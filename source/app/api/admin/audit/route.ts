import { apiError,json,requireAdmin } from "@/lib/auth";
import { database } from "@/lib/server";
export const dynamic="force-dynamic";
export async function GET(){try{await requireAdmin();const rows=await database().prepare("SELECT id,actor,action,entity,entity_id AS entityId,created_at AS createdAt FROM audit ORDER BY created_at DESC LIMIT 250").all();return json({items:rows.results});}catch(e){return apiError(e);}}
