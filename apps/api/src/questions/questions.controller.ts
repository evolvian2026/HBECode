import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { DIFFICULTIES, QuestionInput, QuestionListQuery } from '@hbe/shared';
import { z } from 'zod';
import { CurrentUser, Meta, RequirePermission, type AuthUser, type RequestMeta } from '../common/decorators.js';
import { zp } from '../common/zod.pipe.js';
import { QuestionsService } from './questions.service.js';

const PracticeQuery = z.object({
  q: z.string().max(100).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  tag: z.string().max(40).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

@Controller('questions')
export class QuestionsController {
  constructor(private readonly qs: QuestionsService) {}

  @RequirePermission('question:read_full')
  @Get()
  list(@CurrentUser() u: AuthUser, @Query(zp(QuestionListQuery)) q: z.infer<typeof QuestionListQuery>) {
    return this.qs.list(u, q);
  }

  @RequirePermission('question:write')
  @Post()
  create(@CurrentUser() u: AuthUser, @Body(zp(QuestionInput)) body: z.infer<typeof QuestionInput>, @Meta() meta: RequestMeta) {
    return this.qs.create(u, body, meta);
  }

  @RequirePermission('question:read_full')
  @Get(':id')
  detail(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.qs.detail(u, id);
  }

  @RequirePermission('question:write')
  @Put(':id')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zp(QuestionInput)) body: z.infer<typeof QuestionInput>, @Meta() meta: RequestMeta) {
    return this.qs.update(u, id, body, meta);
  }

  @RequirePermission('question:write')
  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Meta() meta: RequestMeta) {
    return this.qs.remove(u, id, meta);
  }

  @RequirePermission('question:write')
  @Post(':id/validate')
  @HttpCode(202)
  validate(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(zp(z.object({ publishIfValid: z.boolean().default(false) }))) body: { publishIfValid: boolean }, @Meta() meta: RequestMeta) {
    return this.qs.validate(u, id, body.publishIfValid, meta);
  }

  @RequirePermission('question:write')
  @Post(':id/publish')
  @HttpCode(200)
  publish(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Meta() meta: RequestMeta) {
    return this.qs.publish(u, id, meta);
  }
}

@Controller('practice')
export class PracticeController {
  constructor(private readonly qs: QuestionsService) {}

  @RequirePermission('practice:use')
  @Get('questions')
  list(@CurrentUser() u: AuthUser, @Query(zp(PracticeQuery)) q: z.infer<typeof PracticeQuery>) {
    return this.qs.practiceList(u, q);
  }

  @RequirePermission('practice:use')
  @Get('questions/:id')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.qs.studentView(u, id);
  }
}
