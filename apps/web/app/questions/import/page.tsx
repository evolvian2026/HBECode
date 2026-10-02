'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { downloadFile, get, post, uploadFile } from '@/lib/api';
import { useRequireUser } from '@/lib/session';
import { Badge, ErrorBox, Page, Spinner } from '@/components/ui';

interface Issue { loc: string; field?: string; message: string }
interface JobRow {
  rowNo: number; key: string; title: string; type: string; loc: string; action: 'create' | 'update'; status: string;
  errors: Issue[]; warnings: Issue[]; questionId: string | null; questionStatus: string | null; message: string | null;
}
interface Job {
  id: string; filename: string; format: string; status: string; error: string | null; counts: Record<string, number>;
  issues: (Issue & { severity: 'error' | 'warning' })[]; options: { publish?: boolean }; validation: { validating: number; published: number; invalid: number }; rows: JobRow[];
}
interface Recent { id: string; filename: string; status: string; counts: Record<string, number>; createdAt: string }

const ROW_TONE: Record<string, 'green' | 'red' | 'amber' | 'slate' | 'blue'> = { ready: 'blue', imported: 'green', invalid: 'red', duplicate: 'amber', failed: 'red' };
const formatOf = (name: string) => (name.toLowerCase().endsWith('.docx') ? 'docx' : name.toLowerCase().endsWith('.json') ? 'json' : name.toLowerCase().endsWith('.xlsx') ? 'xlsx' : null);
const where = (i: Issue) => `${i.loc}${i.field ? ` · ${i.field}` : ''}`;

