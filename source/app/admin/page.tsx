/* eslint-disable @next/next/no-html-link-for-pages -- Authentication endpoints require a full document navigation. */
import type { Metadata } from "next";
import Link from "@/components/Link";
import { ArrowLeft, ArrowUpRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { getAdminAccess } from "@/lib/auth";
import AdminPanel from "@/components/AdminPanel";
import "./admin.css";

export const metadata: Metadata = {
  title: "Управление сайтом",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const { user, isAdmin } = await getAdminAccess();
  if (user && isAdmin) return <AdminPanel displayName={user.displayName} />;
  return <main className="adm-access">
    <Link className="adm-access-back" href="/"><ArrowLeft size={18} /> На сайт фонда</Link>
    <section className="adm-access-card" aria-labelledby="access-title">
      <div className="adm-access-mark">НФРМИ<span>УПРАВЛЕНИЕ САЙТОМ</span></div>
      <div className="adm-access-icon">{user ? <ShieldCheck size={30} /> : <LockKeyhole size={30} />}</div>
      <p className="adm-eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</p>
      <h1 id="access-title">{user ? "Доступ для администратора" : "Содержание. Проекты. Обращения."}</h1>
      <p>{user ? "Вы вошли в систему. Для работы с содержимым сайта и обращениями вашей учётной записи нужны права администратора." : "Войдите через ChatGPT, чтобы управлять материалами фонда и работать с входящими предложениями."}</p>
      {user ? <><div className="adm-identity"><span>Идентификатор вашей учётной записи</span><code>{user.userId}</code></div><p className="adm-small">Передайте этот идентификатор ответственному за сайт для настройки доступа.</p><a className="adm-btn adm-btn-primary" href="/signout-with-chatgpt?return_to=/admin">Выйти из учётной записи <ArrowUpRight size={17} /></a></> : <a className="adm-btn adm-btn-primary" href="/signin-with-chatgpt?return_to=/admin">Войти через ChatGPT <ArrowUpRight size={17} /></a>}
      <p className="adm-access-note">Доступ к панели предоставляется отдельно от входа в аккаунт.</p>
    </section>
  </main>;
}
