// k6 load test: a class sitting a timed, proctored coding test.
//
// Each virtual user is one student doing what the exam page does:
//   - signs in (spread over LOGIN_SPREAD seconds, like a class arriving), starts the attempt,
//     opens the question and keeps a WebSocket open for proctor messages;
//   - heartbeat every 15 s, proctoring event batches every 5 s (when there is something to send),
//     a draft save every ~10 s while typing;
//   - "Run" (samples) every RUN_EVERY seconds on average and waits for the verdict;
//   - in the last minute: one graded "Submit" and "Finish test" (the end-of-test burst).
// One teacher watches the live monitor (every 10 s) during the test.
//
//   k6 run -e STUDENTS=20 -e DURATION=6m loadtest/exam.js
// See loadtest/README.md for the pilot-sized stack and how the published numbers were produced.
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import exec from 'k6/execution';
import { clearInterval, clearTimeout, setInterval, setTimeout } from 'k6/timers';
import { WebSocket } from 'k6/experimental/websockets';

const API = __ENV.API_URL || 'http://localhost:4000';
const ORIGIN = __ENV.WEB_ORIGIN || 'http://localhost:3000';
const STUDENTS = Number(__ENV.STUDENTS || 20);
const DURATION_S = parseDuration(__ENV.DURATION || '6m');
const LOGIN_SPREAD_S = Number(__ENV.LOGIN_SPREAD || 60);
const RUN_EVERY_S = Number(__ENV.RUN_EVERY || 75);
const PASSWORD = __ENV.PASSWORD || 'demo-password-123';
const QUESTION = __ENV.QUESTION || 'Sum of an Array';
// WAIT=sse (default): wait for a verdict like the web app, on the Server-Sent Events stream, which
// the server closes when grading finishes. WAIT=poll: GET the submission every 0.5 s instead.
const WAIT = __ENV.WAIT || 'sse';
// SUBMIT=0: no final Submit (profiling the API alone, without an executor).
const SUBMIT = __ENV.SUBMIT !== '0';

const runE2E = new Trend('run_to_verdict_ms', true);
const submitE2E = new Trend('submit_to_verdict_ms', true);
const loginMs = new Trend('login_ms', true);
const verdictOk = new Rate('verdict_ok');
const wsMessages = new Counter('ws_messages');
const wsOpen = new Rate('ws_open_ok');

