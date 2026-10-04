'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { downloadFile, get } from '@/lib/api';
import { useRequireUser } from '@/lib/session';
import { ATTEMPT_LABEL, pct, Section, useQueryId, when } from '@/components/reports';
import { ErrorBox, Page, Spinner } from '@/components/ui';

interface BReport {
  batch: { id: string; name: string };
  tests: { id: string; title: string; startsAt: string; taken: number; average: number | null }[];
  students: { userId: string; name: string; email: string; cells: ({ status: string; percent: number | null } | null)[]; average: number | null }[];
}

export default function BatchReport() {
  const user = useRequireUser();
  const id = useQueryId();
  const [r, setR] = useState<BReport | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (user && id) get<BReport>(`/api/v1/reports/batches/${id}`).then(setR).catch(setError);
  }, [user, id]);
  if (!user) return null;
  const canExport = user.role === 'client_admin' || user.role === 'teacher'; // associates view only
  const exp = (format: 'csv' | 'xlsx') => downloadFile(`/api/v1/reports/batches/${id}/export?format=${format}`, `batch-report.${format}`).catch(setError);
  return (
    <Page
      title={r ? `Report · ${r.batch.name}` : 'Batch report'}
      actions={r && (
        <div className="flex gap-2 print:hidden">
          {canExport && <button className="btn-secondary" onClick={() => void exp('csv')}>Export CSV</button>}
          {canExport && <button className="btn-secondary" onClick={() => void exp('xlsx')}>Export Excel</button>}
          <button className="btn-secondary" onClick={() => window.print()}>Print / PDF</button>
        </div>
      )}
    >
      <ErrorBox error={error} />
      {!r ? !error && <Spinner /> : (
        <Section title={`${r.students.length} students · ${r.tests.length} tests`}>
          {r.tests.length === 0 ? <p className="text-sm text-slate-500">No tests have been assigned to this batch yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="batch-grid">
                <thead className="text-left align-bottom text-slate-500">
                  <tr>
                    <th className="py-1.5">Student</th>
                    {r.tests.map((t) => (
                      <th key={t.id} className="px-2 text-right font-normal">
                        <Link className="text-brand-600 hover:underline dark:text-brand-100" href={`/reports/test?id=${t.id}`}>{t.title}</Link>
                        <div className="text-xs">{when(t.startsAt)}</div>
                      </th>
                    ))}
                    <th className="text-right">Average</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {r.students.map((s) => (
                    <tr key={s.userId}>
                      <td className="py-1.5"><Link className="hover:underline" href={`/reports/student?id=${s.userId}`}>{s.name}</Link> <span className="text-xs text-slate-500">{s.email}</span></td>
                      {s.cells.map((c, i) => (
                        <td key={i} className="px-2 text-right tabular-nums">
                          {!c ? <span className="text-slate-400">—</span> : c.percent !== null ? pct(c.percent) : <span className="text-xs text-slate-500">{ATTEMPT_LABEL[c.status] ?? c.status}</span>}
                        </td>
                      ))}
                      <td className="text-right font-medium tabular-nums">{pct(s.average)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400">
                  <tr>
                    <td className="py-1.5">Average (taken)</td>
                    {r.tests.map((t) => <td key={t.id} className="px-2 text-right tabular-nums">{pct(t.average)} <span className="text-xs">({t.taken})</span></td>)}
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Section>
      )}
    </Page>
  );
}
