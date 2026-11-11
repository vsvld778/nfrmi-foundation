'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="error-page"><p className="eyebrow">Не удалось загрузить страницу</p><h1>Попробуем ещё раз</h1><p>Сервис временно не ответил. Повторите загрузку через несколько секунд.</p><button className="btn btn-primary" onClick={reset}>Повторить</button></main>}
