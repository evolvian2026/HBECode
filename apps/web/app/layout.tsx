import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Nav } from '@/components/nav';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'HBECode',
  description: 'Coding assessments and practice',
  referrer: 'strict-origin-when-cross-origin',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <Nav />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
