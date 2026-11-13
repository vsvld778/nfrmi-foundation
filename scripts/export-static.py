#!/usr/bin/env python3
"""Export cached, anonymous public SSR to GitHub Pages. No CMS credentials required."""
import argparse
import html
import json
import re
import shutil
import tempfile
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit, unquote

ORIGIN = 'https://nfrmi-foundation-vsevolod.nordterma.chatgpt.site'
VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}

class Node:
    def __init__(self, tag='', attrs=(), data=None):
        self.tag, self.attrs, self.children, self.data = tag, dict(attrs), [], data
    def walk(self):
        yield self
        for child in self.children:
            yield from child.walk()
    def text(self):
        return html.unescape(self.data or '') if self.data is not None else ''.join(c.text() for c in self.children)
    def has_class(self, name):
        return name in (self.attrs.get('class') or '').split()
    def render(self):
        if self.data is not None:
            return self.data
        if not self.tag:
            return ''.join(c.render() for c in self.children)
        names = {'viewbox':'viewBox','preserveaspectratio':'preserveAspectRatio','gradientunits':'gradientUnits','gradienttransform':'gradientTransform'}
        attrs = ''.join(' '+names.get(k,k)+(('="'+html.escape(str(v),quote=True)+'"') if v is not None else '') for k,v in self.attrs.items())
        opening = '<'+self.tag+attrs+'>'
        return opening if self.tag in VOID else opening+''.join(c.render() for c in self.children)+'</'+self.tag+'>'

