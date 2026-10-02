import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { hasPermission, type RealtimeMessage } from '@hbe/shared';
import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';
import { TokenService } from '../auth/token.service.js';
import { ACCESS_COOKIE } from '../common/cookies.js';
import type { AuthUser } from '../common/decorators.js';
import { CONFIG, type AppConfig } from '../config.js';
import { AttemptsService } from '../tests/attempts.service.js';
import { TestsService } from '../tests/tests.service.js';
import { RealtimeService } from './realtime.service.js';

export const WS_PATH = '/api/v1/ws';
const MAX_SUBSCRIPTIONS = 20;
const RECHECK_MS = 30_000;
const PING_MS = 25_000;

const ClientMessage = z.union([
  z.object({ op: z.literal('sub'), channel: z.literal('attempt'), attemptId: z.uuid(), token: z.string().min(1).max(200) }),
  z.object({ op: z.literal('sub'), channel: z.literal('monitor'), testId: z.uuid() }),
  z.object({ op: z.literal('ping') }),
]);

function cookie(header: string | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/**
 * Push-only WebSocket at /api/v1/ws (Phase 4). Security:
 *  - the Origin must be an allowed web origin (no cross-site WebSocket hijacking);
 *  - the access-token cookie authenticates the upgrade and is re-verified every 30 s (expiry,
 *    revoked sessions); an expired token closes the socket with 4001 so the client refreshes;
 *  - every subscription is authorised with the same service checks as the HTTP routes:
 *    `attempt` needs the attempt's active device token, `monitor` needs test:proctor and a test
 *    visible under the proctor's RLS context;
 *  - inbound frames are small JSON commands only (4 KB cap); nothing a client sends is relayed.
 * State changes are never made over the socket: they go through the audited HTTP endpoints.
 */
@Injectable()
export class RealtimeGateway implements OnApplicationShutdown {
  private readonly log = new Logger('RealtimeGateway');
  private wss?: WebSocketServer;
  private connections = 0;

  constructor(
    private readonly tokens: TokenService,
    private readonly rt: RealtimeService,
    private readonly attempts: AttemptsService,
    private readonly tests: TestsService,
    @Inject(CONFIG) private readonly cfg: AppConfig,
  ) {}

  get connectionCount() {
    return this.connections;
  }

  attach(server: Server) {
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      void this.upgrade(req, socket, head);
    });
  }

  private reject(socket: Duplex, status: number, text: string) {
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
  }

  private async upgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname !== WS_PATH) return this.reject(socket, 404, 'Not Found');
    const origin = req.headers.origin;
    if (!origin || !this.cfg.webOrigins.includes(origin)) return this.reject(socket, 403, 'Forbidden');
    const raw = cookie(req.headers.cookie, ACCESS_COOKIE);
    const user = raw ? await this.tokens.verifyAccess(raw) : null;
    if (!user || user.mfaSetupRequired) return this.reject(socket, 401, 'Unauthorized');
    this.wss!.handleUpgrade(req, socket, head, (ws) => this.connected(ws, user, raw!));
  }

  private connected(ws: WebSocket, user: AuthUser, rawToken: string) {
    this.connections++;
    const subs = new Map<string, () => Promise<void>>();
    let alive = true;
    const send = (m: RealtimeMessage | { type: 'subscribed'; channel: string } | { type: 'error'; error: string } | { type: 'pong' }) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
    };
    const recheck = setInterval(() => {
      void this.tokens.verifyAccess(rawToken).then((u) => {
        if (!u) ws.close(4001, 'session expired');
      });
    }, RECHECK_MS);
    const ping = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, PING_MS);
    ws.on('pong', () => (alive = true));
    ws.on('close', () => {
      this.connections--;
      clearInterval(recheck);
      clearInterval(ping);
      for (const off of subs.values()) void off();
      subs.clear();
    });
    ws.on('message', (data) => {
      void (async () => {
        let msg: z.infer<typeof ClientMessage>;
        try {
          msg = ClientMessage.parse(JSON.parse(String(data)));
        } catch {
          return send({ type: 'error', error: 'bad message' });
        }
        if (msg.op === 'ping') return send({ type: 'pong' });
        if (subs.size >= MAX_SUBSCRIPTIONS) return send({ type: 'error', error: 'too many subscriptions' });
        let channel: string;
        try {
          if (msg.channel === 'attempt') {
            if (!hasPermission(user.role, 'test:attempt')) throw new Error('forbidden');
            await this.attempts.authorize(user, msg.attemptId, msg.token, false);
            channel = `attempt:${msg.attemptId}`;
          } else {
            if (!hasPermission(user.role, 'test:proctor')) throw new Error('forbidden');
            await this.tests.detail(user, msg.testId); // 404 unless visible under the proctor's RLS
            channel = `monitor:${msg.testId}`;
          }
        } catch {
          return send({ type: 'error', error: 'not allowed' });
        }
        if (!subs.has(channel)) {
          const off = await this.rt.subscribe(channel, send);
          if (ws.readyState !== ws.OPEN) return void off();
          subs.set(channel, off);
        }
        send({ type: 'subscribed', channel });
      })().catch((e) => this.log.warn(`ws message failed: ${(e as Error).message}`));
    });
  }

  onApplicationShutdown() {
    for (const c of this.wss?.clients ?? []) c.terminate();
    this.wss?.close();
  }
}
