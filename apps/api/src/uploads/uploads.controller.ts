import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { FORMATS, MIME, type FileFormat } from '@hbe/question-format';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CurrentUser, Meta, RequirePermission, type AuthUser, type RequestMeta } from '../common/decorators.js';
import { badRequest } from '../common/errors.js';
import { zp } from '../common/zod.pipe.js';
import { UploadsService } from './uploads.service.js';

const send = async (reply: FastifyReply, buf: Buffer, format: FileFormat, filename: string) => {
  await reply
    .header('content-type', MIME[format])
    .header('content-disposition', `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`)
    .header('cache-control', 'private, no-store')
    .send(buf);
};

const UploadQuery = z.object({ format: z.enum(FORMATS), filename: z.string().max(200).default('questions') });
const ExportQuery = z.object({ format: z.enum(FORMATS), ids: z.string().min(36).max(200 * 37) });

/** Bulk upload of questions (Excel / Word / JSON) and the templates. Authors only. */
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @RequirePermission('question:write')
  @Get('templates/:format')
  async template(@Param('format', zp(z.enum(['xlsx', 'docx']))) format: 'xlsx' | 'docx', @Res() reply: FastifyReply) {
    await send(reply, await this.uploads.template(format), format, `hbecode-question-template.${format}`);
  }

  /** Body: the raw file (`content-type: application/octet-stream`), at most UPLOAD_MAX_BYTES. */
  @RequirePermission('question:write')
  @Post()
  @HttpCode(202)
  create(@CurrentUser() u: AuthUser, @Query(zp(UploadQuery)) q: z.infer<typeof UploadQuery>, @Req() req: FastifyRequest, @Meta() meta: RequestMeta) {
    if (!Buffer.isBuffer(req.body)) throw badRequest('Send the file as the request body with content-type application/octet-stream.');
    return this.uploads.create(u, req.body, q.format, q.filename, meta);
  }

  @RequirePermission('question:write')
  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.uploads.list(u);
  }

  @RequirePermission('question:write')
  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.uploads.get(u, id);
  }

  @RequirePermission('question:write')
  @Get(':id/report')
  async report(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res() reply: FastifyReply) {
    await send(reply, await this.uploads.report(u, id), 'xlsx', 'upload-problems.xlsx');
  }

  @RequirePermission('question:write')
  @Post(':id/confirm')
  @HttpCode(202)
  confirm(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zp(z.object({ publish: z.boolean().default(false) }))) body: { publish: boolean }, @Meta() meta: RequestMeta) {
    return this.uploads.confirm(u, id, body.publish, meta);
  }

  @RequirePermission('question:write')
  @Delete(':id')
  @HttpCode(204)
  async discard(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.uploads.discard(u, id);
  }
}

@Controller('exports')
export class ExportsController {
  constructor(private readonly uploads: UploadsService) {}

  /** Includes hidden tests, drivers and reference solutions; audited. */
  @RequirePermission('question:write')
  @Get('questions')
  async questions(@CurrentUser() u: AuthUser, @Query(zp(ExportQuery)) q: z.infer<typeof ExportQuery>, @Meta() meta: RequestMeta, @Res() reply: FastifyReply) {
    const ids = [...new Set(q.ids.split(',').map((s) => s.trim()).filter(Boolean))];
    if (ids.length > 200 || ids.some((id) => !z.uuid().safeParse(id).success)) throw badRequest('ids must be up to 200 question ids, comma-separated');
    const stamp = new Date().toISOString().slice(0, 10);
    await send(reply, await this.uploads.export(u, ids, q.format, meta), q.format, `hbecode-questions-${stamp}.${q.format}`);
  }
}
