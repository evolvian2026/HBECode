import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDb, createPool, SYSTEM, withContext, type Db, type DbContext, type Tx } from '@hbe/db';
import { Redis } from 'ioredis';
import type pg from 'pg';
import { CONFIG, loadConfig, type AppConfig } from '../config.js';

export const PG_POOL = Symbol('PG_POOL');
export const REDIS = Symbol('REDIS');
/** Unprefixed client for pub/sub and multi-key blocking pops (keys are prefixed explicitly). */
export const REDIS_RAW = Symbol('REDIS_RAW');

/** All database access goes through `run` (request context) or `system` (trusted server paths). */
@Injectable()
export class DbService {
  readonly db: Db;
  constructor(@Inject(PG_POOL) readonly pool: pg.Pool) {
    this.db = createDb(pool);
  }
  run<T>(ctx: DbContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return withContext(this.db, ctx, fn);
  }
  system<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return withContext(this.db, SYSTEM, fn);
  }
}

@Injectable()
class Shutdown implements OnApplicationShutdown {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(REDIS_RAW) private readonly raw: Redis,
  ) {}
  async onApplicationShutdown() {
    await Promise.allSettled([this.pool.end(), this.redis.quit(), this.raw.quit()]);
  }
}

@Global()
@Module({
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig() },
    {
      provide: PG_POOL,
      inject: [CONFIG],
      useFactory: (cfg: AppConfig) => createPool(cfg.DATABASE_URL, cfg.DATABASE_POOL_SIZE),
    },
    {
      provide: REDIS,
      inject: [CONFIG],
      useFactory: (cfg: AppConfig) => new Redis(cfg.REDIS_URL, { keyPrefix: cfg.REDIS_PREFIX, maxRetriesPerRequest: 3, lazyConnect: false }),
    },
    {
      provide: REDIS_RAW,
      inject: [CONFIG],
      useFactory: (cfg: AppConfig) => new Redis(cfg.REDIS_URL, { maxRetriesPerRequest: 3 }),
    },
    DbService,
    Shutdown,
  ],
  exports: [CONFIG, PG_POOL, REDIS, REDIS_RAW, DbService],
})
export class InfraModule {}
