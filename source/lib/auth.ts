import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export class ApiError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string,string>) { super(message); }
}
export async function getAdminAccess() {
  const user = await getChatGPTUser();
  const allowed = (env.ADMIN_USER_IDS ?? "").split(",").map(v=>v.trim()).filter(Boolean);
  const isAdmin = !!user && (allowed.includes(user.userId) || (import.meta.env.DEV && user.userId === "local_seedy"));
  return {user,isAdmin};
}
export async function requireAdmin() {
  const access = await getAdminAccess();
  if(!access.user) throw new ApiError(401,"Войдите через ChatGPT.");
  if(!access.isAdmin) throw new ApiError(403,"У этой учётной записи нет доступа к управлению сайтом.");
  return access.user;
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;
  if(!origin || origin !== requestOrigin) throw new ApiError(403,"Запрос должен быть отправлен с этого сайта.");
  const site = request.headers.get("sec-fetch-site");
  if(site && site !== "same-origin" && site !== "none") throw new ApiError(403,"Недопустимый источник запроса.");
}
export async function readJson(request: Request, maxBytes=100000): Promise<Record<string,unknown>> {
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new ApiError(415,"Ожидается JSON.");
  const length=Number(request.headers.get("content-length") ?? 0);
  if(length>maxBytes) throw new ApiError(413,"Слишком большой запрос.");
  if(!request.body) throw new ApiError(400,"Пустой запрос.");
  const reader=request.body.getReader(); let count=0; const chunks:Uint8Array[]=[];
  while(true) {const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>maxBytes){await reader.cancel();throw new ApiError(413,"Слишком большой запрос.");}chunks.push(value);}
  const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let parsed:unknown;try{parsed=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError(400,"Некорректный JSON.");}
  if(!parsed || typeof parsed!=="object" || Array.isArray(parsed)) throw new ApiError(400,"Ожидается объект.");
  return parsed as Record<string,unknown>;
}
export const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
export function apiError(error: unknown) {
  if(error instanceof ApiError) return json({error:error.message,...(error.fields?{fields:error.fields}:{})},error.status);
  console.error("API request failed", error instanceof Error ? error.name : "Unknown error");
  return json({error:"Не удалось выполнить запрос. Попробуйте ещё раз."},500);
}
