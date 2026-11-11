import { ApiError, apiError, checkOrigin, json, readJson, requireAdmin } from "@/lib/auth";
import { adminContent, auditStatement, contentById, contentTypes, database, validateContent } from "@/lib/server";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{await requireAdmin();const type=new URL(request.url).searchParams.get("type")||undefined;if(type&&!contentTypes.includes(type as typeof contentTypes[number]))throw new ApiError(400,"Неизвестный тип.");return json({items:await adminContent(type)});}catch(e){return apiError(e);}}
async function save(request:Request,create:boolean){try{
 const user=await requireAdmin();checkOrigin(request);const payload=await readJson(request);const item=await validateContent(payload.item);const db=database();
 const old=create?null:await contentById(item.id);if(!create&&!old)throw new ApiError(404,"Материал не найден.");
 if(old&&old.type!==item.type)throw new ApiError(400,"Тип существующего материала нельзя менять.");
 if(old&&item.updatedAt!==old.updatedAt)throw new ApiError(409,"Материал уже изменён. Обновите список перед сохранением.");
 const occupied=await db.prepare("SELECT id FROM content WHERE type=? AND slug=? AND id<>?").bind(item.type,item.slug,old?.id??"").first();
 const alias=await db.prepare("SELECT content_id FROM redirects WHERE type=? AND old_slug=? AND content_id<>?").bind(item.type,item.slug,old?.id??"").first();
 if(occupied||alias)throw new ApiError(409,"Этот адрес уже используется другим материалом.");
 const now=new Date().toISOString();const id=old?.id??crypto.randomUUID();
 if(create){await db.batch([db.prepare("INSERT INTO content(id,type,slug,title,summary,body,status,category,region,meta,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,item.type,item.slug,item.title,item.summary,item.body,item.status,item.category,item.region,JSON.stringify(item.meta),now,now),auditStatement(user.userId,"create","content",id)]);}
 else {
  const statements:D1PreparedStatement[]=[];
  // Alias and audit mutations are guarded by the same revision as the write.
  if(old!.slug!==item.slug)statements.push(db.prepare("INSERT INTO redirects(id,type,old_slug,content_id) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM content WHERE id=? AND updated_at=?) ON CONFLICT(type,old_slug) DO UPDATE SET content_id=excluded.content_id").bind(crypto.randomUUID(),item.type,old!.slug,id,id,old!.updatedAt));
  statements.push(db.prepare("INSERT INTO audit(id,actor,action,entity,entity_id,created_at) SELECT ?,?,'update','content',?,? WHERE EXISTS(SELECT 1 FROM content WHERE id=? AND updated_at=?)").bind(crypto.randomUUID(),user.userId,id,now,id,old!.updatedAt));
  statements.push(db.prepare("UPDATE content SET slug=?,title=?,summary=?,body=?,status=?,category=?,region=?,meta=?,updated_at=? WHERE id=? AND updated_at=?").bind(item.slug,item.title,item.summary,item.body,item.status,item.category,item.region,JSON.stringify(item.meta),now,id,old!.updatedAt));
  const results=await db.batch(statements);if(!results[results.length-1].meta.changes)throw new ApiError(409,"Материал уже изменён. Обновите список.");
 }
 return json({item:await contentById(id)},create?201:200);
}catch(e){return apiError(e);}}
export const POST=(request:Request)=>save(request,true);
export const PUT=(request:Request)=>save(request,false);
export async function DELETE(request:Request){try{const user=await requireAdmin();checkOrigin(request);const {id}=await readJson(request);if(typeof id!=="string")throw new ApiError(400,"Не указан материал.");const old=await contentById(id);if(!old)throw new ApiError(404,"Материал не найден.");if(old.status==="published")throw new ApiError(409,"Сначала архивируйте опубликованный материал.");const db=database();const related=await db.prepare("SELECT id FROM content WHERE id<>? AND (json_extract(meta,'$.programId')=? OR json_extract(meta,'$.regionId')=? OR json_extract(meta,'$.projectId')=?) LIMIT 1").bind(id,id,id,id).first();if(related)throw new ApiError(409,"Материал связан с другими записями. Оставьте его в архиве.");await db.batch([db.prepare("DELETE FROM redirects WHERE content_id=?").bind(id),db.prepare("DELETE FROM content WHERE id=?").bind(id),auditStatement(user.userId,"delete","content",id)]);return json({ok:true});}catch(e){return apiError(e);}}
