'use client';

import type { SessionUser } from '@hbe/shared';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { post } from '@/lib/api';
import { useRequireUser, useSession } from '@/lib/session';
import { ErrorBox } from '@/components/ui';

export default function SetupMfa() {
  const user = useRequireUser();
  const { setUser } = useSession();
  const [secret, setSecret] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!user || user.mfaEnabled || secret) return;
    post<{ secret: string; otpauthUri: string }>('/api/v1/auth/mfa/setup')
      .then(async (r) => {
        setSecret(r.secret);
        setQr(await QRCode.toDataURL(r.otpauthUri, { margin: 1, width: 200 }));
      })
      .catch(setError);
  }, [user, secret]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await post<{ user: SessionUser }>('/api/v1/auth/mfa/enable', { code });
      setUser(r.user);
      location.assign('/');
    } catch (err) {
      setError(err);
    }
  };

  if (!user) return null;
  if (user.mfaEnabled) return <div className="mx-auto max-w-md px-4 py-12">Two-factor authentication is enabled.</div>;
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-xl font-semibold">Set up two-factor authentication</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        {user.mfaSetupRequired ? 'Your role requires two-factor authentication. ' : ''}Scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…), then enter the 6-digit code.
      </p>
      {qr && <img src={qr} alt="Authenticator QR code" width={200} height={200} className="mx-auto my-6 rounded bg-white p-2" />}
      {secret && (
        <p className="mb-4 text-center text-xs text-slate-500">
          Or enter this key manually: <code className="font-mono select-all">{secret}</code>
        </p>
      )}
      <form onSubmit={submit} className="space-y-3">
        <input className="input font-mono tracking-widest" inputMode="numeric" pattern="\d{6}" maxLength={6} placeholder="123456" aria-label="Code" required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        <ErrorBox error={error} />
        <button className="btn-primary w-full" type="submit">Enable</button>
      </form>
    </div>
  );
}