export default function ImportQuestions() {
  const user = useRequireUser();
  const [jobId, setJobId] = useState<string | null>(null);
  const [poke, setPoke] = useState(0); // re-start polling after confirming
  const [job, setJob] = useState<Job | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [busy, setBusy] = useState(false);
  const [publish, setPublish] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const input = useRef<HTMLInputElement | null>(null);

  const refreshRecent = useCallback(() => get<Recent[]>('/api/v1/uploads').then(setRecent).catch(() => undefined), []);
  useEffect(() => {
    if (user) void refreshRecent();
  }, [user, refreshRecent]);

  // Follow the job while it is being read, imported or validated.
  useEffect(() => {
    if (!jobId) return;
    let stop = false;
    const tick = async () => {
      try {
        const j = await get<Job>(`/api/v1/uploads/${jobId}`);
        if (stop) return;
        setJob(j);
        const working = ['queued', 'parsing', 'importing'].includes(j.status) || (j.status === 'done' && j.validation.validating > 0);
        if (working) setTimeout(() => void tick(), 1000);
        else void refreshRecent();
      } catch (e) {
        setError(e);
      }
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [jobId, poke, refreshRecent]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    const format = formatOf(f.name);
    if (!format) return setError(new Error('Choose an .xlsx, .docx or .json file.'));
    setBusy(true);
    setJob(null);
    try {
      const r = await uploadFile<{ id: string }>(`/api/v1/uploads?format=${format}&filename=${encodeURIComponent(f.name)}`, f);
      setJobId(r.id);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const confirm = async () => {
    if (!job) return;
    setError(null);
    try {
      await post(`/api/v1/uploads/${job.id}/confirm`, { publish });
      setPoke((n) => n + 1);
    } catch (e) {
      setError(e);
    }
  };

  if (!user) return null;
  const ready = job?.rows.filter((r) => r.status === 'ready').length ?? 0;
  return (
    <Page title="Import questions" actions={<Link className="btn-secondary" href="/questions">Question bank</Link>}>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card space-y-2">
          <h2 className="font-medium">1. Start from a template</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">Each template has instructions and one example of each question type (coding, web, database). Long test data can span several rows. See the format guide in the docs for every column.</p>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => void downloadFile('/api/v1/uploads/templates/xlsx', 'hbecode-question-template.xlsx').catch(setError)}>Excel template</button>
            <button className="btn-secondary" onClick={() => void downloadFile('/api/v1/uploads/templates/docx', 'hbecode-question-template.docx').catch(setError)}>Word template</button>
          </div>
        </section>
        <section className="card space-y-2">
          <h2 className="font-medium">2. Upload the file</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">Excel (.xlsx), Word (.docx) or JSON, up to 500 questions. You will see a preview with every problem before anything is created.</p>
          <input ref={input} type="file" accept=".xlsx,.docx,.json" aria-label="Question file" className="block text-sm" disabled={busy} onChange={(e) => void onFile(e.target.files?.[0])} />
          {busy && <p className="text-sm text-slate-500"><Spinner /> Uploading…</p>}
        </section>
      </div>
      <div className="mt-4"><ErrorBox error={error} /></div>

      {job && (
        <section className="card mt-4" data-testid="upload-job">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-medium">{job.filename}</h2>
            <Badge tone={job.status === 'failed' ? 'red' : job.status === 'done' ? 'green' : 'blue'}>{job.status}</Badge>
            {['queued', 'parsing', 'importing'].includes(job.status) && <Spinner />}
            <span className="text-sm text-slate-500" data-testid="upload-counts">
              {job.counts.total !== undefined && `${job.counts.total} questions · ${job.counts.ready ?? 0} ready · ${job.counts.invalid ?? 0} with errors · ${job.counts.duplicate ?? 0} duplicates`}
              {job.counts.imported !== undefined && ` · ${job.counts.imported} imported`}
            </span>
            {(job.status === 'parsed' || job.status === 'done' || job.status === 'failed') && (
              <button className="btn-secondary ml-auto py-1" onClick={() => void downloadFile(`/api/v1/uploads/${job.id}/report`, 'upload-problems.xlsx').catch(setError)}>Download problem report</button>
            )}
          </div>
          {job.error && <p className="mt-2 text-sm text-rose-600" role="alert">The file could not be read: {job.error}</p>}
          {job.issues.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-sm">
              {job.issues.map((i, n) => <li key={n} className={i.severity === 'error' ? 'text-rose-600' : 'text-amber-700'}>{where(i)}: {i.message}</li>)}
            </ul>
          )}
          {job.status === 'done' && job.options.publish && (
            <p className="mt-2 text-sm" data-testid="validation-progress">Sandbox validation: {job.validation.published} published · {job.validation.validating} running · {job.validation.invalid} failed (open the question to see why)</p>
          )}
          {job.rows.length > 0 && (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Key</th><th>Title</th><th>Type</th><th>Action</th><th>Status</th><th>Problems</th></tr></thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {job.rows.map((r) => (
                  <tr key={r.rowNo} className="align-top" data-testid={`upload-row-${r.key}`}>
                    <td className="py-1.5 font-mono text-xs">{r.key}</td>
                    <td>{r.questionId ? <Link className="hover:underline" href={`/questions/edit?id=${r.questionId}`}>{r.title}</Link> : r.title}</td>
                    <td className="text-xs">{r.type}</td>
                    <td className="text-xs">{r.action === 'update' ? 'update' : 'new'}</td>
                    <td><Badge tone={ROW_TONE[r.status] ?? 'slate'}>{r.status}</Badge>{r.questionStatus && <div className="text-xs text-slate-500">{r.questionStatus}</div>}</td>
                    <td className="text-xs">
                      {r.message && <div className={r.status === 'imported' ? 'text-amber-700' : 'text-rose-600'}>{r.message}</div>}
                      {r.errors.map((e, n) => <div key={`e${n}`} className="text-rose-600">{where(e)}: {e.message}</div>)}
                      {r.warnings.slice(0, 6).map((w, n) => <div key={`w${n}`} className="text-amber-700">{where(w)}: {w.message}</div>)}
                      {r.warnings.length > 6 && <div className="text-slate-500">… {r.warnings.length - 6} more in the report</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {job.status === 'parsed' && (
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> Validate each question in the sandbox and publish it when it passes</label>
              <button className="btn-primary ml-auto" disabled={ready === 0} onClick={() => void confirm()}>Import {ready} question{ready === 1 ? '' : 's'}</button>
            </div>
          )}
        </section>
      )}

      {recent.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-medium text-slate-500">Recent uploads (kept for 7 days)</h2>
          <ul className="space-y-1 text-sm">
            {recent.map((r) => (
              <li key={r.id}>
                <button className="hover:underline" onClick={() => setJobId(r.id)}>{r.filename}</button>
                <span className="ml-2 text-slate-500">{new Date(r.createdAt).toLocaleString()} · {r.status}{r.counts.imported !== undefined ? ` · ${r.counts.imported} imported` : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  );
}
