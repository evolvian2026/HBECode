'use client';

import { useRequireUser } from '@/lib/session';
import { StudentReport } from '@/components/student-report';

export default function MyProgress() {
  const user = useRequireUser();
  if (!user) return null;
  return <StudentReport path="/api/v1/reports/me" self staff={false} />;
}
