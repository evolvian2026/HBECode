'use client';

import { useEffect, type ReactNode } from 'react';
import { SessionProvider } from '@/lib/session';

export function applyTheme(theme: 'light' | 'dark' | 'system') {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    let theme: 'light' | 'dark' | 'system' = 'system';
    try {
      theme = (localStorage.getItem('hbe-theme') as typeof theme) ?? 'system';
    } catch {
      /* storage unavailable */
    }
    applyTheme(theme);
  }, []);
  return <SessionProvider>{children}</SessionProvider>;
}
