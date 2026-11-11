import { env } from "cloudflare:workers";
import { seedContent, defaultSettings } from "@/lib/seed";
import type { ContentItem } from "@/lib/types";
import { ApiError } from "@/lib/auth";

export function database(): D1Database {if(!env.DB) throw new Error("Database unavailable");return env.DB;}
export function bucket(): R2Bucket {if(!env.BUCKET) throw new Error("Storage unavailable");return env.BUCKET;}
const columns="id,type,slug,title,summary,body,status,category,region,meta,created_at AS createdAt,updated_at AS updatedAt";
type ContentRow=Omit<ContentItem,"meta">&{meta:string};
export const parseItem=(row:ContentRow):ContentItem=>({...row,meta:JSON.parse(row.meta||"{}")});
export async function ensureSeed() {
  const db=database();
  if(await db.prepare("SELECT value FROM app_state WHERE key='seed_v1'").first()) return;
  const now=new Date().toISOString();
  const statements:D1PreparedStatement[]=[];
  for(const item of seedContent) statements.push(db.prepare("INSERT OR IGNORE INTO content(id,type,slug,title,summary,body,status,category,region,meta,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(item.id,item.type,item.slug,item.title,item.summary,item.body,item.status,item.category,item.region,JSON.stringify(item.meta),item.createdAt||now,item.updatedAt||now));
  for(const [key,value] of Object.entries(defaultSettings)) statements.push(db.prepare("INSERT OR IGNORE INTO settings(key,value,updated_at,actor) VALUES(?,?,?,'seed')").bind(key,value,now));
  statements.push(db.prepare("INSERT OR IGNORE INTO app_state(key,value) VALUES('settings_revision',?)").bind(now));
  statements.push(db.prepare("INSERT OR IGNORE INTO app_state(key,value) VALUES('seed_v1','1')"));
  await db.batch(statements);
}
export async function getContent(type:ContentItem["type"]):Promise<ContentItem[]> {
  await ensureSeed();
  const rows=await database().prepare(`SELECT ${columns} FROM content WHERE type=? AND status='published' ORDER BY created_at DESC,id`).bind(type).all<ContentRow>();
  return rows.results.map(parseItem).sort((a,b)=>(Number(a.meta.number||a.meta.order)||0)-(Number(b.meta.number||b.meta.order)||0));
}
export async function getBySlug(type:ContentItem["type"],slug:string):Promise<ContentItem|null> {
  await ensureSeed(); const db=database();
  const row=await db.prepare(`SELECT ${columns} FROM content WHERE type=? AND slug=? AND status='published'`).bind(type,slug).first<ContentRow>();
  if(row) return parseItem(row);
  const alias=await db.prepare("SELECT content_id FROM redirects WHERE type=? AND old_slug=?").bind(type,slug).first<{content_id:string}>();
  if(!alias)return null;
  const target=await db.prepare(`SELECT ${columns} FROM content WHERE id=? AND type=? AND status='published'`).bind(alias.content_id,type).first<ContentRow>();
  return target?parseItem(target):null;
}
export async function getSettings():Promise<Record<string,string>> {
  await ensureSeed();const rows=await database().prepare("SELECT key,value FROM settings").all<{key:string,value:string}>();
  return {...defaultSettings,...Object.fromEntries(rows.results.map(x=>[x.key,x.value]))};
}
export async function getSettingsRevision():Promise<string> {await ensureSeed();return (await database().prepare("SELECT value FROM app_state WHERE key='settings_revision'").first<{value:string}>())!.value;}
export async function adminContent(type?:string) {await ensureSeed();const query=type?database().prepare(`SELECT ${columns} FROM content WHERE type=? ORDER BY updated_at DESC`).bind(type):database().prepare(`SELECT ${columns} FROM content ORDER BY updated_at DESC`);return (await query.all<ContentRow>()).results.map(parseItem);}
export async function contentById(id:string) {await ensureSeed();const row=await database().prepare(`SELECT ${columns} FROM content WHERE id=?`).bind(id).first<ContentRow>();return row?parseItem(row):null;}
export function auditStatement(actor:string,action:string,entity:string,entityId:string) {return database().prepare("INSERT INTO audit(id,actor,action,entity,entity_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor,action,entity,entityId,new Date().toISOString());}
export async function logAudit(actor:string,action:string,entity:string,entityId:string) {await auditStatement(actor,action,entity,entityId).run();}
export const contentTypes=["program","project","insight","region","document"] as const;
export function textField(value:unknown,name:string,min:number,max:number) {if(typeof value!=="string"||value.trim().length<min||value.trim().length>max) throw new ApiError(400,`Проверьте поле «${name}».`,{[name]:`От ${min} до ${max} символов.`});return value.trim();}
export function safeText(value:string) {if(/<\/?[a-z!][^>]*>/i.test(value)||/\]\(\s*(?:javascript|vbscript|data)\s*:/i.test(value)) throw new ApiError(400,"HTML и небезопасные ссылки не допускаются.");return value;}
export async function validateContent(value:unknown):Promise<Omit<ContentItem,"createdAt"|"updatedAt"> & {updatedAt?:string}> {
  if(!value||typeof value!=="object"||Array.isArray(value))throw new ApiError(400,"Материал не передан.");
  const v=value as Record<string,unknown>;
  if(!contentTypes.includes(v.type as ContentItem["type"]))throw new ApiError(400,"Неизвестный тип материала.");
  if(!["draft","published","archived"].includes(String(v.status)))throw new ApiError(400,"Неизвестный статус.");
  const slug=textField(v.slug,"slug",2,120);if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw new ApiError(400,"Адрес содержит только латиницу, цифры и дефис.");
  const title=safeText(textField(v.title,"title",3,200));const summary=safeText(textField(v.summary??"","summary",0,1000));const body=safeText(textField(v.body??"","body",0,50000));
  if(v.status==="published"&&v.type!=="document"&&(!summary||!body))throw new ApiError(400,"Для публикации нужны анонс и основной текст.");
  const rawMeta=v.meta??{};if(typeof rawMeta!=="object"||Array.isArray(rawMeta)||!rawMeta)throw new ApiError(400,"Некорректные дополнительные поля.");
  const meta:Record<string,string>={};if(Object.keys(rawMeta).length>50)throw new ApiError(400,"Слишком много дополнительных полей.");
  for(const [key,val]of Object.entries(rawMeta)){if(!/^[a-zA-Z][a-zA-Z0-9_]{0,50}$/.test(key)||typeof val!=="string"||val.length>12000)throw new ApiError(400,"Некорректное дополнительное поле.");meta[key]=safeText(val);if(/(?:url|image|link)$/i.test(key)&&val&&!key.endsWith("Key")&&!(key==="image"&&["architecture","cooperation","roadmap"].includes(val))&&!/^(https:\/\/|\/api\/files\/)/.test(val))throw new ApiError(400,"Ссылка должна использовать HTTPS или файл сайта.");}
  for(const key of ["fileKey","imageKey"])if(meta[key]){const found=await database().prepare("SELECT mime FROM files WHERE key=?").bind(meta[key]).first<{mime:string}>();if(!found)throw new ApiError(400,"Загруженный файл не найден.");if(key==="imageKey"&&!found.mime.startsWith("image/"))throw new ApiError(400,"Выберите изображение.");}
  if(v.type==="document"&&v.status==="published"&&!meta.fileKey)throw new ApiError(400,"Для публикации документа загрузите файл.");
  return {id:typeof v.id==="string"?v.id:"",type:v.type as ContentItem["type"],slug,title,summary,body,status:v.status as ContentItem["status"],category:safeText(textField(v.category??"","category",0,160)),region:safeText(textField(v.region??"","region",0,160)),meta,...(typeof v.updatedAt==="string"?{updatedAt:v.updatedAt}:{})};
}
