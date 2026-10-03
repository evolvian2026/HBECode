import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { AuditService } from '../common/audit.service.js';
import { CurrentUser, dbCtx, Meta, RequirePermission, RequireRoles, type AuthUser, type RequestMeta } from '../common/decorators.js';
import { zp } from '../common/zod.pipe.js';
import { DbService } from '../infra/infra.module.js';
import { PlagiarismService } from '../plagiarism/plagiarism.service.js';
import { toCsv, toXlsx } from './exports.js';
import { ReportsService } from './reports.service.js';

const ExportQuery = z.object({ format: z.enum(['csv', 'xlsx']) });
const MIME = { csv: 'text/csv; charset=utf-8', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  private async send(u: AuthUser, reply: FastifyReply, meta: RequestMeta, what: string, id: string, format: 'csv' | 'xlsx', header: string[], rows: (string | number | null)[][]) {
    // Exports carry personal data (names, emails, scores): recorded in the audit log.
    await this.db.run(dbCtx(u), (tx) => this.audit.record(tx, { tenantId: u.tenantId, actorId: u.id, action: 'report.export', entityType: what, entityId: id, data: { format, rows: rows.length } }, meta));
    const buf = format === 'csv' ? toCsv(header, rows) : await toXlsx(what, header, rows);
    await reply.header('content-type', MIME[format]).header('content-disposition', `attachment; filename="${what}-report.${format}"`).header('cache-control', 'private, no-store').send(buf);
  }

  @RequireRoles('client_admin', 'teacher', 'associate')
  @Get('overview')
  overview(@CurrentUser() u: AuthUser) {
    return this.reports.tenantDashboard(u);
  }

  @RequireRoles('client_admin', 'teacher', 'associate')
  @Get('tests/:id')
  test(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.testReport(u, id);
  }

  @RequireRoles('client_admin', 'teacher', 'associate')
  @Get('tests/:id/export')
  async testExport(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query(zp(ExportQuery)) q: z.infer<typeof ExportQuery>, @Meta() meta: RequestMeta, @Res() reply: FastifyReply) {
    const r = await this.reports.testReport(u, id);
    const header = ['Name', 'Email', 'Status', 'Score', 'Max score', 'Percent', 'Rank', 'Minutes', 'Violations', 'Max similarity %', ...r.questions.map((x, i) => `Q${i + 1} ${x.title} (%)`)];
    const rows = r.students.map((s) => [s.name, s.email, s.status, s.score, s.maxScore, s.percent, s.rank, s.minutes, s.violations, s.plagiarismMax, ...r.questions.map((x) => s.perQuestion[x.questionId] ?? null)]);
    await this.send(u, reply, meta, 'test', id, q.format, header, rows);
  }

  @RequireRoles('client_admin', 'teacher', 'associate')
  @Get('questions/:id')
  question(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.questionReport(u, id);
  }

  @RequireRoles('client_admin', 'teacher', 'associate')
  @Get('batches/:id')
  batch(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.batchReport(u, id);
  }

  @RequireRoles('client_admin', 'teacher', 'associate')
  @Get('batches/:id/export')
  async batchExport(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query(zp(ExportQuery)) q: z.infer<typeof ExportQuery>, @Meta() meta: RequestMeta, @Res() reply: FastifyReply) {
    const r = await this.reports.batchReport(u, id);
    const header = ['Name', 'Email', ...r.tests.map((t) => `${t.title} (%)`), 'Average (%)'];
    const rows = r.students.map((s) => [s.name, s.email, ...s.cells.map((c) => (c ? (c.percent ?? c.status) : null)), s.average]);
    await this.send(u, reply, meta, 'batch', id, q.format, header, rows);
  }

  @RequirePermission('report:view')
  @Get('students/:id')
  student(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.studentReport(u, id);
  }

  @RequirePermission('report:view')
  @Get('me')
  me(@CurrentUser() u: AuthUser) {
    return this.reports.studentReport(u, u.id);
  }

  @RequireRoles('super_admin')
  @Get('platform')
  platform(@CurrentUser() u: AuthUser) {
    return this.reports.platform(u);
  }

  /** Recompute all rollups from the raw tables (they also rebuild themselves daily). */
  @RequireRoles('super_admin')
  @Post('rebuild')
  @HttpCode(200)
  async rebuild(@CurrentUser() u: AuthUser, @Meta() meta: RequestMeta) {
    const r = await this.reports.rebuild();
    await this.db.run(dbCtx(u), (tx) => this.audit.record(tx, { tenantId: null, actorId: u.id, action: 'report.rebuild', data: r }, meta));
    return r;
  }
}

@Controller()
export class PlagiarismController {
  constructor(private readonly plag: PlagiarismService) {}

  @RequirePermission('test:manage')
  @Post('tests/:id/plagiarism')
  @HttpCode(202)
  start(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Meta() meta: RequestMeta) {
    return this.plag.start(u, id, meta);
  }

  @RequirePermission('test:proctor')
  @Get('tests/:id/plagiarism')
  latest(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.plag.latest(u, id);
  }

  @RequirePermission('test:proctor')
  @Get('plagiarism/:runId/pairs/:questionId/:subA/:subB')
  pair(
    @CurrentUser() u: AuthUser,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Param('subA', ParseUUIDPipe) subA: string,
    @Param('subB', ParseUUIDPipe) subB: string,
  ) {
    return this.plag.pair(u, runId, questionId, subA, subB);
  }
}
