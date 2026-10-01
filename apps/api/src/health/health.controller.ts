import { Controller, Get, Inject } from '@nestjs/common';
import { RUNTIMES } from '@hbe/shared';
import { sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { Public } from '../common/decorators.js';
import { buildOpenApi } from '../openapi.js';
import { DbService, REDIS } from '../infra/infra.module.js';

@Controller()
export class HealthController {
  constructor(
    private readonly db: DbService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Public()
  @Get('healthz')
  live() {
    return { ok: true };
  }

  @Public()
  @Get('readyz')
  async ready() {
    await this.db.db.execute(sql`select 1`);
    await this.redis.ping();
    return { ok: true };
  }

  @Public()
  @Get('openapi.json')
  openapi() {
    return buildOpenApi();
  }

  /** Pinned toolchain versions shown in the IDE language picker. */
  @Public()
  @Get('runtimes')
  runtimes() {
    return Object.values(RUNTIMES);
  }
}
