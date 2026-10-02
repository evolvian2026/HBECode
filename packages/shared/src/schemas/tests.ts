import { z } from 'zod';
import { Uuid } from './common.js';

/**
 * Tests (timed assessments), attempts and proctoring. The server owns every rule here: deadlines,
 * severities, which events count as violations and what happens when a threshold is reached.
 * The client only reports what it observed.
 */

export const TestSettings = z.object({
  /** Ask for fullscreen at start; leaving it is a violation and covers the test until it returns. */
  requireFullscreen: z.boolean().default(true),
  /** Block copy/cut/paste/drop inside the test (each attempt is still logged). */
  blockClipboard: z.boolean().default(true),
  /** `flagged`: with consent, one webcam frame is uploaded right after a flagged event. Nothing otherwise. */
  webcam: z.enum(['off', 'flagged']).default('off'),
  violations: z
    .object({
      warnAt: z.number().int().min(1).max(100).default(3),
      finalWarnAt: z.number().int().min(1).max(100).default(5),
      /** 0 = never auto-submit for violations. */
      autoSubmitAt: z.number().int().min(0).max(100).default(7),
    })
    .default({ warnAt: 3, finalWarnAt: 5, autoSubmitAt: 7 })
    .refine((v) => v.finalWarnAt >= v.warnAt && (v.autoSubmitAt === 0 || v.autoSubmitAt >= v.finalWarnAt), 'thresholds must be warn ≤ final warning ≤ auto-submit'),
  /** Show the score to the student after they finish. */
  showResults: z.boolean().default(true),
});
export type TestSettings = z.infer<typeof TestSettings>;

const IsoDate = z.iso.datetime({ offset: true });

export const TestInput = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: z.string().max(5000).default(''),
    startsAt: IsoDate,
    endsAt: IsoDate,
    durationMin: z.number().int().min(1).max(1440),
    questions: z
      .array(z.object({ questionId: Uuid, points: z.number().positive().max(1000).default(100) }))
      .min(1)
      .max(50)
      .refine((qs) => new Set(qs.map((q) => q.questionId)).size === qs.length, 'a question can appear only once'),
    settings: TestSettings.default(TestSettings.parse({})),
  })
  .refine((t) => Date.parse(t.endsAt) > Date.parse(t.startsAt), { message: 'the window must end after it starts', path: ['endsAt'] });
export type TestInput = z.infer<typeof TestInput>;

export const AssignTestRequest = z.object({
  batchIds: z.array(Uuid).max(200).default([]),
  userIds: z.array(Uuid).max(2000).default([]),
});

export const StartAttemptRequest = z.object({
  /** Coarse device hash (UA, screen, timezone, cores) — used only to show "different device". */
  fingerprint: z.string().max(128).optional(),
});

/** Header carrying the per-device attempt token (kept in the browser's localStorage). */
export const ATTEMPT_TOKEN_HEADER = 'x-attempt-token';

export const CLIENT_EVENT_TYPES = [
  'tab_hidden',
  'tab_visible',
  'window_blur',
  'window_focus',
  'fullscreen_exit',
  'fullscreen_enter',
  'copy',
  'cut',
  'paste',
  'drop',
  'context_menu',
  'bulk_insert',
  'mouse_leave',
  'multi_monitor',
  'devtools_suspect',
  'webcam_denied',
] as const;
export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number];

export type ProctorSeverityLevel = 'info' | 'low' | 'medium' | 'high';

