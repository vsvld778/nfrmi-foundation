import type {MetadataRoute} from 'next';
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:'*',allow:'/',disallow:['/admin','/api/','/signin-with-chatgpt','/signout-with-chatgpt']},sitemap:'https://nfrmi-foundation-vsevolod.nordterma.chatgpt.site/sitemap.xml'};}
