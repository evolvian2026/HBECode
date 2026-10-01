'use client';

import { grantableRoles, type Page as PageT } from '@hbe/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { get, patch, post } from '@/lib/api';
import { useRequireUser } from '@/lib/session';
import { Badge, ErrorBox, Page, Spinner } from '@/components/ui';

interface U { id: string; email: string | null; name: string; role: string; status: string; membershipStatus: string; lockedUntil: string | null; lastLoginAt: string | null }
interface Tenant { id: string; name: string }

export default function Users() {
  const user = useRequireUser();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [data, setData] = useState<PageT<U> | null>(null);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ email: '', name: '', role: 'student' });
  const [link, setLink] = useState<{ label: string; url: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const sa = user?.role === 'super_admin';
  const scope = sa ? `tenantId=${tenantId}` : '';

  useEffect(() => {
    if (sa) get<Tenant[]>('/api/v1/tenants').then((t) => { setTenants(t); setTenantId((x) => x || t[0]?.id || ''); }).catch(setError);
  }, [sa]);

  const load = async () => {
    if (sa && !tenantId) return;
    const p = new URLSearchParams({ limit: '100' });
    if (q) p.set('q', q);
    if (sa) p.set('tenantId', tenantId);
    try {
      setData(await get<PageT<U>>(`/api/v1/users?${p}`));
    } catch (e) {
      setError(e);
    }
  };
  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, q, tenantId]);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await post<{ inviteUrl: string | null }>('/api/v1/users', { ...form, ...(sa ? { tenantId } : {}) });
      setLink(r.inviteUrl ? { label: `Invite link for ${form.email} (send it to them; valid 72 h)`, url: r.inviteUrl } : null);
      setForm({ email: '', name: '', role: form.role });
      await load();
    } catch (err) {
      setError(err);
    }
  };

  if (!user) return null;
  const roles = grantableRoles(user.role);
  return (
    <Page title="Users">
      {sa && (
        <select className="input mb-4 w-auto" aria-label="Institution" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
          {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}
      <form onSubmit={invite} className="card mb-4 grid gap-2 md:grid-cols-[1fr_1fr_160px_auto]">
        <input className="input" type="email" placeholder="Email" aria-label="Email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="input" placeholder="Full name" aria-label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select className="input" aria-label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          {roles.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
        </select>
        <button className="btn-primary" type="submit">Invite</button>
      </form>
      {link && (
        <div className="card mb-4 text-sm">
          <div className="label">{link.label}</div>
          <code className="block break-all select-all">{link.url}</code>
          <p className="mt-1 text-xs text-slate-500">No email provider is configured yet, so share this link yourself.</p>
        </div>
      )}
      <ErrorBox error={error} />
      <input className="input mb-3 max-w-xs" placeholder="Search name or email" aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} />
      {!data ? <Spinner /> : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-900"><tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Last login</th><th /></tr></thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {data.items.map((u) => (
                <tr key={u.id}>
                  <td className="px-3 py-2">{u.name}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{u.email}</td>
                  <td className="px-3 py-2">{u.role.replace('_', ' ')}</td>
                  <td className="px-3 py-2">
                    {u.membershipStatus === 'disabled' ? <Badge tone="red">disabled</Badge> : u.status === 'invited' ? <Badge tone="amber">invited</Badge> : <Badge tone="green">active</Badge>}
                    {u.lockedUntil && new Date(u.lockedUntil) > new Date() && <Badge tone="red">locked</Badge>}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {roles.includes(u.role as never) && u.id !== user.id && (
                      <>
                        <button className="text-xs text-brand-600 hover:underline" onClick={async () => {
                          try {
                            const r = await post<{ resetUrl: string }>(`/api/v1/users/${u.id}/reset-password${scope ? `?${scope}` : ''}`);
                            setLink({ label: `Password reset link for ${u.email} (valid 2 h)`, url: r.resetUrl });
                          } catch (e) { setError(e); }
                        }}>Reset password</button>
                        <button className="ml-3 text-xs text-rose-600 hover:underline" onClick={async () => {
                          await patch(`/api/v1/users/${u.id}/membership${scope ? `?${scope}` : ''}`, { status: u.membershipStatus === 'disabled' ? 'active' : 'disabled' }).catch(setError);
                          await load();
                        }}>{u.membershipStatus === 'disabled' ? 'Enable' : 'Disable'}</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
