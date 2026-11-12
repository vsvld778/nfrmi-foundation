'use client';

import Link from '@/components/Link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Menu, X } from 'lucide-react';

export function Mark(){return <svg viewBox="0 0 44 44" fill="none" aria-hidden="true"><path d="M5 36V8h8v28M17 36V8h8v28M29 36V8h8v28M5 22h32" stroke="currentColor" strokeWidth="2"/><path d="m5 36 32-28M5 8l32 28" stroke="currentColor" strokeWidth="1"/></svg>}

export default function Header() {
  const [open, setOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const path = usePathname();
  const links = [['/about', 'О фонде'], ['/programs', 'Направления'], ['/projects', 'Проекты'], ['/regions', 'Регионы'], ['/insights', 'Материалы'], ['/contacts', 'Контакты']];

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      toggle.current?.focus();
    };
    const closeOutside = (event: PointerEvent | FocusEvent) => {
      if (event.target instanceof Node && !header.current?.contains(event.target)) setOpen(false);
    };
    const closeOnDesktop = () => {
      if (toggle.current && getComputedStyle(toggle.current).display === 'none') setOpen(false);
    };

    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    window.addEventListener('resize', closeOnDesktop);
    closeOnDesktop();
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
      window.removeEventListener('resize', closeOnDesktop);
    };
  }, [open]);

  return <header className="site-header" ref={header}>
    <div className="header-inner">
      <Link href="/" className="brand" aria-label="НФРМИ — главная"><Mark /><span><strong>НФРМИ</strong><small>Национальный фонд развития<br />и международной интеграции</small></span></Link>
      <button ref={toggle} type="button" className="menu-toggle" aria-expanded={open} aria-controls="main-navigation" aria-label={open ? 'Закрыть меню' : 'Открыть меню'} onClick={() => setOpen(previous => !previous)}>{open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button>
      <nav id="main-navigation" className={open ? 'main-nav is-open' : 'main-nav'} aria-label="Основная навигация">
        {links.map(([href, label]) => <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={path.startsWith(href) ? 'page' : undefined}>{label}</Link>)}
        <Link href="/apply" onClick={() => setOpen(false)} className="header-cta">Предложить проект <ArrowUpRight size={15} aria-hidden="true" /></Link>
      </nav>
    </div>
  </header>;
}
