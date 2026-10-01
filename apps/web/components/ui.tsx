'use client';

import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api';

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const msg =
    error instanceof ApiError
      ? `${error.detail ?? error.title}${Array.isArray(error.body?.errors) ? `: ${(error.body.errors as { path: string; message: string }[]).map((e) => `${e.path} ${e.message}`).join('; ')}` : ''}`
      : error instanceof Error
        ? error.message
        : String(error);
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
      {msg}
    </div>
  );
}

const DIFF: Record<string, string> = {
  easy: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  moderate: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  hard: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
};
export function Difficulty({ value }: { value: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium capitalize ${DIFF[value] ?? ''}`}>{value}</span>;
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'red' | 'amber' | 'blue' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    red: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    blue: 'bg-brand-50 text-brand-700 dark:bg-slate-800 dark:text-brand-100',
  };
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Page({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="ml-auto flex gap-2">{actions}</div>
      </div>
      {children}
    </div>
  );
}

export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]" aria-label="Loading" />;
}
