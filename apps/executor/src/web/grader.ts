import type { AssertSpec, CheckSpec, ExecResult, ExecTestResult, Verdict, WebJob } from '@hbe/shared';
import { BuildError, buildDocument } from '@hbe/web-runtime';
import { loadVendor } from '@hbe/web-runtime/node';
import type { Browser, CDPSession, Page } from 'playwright-core';
import type { ExecutorConfig } from '../config.js';
import { launchJailedChromium, writeChromeWrapper } from './chrome.js';

const ORIGIN = 'http://student.hbe.test/';
const DEFAULT_VIEWPORT = { width: 1280, height: 800 };
let wrapperPath: Promise<string> | null = null;
let vendor: ReturnType<typeof loadVendor> | null = null;

class CheckFailed extends Error {}

/** Runs in the page: resolves after two animation frames (lets React and CSS settle). */
const TWO_FRAMES = 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))';

const collapse = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

function matchText(actual: string, m: { equals?: string; contains?: string; matches?: string } | undefined): boolean {
  if (!m) return true;
  if (m.equals !== undefined) return collapse(actual) === collapse(m.equals);
  if (m.contains !== undefined) return collapse(actual).includes(collapse(m.contains));
  return new RegExp(m.matches!).test(actual);
}
const describe = (m: { equals?: string; contains?: string; matches?: string }) =>
  m.equals !== undefined ? `= "${m.equals}"` : m.contains !== undefined ? `to contain "${m.contains}"` : `to match /${m.matches}/`;

function countOk(n: number, c: { eq?: number; min?: number; max?: number } | undefined): boolean {
  if (!c) return n >= 1;
  return (c.eq === undefined || n === c.eq) && (c.min === undefined || n >= c.min) && (c.max === undefined || n <= c.max);
}

/** Computed style via the DevTools protocol: page scripts cannot patch getComputedStyle for us. */
async function computedStyle(cdp: CDPSession, selector: string, property: string): Promise<string | null> {
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  if (!nodeId) return null;
  const { computedStyle } = await cdp.send('CSS.getComputedStyleForNode', { nodeId });
  return computedStyle.find((p) => p.name === property)?.value ?? '';
}

const LABELLED_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'listbox', 'checkbox', 'radio', 'spinbutton', 'slider', 'switch']);

async function axNodes(cdp: CDPSession) {
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  return nodes.filter((n) => !n.ignored).map((n) => ({ role: String(n.role?.value ?? ''), name: String(n.name?.value ?? '').trim() }));
}

async function assert(page: Page, cdp: CDPSession, a: AssertSpec, timeout: number): Promise<void> {
  switch (a.kind) {
    case 'exists': {
      const n = await page.locator(a.selector).count();
      if (!countOk(n, a.count)) throw new CheckFailed(`expected ${a.count ? JSON.stringify(a.count) : 'at least 1'} element(s) matching "${a.selector}", found ${n}`);
      return;
    }
    case 'text': {
      const loc = page.locator(a.selector).first();
      if ((await loc.count()) === 0) throw new CheckFailed(`no element matches "${a.selector}"`);
      const t = (await loc.textContent({ timeout })) ?? '';
      if (!matchText(t, a.match)) throw new CheckFailed(`text of "${a.selector}" expected ${describe(a.match)}, got "${collapse(t).slice(0, 120)}"`);
      return;
    }
    case 'attribute': {
      const loc = page.locator(a.selector).first();
      if ((await loc.count()) === 0) throw new CheckFailed(`no element matches "${a.selector}"`);
      const v = await loc.getAttribute(a.name, { timeout });
      if (v === null) throw new CheckFailed(`"${a.selector}" has no ${a.name} attribute`);
      if (!matchText(v, a.match)) throw new CheckFailed(`${a.name} of "${a.selector}" expected ${describe(a.match!)}, got "${v.slice(0, 120)}"`);
      return;
    }
    case 'style': {
      const v = await computedStyle(cdp, a.selector, a.property);
      if (v === null) throw new CheckFailed(`no element matches "${a.selector}"`);
      if (!matchText(v, a.match)) throw new CheckFailed(`${a.property} of "${a.selector}" expected ${describe(a.match)}, got "${v}"`);
      return;
    }
    case 'role': {
      const loc = page.getByRole(a.role as Parameters<Page['getByRole']>[0], a.name ? { name: a.name } : {});
      const n = await loc.count();
      if (!countOk(n, a.count)) throw new CheckFailed(`expected ${a.count ? JSON.stringify(a.count) : 'at least 1'} element(s) with role ${a.role}${a.name ? ` named "${a.name}"` : ''}, found ${n}`);
      return;
    }
    case 'a11y': {
      if (a.rule === 'document-lang') {
        const lang = await page.locator('html').getAttribute('lang');
        if (!lang?.trim()) throw new CheckFailed('the <html> element needs a lang attribute');
        return;
      }
      if (a.rule === 'single-h1') {
        const n = await page.locator('h1').count();
        if (n !== 1) throw new CheckFailed(`expected exactly one <h1>, found ${n}`);
        return;
      }
      const nodes = await axNodes(cdp);
      const bad =
        a.rule === 'img-alt'
          ? (await page.locator('img:not([alt])').count())
          : nodes.filter((n) => (a.rule === 'button-names' ? n.role === 'button' : LABELLED_ROLES.has(n.role)) && !n.name).length;
      if (bad > 0) {
        const what = a.rule === 'img-alt' ? 'image(s) without alt text' : a.rule === 'button-names' ? 'button(s) without an accessible name' : 'form control(s) without a label';
        throw new CheckFailed(`${bad} ${what}`);
      }
      return;
    }
  }
}

