"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Authentication endpoints require a full document navigation. */

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "@/components/Link";
import { Mark } from "@/components/Header";
import { ArrowDownToLine, ArrowLeft, ArrowUpRight, Check, CheckCircle2, ChevronRight, CircleAlert, Clock3, FileText, FolderOpen, Globe2, Inbox, LayoutDashboard, ListChecks, LoaderCircle, Menu, Newspaper, Pencil, Plus, Search, Settings2, ShieldCheck, Trash2, Upload, Waypoints, X } from "lucide-react";

import type { ContentType, ContentItem, Application } from "@/lib/types";
type AuditItem = { id: string; actor: string; action: string; entity: string; entityId: string; createdAt: string };
type Tab = "overview" | ContentType | "settings" | "applications" | "audit";
type Notice = { kind: "success" | "error"; text: string } | null;
const contentTypes: ContentType[] = ["program", "project", "region", "insight", "document"];
const names: Record<ContentType, { plural: string; singular: string; description: string }> = {
  program: { plural: "Направления", singular: "Направление", description: "Задачи, компетенции и форматы работы фонда." },
  project: { plural: "Проекты", singular: "Проект", description: "Согласованные проекты, этапы и подтверждённые результаты." },
  region: { plural: "Регионы", singular: "Регион", description: "Историческая география и текущее взаимодействие." },
  insight: { plural: "Материалы", singular: "Материал", description: "Практика, аналитика и новости для партнёров фонда." },
  document: { plural: "Документы", singular: "Документ", description: "Официальные документы и материалы для скачивания." },
};
const statusNames: Record<string, string> = { draft: "Черновик", published: "Опубликован", archived: "В архиве", new: "Новая", review: "На рассмотрении", needs_info: "Запрошены сведения", in_progress: "В работе", completed: "Завершена", rejected: "Отклонена" };
const applicationStatuses = ["new", "review", "needs_info", "in_progress", "completed", "rejected"];
const navItems: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Обзор", icon: LayoutDashboard },
  { id: "applications", label: "Обращения", icon: Inbox },
  { id: "program", label: "Направления", icon: Waypoints },
  { id: "project", label: "Проекты", icon: FolderOpen },
  { id: "region", label: "Регионы", icon: Globe2 },
  { id: "insight", label: "Материалы", icon: Newspaper },
  { id: "document", label: "Документы", icon: FileText },
  { id: "settings", label: "Настройки сайта", icon: Settings2 },
  { id: "audit", label: "Журнал действий", icon: ListChecks },
];
function date(value: string) { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleString("ru-RU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
function bytes(value: string) { const n = Number(value); return !n ? "" : n >= 1048576 ? `${(n / 1048576).toFixed(1)} МБ` : `${Math.ceil(n / 1024)} КБ`; }
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...init?.headers } });
  const result = await response.json().catch(() => ({})) as { error?: unknown };
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Не удалось выполнить запрос. Попробуйте ещё раз.");
  return result as T;
}
function Badge({ status }: { status: string }) { return <span className={`adm-badge adm-badge-${status}`}><i />{statusNames[status] || status}</span>; }
function Field({ label, hint, children, wide }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) { return <label className={`adm-field${wide ? " adm-field-wide" : ""}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
function Empty({ title, description, action }: { title: string; description: string; action?: ReactNode }) { return <div className="adm-empty"><FolderOpen size={32} strokeWidth={1.2} /><h3>{title}</h3><p>{description}</p>{action}</div>; }
function Loading() { return <div className="adm-loading" role="status"><LoaderCircle className="adm-spin" size={22} /> Загружаем данные…</div>; }
function slugify(text: string) { const ru: Record<string, string> = { а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya" }; return text.toLowerCase().split("").map(c => ru[c] ?? c).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120); }
function blank(type: ContentType): ContentItem { return { id: "", type, slug: "", title: "", summary: "", body: "", status: "draft", category: "", region: "", meta: {}, createdAt: "", updatedAt: "" }; }
function path(item: ContentItem) { return item.type === "document" ? "/documents" : item.type === "region" ? "/regions" : `/${item.type === "program" ? "programs" : item.type === "project" ? "projects" : "insights"}/${item.slug}`; }

export default function AdminPanel({ displayName }: { displayName: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [settingsRevision, setSettingsRevision] = useState("");
  const [settingsDraft, setSettingsDraft] = useState<Record<string, string>>({});
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editor, setEditor] = useState<ContentItem | null>(null);
  const [original, setOriginal] = useState("");
  const [preview, setPreview] = useState(false);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [appOriginal, setAppOriginal] = useState("");
  const [uploading, setUploading] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const focusHeadingAfterNavigation = useRef(false);
  const dirty = (editor !== null && JSON.stringify(editor) !== original) || (tab === "settings" && JSON.stringify(settingsDraft) !== JSON.stringify(settings)) || (selectedApp !== null && JSON.stringify(selectedApp) !== appOriginal);
  const newCount = applications.filter(a => a.status === "new").length;

  const refresh = useCallback(() => Promise.all([
    Promise.all(contentTypes.map(type => api<{ items: ContentItem[] }>(`/api/admin/content?type=${type}`))),
    api<{ items: Application[] }>("/api/admin/applications"),
    api<{ settings: Record<string, string>; revision: string }>("/api/admin/settings"),
  ]).then(([content, apps, config]) => {
    setItems(content.flatMap(result => result.items)); setApplications(apps.items); setSettings(config.settings); setSettingsDraft(config.settings); setSettingsRevision(config.revision);
  }).catch((error: unknown) => {
    setLoadFailed(true); setNotice({ kind: "error", text: error instanceof Error ? error.message : "Ошибка загрузки." });
  }).finally(() => setLoading(false)), []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (!dirty) return; const listener = (event: BeforeUnloadEvent) => { event.preventDefault(); }; window.addEventListener("beforeunload", listener); return () => window.removeEventListener("beforeunload", listener); }, [dirty]);
  useEffect(() => { if (tab !== "audit") return; api<{ items: AuditItem[] }>("/api/admin/audit").then(result => setAudit(result.items)).catch(error => setNotice({ kind: "error", text: error.message })).finally(() => setAuditLoading(false)); }, [tab]);
  useEffect(() => {
    if (!mobileOpen && focusHeadingAfterNavigation.current) {
      focusHeadingAfterNavigation.current = false;
      headingRef.current?.focus();
    }
  }, [mobileOpen, tab, editor, selectedApp]);
  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMobileOpen(false);
      mobileToggleRef.current?.focus();
    };
    const closeOnDesktop = () => {
      if (mobileToggleRef.current && mobileToggleRef.current.getClientRects().length === 0) setMobileOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnDesktop);
    closeOnDesktop();
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnDesktop);
    };
  }, [mobileOpen]);
  function mayLeave() { if (busy || uploading) { setNotice({ kind: "error", text: "Дождитесь завершения текущего сохранения или загрузки." }); return false; } return !dirty || window.confirm("Есть несохранённые изменения. Покинуть редактор без сохранения?"); }
  function navigate(next: Tab) { if (next === tab && !editor && !selectedApp) { focusHeadingAfterNavigation.current = mobileOpen; setMobileOpen(false); return; } if (!mayLeave()) return; focusHeadingAfterNavigation.current = mobileOpen; if(next === "audit") setAuditLoading(true); setTab(next); setEditor(null); setSelectedApp(null); setQuery(""); setStatusFilter(""); setPreview(false); setMobileOpen(false); setSettingsDraft(settings); setNotice(null); window.scrollTo({ top: 0 }); }
  function edit(item: ContentItem) { if (!mayLeave()) return; setEditor(structuredClone(item)); setOriginal(JSON.stringify(item)); setPreview(false); setNotice(null); window.scrollTo({ top: 0 }); }
  function updateEditor(key: keyof ContentItem, value: string) { setEditor(current => current ? { ...current, [key]: value } : null); }
  function updateMeta(key: string, value: string) { setEditor(current => current ? { ...current, meta: { ...current.meta, [key]: value } } : null); }
  async function saveContent(event: FormEvent) {
    event.preventDefault(); if (!editor || busy) return; setBusy(true); setNotice(null);
    try { const result = await api<{ item: ContentItem }>("/api/admin/content", { method: editor.id ? "PUT" : "POST", body: JSON.stringify({ item: editor }) }); setItems(current => [...current.filter(item => item.id !== result.item.id), result.item]); setEditor(result.item); setOriginal(JSON.stringify(result.item)); setNotice({ kind: "success", text: `${editor.status === "published" ? "Материал опубликован" : "Изменения сохранены"}. ${date(result.item.updatedAt)}.` }); }
    catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Ошибка сохранения." }); }
    finally { setBusy(false); }
  }
  async function deleteContent(item: ContentItem) {
    if (busy || !window.confirm(`Удалить «${item.title}»? Это действие нельзя отменить. Чтобы сохранить запись, выберите статус «В архиве».`)) return;
    setBusy(true); try { await api("/api/admin/content", { method: "DELETE", body: JSON.stringify({ id: item.id, updatedAt: item.updatedAt }) }); setItems(current => current.filter(row => row.id !== item.id)); setEditor(null); setNotice({ kind: "success", text: "Материал удалён." }); } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Ошибка удаления." }); } finally { setBusy(false); }
  }
  async function upload(file: File, kind: "file" | "image") {
    const limit = kind === "file" ? 10 * 1024 * 1024 : 8 * 1024 * 1024;
    if (file.size > limit) { setNotice({ kind: "error", text: `Файл слишком большой. Максимум ${kind === "file" ? "10" : "8"} МБ.` }); return; }
    if (!(kind === "file" ? ["application/pdf"] : ["image/jpeg", "image/png", "image/webp"]).includes(file.type)) { setNotice({ kind: "error", text: "Этот формат файла не поддерживается." }); return; }
    setUploading(true); setNotice(null);
    try { const form = new FormData(); form.set("file", file); const result = await api<{ key: string; url: string; name: string; size: number; mime: string }>("/api/admin/files", { method: "POST", body: form }); setEditor(current => current ? { ...current, meta: { ...current.meta, [`${kind}Key`]: result.key, [`${kind}Url`]: result.url, [`${kind}Name`]: result.name, [`${kind}Size`]: String(result.size), [`${kind}Mime`]: result.mime } } : null); setNotice({ kind: "success", text: "Файл загружен. Сохраните запись, чтобы прикрепить его к материалу." }); } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Ошибка загрузки файла." }); } finally { setUploading(false); }
  }
  async function saveSettings(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setNotice(null);
    try { const result = await api<{ settings: Record<string, string>; revision: string }>("/api/admin/settings", { method: "PUT", body: JSON.stringify({ settings: settingsDraft, revision: settingsRevision }) }); setSettings(result.settings); setSettingsDraft(result.settings); setSettingsRevision(result.revision); setNotice({ kind: "success", text: "Настройки сайта сохранены." }); } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Ошибка сохранения." }); } finally { setBusy(false); }
  }
  async function saveApplication(event: FormEvent) {
    event.preventDefault(); if (!selectedApp || busy) return; setBusy(true); setNotice(null);
    try { const result = await api<{ item?: Application }>("/api/admin/applications", { method: "PATCH", body: JSON.stringify({ id: selectedApp.id, status: selectedApp.status, notes: selectedApp.notes, updatedAt: selectedApp.updatedAt }) }); const saved = result.item || selectedApp; setApplications(current => current.map(item => item.id === saved.id ? saved : item)); setSelectedApp(saved); setAppOriginal(JSON.stringify(saved)); setNotice({ kind: "success", text: "Статус и внутренняя заметка сохранены." }); } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Ошибка сохранения." }); } finally { setBusy(false); }
  }
  async function deleteApplication() {
    if (!selectedApp || busy || !window.confirm(`Безвозвратно удалить обращение ${selectedApp.reference} и контактные данные заявителя?`)) return;
    setBusy(true); try { await api("/api/admin/applications", { method: "DELETE", body: JSON.stringify({ id: selectedApp.id }) }); setApplications(current => current.filter(item => item.id !== selectedApp.id)); setSelectedApp(null); setNotice({ kind: "success", text: "Обращение удалено." }); } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Ошибка удаления." }); } finally { setBusy(false); }
  }
  const section = contentTypes.includes(tab as ContentType) ? names[tab as ContentType] : null;
  const filtered = items.filter(item => item.type === tab && (!statusFilter || item.status === statusFilter) && `${item.title} ${item.summary} ${item.region}`.toLowerCase().includes(query.toLowerCase()));
  const filteredApps = applications.filter(item => (!statusFilter || item.status === statusFilter) && `${item.title} ${item.organization} ${item.reference} ${item.name}`.toLowerCase().includes(query.toLowerCase()));
  const title = tab === "overview" ? "Рабочий стол" : tab === "applications" ? "Обращения" : tab === "settings" ? "Настройки сайта" : tab === "audit" ? "Журнал действий" : section?.plural;
  const subtitle = tab === "overview" ? "Содержание и входящие предложения — в одном пространстве." : tab === "applications" ? "Проектные предложения и запросы на сотрудничество." : tab === "settings" ? "Основные тексты, контакты и сведения о фонде." : tab === "audit" ? "История изменений, выполненных администраторами." : section?.description;

  return <div className="adm-shell">
    <header className="adm-mobile-bar"><Link href="/" className="adm-mobile-logo" aria-label="НФРМИ — на сайт фонда"><Mark/><span>Панель управления</span></Link><button ref={mobileToggleRef} type="button" className="adm-icon-btn" aria-label={mobileOpen ? "Закрыть меню" : "Открыть меню"} aria-expanded={mobileOpen} aria-controls="admin-navigation" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X /> : <Menu />}</button></header>
    {mobileOpen && <button className="adm-backdrop" aria-label="Закрыть меню" onClick={() => setMobileOpen(false)} />}
    <aside className={`adm-sidebar${mobileOpen ? " adm-sidebar-open" : ""}`} id="admin-navigation">
      <Link href="/" className="adm-brand" aria-label="НФРМИ — на сайт фонда" onClick={event => { if (!mayLeave()) event.preventDefault(); }}><Mark/><span className="adm-brand-label">ПАНЕЛЬ<br/>УПРАВЛЕНИЯ</span></Link>
      <div className="adm-sidebar-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
      <nav aria-label="Разделы панели">{navItems.map(({ id, label, icon: Icon }, index) => <button key={id} className={`adm-nav-item${tab === id ? " adm-nav-active" : ""}${index === 2 || index === 7 ? " adm-nav-separated" : ""}`} onClick={() => navigate(id)} aria-current={tab === id ? "page" : undefined}><Icon size={19} strokeWidth={1.6} /><span>{label}</span>{id === "applications" && newCount > 0 && <b>{newCount}</b>}</button>)}</nav>
      <div className="adm-sidebar-bottom"><Link href="/" target="_blank" rel="noreferrer">Открыть сайт <ArrowUpRight size={17} /></Link><div className="adm-user"><div className="adm-avatar">{displayName.slice(0, 1).toUpperCase()}</div><div><strong>{displayName}</strong><span>Администратор</span></div></div><a className="adm-signout" href="/signout-with-chatgpt?return_to=/" onClick={event => { if (!mayLeave()) event.preventDefault(); }}>Выйти из аккаунта</a></div>
    </aside>
    <main className="adm-main">
      <div className="adm-topline"><span>Национальный фонд развития<br className="adm-mobile-break" /> и международной интеграции</span><span className="adm-protected"><ShieldCheck size={15} /> Защищённая панель</span></div>
      <div className="adm-page-heading"><div><p className="adm-eyebrow">УПРАВЛЕНИЕ ФОНДОМ</p><h1 ref={headingRef} tabIndex={-1}>{title}</h1><p>{subtitle}</p></div>{section && !editor && <button className="adm-btn adm-btn-primary" onClick={() => edit(blank(tab as ContentType))}><Plus size={18} /> Создать {tab === "project" ? "проект" : tab === "region" ? "регион" : tab === "document" ? "документ" : tab === "program" ? "направление" : "материал"}</button>}</div>
      {!loading && !loadFailed && <div className="adm-refresh-row"><button className="adm-text-btn" onClick={() => { if(mayLeave()){setEditor(null);setSelectedApp(null);setNotice(null);setLoading(true);setLoadFailed(false);void refresh();if(tab === "audit"){setAuditLoading(true);api<{items: AuditItem[]}>("/api/admin/audit").then(result=>setAudit(result.items)).catch(error=>setNotice({kind:"error",text:error.message})).finally(()=>setAuditLoading(false));}} }}>Обновить данные</button></div>}
      {notice && <div className={`adm-notice adm-notice-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.kind === "error" ? <CircleAlert size={20} /> : <CheckCircle2 size={20} />}<span>{notice.text}</span><button aria-label="Закрыть уведомление" onClick={() => setNotice(null)}><X size={17} /></button></div>}
      {loading ? <Loading /> : loadFailed ? <section className="adm-card"><Empty title="Не удалось загрузить данные" description="Проверьте соединение и попробуйте повторить запрос." action={<button className="adm-btn adm-btn-primary" onClick={() => {setLoading(true);setLoadFailed(false);void refresh();}}>Попробовать снова</button>}/></section> : <>
      {tab === "overview" && <>
        <div className="adm-stats"><button onClick={() => navigate("applications")}><span>Новые обращения <Inbox size={18} /></span><strong>{newCount.toString().padStart(2,"0")}</strong><small>Ожидают рассмотрения <ChevronRight size={15}/></small></button><button onClick={() => navigate("insight")}><span>Опубликовано <CheckCircle2 size={18}/></span><strong>{items.filter(i => i.status === "published").length.toString().padStart(2,"0")}</strong><small>Записей на сайте <ChevronRight size={15}/></small></button><button onClick={() => { navigate(contentTypes.find(type => items.some(item => item.type === type && item.status === "draft")) || "insight"); setStatusFilter("draft"); }}><span>Черновики <Pencil size={18}/></span><strong>{items.filter(i => i.status === "draft").length.toString().padStart(2,"0")}</strong><small>Во всех разделах <ChevronRight size={15}/></small></button></div>
        <div className="adm-overview-grid"><section className="adm-card"><div className="adm-card-heading"><div><p className="adm-eyebrow">ВХОДЯЩИЕ</p><h2>Последние обращения</h2></div><button className="adm-text-btn" onClick={() => navigate("applications")}>Все <ArrowUpRight size={16}/></button></div>{applications.length ? <div className="adm-simple-list">{[...applications].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,5).map(item => <button key={item.id} onClick={() => { navigate("applications"); setSelectedApp(structuredClone(item)); setAppOriginal(JSON.stringify(item)); }}><div><small>{item.reference} · {date(item.createdAt)}</small><strong>{item.title}</strong><span>{item.organization}</span></div><Badge status={item.status}/></button>)}</div> : <Empty title="Пока нет обращений" description="Предложения с формы сайта появятся здесь после отправки." />}</section><section className="adm-card"><div className="adm-card-heading"><div><p className="adm-eyebrow">СОДЕРЖАНИЕ</p><h2>Разделы сайта</h2></div></div><div className="adm-section-list">{contentTypes.map(type => <button key={type} onClick={() => navigate(type)}><span>{names[type].plural}<small>{items.filter(i => i.type === type && i.status === "published").length} опубликовано</small></span><b>{items.filter(i => i.type === type).length}</b><ChevronRight size={16}/></button>)}</div></section></div>
        <section className="adm-workflow"><div><p className="adm-eyebrow">РЕДАКЦИОННЫЙ ПОРЯДОК</p><h2>От черновика к публикации</h2></div><p>Создайте материал, проверьте текст в предпросмотре и выберите статус «Опубликован». Черновики и архивные записи доступны только в панели.</p><button className="adm-btn adm-btn-secondary" onClick={() => { navigate("insight"); edit(blank("insight")); }}>Новый материал <Plus size={17}/></button></section>
      </>}
      {section && !editor && <section className="adm-card">
        <div className="adm-toolbar"><label className="adm-search"><Search size={18}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по названию и описанию" aria-label="Поиск материалов" /></label><select aria-label="Статус материала" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">Все статусы</option>{["draft","published","archived"].map(s => <option key={s} value={s}>{statusNames[s]}</option>)}</select><span className="adm-count">{filtered.length} записей</span></div>
        {filtered.length ? <div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>Название</th><th>Статус</th><th>Изменено</th><th><span className="adm-sr-only">Действия</span></th></tr></thead><tbody>{filtered.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).map(item => <tr key={item.id}><td><button className="adm-row-title" onClick={() => edit(item)}>{item.title}</button><span className="adm-row-sub">{item.category || item.region || `/${item.slug}`}</span></td><td><Badge status={item.status}/></td><td className="adm-date">{date(item.updatedAt)}</td><td><button className="adm-icon-btn" aria-label={`Редактировать ${item.title}`} onClick={() => edit(item)}><Pencil size={17}/></button></td></tr>)}</tbody></table></div> : <Empty title={query || statusFilter ? "Ничего не найдено" : "Здесь появятся записи"} description={query || statusFilter ? "Попробуйте изменить запрос или снять фильтр." : "Добавьте первый материал и сохраните его как черновик или опубликуйте на сайте."} action={query || statusFilter ? <button className="adm-btn adm-btn-secondary" onClick={() => { setQuery(""); setStatusFilter(""); }}>Сбросить фильтры</button> : undefined} />}
      </section>}
      {editor && <form onSubmit={saveContent}>
        <div className="adm-editor-top"><button type="button" className="adm-text-btn" onClick={() => { if (mayLeave()) setEditor(null); }}><ArrowLeft size={16}/> К списку</button><span className="adm-unsaved">{dirty ? "Есть несохранённые изменения" : editor.id ? `Сохранено ${date(editor.updatedAt)}` : "Новая запись"}</span><div className="adm-editor-tabs"><button type="button" className={!preview ? "adm-editor-tab-active" : ""} onClick={() => setPreview(false)}>Редактор</button><button type="button" className={preview ? "adm-editor-tab-active" : ""} onClick={() => setPreview(true)}>Предпросмотр</button></div></div>
        <div className="adm-editor-grid"><section className="adm-card adm-editor-main">{preview ? <div className="adm-preview"><p className="adm-eyebrow">{editor.category || names[editor.type].singular}</p><h2>{editor.title || "Название материала"}</h2><p className="adm-preview-summary">{editor.summary}</p>{editor.body.split(/(?=^## )/m).map((section,i) => section.startsWith("## ") ? <section key={i}><h3>{section.split("\n")[0].slice(3)}</h3>{section.split("\n").slice(1).join("\n").split(/\n\s*\n/).filter(Boolean).map((p,j) => <p key={j}>{p}</p>)}</section> : section.split(/\n\s*\n/).filter(Boolean).map((p,j) => <p key={`${i}-${j}`}>{p}</p>))}{!editor.body && <p className="adm-muted">Текст пока не добавлен.</p>}</div> : <><h2>{editor.id ? "Редактирование записи" : `Новый ${editor.type === "program" ? "материал направления" : editor.type === "region" ? "регион" : editor.type === "project" ? "проект" : editor.type === "document" ? "документ" : "материал"}`}</h2><Field label="Название *"><input required minLength={3} maxLength={200} value={editor.title} onChange={e => updateEditor("title",e.target.value)} placeholder="Понятное название записи"/></Field><Field label="Краткое описание *" hint="Анонс для карточки в каталоге."><textarea required rows={3} maxLength={1000} value={editor.summary} onChange={e => updateEditor("summary",e.target.value)} /></Field><Field label="Основной текст" hint="Разделы начинайте с ##. Отделяйте абзацы пустой строкой; HTML не выполняется."><textarea className="adm-body-editor" rows={14} maxLength={50000} value={editor.body} onChange={e => updateEditor("body",e.target.value)} /></Field>
        {editor.type === "program" && <div className="adm-form-grid">{[["deliverable","Результат работы"]].map(([key,label]) => <Field key={key} label={label} wide={key === "steps"}><textarea rows={3} value={editor.meta[key] || ""} onChange={e => updateMeta(key,e.target.value)} /></Field>)}</div>}
        {editor.type === "project" && <div className="adm-form-grid">{[["stage","Стадия проекта"],["role","Роль фонда"],["outcome","Подтверждённые результаты"]].map(([key,label]) => <Field key={key} label={label} wide={key === "outcome"}><textarea rows={3} value={editor.meta[key] || ""} onChange={e => updateMeta(key,e.target.value)} /></Field>)}</div>}
        
        {editor.type === "insight" && <div className="adm-form-grid"><Field label="Автор или редакция"><input value={editor.meta.author || ""} onChange={e => updateMeta("author", e.target.value)}/></Field><Field label="Дата публикации"><input type="date" value={(editor.meta.publishedAt || "").slice(0,10)} onChange={e => updateMeta("publishedAt",e.target.value)}/></Field></div>}
        {editor.type === "document" && <div className="adm-upload"><Upload size={24}/><h3>{editor.meta.fileName || "Прикрепить документ"}</h3><p>{editor.meta.fileName ? bytes(editor.meta.fileSize) : "PDF, не более 10 МБ. После загрузки сохраните запись."}</p><label className={`adm-btn adm-btn-secondary${uploading ? " adm-disabled" : ""}`}>{uploading ? "Загрузка…" : editor.meta.fileKey ? "Заменить файл" : "Выбрать PDF"}<input className="adm-sr-only" type="file" accept="application/pdf,.pdf" disabled={uploading} onChange={e => { const f=e.target.files?.[0]; if(f) void upload(f,"file"); e.target.value=""; }}/></label>{editor.meta.fileUrl && <a className="adm-text-btn" href={editor.meta.fileUrl} target="_blank" rel="noreferrer">Открыть документ <ArrowUpRight size={15}/></a>}</div>}
        {editor.type !== "document" && <div className="adm-upload"><Upload size={24}/><h3>{editor.meta.imageName || "Изображение материала"}</h3><p>{editor.meta.imageName ? bytes(editor.meta.imageSize) : "JPEG, PNG или WebP, не более 8 МБ."}</p><label className={`adm-btn adm-btn-secondary${uploading ? " adm-disabled" : ""}`}>{uploading ? "Загрузка…" : editor.meta.imageKey ? "Заменить изображение" : "Выбрать изображение"}<input className="adm-sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={e => { const f=e.target.files?.[0]; if(f) void upload(f,"image"); e.target.value=""; }}/></label>{editor.meta.imageUrl && <a className="adm-text-btn" href={editor.meta.imageUrl} target="_blank" rel="noreferrer">Открыть изображение <ArrowUpRight size={15}/></a>}<Field label="Описание изображения"><input value={editor.meta.imageAlt || ""} onChange={e => updateMeta("imageAlt",e.target.value)} placeholder="Что изображено на фотографии" /></Field></div>}
        </>}</section><aside className="adm-editor-aside"><section className="adm-card adm-panel"><h2>Публикация</h2><Field label="Статус"><select value={editor.status} onChange={e => updateEditor("status",e.target.value)}>{["draft","published","archived"].map(s => <option key={s} value={s}>{statusNames[s]}</option>)}</select></Field><p className="adm-small">{editor.status === "published" ? "После сохранения материал будет виден посетителям сайта." : editor.status === "archived" ? "Материал будет скрыт с сайта и сохранён в панели." : "Черновик доступен только администраторам."}</p><button className="adm-btn adm-btn-primary adm-full" type="submit" disabled={busy || uploading}>{busy ? <LoaderCircle className="adm-spin" size={17}/> : <Check size={17}/>} {busy ? "Сохраняем…" : "Сохранить изменения"}</button>{editor.id && editor.status === "published" && <Link className="adm-btn adm-btn-secondary adm-full" href={path(editor)} target="_blank">Открыть на сайте <ArrowUpRight size={15}/></Link>}</section><section className="adm-card adm-panel"><h2>Параметры записи</h2><Field label="Адрес страницы *" hint="Латинские буквы, цифры и дефисы."><input required minLength={2} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={editor.slug} maxLength={120} onChange={e => updateEditor("slug",e.target.value)} placeholder="nazvanie-materiala"/></Field><button type="button" className="adm-text-btn adm-slug-button" onClick={() => updateEditor("slug",slugify(editor.title))}>Создать из названия</button><Field label="Категория"><input value={editor.category} maxLength={120} onChange={e => updateEditor("category",e.target.value)} placeholder={editor.type === "insight" ? "Практика" : "Категория записи"}/></Field>{editor.type === "project" && <Field label="Регион"><input value={editor.region} maxLength={150} onChange={e => updateEditor("region",e.target.value)}/></Field>}<Field label="Порядок в списке"><input type="number" min="0" max="9999" value={editor.meta.number || ""} onChange={e => updateMeta("number",e.target.value)} placeholder="0"/></Field></section><section className="adm-card adm-panel"><h2>Поиск и предпросмотр</h2><Field label="SEO-заголовок"><input value={editor.meta.seoTitle || ""} maxLength={180} onChange={e => updateMeta("seoTitle",e.target.value)}/></Field><Field label="SEO-описание"><textarea rows={3} value={editor.meta.seoDescription || ""} maxLength={350} onChange={e => updateMeta("seoDescription",e.target.value)}/></Field></section>{editor.id && <div><button type="button" className="adm-btn adm-btn-danger adm-full" disabled={busy || items.find(item => item.id === editor.id)?.status === "published"} onClick={() => void deleteContent(editor)}><Trash2 size={16}/> Удалить запись</button>{items.find(item => item.id === editor.id)?.status === "published" && <p className="adm-small" style={{marginTop:10}}>Перед удалением выберите статус «В архиве» и сохраните запись.</p>}</div>}</aside></div>
      </form>}
      {tab === "applications" && !selectedApp && <section className="adm-card"><div className="adm-toolbar"><label className="adm-search"><Search size={18}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Номер, тема или организация" aria-label="Поиск обращений"/></label><select aria-label="Статус обращения" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">Все статусы</option>{applicationStatuses.map(s => <option key={s} value={s}>{statusNames[s]}</option>)}</select><a href="/api/admin/applications?format=csv" className="adm-btn adm-btn-secondary" download><ArrowDownToLine size={17}/> CSV</a></div>{filteredApps.length ? <div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>Обращение</th><th>Статус</th><th>Дата</th><th><span className="adm-sr-only">Открыть</span></th></tr></thead><tbody>{filteredApps.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(item=><tr key={item.id}><td><small className="adm-row-reference">{item.reference}</small><button className="adm-row-title" onClick={()=>{setSelectedApp(structuredClone(item));setAppOriginal(JSON.stringify(item));}}>{item.title}</button><span className="adm-row-sub">{item.organization}</span></td><td><Badge status={item.status}/></td><td className="adm-date">{date(item.createdAt)}</td><td><button className="adm-icon-btn" aria-label={`Открыть ${item.reference}`} onClick={()=>{setSelectedApp(structuredClone(item));setAppOriginal(JSON.stringify(item));}}><ChevronRight size={18}/></button></td></tr>)}</tbody></table></div>:<Empty title={query || statusFilter ? "Обращения не найдены" : "Пока нет обращений"} description={query || statusFilter ? "Измените запрос или фильтр статуса." : "Здесь будут предложения, отправленные через форму сайта."}/>}</section>}
      {tab === "applications" && selectedApp && <><div className="adm-editor-top"><button className="adm-text-btn" onClick={()=>{if(mayLeave())setSelectedApp(null);}}><ArrowLeft size={16}/> Все обращения</button><span className="adm-unsaved">{dirty ? "Есть несохранённые изменения" : selectedApp.reference}</span></div><div className="adm-editor-grid"><article className="adm-card adm-application-detail"><div className="adm-application-meta"><span>{selectedApp.reference}</span><span>{date(selectedApp.createdAt)}</span></div><h2>{selectedApp.title}</h2><Badge status={selectedApp.status}/><dl className="adm-details">{[["Тип",selectedApp.type === "partnership" ? "Сотрудничество" : "Проект"],["Организация",selectedApp.organization],["ИНН",selectedApp.inn],["Контактное лицо",selectedApp.name],["Email",selectedApp.email],["Телефон",selectedApp.phone],["Регион",selectedApp.region],["Направление",items.find(item=>item.type === "program" && (item.slug === selectedApp.direction || item.title === selectedApp.direction))?.title || (selectedApp.direction === "consultation" ? "Нужна консультация" : selectedApp.direction)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value || "Не указан"}</dd></div>)}</dl><h3>Описание предложения</h3><p className="adm-application-text">{selectedApp.description}</p></article><form className="adm-editor-aside" onSubmit={saveApplication}><section className="adm-card adm-panel"><h2>Работа с обращением</h2><Field label="Статус"><select value={selectedApp.status} onChange={e=>setSelectedApp({...selectedApp,status:e.target.value})}>{applicationStatuses.map(s=><option key={s} value={s}>{statusNames[s]}</option>)}</select></Field><Field label="Внутренняя заметка" hint="Доступна только администраторам."><textarea rows={8} maxLength={10000} value={selectedApp.notes || ""} onChange={e=>setSelectedApp({...selectedApp,notes:e.target.value})} placeholder="Результат рассмотрения, следующий шаг, ответственный…"/></Field><button className="adm-btn adm-btn-primary adm-full" disabled={busy}>{busy ? <LoaderCircle className="adm-spin" size={17}/> : <Check size={17}/>} Сохранить</button><p className="adm-small">Смена статуса не отправляет автоматическое письмо заявителю.</p></section><button type="button" className="adm-btn adm-btn-danger adm-full" disabled={busy} onClick={()=>void deleteApplication()}><Trash2 size={16}/> Удалить обращение</button></form></div></>}
      {tab === "settings" && <form onSubmit={saveSettings} className="adm-settings-form">{[
        {title:"Фонд и первый экран",description:"Основные подписи и обращение к посетителю.",fields:[["heroTitle","Заголовок первого экрана","textarea"],["heroDescription","Описание первого экрана","textarea"]]},
        {title:"О фонде",description:"Вступление для страницы о деятельности фонда.",fields:[["aboutTitle","Заголовок","input"],["aboutText","Текст о фонде","textarea"]]},
        {title:"Контакты и реквизиты",description:"Указывайте только согласованные контакты. Пустые поля не отображаются на сайте.",fields:[["address","Адрес","input"],["email","Email","email"],["phone","Телефон","tel"],["inn","ИНН","input"],["ogrn","ОГРН","input"]]},
        {title:"Обработка персональных данных",description:"Утверждённый текст политики для страницы сайта.",fields:[["privacyText","Политика обработки персональных данных","textarea"]]},
      ].map(group=><section className="adm-card adm-settings-section" key={group.title}><div><h2>{group.title}</h2><p>{group.description}</p></div><div className="adm-form-grid">{group.fields.map(([key,label,type])=><Field key={key} label={label} wide={type === "textarea" || key === "siteName" || key === "address"}>{type === "textarea" ? <textarea rows={key === "privacyText" ? 10 : key === "aboutText" ? 7 : 3} maxLength={key === "privacyText" ? 20000 : 10000} value={settingsDraft[key] || ""} onChange={e=>setSettingsDraft({...settingsDraft,[key]:e.target.value})}/> : <input type={type === "input" ? "text" : type} maxLength={500} value={settingsDraft[key] || ""} onChange={e=>setSettingsDraft({...settingsDraft,[key]:e.target.value})}/>}</Field>)}</div></section>)}<div className="adm-settings-save"><span>{dirty ? "Есть несохранённые изменения" : "Все изменения сохранены"}</span><button className="adm-btn adm-btn-primary" disabled={busy}>{busy ? <LoaderCircle className="adm-spin" size={17}/> : <Check size={17}/>} Сохранить настройки</button></div></form>}
      {tab === "audit" && <section className="adm-card">{auditLoading ? <Loading/> : audit.length ? <div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>Дата</th><th>Действие</th><th>Запись</th><th>Администратор</th></tr></thead><tbody>{audit.map(item=><tr key={item.id}><td className="adm-date">{date(item.createdAt)}</td><td>{({create:"Создание",update:"Изменение",delete:"Удаление",upload:"Загрузка",publish:"Публикация",export:"Экспорт"} as Record<string,string>)[item.action] || item.action}</td><td><strong>{({content:"Материал",settings:"Настройки",application:"Обращение",applications:"Обращения",file:"Файл"} as Record<string,string>)[item.entity] || item.entity}</strong><code className="adm-audit-id">{item.entityId}</code></td><td><code className="adm-audit-id">{item.actor}</code></td></tr>)}</tbody></table></div> : <Empty title="Действий пока нет" description="Создание, изменение и удаление записей появятся в журнале."/>}</section>}
      </>}
      <footer className="adm-footer"><span>НФРМИ · Управление содержимым</span><span><Clock3 size={13}/> Изменения сохраняются на сервере</span></footer>
    </main>
  </div>;
}
