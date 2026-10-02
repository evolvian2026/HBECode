'use client';

import { ATTEMPT_TOKEN_HEADER, EVENT_RULES, type AttemptNotice, type ClientEventType, type HeartbeatResponse, type TestSettings } from '@hbe/shared';
import { useCallback, useEffect, useRef } from 'react';
import { api, ApiError, openRealtime } from '@/lib/api';

/**
 * Browser proctoring agent. It reports what it observes; the server decides severity, what
 * counts as a violation, warnings and auto-submission. It deters, it cannot guarantee: a
 * determined student can use a second device or a modified browser (see the threat model, T3).
 */
const FLUSH_MS = 5_000;
const HEARTBEAT_MS = 15_000;

export interface ProctorState {
  violationCount: number;
  warningLevel: number;
  status: string;
}

interface Options {
  attemptId: string;
  token: string;
  settings: TestSettings;
  onState: (s: Partial<ProctorState> & { deadlineAt?: string; serverNow?: string }) => void;
  onNotice: (n: AttemptNotice) => void;
  onSessionError: (detail: string) => void;
  onEnded: (status: string) => void;
  /** Returns a base64 JPEG (or null) — only used when the test enables flagged snapshots. */
  capture?: () => Promise<string | null>;
}

type Queued = { type: ClientEventType; clientTs: string; data?: Record<string, string | number | boolean> };

