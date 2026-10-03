'use client';

import { useRequireUser } from '@/lib/session';
import { StudentReport } from '@/components/student-report';
import { useQueryId } from '@/components/reports';

export default function StudentReportPage() {
  const user = useRequireUser();
  const id = useQueryId();
  if (!user || !id) return null;
  return <StudentReport path={`/api/v1/reports/students/${id}`} self={id === user.id} staff={user.role !== 'student'} />;
}
