'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { post } from '@/lib/api';
import { useSession } from '@/lib/session';
import { applyTheme } from './providers';

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super admin',
  client_admin: 'Institution admin',
  teacher: 'Teacher',
  associate: 'Associate',
  student: 'Student',
  guest: 'Guest',
};

export function Nav() {
  const { user, logout, can, setUser } = useSession();
  const path = usePathname();
  if (path?.startsWith('/solve')) return null; // the IDE uses the full screen
  const link = (href: string, label: string) => (
    <Link href={href} className={`rounded px-2 py-1 text-sm ${path?.startsWith(href) ? 'bg-slate-100 font-medium dark:bg-slate-800' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'}`}>
      {label}
    </Link>
  );
  const toggleTheme = () => {
    const dark = !document.documentElement.classList.contains('dark');
    try {
      localStorage.setItem('hbe-theme', dark ? 'dark' : 'light');
    } catch {
      /* storage unavailable */
    }
    applyTheme(dark ? 'dark' : 'light');
  };
  return (
    <header className="border-b border-slate-200 dark:border-slate-800">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-2 px-4">
        <Link href="/" className="mr-3 font-semibold tracking-tight">
          HBE<span className="text-brand-600">Code</span>
        </Link>
        {user && !user.mfaSetupRequired && (
          <nav className="flex flex-wrap items-center gap-1" aria-label="Main">
            {can('practice:use') && link('/practice', 'Practice')}
            {can('question:read_full') && link('/questions', 'Question bank')}
            {(user.role === 'client_admin' || user.role === 'super_admin') && link('/admin/users', 'Users')}
            {(user.role === 'client_admin' || user.role === 'teacher') && link('/admin/batches', 'Batches')}
            {user.role === 'super_admin' && link('/admin/tenants', 'Institutions')}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2 text-sm">
          <button type="button" onClick={toggleTheme} className="btn-secondary px-2" aria-label="Toggle dark mode">
            ◐
          </button>
          {user ? (
            <>
              {user.memberships.length > 1 && (
                <select
                  className="input w-auto py-1"
                  aria-label="Institution"
                  value={user.tenantId ?? ''}
                  onChange={async (e) => {
                    const r = await post<{ user: typeof user }>('/api/v1/auth/switch-tenant', { tenantId: e.target.value });
                    setUser(r.user);
                    location.assign('/');
                  }}
                >
                  {user.memberships.map((m) => (
                    <option key={m.tenantId} value={m.tenantId}>
                      {m.tenantName} · {ROLE_LABEL[m.role]}
                    </option>
                  ))}
                </select>
              )}
              <Link href="/account" className="hidden text-slate-600 sm:inline dark:text-slate-300">
                {user.name} <span className="text-xs text-slate-400">({ROLE_LABEL[user.role]}{user.tenantName ? ` · ${user.tenantName}` : ''})</span>
              </Link>
              <button type="button" className="btn-secondary" onClick={() => void logout()}>
                Sign out
              </button>
            </>
          ) : (
            path !== '/login/' && (
              <Link href="/login" className="btn-primary">
                Sign in
              </Link>
            )
          )}
        </div>
      </div>
    </header>
  );
}
