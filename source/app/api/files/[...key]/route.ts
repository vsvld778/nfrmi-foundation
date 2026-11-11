import {apiError,getAdminAccess,json} from "@/lib/auth";
import {bucket,database} from "@/lib/server";
export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{key:string[]}>}){try{
 const {key:segments}=await params;const key=segments.join("/");if(!/^(documents|images)\/[a-z0-9-]+\.(pdf|jpg|png|webp)$/.test(key))return json({error:"Файл не найден."},404);
 const file=await database().prepare("SELECT name,mime,size FROM files WHERE key=?").bind(key).first<{name:string,mime:string,size:number}>();if(!file)return json({error:"Файл не найден."},404);
 const published=await database().prepare("SELECT id FROM content WHERE status='published' AND (json_extract(meta,'$.fileKey')=? OR json_extract(meta,'$.imageKey')=?) LIMIT 1").bind(key,key).first();
 if(!published&&!(await getAdminAccess()).isAdmin)return json({error:"Файл не найден."},404);
 const object=await bucket().get(key);if(!object)return json({error:"Файл не найден."},404);
 const fallback=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");const disposition=file.mime==="application/pdf"?"attachment":"inline";
 return new Response(object.body,{headers:{"Content-Type":file.mime,"Content-Length":String(object.size),"Content-Disposition":`${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(file.name).replaceAll("'","%27")}`,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox","Cross-Origin-Resource-Policy":"same-origin"}});
}catch(e){return apiError(e);}}