export const options = {
  scenarios: {
    students: { executor: 'per-vu-iterations', vus: STUDENTS, iterations: 1, maxDuration: `${DURATION_S + LOGIN_SPREAD_S + 240}s`, exec: 'student' },
    teacher: { executor: 'per-vu-iterations', vus: 1, iterations: 1, maxDuration: `${DURATION_S + LOGIN_SPREAD_S + 240}s`, exec: 'teacher' },
  },
  // Reported, not enforced: the report states what passed and what did not.
  thresholds: {
    ...Object.fromEntries(['login', 'my_tests', 'start_attempt', 'attempt_view', 'question', 'drafts_get', 'heartbeat', 'events', 'draft', 'run', 'submit', 'poll', 'sse', 'finish', 'live_monitor', 'test_report'].map((n) => [`http_req_duration{name:${n}}`, ['max>=0']])),
    'http_req_failed{kind:student}': ['rate<0.01'],
    
    run_to_verdict_ms: ['p(95)<10000'],
    submit_to_verdict_ms: ['p(95)<30000'],
    verdict_ok: ['rate>0.99'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max', 'count'],
};

// Solutions in the three most common languages (the executor's cost differs a lot per language).
const SOLUTIONS = [
  ['python', 'def sum_array(a: list[int]) -> int:\n    return sum(a)\n'],
  ['python', 'def sum_array(a: list[int]) -> int:\n    total = 0\n    for x in a:\n        total += x\n    return total\n'],
  ['cpp', 'long long sumArray(const vector<long long>& a) {\n    long long s = 0;\n    for (auto x : a) s += x;\n    return s;\n}\n'],
  ['java', 'class Solution {\n    long sumArray(long[] a) {\n        long s = 0;\n        for (long x : a) s += x;\n        return s;\n    }\n}\n'],
];

function parseDuration(s) {
  const m = /^(\d+)(s|m)?$/.exec(s);
  if (!m) throw new Error(`bad DURATION ${s}`);
  return Number(m[1]) * (m[2] === 'm' ? 60 : 1);
}

/** A signed-in browser session: CSRF double-submit + Origin, like the web app. */
class Session {
  constructor(kind) {
    this.kind = kind;
    this.csrf = '';
    this.extra = {};
    this.refreshing = null;
  }
  params(name, timeout = '60s') {
    return { headers: { origin: ORIGIN, 'x-csrf-token': this.csrf, 'content-type': 'application/json', ...this.extra }, tags: { name, kind: this.kind }, timeout };
  }
  login(email) {
    const t0 = Date.now();
    const c = http.get(`${API}/api/v1/auth/csrf`, { tags: { name: 'csrf', kind: this.kind } });
    this.csrf = c.json('csrfToken');
    const r = http.post(`${API}/api/v1/auth/login`, JSON.stringify({ email, password: PASSWORD }), this.params('login'));
    if (!check(r, { 'login 200': (x) => x.status === 200 })) fail(`login ${email}: ${r.status} ${r.body}`);
    loginMs.add(Date.now() - t0);
  }
  /** Synchronous request (setup and the teacher). */
  get(path, name) {
    return http.get(`${API}${path}`, this.params(name));
  }
  /** Bodyless POSTs still send `{}`: the API rejects an empty body with a JSON content type. */
  body(method, body) {
    return body === undefined ? (method === 'GET' ? null : '{}') : JSON.stringify(body);
  }
  /** Every failed request is logged (name, status, body) so the report can say what failed. */
  note(r, name) {
    if (r.status === 0 || r.status >= 400) console.warn(`FAILED ${name} ${r.status} ${r.error || ''} ${String(r.body || '').slice(0, 160)}`);
    return r;
  }
  send(method, path, body, name) {
    return this.note(http.request(method, `${API}${path}`, this.body(method, body), this.params(name)), name);
  }
  /**
   * Non-blocking request, so timers keep firing while a Run waits for its verdict. On 401 (the
   * 10-minute access token expired) refresh once — single-flight, as refresh tokens rotate — and retry.
   */
  async req(method, path, body, name, timeout) {
    const go = () => http.asyncRequest(method, `${API}${path}`, this.body(method, body), this.params(name, timeout));
    let r = await go();
    if (r.status === 401) {
      this.refreshing ??= http.asyncRequest('POST', `${API}/api/v1/auth/refresh`, '{}', this.params('refresh')).finally(() => (this.refreshing = null));
      await this.refreshing;
      r = await go();
    }
    return this.note(r, name);
  }
  cookieHeader() {
    const jar = http.cookieJar().cookiesForURL(API);
    return Object.entries(jar).map(([k, v]) => `${k}=${v[0]}`).join('; ');
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function setup() {
  const t = new Session('setup');
  t.login(__ENV.TEACHER || 'teacher@demo.edu');
  const q = t.get(`/api/v1/questions?status=published&q=${encodeURIComponent(QUESTION)}`, 'setup').json('items');
  if (!q || !q.length) fail(`question "${QUESTION}" is not published yet (run the seed and wait for validation)`);
  const ids = [];
  let cursor = '';
  do {
    const page = t.get(`/api/v1/users?role=student&q=load&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, 'setup').json();
    for (const u of page.items) if (/^load\d+@demo\.edu$/.test(u.email)) ids.push({ id: u.id, email: u.email });
    cursor = page.nextCursor || '';
  } while (cursor);
  ids.sort((a, b) => Number(a.email.match(/\d+/)[0]) - Number(b.email.match(/\d+/)[0]));
  if (ids.length < STUDENTS) fail(`only ${ids.length} load students exist; seed with SEED_LOAD_STUDENTS=${STUDENTS}`);
  const users = ids.slice(0, STUDENTS);
  const now = Date.now();
  const test = t.send('POST', '/api/v1/tests', {
    title: `Load test ${STUDENTS} students ${new Date(now).toISOString()}`,
    startsAt: new Date(now - 60_000).toISOString(),
    endsAt: new Date(now + (DURATION_S + LOGIN_SPREAD_S + 600) * 1000).toISOString(),
    durationMin: Math.ceil((DURATION_S + LOGIN_SPREAD_S + 300) / 60),
    questions: [{ questionId: q[0].id, points: 100 }],
    settings: { requireFullscreen: false, blockClipboard: true, webcam: 'off', violations: { warnAt: 3, finalWarnAt: 5, autoSubmitAt: 0 } },
  }, 'setup');
  if (test.status !== 201 && test.status !== 200) fail(`create test: ${test.status} ${test.body}`);
  const testId = test.json('id');
  const asg = t.send('POST', `/api/v1/tests/${testId}/assign`, { userIds: users.map((u) => u.id) }, 'setup');
  if (asg.status >= 300) fail(`assign: ${asg.status} ${asg.body}`);
  const pub = t.send('POST', `/api/v1/tests/${testId}/publish`, undefined, 'setup');
  if (pub.status >= 300) fail(`publish: ${pub.status} ${pub.body}`);
  return { testId, questionId: q[0].id, emails: users.map((u) => u.email) };
}

/** Wait for a verdict: one SSE request (as the app does), or polling (WAIT=poll). */
async function waitVerdict(s, id) {
  const t0 = Date.now();
  if (WAIT === 'sse') {
    const r = await s.req('GET', `/api/v1/submissions/${id}/events`, undefined, 'sse', '200s');
    const last = String(r.body || '').split('\n').filter((l) => l.startsWith('data: ')).pop();
    if (r.status === 200 && last) {
      const sub = JSON.parse(last.slice(6));
      if (sub.status === 'done' || sub.status === 'failed') return { ms: Date.now() - t0, verdict: sub.verdict };
    }
    // Stream ended without a final state (timeout or error): fall through to polling.
  }
  while (Date.now() - t0 < 180_000) {
    const r = await s.req('GET', `/api/v1/submissions/${id}`, undefined, 'poll');
    if (r.status === 200) {
      const st = r.json('status');
      if (st === 'done' || st === 'failed') return { ms: Date.now() - t0, verdict: r.json('verdict') };
    }
    await wait(500);
  }
  return { ms: Date.now() - t0, verdict: 'TIMEOUT' };
}

export async function student(data) {
  const i = exec.scenario.iterationInTest; // 0 … STUDENTS-1
  sleep((i / STUDENTS) * LOGIN_SPREAD_S);
  const s = new Session('student');
  s.login(data.emails[i]);
  s.get('/api/v1/my/tests', 'my_tests');
  const start = s.send('POST', `/api/v1/tests/${data.testId}/attempt`, {}, 'start_attempt');
  if (!check(start, { 'attempt started': (r) => r.status === 200 || r.status === 201 })) fail(`start: ${start.status} ${start.body}`);
  const attemptId = start.json('attemptId');
  s.extra = { 'x-attempt-token': start.json('token') };
  s.get(`/api/v1/attempts/${attemptId}`, 'attempt_view');
  s.get(`/api/v1/attempts/${attemptId}/questions/${data.questionId}`, 'question');
  s.get(`/api/v1/attempts/${attemptId}/drafts/${data.questionId}`, 'drafts_get');

  const [runtime, code] = SOLUTIONS[i % SOLUTIONS.length];
  const submit = async (kind, trend) => {
    const r = await s.req('POST', '/api/v1/submissions', { questionId: data.questionId, runtime, code, kind, attemptId }, kind);
    if (r.status !== 202) {
      verdictOk.add(false);
      return;
    }
    const v = await waitVerdict(s, r.json('id'));
    trend.add(v.ms);
    verdictOk.add(v.verdict === 'AC');
  };

  const ws = new WebSocket(`${API.replace(/^http/, 'ws')}/api/v1/ws`, null, { headers: { Origin: ORIGIN, Cookie: s.cookieHeader() } });
  let opened = false;
  ws.onmessage = () => wsMessages.add(1);
  ws.onerror = () => undefined;
  ws.onopen = () => {
    opened = true;
    wsOpen.add(1);
  };
  const quiet = (p) => p.catch(() => undefined);
  let edits = 0;
  let ending = false;
  const intervals = [
    setInterval(() => quiet(s.req('POST', `/api/v1/attempts/${attemptId}/heartbeat`, { visible: true, focused: true, fullscreen: false, eventsSent: edits }, 'heartbeat')), 15_000),
    setInterval(() => {
      if (Math.random() < 0.3) quiet(s.req('POST', `/api/v1/attempts/${attemptId}/events`, { events: [{ type: 'window_focus', clientTs: new Date().toISOString() }] }, 'events'));
    }, 5_000),
    setInterval(() => {
      edits++;
      quiet(s.req('PUT', `/api/v1/attempts/${attemptId}/drafts/${data.questionId}/${runtime}`, { code: `${code}\n# edit ${edits}\n` }, 'draft'));
    }, 8_000 + Math.floor(Math.random() * 4_000)),
  ];
  // "Run" now and then; one at a time per student, as in the UI. The pause between runs ends
  // early when the test ends, so the final Submit is not held back by a sleeping run loop.
  let wake = () => undefined;
  let pause = null;
  const runs = (async () => {
    while (!ending) {
      await new Promise((r) => {
        wake = r;
        pause = setTimeout(r, RUN_EVERY_S * (0.5 + Math.random()) * 1000);
      });
      if (!ending) await submit('run', runE2E);
    }
  })();
  // The last minute: everyone submits within ~45 s, then finishes the test.
  await wait((DURATION_S - (i * LOGIN_SPREAD_S) / STUDENTS - 60 + Math.random() * 45) * 1000);
  ending = true;
  clearTimeout(pause);
  wake();
  await runs;
  if (SUBMIT) await submit('submit', submitE2E);
  for (const t of intervals) clearInterval(t);
  const fin = await s.req('POST', `/api/v1/attempts/${attemptId}/submit`, {}, 'finish');
  check(fin, { finished: (x) => x.status < 300 });
  if (!opened) wsOpen.add(0);
  ws.close();
}

export function teacher(data) {
  const s = new Session('teacher');
  s.login(__ENV.TEACHER || 'teacher@demo.edu');
  const end = Date.now() + (DURATION_S + LOGIN_SPREAD_S) * 1000;
  while (Date.now() < end) {
    s.get(`/api/v1/tests/${data.testId}/live`, 'live_monitor');
    sleep(10);
  }
  s.get(`/api/v1/reports/tests/${data.testId}`, 'test_report');
}

export function handleSummary(d) {
  const out = __ENV.SUMMARY_OUT || 'loadtest/results/summary.json';
  return { [out]: JSON.stringify(d, null, 2), stdout: textSummary(d) };
}

function textSummary(d) {
  const m = d.metrics;
  const line = (k, label) => (m[k] && m[k].values.count ? `${label.padEnd(34)} p50 ${fmt(m[k].values.med)}  p95 ${fmt(m[k].values['p(95)'])}  max ${fmt(m[k].values.max)}  n ${m[k].values.count ?? ''}\n` : '');
  const fmt = (v) => (v === undefined ? '-' : `${Math.round(v)} ms`.padStart(9));
  let s = `\nHBECode exam load test: ${STUDENTS} students, ${DURATION_S} s\n`;
  s += line('login_ms', 'login (csrf + argon2id)');
  for (const k of Object.keys(m).filter((x) => x.startsWith('http_req_duration{') && x.includes('name:')).sort()) s += line(k, k.replace('http_req_duration', ''));
  s += line('run_to_verdict_ms', 'Run → verdict');
  s += line('submit_to_verdict_ms', 'Submit → verdict');
  const rate = (k) => (m[k] ? `${(m[k].values.rate * 100).toFixed(2)} %` : '-');
  s += `http errors (student): ${rate('http_req_failed{kind:student}')}   verdicts AC: ${rate('verdict_ok')}   ws opened: ${rate('ws_open_ok')}\n`;
  return s;
}
