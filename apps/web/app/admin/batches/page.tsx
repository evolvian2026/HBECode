'use client';

import type { Page as PageT } from '@hbe/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { del, get, post } from '@/lib/api';
import { useRequireUser, useSession } from '@/lib/session';
import { ErrorBox, Page, Spinner } from '@/components/ui';

interface Batch { id: string; name: string; year: number | null; members: number }
interface Member { id: string; name: string; email: string }
interface U { id: string; name: string; email: string; role: string }

export default function Batches() {
  const user = useRequireUser();
  const { can } = useSession();
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [name, setName] = useState('');
  const [open, setOpen] = useState<Batch | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [students, setStudents] = useState<U[]>([]);
  const [pick, setPick] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);
  const manage = can('batch:manage');

  const load = () => get<Batch[]>('/api/v1/batches').then(setBatches).catch(setError);
  useEffect(() => {
    if (user) void load();
  }, [user]);
  const openBatch = async (b: Batch) => {
    setOpen(b);
    setPick([]);
    setMembers(await get<Member[]>(`/api/v1/batches/${b.id}/members`));
    setStudents((await get<PageT<U>>('/api/v1/users?role=student&limit=100')).items);
  };
  const create = async (e: FormEvent) => {
    e.preventDefault();
    await post('/api/v1/batches', { name }).catch(setError);
    setName('');
    await load();
  };

  if (!user) return null;
  return (
    <Page title="Batches">
      {manage && (
        <form onSubmit={create} className="card mb-4 flex gap-2">
          <input className="input" placeholder="Batch name, e.g. CSE 2026 Section A" aria-label="Batch name" required value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn-primary" type="submit">Create</button>
        </form>
      )}
      <ErrorBox error={error} />
      {!batches ? <Spinner /> : (
        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          <ul className="space-y-1">
            {batches.map((b) => (
              <li key={b.id}>
                <button className={`w-full rounded px-3 py-2 text-left text-sm ${open?.id === b.id ? 'bg-brand-50 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-900'}`} onClick={() => void openBatch(b)}>
                  {b.name} <span className="text-xs text-slate-500">· {b.members} students</span>
                </button>
              </li>
            ))}
            {batches.length === 0 && <li className="text-sm text-slate-500">No batches yet.</li>}
          </ul>
          {open && (
            <div className="card">
              <div className="mb-3 flex items-center gap-2">
                <h2 className="font-medium">{open.name}</h2>
                {manage && <button className="ml-auto text-xs text-rose-600 hover:underline" onClick={async () => { if (confirm('Delete this batch?')) { await del(`/api/v1/batches/${open.id}`).catch(setError); setOpen(null); await load(); } }}>Delete batch</button>}
              </div>
              <ul className="mb-4 divide-y divide-slate-200 text-sm dark:divide-slate-800">
                {members.map((m) => (
                  <li key={m.id} className="flex py-1.5">{m.name} <span className="ml-2 text-slate-500">{m.email}</span>
                    {manage && <button className="ml-auto text-xs text-rose-600 hover:underline" onClick={async () => { await post(`/api/v1/batches/${open.id}/members/remove`, { userIds: [m.id] }); await openBatch(open); await load(); }}>Remove</button>}
                  </li>
                ))}
                {members.length === 0 && <li className="py-1.5 text-slate-500">No students in this batch.</li>}
              </ul>
              {manage && (
                <div>
                  <div className="label">Add students</div>
                  <select multiple className="input h-40" aria-label="Students to add" value={pick} onChange={(e) => setPick([...e.target.selectedOptions].map((o) => o.value))}>
                    {students.filter((s) => !members.some((m) => m.id === s.id)).map((s) => <option key={s.id} value={s.id}>{s.name} — {s.email}</option>)}
                  </select>
                  <button className="btn-primary mt-2" disabled={pick.length === 0} onClick={async () => { await post(`/api/v1/batches/${open.id}/members`, { userIds: pick }).catch(setError); await openBatch(open); await load(); }}>Add {pick.length || ''}</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
