'use client';

import type { SessionUser } from '@hbe/shared';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { post } from '@/lib/api';
import { useRequireUser, useSession } from '@/lib/session';
import { ErrorBox, Page } from '@/components/ui';

export default function Account() {
  const user = useRequireUser();
  const { setUser } = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState<unknown>(null);
  if (!user) return null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await post<{ user: SessionUser }>('/api/v1/auth/password', { currentPassword: current, newPassword: next });
      setUser(r.user);
      setMsg('Password changed. Other sessions were signed out.');
      setCurrent('');
      setNext('');
    } catch (err) {
      setError(err);
    }
  };
  return (
    <Page title="Account">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-1 text-sm">
          <div><span className="text-slate-500">Name:</span> {user.name}</div>
          <div><span className="text-slate-500">Email:</span> {user.email || '—'}</div>
          <div><span className="text-slate-500">Two-factor:</span> {user.mfaEnabled ? 'enabled' : <Link className="text-brand-600 underline" href="/setup-mfa">set up</Link>}</div>
        </div>
        {user.role !== 'guest' && (
          <form onSubmit={submit} className="card space-y-3">
            <h2 className="font-medium">Change password</h2>
            <input className="input" type="password" placeholder="Current password" aria-label="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            <input className="input" type="password" placeholder="New password (10+ characters)" aria-label="New password" autoComplete="new-password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required />
            <ErrorBox error={error} />
            {msg && <p className="text-sm text-emerald-700 dark:text-emerald-400">{msg}</p>}
            <button className="btn-primary" type="submit">Update</button>
          </form>
        )}
      </div>
    </Page>
  );
}
