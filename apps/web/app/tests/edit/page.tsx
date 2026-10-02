'use client';

import type { Page as PageT, TestSettings } from '@hbe/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { get, post, put } from '@/lib/api';
import { useRequireUser, useSession } from '@/lib/session';
import { Badge, Difficulty, ErrorBox, Page, Spinner } from '@/components/ui';

interface QItem { id: string; type: string; title: string; difficulty: string; status: string; published: boolean }
interface TestDetail {
  id: string; title: string; description: string; status: string; startsAt: string; endsAt: string; durationMin: number; settings: TestSettings;
  questions: { questionId: string; title: string; type: string; difficulty: string; points: number; status: string; versionId: string | null }[];
  batchIds: string[]; userIds: string[];
}
interface Batch { id: string; name: string; members: number }
interface Student { id: string; name: string; email: string }

const DEFAULT_SETTINGS: TestSettings = { requireFullscreen: true, blockClipboard: true, webcam: 'off', violations: { warnAt: 3, finalWarnAt: 5, autoSubmitAt: 7 }, showResults: true };
/** <input type="datetime-local"> works in local time without a zone. */
const toLocal = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => new Date(v).toISOString();

export default function EditTest() {
  const user = useRequireUser();
  const { can } = useSession();
  const [id, setId] = useState<string | null | undefined>(undefined); // undefined until the URL is read
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setId(new URLSearchParams(location.search).get('id')), []);
  const [status, setStatus] = useState('draft');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState(() => toLocal(new Date(Date.now() + 10 * 60_000).toISOString()));
  const [endsAt, setEndsAt] = useState(() => toLocal(new Date(Date.now() + 3 * 3600_000).toISOString()));
  const [durationMin, setDuration] = useState(60);
  const [settings, setSettings] = useState<TestSettings>(DEFAULT_SETTINGS);
  const [picked, setPicked] = useState<{ questionId: string; title: string; type: string; difficulty: string; points: number }[]>([]);
  const [bank, setBank] = useState<QItem[]>([]);
  const [search, setSearch] = useState('');
  const [batches, setBatches] = useState<Batch[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [msg, setMsg] = useState('');
  const manage = can('test:manage');
  const editable = manage && status === 'draft';

  useEffect(() => {
    if (!user || id === undefined || loaded) return;
    void (async () => {
      try {
        if (id) {
          const t = await get<TestDetail>(`/api/v1/tests/${id}`);
          setStatus(t.status); setTitle(t.title); setDescription(t.description); setStartsAt(toLocal(t.startsAt)); setEndsAt(toLocal(t.endsAt));
          setDuration(t.durationMin); setSettings(t.settings); setBatchIds(t.batchIds); setUserIds(t.userIds);
          setPicked(t.questions.map((q) => ({ questionId: q.questionId, title: q.title, type: q.type, difficulty: q.difficulty, points: q.points })));
        }
        if (manage) {
          setBatches(await get<Batch[]>('/api/v1/batches'));
          setStudents((await get<PageT<Student>>('/api/v1/users?role=student&limit=100')).items);
        }
      } catch (e) {
        setError(e);
      }
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id, manage]);

  useEffect(() => {
    if (!editable) return;
    const t = setTimeout(() => {
      const p = new URLSearchParams({ limit: '50', status: 'published' });
      if (search) p.set('q', search);
      get<PageT<QItem>>(`/api/v1/questions?${p}`).then((r) => setBank(r.items)).catch(setError);
    }, 200);
    return () => clearTimeout(t);
  }, [search, editable]);

  const body = () => ({ title, description, startsAt: fromLocal(startsAt), endsAt: fromLocal(endsAt), durationMin, questions: picked.map((p) => ({ questionId: p.questionId, points: p.points })), settings });

  const save = async () => {
    setError(null);
    setMsg('');
    try {
      let tid = id;
      if (tid) await put(`/api/v1/tests/${tid}`, body());
      else {
        tid = (await post<{ id: string }>('/api/v1/tests', body())).id;
        setId(tid);
        history.replaceState(null, '', `/tests/edit/?id=${tid}`);
      }
      await post(`/api/v1/tests/${tid}/assign`, { batchIds, userIds });
      setMsg('Saved.');
      return tid;
    } catch (e) {
      setError(e);
      return null;
    }
  };
  const publish = async () => {
    const tid = await save();
    if (!tid) return;
    try {
      await post(`/api/v1/tests/${tid}/publish`);
      setStatus('published');
      setMsg('Published. Students see it in “My tests” when the window opens.');
    } catch (e) {
      setError(e);
    }
  };
  const close = async () => {
    if (!id || !confirm('Close this test now? Every attempt in progress is submitted.')) return;
    try {
      await post(`/api/v1/tests/${id}/close`);
      setStatus('closed');
    } catch (e) {
      setError(e);
    }
  };

  if (!user) return null;
  if (!loaded) return <Page title="Test"><Spinner /></Page>;
  const v = settings.violations;
  const setV = (k: keyof typeof v, n: number) => setSettings({ ...settings, violations: { ...v, [k]: n } });
  return (
    <Page
      title={id ? title || 'Test' : 'New test'}
      actions={
        <>
          {id && status !== 'draft' && <Link className="btn-secondary" href={`/tests/monitor?id=${id}`}>Live monitor</Link>}
          {editable && <button className="btn-secondary" onClick={() => void save()}>Save draft</button>}
          {editable && <button className="btn-primary" onClick={() => void publish()}>Publish</button>}
          {manage && status === 'published' && <button className="btn-secondary text-rose-600" onClick={() => void close()}>Close test</button>}
        </>
      }
    >
      <div className="mb-3 flex items-center gap-2"><Badge tone={status === 'published' ? 'blue' : 'slate'}>{status}</Badge>{msg && <span className="text-sm text-emerald-600">{msg}</span>}</div>
      <ErrorBox error={error} />
      <fieldset disabled={!editable} className="grid gap-4 lg:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="font-medium">Schedule</h2>
          <label className="block"><span className="label">Title</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" /></label>
          <label className="block"><span className="label">Instructions for students</span><textarea className="input h-20" value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Instructions" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label><span className="label">Opens</span><input type="datetime-local" className="input" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} aria-label="Opens" /></label>
            <label><span className="label">Closes</span><input type="datetime-local" className="input" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} aria-label="Closes" /></label>
          </div>
          <label className="block"><span className="label">Duration per student (minutes)</span><input type="number" min={1} max={1440} className="input w-32" value={durationMin} onChange={(e) => setDuration(Number(e.target.value))} aria-label="Duration" /></label>
          <p className="text-xs text-slate-500">Each student gets the duration from the moment they start, but never past the closing time. Deadlines are enforced by the server.</p>
        </section>

        <section className="card space-y-2">
          <h2 className="font-medium">Proctoring</h2>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.requireFullscreen} onChange={(e) => setSettings({ ...settings, requireFullscreen: e.target.checked })} /> Require fullscreen</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.blockClipboard} onChange={(e) => setSettings({ ...settings, blockClipboard: e.target.checked })} /> Block copy, cut, paste and drag-and-drop</label>
          <label className="flex items-center gap-2 text-sm">Webcam
            <select className="input w-auto py-1" value={settings.webcam} onChange={(e) => setSettings({ ...settings, webcam: e.target.value as 'off' | 'flagged' })} aria-label="Webcam">
              <option value="off">Off</option><option value="flagged">One still image after a flagged event (with consent)</option>
            </select>
          </label>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <label><span className="label">Warn at</span><input type="number" min={1} className="input" value={v.warnAt} onChange={(e) => setV('warnAt', Number(e.target.value))} aria-label="Warn at" /></label>
            <label><span className="label">Final warning at</span><input type="number" min={1} className="input" value={v.finalWarnAt} onChange={(e) => setV('finalWarnAt', Number(e.target.value))} aria-label="Final warning at" /></label>
            <label><span className="label">Auto-submit at (0 = never)</span><input type="number" min={0} className="input" value={v.autoSubmitAt} onChange={(e) => setV('autoSubmitAt', Number(e.target.value))} aria-label="Auto-submit at" /></label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.showResults} onChange={(e) => setSettings({ ...settings, showResults: e.target.checked })} /> Show students their score when they finish</label>
          <p className="text-xs text-slate-500">Browser proctoring deters cheating but cannot guarantee a clean test: a determined student can use a second device or a modified browser. Treat flags as evidence for review, not proof. A second device that opens the test is blocked until a proctor approves it.</p>
        </section>

        <section className="card space-y-2 lg:col-span-2">
          <h2 className="font-medium">Questions</h2>
          {picked.length === 0 && <p className="text-sm text-slate-500">No questions yet.</p>}
          <ol className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
            {picked.map((p, i) => (
              <li key={p.questionId} className="flex items-center gap-2 py-1.5">
                <span className="w-6 text-slate-500">{i + 1}.</span><span className="flex-1">{p.title}</span><Badge>{p.type}</Badge><Difficulty value={p.difficulty} />
                <label className="flex items-center gap-1 text-xs">Points <input type="number" min={1} className="input w-20 py-0.5" value={p.points} onChange={(e) => setPicked(picked.map((x) => (x.questionId === p.questionId ? { ...x, points: Number(e.target.value) } : x)))} aria-label={`Points for ${p.title}`} /></label>
                {editable && <button type="button" className="text-xs text-rose-600 hover:underline" onClick={() => setPicked(picked.filter((x) => x.questionId !== p.questionId))}>Remove</button>}
              </li>
            ))}
          </ol>
          {editable && (
            <div>
              <input className="input mt-2" placeholder="Search published questions" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search questions" />
              <ul className="mt-1 max-h-48 overflow-y-auto text-sm">
                {bank.filter((b) => !picked.some((p) => p.questionId === b.id)).map((b) => (
                  <li key={b.id} className="flex items-center gap-2 py-1">
                    <span className="flex-1">{b.title}</span><Badge>{b.type}</Badge><Difficulty value={b.difficulty} />
                    <button type="button" className="text-brand-600 hover:underline" onClick={() => setPicked([...picked, { questionId: b.id, title: b.title, type: b.type, difficulty: b.difficulty, points: 100 }])}>Add</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {manage && (
          <section className="card space-y-2 lg:col-span-2">
            <h2 className="font-medium">Assign to</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <label><span className="label">Batches</span>
                <select multiple className="input h-32" value={batchIds} onChange={(e) => setBatchIds([...e.target.selectedOptions].map((o) => o.value))} aria-label="Batches">
                  {batches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.members})</option>)}
                </select>
              </label>
              <label><span className="label">Individual students</span>
                <select multiple className="input h-32" value={userIds} onChange={(e) => setUserIds([...e.target.selectedOptions].map((o) => o.value))} aria-label="Students">
                  {students.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.email}</option>)}
                </select>
              </label>
            </div>
          </section>
        )}
      </fieldset>
    </Page>
  );
}