/**
 * How long one interaction step waits for its element. The page has already loaded, so a
 * missing element fails fast with a clear reason instead of burning the whole check budget (which
 * stays the infinite-loop guard) and holding the executor slot.
 */
const STEP_WAIT_MS = 1500;

async function runCheck(page: Page, cdp: CDPSession, spec: CheckSpec, checkTimeout: number): Promise<void> {
  if (spec.kind !== 'interaction') return assert(page, cdp, spec, checkTimeout);
  const timeout = Math.min(STEP_WAIT_MS, Math.floor(checkTimeout / 2));
  for (const s of spec.steps) {
    const loc = page.locator(s.selector).first();
    try {
      if (s.action === 'click') await loc.click({ timeout });
      else if (s.action === 'fill') await loc.fill(s.value ?? '', { timeout });
      else if (s.action === 'press') await loc.press(s.value ?? 'Enter', { timeout });
      else if (s.action === 'hover') await loc.hover({ timeout });
      else if (s.action === 'check') await loc.check({ timeout });
      else if (s.action === 'uncheck') await loc.uncheck({ timeout });
      else await loc.selectOption(s.value ?? '', { timeout });
    } catch (e) {
      if ((e as Error).name === 'TimeoutError') throw new CheckFailed(`could not ${s.action} "${s.selector}" (not found, hidden or disabled)`);
      throw e;
    }
  }
  // Let the page react (state updates, re-render, transitions start).
  await page.evaluate(TWO_FRAMES).catch(() => undefined);
  return assert(page, cdp, spec.then, checkTimeout);
}

async function gradeOne(browser: Browser, html: string, check: WebJob['checks'][number], timeout: number, explainHidden: boolean): Promise<ExecTestResult> {
  const quiet = check.hidden && !explainHidden;
  const t0 = Date.now();
  const ctx = await browser.newContext({ viewport: check.viewport ?? DEFAULT_VIEWPORT, javaScriptEnabled: true, serviceWorkers: 'block', acceptDownloads: false });
  const errors: string[] = [];
  try {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    // The only resource that exists is the student's document; everything else is refused
    // (the jailed browser has no network interfaces anyway).
    await ctx.route('**/*', (r) => (r.request().url() === ORIGIN ? r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }) : r.abort('blockedbyclient')));
    await page.goto(ORIGIN, { waitUntil: 'load', timeout });
    await page.evaluate(TWO_FRAMES).catch(() => undefined);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    let verdict: Verdict = 'AC';
    let detail = '';
    try {
      await Promise.race([
        runCheck(page, cdp, check.spec, timeout),
        new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('check timed out'), { name: 'TimeoutError' })), timeout)),
      ]);
    } catch (e) {
      if (e instanceof CheckFailed) {
        verdict = 'WA';
        detail = e.message;
      } else if ((e as Error).name === 'TimeoutError') {
        verdict = 'TLE';
        detail = 'the page did not respond in time (infinite loop?)';
      } else {
        verdict = 'RE';
        detail = (e as Error).message.split('\n')[0]!.slice(0, 300);
      }
    }
    if (errors.length && verdict !== 'AC') detail += `\nPage error: ${errors[0]!.slice(0, 300)}`;
    return { id: check.id, verdict, cpuMs: 0, wallMs: Date.now() - t0, memKb: 0, stdout: '', stderr: quiet ? '' : errors.slice(0, 3).join('\n'), detail: quiet ? undefined : detail || undefined };
  } catch (e) {
    const timeout = (e as Error).name === 'TimeoutError';
    return { id: check.id, verdict: timeout ? 'TLE' : 'RE', cpuMs: 0, wallMs: Date.now() - t0, memKb: 0, stdout: '', stderr: '', detail: quiet ? undefined : timeout ? 'the page did not load in time' : (e as Error).message.split('\n')[0] };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

export async function runWebJob(cfg: ExecutorConfig, job: WebJob): Promise<ExecResult> {
  const base = { jobId: job.jobId, executorId: cfg.executorId };
  const t0 = Date.now();
  let html: string;
  try {
    vendor ??= job.framework === 'react' ? loadVendor() : null;
    html = buildDocument({ framework: job.framework, files: job.files, vendor: vendor ?? undefined });
  } catch (e) {
    if (e instanceof BuildError) return { ...base, compile: { ok: false, output: e.message, wallMs: Date.now() - t0 }, tests: [] };
    throw e;
  }
  wrapperPath ??= writeChromeWrapper(cfg);
  let browser: Browser | null = null;
  try {
    // A fresh browser per job: nothing (cookies, storage, caches) carries over between students.
    browser = await launchJailedChromium(await wrapperPath);
    const tests: ExecTestResult[] = [];
    for (const c of job.checks) tests.push(await gradeOne(browser, html, c, job.checkTimeoutMs, job.kind === 'validate'));
    return { ...base, compile: { ok: true, output: '', wallMs: Date.now() - t0 }, tests };
  } catch (e) {
    return { ...base, compile: { ok: false, output: '', wallMs: Date.now() - t0 }, tests: [], internalError: `browser: ${(e as Error).message.split('\n')[0]}` };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