/** Severity and whether the event counts toward the violation policy. Decided server-side. */
export const EVENT_RULES: Record<string, { severity: ProctorSeverityLevel; counted: boolean; label: string }> = {
  tab_hidden: { severity: 'medium', counted: true, label: 'Switched tab / minimised' },
  tab_visible: { severity: 'info', counted: false, label: 'Returned to the test' },
  window_blur: { severity: 'low', counted: true, label: 'Left the window' },
  window_focus: { severity: 'info', counted: false, label: 'Focused the window' },
  fullscreen_exit: { severity: 'medium', counted: true, label: 'Left fullscreen' },
  fullscreen_enter: { severity: 'info', counted: false, label: 'Entered fullscreen' },
  copy: { severity: 'low', counted: true, label: 'Copy' },
  cut: { severity: 'low', counted: true, label: 'Cut' },
  paste: { severity: 'medium', counted: true, label: 'Paste' },
  drop: { severity: 'low', counted: true, label: 'Drag and drop' },
  context_menu: { severity: 'info', counted: false, label: 'Right-click' },
  bulk_insert: { severity: 'medium', counted: true, label: 'Large text inserted at once' },
  mouse_leave: { severity: 'info', counted: false, label: 'Mouse left the page' },
  multi_monitor: { severity: 'high', counted: true, label: 'Extended display detected' },
  devtools_suspect: { severity: 'low', counted: false, label: 'Developer tools suspected (low confidence)' },
  webcam_denied: { severity: 'medium', counted: false, label: 'Webcam permission denied' },
  // server-side events
  attempt_started: { severity: 'info', counted: false, label: 'Started the test' },
  attempt_resumed: { severity: 'info', counted: false, label: 'Resumed on the same device' },
  device_request: { severity: 'high', counted: false, label: 'Second device tried to open the test' },
  device_approved: { severity: 'info', counted: false, label: 'Proctor approved a device' },
  device_denied: { severity: 'info', counted: false, label: 'Proctor denied a device' },
  session_rejected: { severity: 'high', counted: false, label: 'Request with an unknown device token' },
  heartbeat_gap: { severity: 'medium', counted: false, label: 'No heartbeat for 45 s (offline or agent stopped)' },
  heartbeat_resumed: { severity: 'info', counted: false, label: 'Heartbeat resumed' },
  events_missing: { severity: 'high', counted: false, label: 'Client reported events the server never received' },
  warning_issued: { severity: 'info', counted: false, label: 'Automatic warning' },
  proctor_warn: { severity: 'info', counted: false, label: 'Proctor warning' },
  time_extended: { severity: 'info', counted: false, label: 'Time extended' },
  snapshot: { severity: 'info', counted: false, label: 'Webcam snapshot stored' },
  attempt_submitted: { severity: 'info', counted: false, label: 'Submitted' },
  auto_submitted: { severity: 'medium', counted: false, label: 'Auto-submitted' },
  terminated: { severity: 'high', counted: false, label: 'Terminated by proctor' },
};

export const ProctorEventsRequest = z.object({
  events: z
    .array(
      z.object({
        type: z.enum(CLIENT_EVENT_TYPES),
        clientTs: IsoDate,
        data: z.record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
      }),
    )
    .min(1)
    .max(50),
});

export const HeartbeatRequest = z.object({
  visible: z.boolean(),
  focused: z.boolean(),
  fullscreen: z.boolean(),
  /** Client events sent so far on this device (after flushing): the server compares. */
  eventsSent: z.number().int().min(0).max(1_000_000),
});

export const SnapshotRequest = z.object({
  eventType: z.enum(CLIENT_EVENT_TYPES),
  /** Base64 JPEG, ≤ 150 KB decoded. */
  image: z.string().max(210_000),
});

export const WarnRequest = z.object({ message: z.string().trim().min(1).max(300) });
export const ExtendRequest = z.object({ minutes: z.number().int().min(1).max(240) });
export const TerminateRequest = z.object({ reason: z.string().trim().min(1).max(300) });
export const SaveAttemptDraftRequest = z.object({ code: z.string().max(1100 * 1024) });

export type AttemptStatus = 'in_progress' | 'submitted' | 'auto_submitted' | 'terminated';

export type StartAttemptResult =
  | { state: 'active'; attemptId: string; token: string }
  | { state: 'pending'; attemptId: string; token: string; requestId: string }
  | { state: 'denied'; attemptId: string }
  | { state: 'ended'; attemptId: string; status: AttemptStatus };

export interface AttemptNotice {
  id: string;
  message: string;
  at: string;
}

/** What the student's device sees about its attempt. */
export interface AttemptView {
  id: string;
  testId: string;
  title: string;
  description: string;
  status: AttemptStatus;
  startedAt: string;
  deadlineAt: string;
  serverNow: string;
  violationCount: number;
  warningLevel: number;
  settings: TestSettings;
  questions: { questionId: string; ordinal: number; points: number; title: string; type: 'coding' | 'web' | 'db'; difficulty: string; bestScore: number | null; submissions: number }[];
  score: number | null;
  maxScore: number | null;
  notices: AttemptNotice[];
}

export interface HeartbeatResponse {
  status: AttemptStatus;
  deadlineAt: string;
  serverNow: string;
  violationCount: number;
  warningLevel: number;
  notices: AttemptNotice[];
}

/** Messages pushed over the WebSocket. Clients re-read state over HTTP when in doubt. */
export type RealtimeMessage =
  | { type: 'notice'; notice: AttemptNotice }
  | { type: 'deadline'; deadlineAt: string }
  | { type: 'violations'; violationCount: number; warningLevel: number }
  | { type: 'ended'; status: AttemptStatus }
  | { type: 'session_replaced' }
  | { type: 'attempt_changed'; attemptId: string | null; userId: string | null };