class Document(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.root = Node()
        self.stack = [self.root]
        self.feed(source)
    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in VOID: self.stack.append(node)
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag,attrs)
        if tag not in VOID: self.handle_endtag(tag)
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1,0,-1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                return
    def handle_data(self, data): self.stack[-1].children.append(Node(data=data))
    def handle_entityref(self, name): self.handle_data('&'+name+';')
    def handle_charref(self, name): self.handle_data('&#'+name+';')
    def handle_decl(self, decl): self.root.children.append(Node(data='<!'+decl+'>'))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache',type=Path,required=True)
    parser.add_argument('--base',default='/nfrmi-foundation/')
    parser.add_argument('--site-url',default='https://vsvld778.github.io/nfrmi-foundation/')
    parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'docs')
    args=parser.parse_args()
    base='/'+args.base.strip('/')+'/'
    output=args.output.resolve()
    cache=args.cache.resolve()
    manifest=json.loads((cache/'manifest.json').read_text())
    pages={entry['path'].rstrip('/') or '/':entry for entry in manifest if 'text/html' in entry.get('contentType','') and not entry['path'].startswith(('/admin','/apply','/api/'))}
    if '/' not in pages or len(pages)<10: raise SystemExit('Incomplete snapshot: refusing to replace published pages.')
    for required in ('fonts/open-sans.woff2','fonts/OFL.txt','images/architecture.jpg','favicon.svg'):
        if not (cache/required).is_file(): raise SystemExit('Missing public asset: '+required)
    staging=Path(tempfile.mkdtemp(prefix='.pages-build-',dir=output.parent))
    missing=[]

    def rewrite(value, current='/'):
        if not value or value.startswith(('#','mailto:','tel:','data:','javascript:')): return value
        parsed=urlsplit(urljoin(ORIGIN+current,value))
        if parsed.netloc != urlsplit(ORIGIN).netloc: return value
        path=parsed.path
        if path.startswith(('/apply','/admin','/api/','/cdn-cgi/')):
            return urlunsplit(('https',parsed.netloc,path,parsed.query,parsed.fragment))
        route=path.rstrip('/') or '/'
        if route in pages:
            path=base+route.lstrip('/')+('/' if route!='/' else '')
        else:
            path=base+path.lstrip('/')
        return urlunsplit(('','',path,parsed.query,parsed.fragment))

    try:
        # Copy public non-HTML resources. JS runtime chunks and server data never enter Pages.
        for entry in manifest:
            mime=entry.get('contentType','')
            if 'text/html' in mime or entry['path'].endswith(('.js','.mjs','.map')): continue
            source=cache/entry['file']
            if not source.is_file(): raise RuntimeError('Missing cached asset: '+str(source))
            target=staging/entry['path'].lstrip('/')
            target.parent.mkdir(parents=True,exist_ok=True)
            if 'css' in mime or target.suffix=='.css':
                css=source.read_text()
                css=re.sub(r'url\(\s*([\"\']?)([^\"\')]+)\1\s*\)',lambda m:'url("'+rewrite(m.group(2),entry['path'])+'")',css)
                target.write_text(css)
            else: shutil.copyfile(source,target)
        for name in ('fonts/open-sans.woff2','fonts/OFL.txt','images/architecture.jpg','favicon.svg'):
            target=staging/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(cache/name,target)

        rendered={}
        for route,entry in pages.items():
            source=(cache/entry['file']).read_text()
            doc=Document(source).root
            head=next((n for n in doc.walk() if n.tag=='head'),None)
            body=next((n for n in doc.walk() if n.tag=='body'),None)
            main_node=next((n for n in doc.walk() if n.tag=='main'),None)
            if head is None or body is None or main_node is None or not main_node.text().strip():
                raise RuntimeError('Incomplete SSR page: '+route)
            # Vinext streams title/icons into a hidden body fragment. Hoist those before removal.
            title_nodes=[n for n in doc.walk() if n.tag=='title']
            title=title_nodes[-1].text() if title_nodes else 'НФРМИ'
            descriptions=[n.attrs.get('content','') for n in doc.walk() if n.tag=='meta' and n.attrs.get('name')=='description']
            def clean(node):
                kept=[]
                for child in node.children:
                    a=child.attrs
                    if child.tag in ('script','iframe','template','title','base'): continue
                    if child.tag=='div' and 'hidden' in a: continue
                    if child.tag=='meta' and (a.get('name')=='description' or a.get('property')=='og:url'): continue
                    if child.tag=='link' and (a.get('rel') in ('modulepreload','preload','canonical','icon','shortcut icon')): continue
                    child.attrs={k:v for k,v in a.items() if not k.startswith(('on','data-rsc','data-vinext')) and k!='data-precedence'}
                    for attr in ('href','src','poster','action'):
                        if attr in child.attrs: child.attrs[attr]=rewrite(child.attrs[attr],route)
                    if 'srcset' in child.attrs:
                        child.attrs['srcset']=', '.join(' '.join([rewrite(part.strip().split()[0],route)]+part.strip().split()[1:]) for part in child.attrs['srcset'].split(','))
                    clean(child);kept.append(child)
                node.children=kept
            clean(doc)
            if any(n.tag=='form' for n in doc.walk()): raise RuntimeError('Unexpected form in static page: '+route)
            for catalog in [n for n in doc.walk() if n.has_class('catalog')]:
                grid=next((n for n in catalog.walk() if n.has_class('catalog-grid')),None)
                if grid:
                    for card in grid.children:
                        if card.tag not in ('article','details'): continue
                        eyebrow=next((n for n in card.walk() if n.has_class('eyebrow')),None)
                        details=next((n for n in card.walk() if n.has_class('card-details')),None)
                        region=next((n for n in details.children if n.tag=='span'),None) if details else None
                        card.attrs['data-category']=eyebrow.text().strip() if eyebrow else ''
                        card.attrs['data-region']=region.text().strip() if region else ''
            canonical=args.site_url.rstrip('/')+(route+'/' if route!='/' else '/')
            head.children.extend([Node('title'),Node('meta',[('name','description'),('content',descriptions[-1] if descriptions else '')]),Node('link',[('rel','icon'),('href',base+'images/nfrmi-logo.webp')]),Node('link',[('rel','canonical'),('href',canonical)]),Node('link',[('rel','stylesheet'),('href',base+'static.css')])])
            head.children[-5].children=[Node(data=html.escape(title))]
            body.children.append(Node('script',[('src',base+'static.js'),('defer',None)]))
            rendered[route]=doc.render()
            target=staging/route.lstrip('/')/'index.html' if route!='/' else staging/'index.html'
            target.parent.mkdir(parents=True,exist_ok=True);target.write_text(rendered[route])

        # Explicit service handoff pages: GitHub Pages never pretends to process a form or sign-in.
        for route,title,description,label,href in [
            ('apply','Предложить проект','Обращения принимаются на основном сайте фонда. Форма и её данные обрабатываются защищённым сервером фонда.','Открыть форму обращения',ORIGIN+'/apply'),
            ('admin','Панель управления','Панель управления работает на основном сайте фонда. Для доступа требуется вход через ChatGPT и права администратора.','Перейти к входу',ORIGIN+'/admin'),
        ]:
            content='<section class="page-intro container"><p class="eyebrow">НФРМИ</p><h1>'+title+'</h1><p class="intro-description">'+description+'</p></section><section class="container section-bottom"><a class="btn btn-primary" href="'+href+'">'+label+' ↗</a></section>'
            bridge=re.sub(r'<main\b[^>]*>.*?</main>','<main id="main">'+content+'</main>',rendered['/'],flags=re.S)
            bridge=re.sub(r'<title>.*?</title>','<title>'+title+' · НФРМИ</title>',bridge,flags=re.S)
            bridge=re.sub(r'<link rel="canonical"[^>]+>','',bridge)
            bridge=bridge.replace('</head>','<meta name="robots" content="noindex"></head>')
            target=staging/route/'index.html';target.parent.mkdir(parents=True);target.write_text(bridge)
        error=re.sub(r'<main\b[^>]*>.*?</main>','<main id="main"><section class="page-intro container"><p class="eyebrow">404</p><h1>Страница не найдена</h1><p class="intro-description">Адрес мог измениться. Вернитесь на главную страницу фонда.</p></section><section class="container section-bottom"><a class="btn btn-primary" href="'+base+'">На главную</a></section></main>',rendered['/'],flags=re.S)
        error=re.sub(r'<title>.*?</title>','<title>Страница не найдена · НФРМИ</title>',error,flags=re.S)
        error=re.sub(r'<link rel="canonical"[^>]+>','',error).replace('</head>','<meta name="robots" content="noindex"></head>')
        (staging/'404.html').write_text(error)
        scripts=Path(__file__).parent
        shutil.copyfile(scripts/'static.js',staging/'static.js')
        shutil.copyfile(scripts/'static.css',staging/'static.css')
        (staging/'.nojekyll').touch()
        xml='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join('<url><loc>'+html.escape(args.site_url.rstrip('/')+(r+'/' if r!='/' else '/'))+'</loc></url>' for r in pages)+'</urlset>\n'
        (staging/'sitemap.xml').write_text(xml)
        (staging/'robots.txt').write_text('User-agent: *\nAllow: /\nSitemap: '+args.site_url.rstrip('/')+'/sitemap.xml\n')
        # Fail before replacing docs if any internal page or asset was missed.
        for page in staging.rglob('*.html'):
            doc=Document(page.read_text()).root
            for node in doc.walk():
                for attr in ('href','src','poster'):
                    value=node.attrs.get(attr,'') or ''
                    if not value.startswith(base): continue
                    relative=unquote(urlsplit(value).path[len(base):])
                    target=staging/relative
                    if target.is_dir(): target=target/'index.html'
                    if not target.is_file(): missing.append(str(page.relative_to(staging))+': '+value)
            scripts_found=[n for n in doc.walk() if n.tag=='script']
            if len(scripts_found)!=1 or scripts_found[0].attrs.get('src')!=base+'static.js': raise RuntimeError('Unexpected executable script: '+str(page))
        if missing: raise RuntimeError('Broken links/assets:\n'+'\n'.join(missing))
        report={'exportedAt':datetime.now(timezone.utc).isoformat(),'sourceOrigin':ORIGIN,'siteUrl':args.site_url,'publicPages':len(pages),'handoffPages':2,'sourcePaths':list(pages),'contentRefresh':'Manual snapshot; CMS edits require re-export and commit.','validation':'All local href/src/poster references resolve; no forms or server runtime scripts exported.'}
        (staging/'export-manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        backup=output.with_name(output.name+'.previous')
        if backup.exists(): shutil.rmtree(backup)
        if output.exists(): output.rename(backup)
        try: staging.rename(output)
        except BaseException:
            if backup.exists(): backup.rename(output)
            raise
        if backup.exists(): shutil.rmtree(backup)
        print(json.dumps(report,ensure_ascii=False,indent=2))
    finally:
        if staging.exists(): shutil.rmtree(staging)

if __name__=='__main__': main()
