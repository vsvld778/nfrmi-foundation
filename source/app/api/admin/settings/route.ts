import { ApiError, apiError, checkOrigin, json, readJson, requireAdmin } from "@/lib/auth";
import { database, getSettings, getSettingsRevision, safeText } from "@/lib/server";
import { defaultSettings } from "@/lib/seed";
export const dynamic="force-dynamic";
export async function GET(){try{await requireAdmin();return json({settings:await getSettings(),revision:await getSettingsRevision()});}catch(e){return apiError(e);}}
export async function PUT(request:Request){try{
 const user=await requireAdmin();checkOrigin(request);const {settings,revision}=await readJson(request,120000);
 if(!settings||typeof settings!=="object"||Array.isArray(settings))throw new ApiError(400,"Настройки не переданы.");
 if(typeof revision!=="string"||revision!==await getSettingsRevision())throw new ApiError(409,"Настройки были изменены. Загрузите актуальную версию.");
 const values:Record<string,string>={};for(const [key,val] of Object.entries(settings)){if(!Object.hasOwn(defaultSettings,key)||typeof val!=="string"||val.length>20000)throw new ApiError(400,"Неизвестное или слишком длинное поле настроек.");values[key]=safeText(val.trim());if(/url$/i.test(key)&&val&&!/^https:\/\//.test(val))throw new ApiError(400,"Ссылки должны начинаться с https://");if(/email/i.test(key)&&val&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val))throw new ApiError(400,"Проверьте адрес электронной почты.");}
 const now=new Date().toISOString(),db=database();const statements=Object.entries(values).map(([key,val])=>db.prepare("INSERT INTO settings(key,value,updated_at,actor) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM app_state WHERE key='settings_revision' AND value=?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,actor=excluded.actor").bind(key,val,now,user.userId,revision));
 statements.push(db.prepare("INSERT INTO audit(id,actor,action,entity,entity_id,created_at) SELECT ?,?,'update','settings','site',? WHERE EXISTS(SELECT 1 FROM app_state WHERE key='settings_revision' AND value=?)").bind(crypto.randomUUID(),user.userId,now,revision));
 statements.push(db.prepare("UPDATE app_state SET value=? WHERE key='settings_revision' AND value=?").bind(now,revision));
 const results=await db.batch(statements);if(!results[results.length-1].meta.changes)throw new ApiError(409,"Настройки уже изменены. Обновите страницу.");return json({settings:await getSettings(),revision:now});
}catch(e){return apiError(e);}}
