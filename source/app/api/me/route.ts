import {apiError,getAdminAccess,json}from "@/lib/auth";
export const dynamic="force-dynamic";
export async function GET(){try{return json(await getAdminAccess());}catch(e){return apiError(e);}}
