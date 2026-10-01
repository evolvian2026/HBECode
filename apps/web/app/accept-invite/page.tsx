'use client';

import { useState, type FormEvent } from 'react';
import { post } from '@/lib/api';
import { ErrorBox } from '@/components/ui';

export default function AcceptInvite() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError(new Error('Passwords do not match.'));
    const token = new URLSearchParams(location.search).get('token') ?? '';
    try {
      await post('/api/v1/auth/accept-invite', { token, password });
      // Drop the token from the address bar and history.
      history.replaceState(null, '', '/accept-invite/');
      setDone(true);
    } catch (err) {
      setError(err);
    }
  };

  if (done)
    return (
      <div className="mx-auto max-w-sm px-4 py-16">
        <p>Your password is set.</p>
        <a className="btn-primary mt-4" href="/login/">Sign in</a>
      </div>
    );
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 text-xl font-semibold">Choose a password</h1>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="pw">New password (at least 10 characters)</label>
          <input id="pw" className="input" type="password" autoComplete="new-password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="pw2">Confirm password</label>
          <input id="pw2" className="input" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <ErrorBox error={error} />
        <button className="btn-primary w-full" type="submit">Save password</button>
      </form>
    </div>
  );
}
