'use client';

import type { LoginResponse, SessionUser } from '@hbe/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { post } from '@/lib/api';
import { useSession } from '@/lib/session';
import { ErrorBox } from '@/components/ui';

function safeNext(): string {
  const n = new URLSearchParams(location.search).get('next') ?? '/';
  return n.startsWith('/') && !n.startsWith('//') ? n : '/';
}

export default function Login() {
  const { setUser } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const done = (r: LoginResponse) => {
    if (r.status === 'mfa_required') {
      setMfaToken(r.mfaToken);
      return;
    }
    setUser(r.user);
    location.assign(r.user.mfaSetupRequired ? '/setup-mfa/' : safeNext());
  };

  const guest = async () => {
    setBusy(true);
    try {
      const r = await post<{ user: SessionUser }>('/api/v1/auth/guest');
      setUser(r.user);
      location.assign('/practice/');
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  useEffect(() => {
    if (new URLSearchParams(location.search).get('guest') === '1') void guest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      done(mfaToken ? await post<LoginResponse>('/api/v1/auth/mfa/verify', { mfaToken, code }) : await post<LoginResponse>('/api/v1/auth/login', { email, password }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 text-xl font-semibold">{mfaToken ? 'Two-factor authentication' : 'Sign in'}</h1>
      <form onSubmit={submit} className="space-y-4">
        {!mfaToken ? (
          <>
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </>
        ) : (
          <div>
            <label className="label" htmlFor="code">6-digit code from your authenticator app</label>
            <input id="code" className="input font-mono tracking-widest" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
          </div>
        )}
        <ErrorBox error={error} />
        <button className="btn-primary w-full" disabled={busy} type="submit">
          {mfaToken ? 'Verify' : 'Sign in'}
        </button>
      </form>
      {!mfaToken && (
        <button type="button" className="btn-secondary mt-3 w-full" disabled={busy} onClick={() => void guest()}>
          Continue as guest (practice only)
        </button>
      )}
    </div>
  );
}
