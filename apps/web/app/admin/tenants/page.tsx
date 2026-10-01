'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { get, patch, post } from '@/lib/api';
import { useRequireUser } from '@/lib/session';
import { Badge, ErrorBox, Page, Spinner } from '@/components/ui';

interface Tenant { id: string; name: string; slug: string; status: 'active' | 'suspended'; createdAt: string }

export default function Tenants() {
  const user = useRequireUser();
  const [list, setList] = useState<Tenant[] | null>(null);
  const [form, setForm] = useState({ name: '', slug: '' });
  const [error, setError] = useState<unknown>(null);
  const load = () => get<Tenant[]>('/api/v1/tenants').then(setList).catch(setError);
  useEffect(() => {
    if (user) void load();
  }, [user]);
  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await post('/api/v1/tenants', form);
      setForm({ name: '', slug: '' });
      await load();
    } catch (err) {
      setError(err);
    }
  };
  if (!user) return null;
  return (
    <Page title="Institutions">
      <form onSubmit={create} className="card mb-4 grid gap-2 md:grid-cols-[1fr_220px_auto]">
        <input className="input" placeholder="Institution name" aria-label="Institution name" required value={form.name} onChange={(e) => setForm({ name: e.target.value, slug: form.slug || '' })} />
        <input className="input" placeholder="short-id (e.g. iit-delhi)" aria-label="Slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} />
        <button className="btn-primary" type="submit">Add institution</button>
      </form>
      <ErrorBox error={error} />
      {!list ? <Spinner /> : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {list.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="font-medium">{t.name}</span><span className="text-slate-500">{t.slug}</span>
              <Badge tone={t.status === 'active' ? 'green' : 'red'}>{t.status}</Badge>
              <button className="ml-auto text-xs text-brand-600 hover:underline" onClick={async () => { await patch(`/api/v1/tenants/${t.id}`, { status: t.status === 'active' ? 'suspended' : 'active' }).catch(setError); await load(); }}>
                {t.status === 'active' ? 'Suspend' : 'Reactivate'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
