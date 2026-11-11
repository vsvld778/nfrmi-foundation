import { ApiError,apiError,checkOrigin,json,requireAdmin } from "@/lib/auth";
import { auditStatement,bucket,database } from "@/lib/server";
export const dynamic="force-dynamic";
const maxSize=10*1024*1024;
const bytesEqual=(b:Uint8Array,a:number[],offset=0)=>a.every((x,i)=>b[offset+i]===x);
const ascii=(b:Uint8Array,start:number,end:number)=>new TextDecoder().decode(b.slice(start,end));
function join(parts:Uint8Array[]){const result=new Uint8Array(parts.reduce((a,p)=>a+p.length,0));let n=0;for(const p of parts){result.set(p,n);n+=p.length;}return result;}
function cleanImage(bytes:Uint8Array,mime:string):Uint8Array {
 if(mime==="image/jpeg"){
  const parts=[bytes.slice(0,2)];let pos=2;
  while(pos<bytes.length){if(bytes[pos]!==255)throw new ApiError(400,"Повреждённый JPEG.");const marker=bytes[pos+1];if(marker===0xda||marker===0xd9){parts.push(bytes.slice(pos));return join(parts);}if(marker===0x00||marker===0xff)throw new ApiError(400,"Повреждённый JPEG.");const len=bytes[pos+2]*256+bytes[pos+3];if(len<2||pos+2+len>bytes.length)throw new ApiError(400,"Повреждённый JPEG.");if(![0xe1,0xed,0xfe].includes(marker))parts.push(bytes.slice(pos,pos+2+len));pos+=2+len;}
  throw new ApiError(400,"Повреждённый JPEG.");
 }
 if(mime==="image/png"){
  const parts=[bytes.slice(0,8)];let pos=8;const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  while(pos+12<=bytes.length){const len=view.getUint32(pos),end=pos+len+12;if(end>bytes.length)throw new ApiError(400,"Повреждённый PNG.");const type=ascii(bytes,pos+4,pos+8);if(!["eXIf","tEXt","zTXt","iTXt"].includes(type))parts.push(bytes.slice(pos,end));pos=end;if(type==="IEND")return join(parts);}
  throw new ApiError(400,"Повреждённый PNG.");
 }
 if(mime==="image/webp"){
  const parts=[bytes.slice(0,12)];let pos=12;const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  while(pos+8<=bytes.length){const len=view.getUint32(pos+4,true),end=pos+8+len+(len%2);if(end>bytes.length)throw new ApiError(400,"Повреждённый WebP.");const type=ascii(bytes,pos,pos+4);if(!["EXIF","XMP "].includes(type)){const chunk=bytes.slice(pos,end);if(type==="VP8X"&&chunk.length>8)chunk[8]&=~0x0c;parts.push(chunk);}pos=end;}
  if(pos!==bytes.length)throw new ApiError(400,"Повреждённый WebP.");const result=join(parts);new DataView(result.buffer).setUint32(4,result.length-8,true);return result;
 }
 return bytes;
}
export async function POST(request:Request){try{
 const user=await requireAdmin();checkOrigin(request);if(!request.headers.get("content-type")?.startsWith("multipart/form-data"))throw new ApiError(415,"Ожидается файл формы.");
 if(Number(request.headers.get("content-length")||0)>maxSize+65536)throw new ApiError(413,"Максимальный размер файла — 10 МБ.");
 if(!request.body)throw new ApiError(400,"Файл не передан.");const reader=request.body.getReader(),chunks:Uint8Array[]=[];let total=0;
 while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>maxSize+65536){await reader.cancel();throw new ApiError(413,"Максимальный размер файла — 10 МБ.");}chunks.push(value);}
 const form=await new Response(join(chunks).buffer,{headers:{"content-type":request.headers.get("content-type")!}}).formData();const file=form.get("file");
 if(!(file instanceof File)||file.size===0)throw new ApiError(400,"Выберите файл.");if(file.size>maxSize)throw new ApiError(413,"Максимальный размер файла — 10 МБ.");
 let bytes=new Uint8Array(await file.arrayBuffer());let mime="",extension="";
 if(bytesEqual(bytes,[0x25,0x50,0x44,0x46,0x2d])){mime="application/pdf";extension="pdf";}
 else if(bytesEqual(bytes,[255,216,255])){mime="image/jpeg";extension="jpg";}
 else if(bytesEqual(bytes,[137,80,78,71,13,10,26,10])&&ascii(bytes,12,16)==="IHDR"){mime="image/png";extension="png";}
 else if(ascii(bytes,0,4)==="RIFF"&&ascii(bytes,8,12)==="WEBP"&&["VP8 ","VP8L","VP8X"].includes(ascii(bytes,12,16))){mime="image/webp";extension="webp";}
 else throw new ApiError(400,"Допускаются только PDF, JPEG, PNG и WebP.");
 if(mime.startsWith("image/")&&file.size>8*1024*1024)throw new ApiError(413,"Максимальный размер изображения — 8 МБ.");
 const originalExtension=file.name.split(".").pop()?.toLowerCase();if(file.type!==mime||!(extension==="jpg"?["jpg","jpeg"]:[extension]).includes(originalExtension||""))throw new ApiError(400,"Расширение и тип файла не совпадают с содержимым.");
 bytes=new Uint8Array(cleanImage(bytes,mime));const name=file.name.replace(/[\x00-\x1f\x7f/\\]/g,"_").slice(0,180);const key=`${mime==="application/pdf"?"documents":"images"}/${crypto.randomUUID()}.${extension}`;
 await bucket().put(key,bytes.buffer,{httpMetadata:{contentType:mime},customMetadata:{name}});
 try{await database().batch([database().prepare("INSERT INTO files(key,name,mime,size,actor,created_at) VALUES(?,?,?,?,?,?)").bind(key,name,mime,bytes.length,user.userId,new Date().toISOString()),auditStatement(user.userId,"upload","file",key)]);}catch(e){await bucket().delete(key);throw e;}
 return json({key,url:`/api/files/${key}`,name,size:bytes.length,mime},201);
}catch(e){return apiError(e);}}