export function useProctoring(o: Options | null) {
  const opts = useRef(o);
  opts.current = o;
  const queue = useRef<Queued[]>([]);
  const sent = useRef(0);
  const flushing = useRef<Promise<void> | null>(null);
  const snapshotPending = useRef<ClientEventType | null>(null);

  const headers = () => ({ [ATTEMPT_TOKEN_HEADER]: opts.current!.token });

  const handleError = (e: unknown) => {
    if (e instanceof ApiError && e.status === 409) opts.current?.onSessionError(e.detail ?? '');
  };

  const takeSnapshot = async (type: ClientEventType) => {
    const cur = opts.current;
    if (!cur?.capture || cur.settings.webcam !== 'flagged') return;
    if (document.visibilityState !== 'visible') {
      snapshotPending.current = type; // the camera may be paused while hidden: capture on return
      return;
    }
    const image = await cur.capture().catch(() => null);
    if (!image) return;
    await api('POST', `/api/v1/attempts/${cur.attemptId}/snapshots`, { eventType: type, image }, headers()).catch(() => undefined);
  };

  const flush = useCallback(async () => {
    if (flushing.current) return flushing.current;
    const cur = opts.current;
    if (!cur || queue.current.length === 0) return;
    const batch = queue.current.splice(0, 50);
    flushing.current = (async () => {
      try {
        const r = await api<ProctorState>('POST', `/api/v1/attempts/${cur.attemptId}/events`, { events: batch }, headers());
        sent.current += batch.length;
        cur.onState(r);
        if (r.status !== 'in_progress') cur.onEnded(r.status);
        const counted = batch.find((e) => EVENT_RULES[e.type]?.counted);
        if (counted) await takeSnapshot(counted.type);
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) handleError(e);
        else queue.current.unshift(...batch); // retry later (offline)
      } finally {
        flushing.current = null;
      }
    })();
    return flushing.current;
    // takeSnapshot reads everything through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const report = useCallback(
    (type: ClientEventType, data?: Record<string, string | number | boolean>) => {
      if (!opts.current) return;
      queue.current.push({ type, clientTs: new Date().toISOString(), data });
      if (EVENT_RULES[type]?.counted) setTimeout(() => void flush(), 0);
    },
    [flush],
  );

  const active = o !== null;
  const attemptId = o?.attemptId;
  useEffect(() => {
    if (!active) return;
    const cur = () => opts.current!;
    const doc = document;
    const block = (e: Event) => {
      if (cur().settings.blockClipboard) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onVisibility = () => {
      if (doc.visibilityState === 'hidden') report('tab_hidden');
      else {
        report('tab_visible');
        if (snapshotPending.current) {
          const t = snapshotPending.current;
          snapshotPending.current = null;
          setTimeout(() => void takeSnapshot(t), 500);
        }
      }
    };
    const onBlur = () => report('window_blur');
    const onFocus = () => report('window_focus');
    const onFullscreen = () => report(doc.fullscreenElement ? 'fullscreen_enter' : 'fullscreen_exit');
    const onCopy = (e: Event) => { report('copy'); block(e); };
    const onCut = (e: Event) => { report('cut'); block(e); };
    const onPaste = (e: ClipboardEvent) => { report('paste', { chars: e.clipboardData?.getData('text')?.length ?? 0 }); block(e); };
    const onDrop = (e: Event) => { report('drop'); block(e); };
    const onContext = (e: Event) => { report('context_menu'); e.preventDefault(); };
    let leaveTimer: ReturnType<typeof setTimeout> | null = null;
    const onLeave = () => {
      if (leaveTimer) return;
      leaveTimer = setTimeout(() => (leaveTimer = null), 2000);
      report('mouse_leave');
    };
    doc.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    doc.addEventListener('fullscreenchange', onFullscreen);
    doc.addEventListener('copy', onCopy, true);
    doc.addEventListener('cut', onCut, true);
    doc.addEventListener('paste', onPaste, true);
    doc.addEventListener('drop', onDrop, true);
    doc.addEventListener('contextmenu', onContext, true);
    doc.documentElement.addEventListener('mouseleave', onLeave);

    let multiReported = false;
    let devtoolsAt = 0;
    const probes = () => {
      const s = screen as Screen & { isExtended?: boolean };
      if (s.isExtended && !multiReported) {
        multiReported = true;
        report('multi_monitor');
      }
      // Low-confidence heuristic: docked developer tools shrink the viewport a lot.
      const docked = window.outerWidth - window.innerWidth > 240 || window.outerHeight - window.innerHeight > 260;
      if (docked && !doc.fullscreenElement && Date.now() - devtoolsAt > 60_000) {
        devtoolsAt = Date.now();
        report('devtools_suspect');
      }
    };
    probes();
    const flushTimer = setInterval(() => void flush(), FLUSH_MS);
    const heartbeat = async () => {
      probes();
      await flush();
      const c = opts.current;
      if (!c) return;
      try {
        const r = await api<HeartbeatResponse>(
          'POST',
          `/api/v1/attempts/${c.attemptId}/heartbeat`,
          { visible: doc.visibilityState === 'visible', focused: doc.hasFocus(), fullscreen: !!doc.fullscreenElement, eventsSent: sent.current },
          headers(),
        );
        c.onState(r);
        for (const n of r.notices) c.onNotice(n);
        if (r.status !== 'in_progress') c.onEnded(r.status);
      } catch (e) {
        handleError(e);
      }
    };
    void heartbeat();
    const hbTimer = setInterval(() => void heartbeat(), HEARTBEAT_MS);
    const stopWs = openRealtime({ channel: 'attempt', attemptId: cur().attemptId, token: cur().token }, (m) => {
      const c = opts.current;
      if (!c) return;
      if (m.type === 'notice') c.onNotice(m.notice as AttemptNotice);
      else if (m.type === 'deadline') c.onState({ deadlineAt: String(m.deadlineAt) });
      else if (m.type === 'violations') c.onState({ violationCount: Number(m.violationCount), warningLevel: Number(m.warningLevel) });
      else if (m.type === 'ended') c.onEnded(String(m.status));
      else if (m.type === 'session_replaced') void heartbeat(); // confirm over HTTP (409 if it was us)
    });
    return () => {
      doc.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      doc.removeEventListener('fullscreenchange', onFullscreen);
      doc.removeEventListener('copy', onCopy, true);
      doc.removeEventListener('cut', onCut, true);
      doc.removeEventListener('paste', onPaste, true);
      doc.removeEventListener('drop', onDrop, true);
      doc.removeEventListener('contextmenu', onContext, true);
      doc.documentElement.removeEventListener('mouseleave', onLeave);
      clearInterval(flushTimer);
      clearInterval(hbTimer);
      stopWs();
      void flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, attemptId]);

  return { report, flush };
}

/** Webcam for flagged snapshots: one stream, frames captured to a small JPEG on demand. */
export function createWebcam() {
  let stream: MediaStream | null = null;
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  return {
    async start(): Promise<boolean> {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
        video.srcObject = stream;
        await video.play();
        return true;
      } catch {
        return false;
      }
    },
    async capture(): Promise<string | null> {
      if (!stream) return null;
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      canvas.getContext('2d')?.drawImage(video, 0, 0, 320, 240);
      const url = canvas.toDataURL('image/jpeg', 0.6);
      return url.split(',')[1] ?? null;
    },
    stop() {
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    },
  };
}

/** Coarse device hash: only used to show proctors "this looks like a different device". */
export async function deviceFingerprint(): Promise<string> {
  const raw = [navigator.userAgent, `${screen.width}x${screen.height}x${screen.colorDepth}`, Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.hardwareConcurrency].join('|');
  try {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return 'unknown';
  }
}
