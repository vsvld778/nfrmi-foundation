import type {MetadataRoute} from 'next';
import {getContent} from '@/lib/server';
export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{const origin='https://nfrmi-foundation-vsevolod.nordterma.chatgpt.site';const pages=['','about','history','regions','programs','projects','insights','documents','contacts','apply','privacy'].map(p=>({url:`${origin}/${p}`}));const groups=await Promise.all([getContent('program'),getContent('project'),getContent('insight')]);return [...pages,...groups.flatMap((items,i)=>items.map(item=>({url:`${origin}/${['programs','projects','insights'][i]}/${item.slug}`,lastModified:new Date(item.updatedAt)})))];}
