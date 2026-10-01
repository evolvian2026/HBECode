import { Injectable } from '@nestjs/common';
import { auditLogs, type Tx } from '@hbe/db';
import type { RequestMeta } from './decorators.js';

export interface AuditEntry {
  tenantId: string | null;
  actorId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  data?: Record<string, unknown>;
}

const SECRET_KEYS = /password|secret|token|hash|driver|solution|code/i;

function redact(data: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!data) return {};
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, SECRET_KEYS.test(k) ? '[redacted]' : v]));
}

/** Written inside the same transaction as the change it describes (append-only table). */
@Injectable()
export class AuditService {
  async record(tx: Tx, e: AuditEntry, meta?: RequestMeta): Promise<void> {
    await tx.insert(auditLogs).values({
      tenantId: e.tenantId,
      actorId: e.actorId,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      data: redact(e.data),
      ip: meta?.ip || null,
      userAgent: meta?.userAgent || null,
      requestId: meta?.requestId,
    });
  }
}
