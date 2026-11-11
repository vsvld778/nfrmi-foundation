#!/usr/bin/env node
/** Download an anonymous, public snapshot. Never calls admin APIs or exports applications. */
import { mkdir, readFile, writeFile, rename, rm, mkdtemp } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import process from 'node:process';

const origin = 'https://nfrmi-foundation-vsevolod.nordterma.chatgpt.site';
const cacheFlag = process.argv.indexOf('--cache');
const target = resolve(cacheFlag >= 0 ? process.argv[cacheFlag + 1] : '.cache/public');
const parent = dirname(target);
await mkdir(parent, { recursive: true });
const staging = await mkdtemp(join(parent, '.public-snapshot-'));
const manifest = [];
const seen = new Set();
const assets = new Set(['/fonts/open-sans.woff2', '/images/architecture.jpg', '/favicon.svg']);
const decode = (value) => value.replaceAll('&amp;', '&');
const publicResource = (raw, base) => {
  const url = new URL(decode(raw), base);
  if (url.origin === origin && !url.pathname.startsWith('/api/') && /\.(css|svg|png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf)$/i.test(url.pathname)) assets.add(url.pathname + url.search);
};
async function request(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000), credentials: 'omit', headers: { 'User-Agent': 'NFRMI-Public-Snapshot/1.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  if (new URL(response.url).origin !== new URL(url).origin) throw new Error(`Unexpected cross-origin redirect: ${response.url}`);
  return response;
}
async function save(path, file, response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 25 * 1024 * 1024) throw new Error(`Public resource exceeds 25MB: ${path}`);
  const local = resolve(staging, file);
  if (!local.startsWith(staging + '/')) throw new Error('Unsafe cache path');
  await mkdir(dirname(local), { recursive: true });
  await writeFile(local, bytes);
  manifest.push({ url: origin + path, path: new URL(path, origin).pathname, file, contentType: response.headers.get('content-type') || '' });
  return new TextDecoder().decode(bytes);
}
try {
  const sitemap = await (await request(origin + '/sitemap.xml')).text();
  await writeFile(join(staging, 'sitemap.xml'), sitemap);
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(decode(match[1])));
  const pages = urls.filter((url) => url.origin === origin && !/^\/(apply|admin|api)(\/|$)/.test(url.pathname));
  if (pages.length < 10 || !pages.some((url) => url.pathname === '/')) throw new Error('Public sitemap is incomplete');
  for (const url of pages) {
    const path = url.pathname.replace(/\/$/, '') || '/';
    if (seen.has(path)) continue;
    seen.add(path);
    const response = await request(url.href);
    if (!(response.headers.get('content-type') || '').includes('text/html')) throw new Error(`Not HTML: ${path}`);
    const file = path === '/' ? 'index.html' : path.slice(1) + '/index.html';
    const html = await save(path, file, response);
    if (!/<main\b/i.test(html) || !/<\/html>/i.test(html)) throw new Error(`Incomplete SSR response: ${path}`);
    for (const match of html.matchAll(/(?:href|src|poster)=["']([^"']+)["']/gi)) publicResource(match[1], url);
    for (const match of html.matchAll(/srcset=["']([^"']+)["']/gi)) {
      for (const part of match[1].split(',')) publicResource(part.trim().split(/\s+/)[0], url);
    }
    console.log(`HTML ${path}`);
  }
  for (const asset of assets) {
    const url = new URL(asset, origin);
    const response = await request(url.href);
    const body = await save(url.pathname, url.pathname.slice(1), response);
    if (url.pathname.endsWith('.css')) for (const match of body.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      if (!match[1].startsWith('data:')) publicResource(match[1], url);
    }
    console.log(`ASSET ${url.pathname}`);
  }
  const license = await (await request('https://raw.githubusercontent.com/google/fonts/main/ofl/opensans/OFL.txt')).text();
  if (!license.includes('SIL OPEN FONT LICENSE')) throw new Error('Unexpected Open Sans license response');
  await mkdir(join(staging, 'fonts'), { recursive: true });
  await writeFile(join(staging, 'fonts/OFL.txt'), license);
  await writeFile(join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const backup = target + '.previous';
  await rm(backup, { recursive: true, force: true });
  try { await rename(target, backup); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { await rename(staging, target); } catch (error) { await rename(backup, target).catch(() => {}); throw error; }
  await rm(backup, { recursive: true, force: true });
  console.log(`Saved ${pages.length} public pages to ${target}`);
} catch (error) {
  await rm(staging, { recursive: true, force: true });
  console.error(error.message);
  process.exitCode = 1;
}
