'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from '@/components/Link';
import { ArrowRight, CheckCircle2, LoaderCircle } from 'lucide-react';
import { regionNames, seedContent } from '@/lib/seed';
import type { ContentItem } from '@/lib/types';

type Fields = {
  type: string; title: string; organization: string; inn: string; name: string;
  email: string; phone: string; region: string; otherRegion: string; direction: string;
  description: string; website: string; consent: boolean;
};
type Errors = Partial<Record<keyof Fields, string>>;
const fallbackDirections = seedContent.filter(item => item.type === 'program');

function validInn(value: string) {
  if (!/^\d{10}$|^\d{12}$/.test(value)) return false;
  const digits = value.split('').map(Number);
  const check = (weights: number[]) => weights.reduce((sum, weight, index) => sum + weight * digits[index], 0) % 11 % 10;
  return value.length === 10
    ? check([2, 4, 10, 3, 5, 9, 4, 6, 8]) === digits[9]
    : check([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === digits[10] && check([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === digits[11];
}

export function ApplyForm({ direction = '', programs, regions }: { direction?: string; programs?: ContentItem[]; regions?: ContentItem[] }) {
  const directions = programs ? programs.filter(item => item.status === 'published') : fallbackDirections;
  const regionOptions = regions ? regions.filter(item => item.status === 'published').map(item => item.title) : regionNames;
  const [values, setValues] = useState<Fields>({
    type: 'project', title: '', organization: '', inn: '', name: '', email: '', phone: '',
    region: '', otherRegion: '', direction: directions.some(item => item.slug === direction) ? direction : '',
    description: '', website: '', consent: false,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState('');
  const key = useRef<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const result = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reference) result.current?.focus();
  }, [reference]);

  const update = (name: keyof Fields, value: string | boolean) => {
    setValues(previous => ({ ...previous, [name]: value }));
    setErrors(previous => ({ ...previous, [name]: undefined }));
  };
  const validation = (): Errors => {
    const next: Errors = {};
    if (values.title.trim().length < 5) next.title = 'Укажите тему длиной не менее 5 символов.';
    if (values.organization.trim().length < 2) next.organization = 'Укажите название организации.';
    if (values.inn && !validInn(values.inn.trim())) next.inn = 'Проверьте ИНН: 10 или 12 цифр с корректной контрольной суммой.';
    if (values.name.trim().length < 2) next.name = 'Укажите, как к вам обращаться.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) next.email = 'Укажите корректный адрес электронной почты.';
    if (values.phone && !/^\+?[\d\s()\-]{7,20}$/.test(values.phone.trim())) next.phone = 'Проверьте номер телефона: от 7 до 20 символов.';
    if (!values.region) next.region = 'Выберите регион.';
    if (values.region === 'other' && values.otherRegion.trim().length < 2) next.otherRegion = 'Укажите регион или страну.';
    if (!values.direction) next.direction = 'Выберите направление или консультацию.';
    if (values.description.trim().length < 50) next.description = 'Расскажите о задаче подробнее: не менее 50 символов.';
    if (!values.consent) next.consent = 'Подтвердите ознакомление с условиями обработки данных.';
    return next;
  };
  const focusError = (next: Errors) => {
    const first = Object.keys(next)[0];
    if (first) requestAnimationFrame(() => form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus());
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const next = validation();
    setErrors(next);
    setMessage('');
    if (Object.keys(next).length) {
      setMessage('Проверьте отмеченные поля. Ваш текст сохранён в форме.');
      focusError(next);
      return;
    }
    setBusy(true);
    key.current ||= crypto.randomUUID();
    try {
      const response = await fetch('/api/applications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: values.type, title: values.title.trim(), organization: values.organization.trim(),
          inn: values.inn.trim(), name: values.name.trim(), email: values.email.trim(), phone: values.phone.trim(),
          region: values.region, direction: values.direction,
          description: values.region === 'other' ? `Регион / страна: ${values.otherRegion.trim()}\n\n${values.description.trim()}` : values.description.trim(),
          consent: values.consent, consentVersion: '2026-11-11', idempotencyKey: key.current, website: values.website,
        }),
      });
      const data = await response.json().catch(() => ({})) as { reference?: unknown; error?: unknown; fields?: Record<string, unknown> };
      if (!response.ok) {
        const fields: Errors = {};
        if (data.fields && typeof data.fields === 'object') {
          for (const [name, value] of Object.entries(data.fields)) {
            if (name in values) fields[name as keyof Fields] = Array.isArray(value) ? value.join(' ') : String(value);
          }
        }
        setErrors(fields);
        focusError(fields);
        throw new Error(typeof data.error === 'string' ? data.error : 'Не удалось отправить предложение. Попробуйте ещё раз.');
      }
      if (typeof data.reference !== 'string' || !data.reference) throw new Error('Сервер не подтвердил получение. Повторите отправку — дубликат не будет создан.');
      setReference(data.reference);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Соединение прервалось. Повторите отправку, не закрывая страницу.');
    } finally { setBusy(false); }
  };

  if (reference) return <div className="success-panel" ref={result} tabIndex={-1} role="status">
    <CheckCircle2 size={38} strokeWidth={1.4} aria-hidden="true" />
    <p className="eyebrow">Предложение получено</p>
    <h2>Спасибо за обращение</h2>
    <p>Номер обращения: <strong>{reference}</strong></p>
    <p>Обращение сохранено и доступно команде фонда. В закрытой версии проверяется работа с тестовыми предложениями.</p>
    <Link href="/programs" className="btn btn-primary">К направлениям работы <ArrowRight size={18} aria-hidden="true" /></Link>
  </div>;

  const errorFor = (name: keyof Fields) => errors[name] ? <span className="error" id={`apply-${name}-error`}>{errors[name]}</span> : null;
  const fieldProps = (name: keyof Fields) => ({ id: `apply-${name}`, name, 'aria-invalid': !!errors[name], 'aria-describedby': [errors[name] ? `apply-${name}-error` : '', name === 'description' ? 'apply-description-hint' : ''].filter(Boolean).join(' ') || undefined });
  return <form ref={form} onSubmit={submit} className="form-grid" noValidate aria-busy={busy}>
    <div className="form-span form-intro"><p className="eyebrow">Первый шаг к сотрудничеству</p><h2>Расскажите о вашей задаче</h2><p className="muted">Поля со звёздочкой обязательны. В закрытой версии используйте вымышленные тестовые данные.</p></div>
    <div className="form-field form-span">
      <label htmlFor="apply-type">Тип обращения *</label>
      <select {...fieldProps('type')} className="input" value={values.type} onChange={event => update('type', event.target.value)} required><option value="project">Предложить проект</option><option value="partnership">Предложить сотрудничество</option></select>
    </div>
    <div className="form-field form-span"><label htmlFor="apply-title">Название проекта или тема *</label><input {...fieldProps('title')} className="input" value={values.title} onChange={event => update('title', event.target.value)} minLength={5} maxLength={160} placeholder="Например, развитие производственной кооперации" required />{errorFor('title')}</div>
    <div className="form-field"><label htmlFor="apply-organization">Организация *</label><input {...fieldProps('organization')} className="input" value={values.organization} onChange={event => update('organization', event.target.value)} autoComplete="organization" maxLength={200} required />{errorFor('organization')}</div>
    <div className="form-field"><label htmlFor="apply-inn">ИНН <span className="muted">— необязательно</span></label><input {...fieldProps('inn')} className="input" value={values.inn} onChange={event => update('inn', event.target.value)} inputMode="numeric" maxLength={12} placeholder="10 или 12 цифр" />{errorFor('inn')}</div>
    <div className="form-field"><label htmlFor="apply-name">Контактное имя *</label><input {...fieldProps('name')} className="input" value={values.name} onChange={event => update('name', event.target.value)} autoComplete="name" maxLength={120} required />{errorFor('name')}</div>
    <div className="form-field"><label htmlFor="apply-email">Электронная почта *</label><input {...fieldProps('email')} className="input" type="email" value={values.email} onChange={event => update('email', event.target.value)} autoComplete="email" maxLength={254} placeholder="name@example.com" required />{errorFor('email')}</div>
    <div className="form-field"><label htmlFor="apply-phone">Телефон <span className="muted">— необязательно</span></label><input {...fieldProps('phone')} className="input" type="tel" value={values.phone} onChange={event => update('phone', event.target.value)} autoComplete="tel" maxLength={20} />{errorFor('phone')}</div>
    <div className="form-field"><label htmlFor="apply-region">Регион *</label><select {...fieldProps('region')} className="input" value={values.region} onChange={event => update('region', event.target.value)} required><option value="">Выберите регион</option>{regionOptions.map(name => <option key={name} value={name}>{name}</option>)}<option value="other">Другой регион или страна</option></select>{errorFor('region')}</div>
    {values.region === 'other' && <div className="form-field form-span"><label htmlFor="apply-otherRegion">Регион или страна *</label><input {...fieldProps('otherRegion')} className="input" value={values.otherRegion} onChange={event => update('otherRegion', event.target.value)} maxLength={120} required />{errorFor('otherRegion')}</div>}
    <div className="form-field form-span"><label htmlFor="apply-direction">Направление *</label><select {...fieldProps('direction')} className="input" value={values.direction} onChange={event => update('direction', event.target.value)} required><option value="">Выберите направление</option>{directions.map(item => <option key={item.id} value={item.slug}>{item.title}</option>)}<option value="consultation">Нужна консультация</option></select>{errorFor('direction')}</div>
    <div className="form-field form-span"><label htmlFor="apply-description">Краткое описание *</label><textarea {...fieldProps('description')} className="input" rows={7} value={values.description} onChange={event => update('description', event.target.value)} minLength={50} maxLength={values.region === 'other' ? 4800 : 5000} placeholder="Опишите задачу, стадию подготовки, имеющиеся ресурсы и ожидаемый формат сотрудничества." required /><span id="apply-description-hint" className="muted form-counter">{values.description.length} / {values.region === 'other' ? 4800 : 5000} символов · минимум 50</span>{errorFor('description')}</div>
    <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}><label htmlFor="apply-website">Ваш сайт<input id="apply-website" name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={event => update('website', event.target.value)} /></label></div>
    <div className="form-field form-span"><label className="consent-label" htmlFor="apply-consent"><input {...fieldProps('consent')} type="checkbox" checked={values.consent} onChange={event => update('consent', event.target.checked)} required /><span>Я ознакомлен(а) с <Link href="/privacy" target="_blank" rel="noopener noreferrer">условиями обработки данных</Link> и соглашаюсь на обработку сведений, указанных в форме. *</span></label>{errorFor('consent')}</div>
    <p className={message ? 'error form-span' : 'sr-only'} role="alert" aria-atomic="true">{message}</p>
    <div className="form-span form-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? <><LoaderCircle size={18} aria-hidden="true" /> Отправляем…</> : <>Отправить предложение <ArrowRight size={18} aria-hidden="true" /></>}</button><p className="muted">После отправки вы получите номер обращения на этой странице.</p></div>
  </form>;
}

export default ApplyForm;
