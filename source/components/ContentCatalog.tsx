'use client';

import { useMemo, useState } from 'react';
import Link from '@/components/Link';
import { ArrowRight, ArrowUpRight, Download, FileText, MapPin, Plus, Search } from 'lucide-react';
import type { ContentItem, ContentType } from '@/lib/types';

const routes: Partial<Record<ContentType, string>> = { program: '/programs', project: '/projects', insight: '/insights' };
const labels: Record<ContentType, string> = { program: 'направлениям', project: 'проектам', insight: 'материалам', region: 'регионам', document: 'документам' };
const empty: Record<ContentType, { title: string; text: string; action: string; href: string }> = {
  program: { title: 'Направления готовятся к публикации', text: 'Вы можете описать свою задачу в обращении. Это поможет определить подходящий формат взаимодействия.', action: 'Предложить проект', href: '/apply' },
  project: { title: 'Здесь появятся проекты фонда', text: 'Мы публикуем проекты после согласования их содержания и роли участников. Если у вас есть инициатива, начните с краткого предложения.', action: 'Предложить проект', href: '/apply' },
  insight: { title: 'Материалы готовятся к публикации', text: 'Практические рекомендации и аналитика будут доступны в этом разделе. Пока можно познакомиться с направлениями работы фонда.', action: 'Направления работы', href: '/programs' },
  region: { title: 'Сведения о регионах обновляются', text: 'Институциональная история фонда раскрыта на отдельной странице.', action: 'История фонда', href: '/history' },
  document: { title: 'Документы готовятся к размещению', text: 'Учредительные документы и другие материалы появятся после подготовки к публикации. Для запроса информации можно направить обращение.', action: 'Связаться с фондом', href: '/contacts' },
};
function displayDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function fileSize(value?: string) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

export function ContentCatalog({ items, type }: { items: ContentItem[]; type: ContentType }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [region, setRegion] = useState('');
  const published = useMemo(() => items.filter(item => item.status === 'published'), [items]);
  const categories = useMemo(() => Array.from(new Set(published.map(item => item.category).filter(Boolean))), [published]);
  const regions = useMemo(() => Array.from(new Set(published.map(item => item.region).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru')), [published]);
  const visible = useMemo(() => published.filter(item => {
    const needle = search.trim().toLocaleLowerCase('ru');
    return (!needle || `${item.title} ${item.summary} ${item.region} ${item.category}`.toLocaleLowerCase('ru').includes(needle))
      && (!category || item.category === category) && (!region || item.region === region);
  }), [published, search, category, region]);
  const filtered = !!(search || category || region);
  const reset = () => { setSearch(''); setCategory(''); setRegion(''); };

  if (!published.length) return <div className="catalog-empty"><p className="eyebrow">{type === 'project' ? 'Совместная работа начинается с идеи' : 'Информация фонда'}</p><h2>{empty[type].title}</h2><p>{empty[type].text}</p><Link className="btn btn-primary" href={empty[type].href}>{empty[type].action}<ArrowRight size={18} aria-hidden="true" /></Link></div>;

  return <div className={`catalog catalog-${type}`}>
    <div className="catalog-controls">
      <div className="catalog-search"><label className="sr-only" htmlFor={`catalog-search-${type}`}>Поиск по {labels[type]}</label><Search size={19} aria-hidden="true" /><input className="input" id={`catalog-search-${type}`} value={search} onChange={event => setSearch(event.target.value)} placeholder={`Поиск по ${labels[type]}`} type="search" /></div>
      {categories.length > 1 && <div className="catalog-filter"><label className="sr-only" htmlFor={`catalog-category-${type}`}>Рубрика</label><select id={`catalog-category-${type}`} className="input" value={category} onChange={event => setCategory(event.target.value)}><option value="">Все рубрики</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></div>}
      {type === 'project' && regions.length > 0 && <div className="catalog-filter"><label className="sr-only" htmlFor="catalog-region">Регион проекта</label><select id="catalog-region" className="input" value={region} onChange={event => setRegion(event.target.value)}><option value="">Все регионы</option>{regions.map(value => <option key={value} value={value}>{value}</option>)}</select></div>}
    </div>
    <div className="catalog-meta"><p className="muted" aria-live="polite">Найдено: {visible.length}</p>{filtered && <button className="text-link" type="button" onClick={reset}>Сбросить фильтры</button>}</div>
    {!visible.length ? <div className="catalog-empty"><h2>Ничего не найдено</h2><p>Попробуйте другое название или сбросьте фильтры.</p><button type="button" className="btn btn-primary" onClick={reset}>Показать всё</button></div> : <div className={`catalog-grid ${type === 'region' ? 'region-grid' : ''}`}>
      {visible.map((item, index) => {
        if (type === 'region') return <details key={item.id} className="region-item"><summary><span className="region-number">{item.meta.number || String(index + 1).padStart(2, '0')}</span><h3>{item.title}</h3><Plus className="region-plus" size={18} aria-hidden="true" /></summary><div className="region-description"><p>{item.summary}</p>{item.body && <p>{item.body}</p>}{item.meta.currentInteraction && <p><strong>Текущее взаимодействие:</strong> {item.meta.currentInteraction}</p>}<Link className="text-link" href="/apply">Предложить сотрудничество <ArrowRight size={16} aria-hidden="true" /></Link></div></details>;
        if (type === 'document') {
          const key = item.meta.fileKey;
          const format = (item.meta.fileName?.split('.').pop() || item.meta.fileMime?.split('/').pop() || '').toUpperCase();
          const details = [format, fileSize(item.meta.fileSize), displayDate(item.meta.publishedAt || item.createdAt)].filter(Boolean).join(' · ');
          return <article key={item.id} className="document-card"><FileText size={30} strokeWidth={1.3} aria-hidden="true" /><div><p className="eyebrow">{item.category || 'Документ'}</p><h3>{item.title}</h3><p>{item.summary}</p>{details && <p className="muted">{details}</p>}</div>{key ? <a className="text-link" href={`/api/files/${key.split('/').map(encodeURIComponent).join('/')}`} download aria-label={`Скачать: ${item.title}`}>Скачать <Download size={17} aria-hidden="true" /></a> : <span className="muted">Файл готовится к размещению</span>}</article>;
        }
        const href = `${routes[type]}/${encodeURIComponent(item.slug)}`;
        return <article key={item.id} className={`catalog-card ${type}-card`}>
          <div className="card-top"><p className="eyebrow">{item.category || (type === 'project' ? 'Проект' : 'Направление')}</p>{type === 'program' && <span className="card-number">{item.meta.number || String(index + 1).padStart(2, '0')}</span>}</div>
          {item.meta.imageUrl&&<img className="catalog-image" src={item.meta.imageUrl} alt={item.meta.imageAlt||item.title} loading="lazy"/>}<h3><Link href={href}>{item.title}</Link></h3><p>{item.summary}</p>
          {type === 'project' && <div className="card-details">{item.region && <span><MapPin size={14} aria-hidden="true" /> {item.region}</span>}{item.meta.stage && <span>{item.meta.stage}</span>}</div>}
          <div className="card-bottom">{type === 'insight' ? <span className="muted">{[displayDate(item.meta.publishedAt || item.createdAt), item.meta.readTime].filter(Boolean).join(' · ')}</span> : <span>{item.meta.deliverable || 'Подробнее о работе'}</span>}<Link href={href} className="card-arrow" aria-label={`Подробнее: ${item.title}`}><ArrowUpRight size={22} aria-hidden="true" /></Link></div>
        </article>;
      })}
    </div>}
  </div>;
}

export default ContentCatalog;
