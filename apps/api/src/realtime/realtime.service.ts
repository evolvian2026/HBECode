import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { RealtimeMessage } from '@hbe/shared';
import { Redis } from 'ioredis';
import { CONFIG, type AppConfig } from '../config.js';
import { REDIS_RAW } from '../infra/infra.module.js';

/**
 * Cross-replica fan-out over Redis pub/sub. Channels:
 *   attempt:{attemptId}   pushes to the student's active device (notices, deadline, end, takeover)
 *   monitor:{testId}      "something changed" pings for the proctor dashboard
 * Messages carry ids and small public fields only; dashboards re-read rows over HTTP, so a
 * message never carries data the subscriber was not already authorised to load.
 */
@Injectable()
export class RealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Realtime');
  private subscriber?: Redis;
  private readonly listeners = new Map<string, Set<(m: RealtimeMessage) => void>>();

  constructor(
    @Inject(REDIS_RAW) private readonly redis: Redis,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {}

  private key(channel: string) {
    return `${this.cfg.REDIS_PREFIX}rt:${channel}`;
  }

  onModuleInit() {
    this.subscriber = this.redis.duplicate();
    const prefix = this.key('');
    this.subscriber.on('message', (ch: string, raw: string) => {
      const set = this.listeners.get(ch.slice(prefix.length));
      if (!set) return;
      let msg: RealtimeMessage;
      try {
        msg = JSON.parse(raw) as RealtimeMessage;
      } catch {
        return;
      }
      for (const fn of set) fn(msg);
    });
  }

  async onModuleDestroy() {
    await this.subscriber?.quit().catch(() => undefined);
  }

  async publish(channel: string, msg: RealtimeMessage): Promise<void> {
    try {
      await this.redis.publish(this.key(channel), JSON.stringify(msg));
    } catch (e) {
      // Realtime is best effort: clients also poll (heartbeat / dashboard refresh).
      this.log.warn(`publish ${channel} failed: ${(e as Error).message}`);
    }
  }

  async subscribe(channel: string, fn: (m: RealtimeMessage) => void): Promise<() => Promise<void>> {
    let set = this.listeners.get(channel);
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
      await this.subscriber!.subscribe(this.key(channel));
    }
    set.add(fn);
    return async () => {
      set!.delete(fn);
      if (set!.size === 0 && this.listeners.get(channel) === set) {
        this.listeners.delete(channel);
        await this.subscriber?.unsubscribe(this.key(channel)).catch(() => undefined);
      }
    };
  }
}
