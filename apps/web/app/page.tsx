'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useSession } from '@/lib/session';
import { Spinner } from '@/components/ui';

/** Home: send signed-in users to their main screen. */
export default function Home() {
  const { user, loading } = useSession();
  useEffect(() => {
    if (loading || !user) return;
    if (user.mfaSetupRequired) location.replace('/setup-mfa/');
    else if (user.role === 'super_admin') location.replace('/admin/tenants/');
    else if (user.role === 'client_admin') location.replace('/admin/users/');
    else if (user.role === 'teacher' || user.role === 'associate') location.replace('/questions/');
    else location.replace('/practice/');
  }, [user, loading]);
  if (loading || user) return <div className="p-8 text-center"><Spinner /></div>;
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Coding assessments for your institution</h1>
      <p className="mt-3 text-slate-600 dark:text-slate-400">Practice and solve programming problems in C, C++, Java, Python, JavaScript, Go, Rust and C#, with instant feedback from secure sandboxes.</p>
      <div className="mt-8 flex justify-center gap-3">
        <Link className="btn-primary" href="/login">Sign in</Link>
        <Link className="btn-secondary" href="/login?guest=1">Try as guest</Link>
      </div>
    </div>
  );
}
