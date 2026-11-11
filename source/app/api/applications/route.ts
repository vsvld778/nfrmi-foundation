import { ApiError,apiError,checkOrigin,json,readJson } from "@/lib/auth";
import { database,ensureSeed,getContent } from "@/lib/server";
export const dynamic="force-dynamic";
const consentVersion="2026-11-11";
async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,"0")).join("");}
function validInn(value:string){if(!/^(\d{10}|\d{12})$/.test(value))return false;const nums=value.split("").map(Number);const checksum=(weights:number[])=>weights.reduce((sum,x,i)=>sum+x*nums[i],0)%11%10;return nums.length===10?checksum([2,4,10,3,5,9,4,6,8])===nums[9]:checksum([7,2,4,10,3,5,9,4,6,8])===nums[10]&&checksum([3,7,2,4,10,3,5,9,4,6,8])===nums[11];}
export async function POST(request:Request){try{
 checkOrigin(request);const v=await readJson(request,25000);const errors:Record<string,string>={};const value=(key:string,min:number,max:number)=>{const val=typeof v[key]==="string"?(v[key] as string).trim():"";if(val.length<min||val.length>max)errors[key]=`Введите от ${min} до ${max} символов.`;return val;};
 if(v.website)throw new ApiError(400,"Не удалось отправить форму.");
 const type=value("type",1,30),title=value("title",5,160),organization=value("organization",2,200),inn=value("inn",0,12),name=value("name",2,120),email=value("email",3,254).toLowerCase(),phone=value("phone",0,20),region=value("region",1,160),direction=value("direction",1,200),description=value("description",50,5000),idempotencyKey=value("idempotencyKey",20,128);
 if(!["project","partnership"].includes(type))errors.type="Выберите тип обращения.";
 if(inn&&!validInn(inn))errors.inn="Проверьте ИНН и контрольные цифры.";
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))errors.email="Введите корректный email.";
 if(phone&&!/^\+?[\d\s()\-]{7,20}$/.test(phone))errors.phone="Проверьте телефон.";
 if(!/^[a-zA-Z0-9_-]{20,128}$/.test(idempotencyKey))errors.idempotencyKey="Обновите страницу перед отправкой.";
 if(v.consent!==true||v.consentVersion!==consentVersion)errors.consent="Подтвердите согласие с актуальным текстом обработки данных.";
 if(Object.keys(errors).length)throw new ApiError(400,"Проверьте отмеченные поля.",errors);
 await ensureSeed();const [regions,programs]=await Promise.all([getContent("region"),getContent("program")]);
 if(!["other","Другой регион",...regions.flatMap(x=>[x.slug,x.title])].includes(region))errors.region="Выберите регион из списка.";
 if(!["consultation","Нужна консультация",...programs.flatMap(x=>[x.slug,x.title])].includes(direction))errors.direction="Выберите направление из списка.";
 if(Object.keys(errors).length)throw new ApiError(400,"Проверьте отмеченные поля.",errors);
 const regionLabel=regions.find(x=>x.slug===region||x.title===region)?.title||(region==="other"?"Другой регион":region); const directionLabel=programs.find(x=>x.slug===direction||x.title===direction)?.title||(direction==="consultation"?"Нужна консультация":direction);
 const db=database(),now=new Date().toISOString();const fingerprint=await hash(JSON.stringify({type,title,organization,inn,name,email,phone,region,direction,description}));
 const existing=await db.prepare("SELECT reference,fingerprint FROM applications WHERE idempotency_key=?").bind(idempotencyKey).first<{reference:string,fingerprint:string}>();
 if(existing){if(existing.fingerprint!==fingerprint)throw new ApiError(409,"С этой формой уже отправлено другое предложение. Обновите страницу.");return json({reference:existing.reference});}
 const duplicate=await db.prepare("SELECT reference FROM applications WHERE fingerprint=? AND created_at>? LIMIT 1").bind(fingerprint,new Date(Date.now()-86400000).toISOString()).first<{reference:string}>();if(duplicate)return json({reference:duplicate.reference});
 const ip=request.headers.get("cf-connecting-ip")||"local-preview";const hour=Math.floor(Date.now()/3600000);const rateKey=await hash(`application:${ip}:${hour}`);
 const limit=await db.prepare("INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count").bind(rateKey,(hour+1)*3600000).first<{count:number}>();
 if((limit?.count??99)>5)throw new ApiError(429,"Слишком много отправок. Попробуйте позже.");
 await db.prepare("DELETE FROM rate_limits WHERE expires_at<?").bind(Date.now()-86400000).run();
 const id=crypto.randomUUID(),reference=`НФ-${new Date().getFullYear()}-${id.replaceAll("-","").slice(0,10).toUpperCase()}`;
 try{await db.prepare("INSERT INTO applications(id,reference,type,title,organization,inn,name,email,phone,region,direction,description,status,notes,consent_version,consent_at,idempotency_key,fingerprint,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'new','',?,?,?,?,?,?)").bind(id,reference,type,title,organization,inn,name,email,phone,regionLabel,directionLabel,description,consentVersion,now,idempotencyKey,fingerprint,now,now).run();}
 catch(error){const raced=await db.prepare("SELECT reference,fingerprint FROM applications WHERE idempotency_key=?").bind(idempotencyKey).first<{reference:string,fingerprint:string}>();if(raced?.fingerprint===fingerprint)return json({reference:raced.reference});throw error;}
 return json({reference},201);
}catch(e){return apiError(e);}}
