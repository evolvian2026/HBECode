import { expect, test, type Frame, type Page } from '@playwright/test';

const PW = process.env.E2E_PASSWORD ?? 'demo-password-123';
const shots = process.env.E2E_SCREENSHOTS;
const API = process.env.E2E_API_URL ?? 'http://localhost:4000';

/**
 * Fail on CSP violations or page errors in the app itself. Messages from the preview frame are
 * excluded: student code is expected to trip the preview's (stricter) CSP, and tests below
 * provoke exactly that on purpose.
 */
function guard(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.location().url.includes('/preview/frame.html')) return;
    if (/Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

async function login(page: Page, email: string) {
  await page.goto('/login/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PW);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

/**
 * Replace the content of the visible Monaco editor through its model (as a paste would).
 * Keyboard insertText is not used here: Monaco's auto-closing/auto-indent altered multi-line
 * JSX and Python typed that way, which tested the test rather than the app.
 */
async function setCode(page: Page, code: string) {
  await expect(page.locator('.monaco-editor').first()).toBeVisible();
  await page.evaluate((c) => {
    const m = (window as unknown as { monaco: { editor: { getEditors(): { setValue(v: string): void; getDomNode(): HTMLElement | null }[] } } }).monaco;
    const visible = m.editor.getEditors().filter((e) => (e.getDomNode()?.offsetParent ?? null) !== null);
    visible[0]!.setValue(c);
  }, code);
}

async function previewFrame(page: Page): Promise<Frame> {
  await expect(page.getByTestId('preview')).toBeAttached();
  let f: Frame | undefined;
  await expect.poll(() => (f = page.frames().find((x) => x.url().includes('/preview/frame.html'))) !== undefined).toBe(true);
  return f!;
}

const CART_APP = `import { useState } from 'react';
import ProductList from './ProductList';
import './App.css';

export const PRODUCTS = [
  { id: 'pen', name: 'Gel pen', price: 40 },
  { id: 'book', name: 'Notebook', price: 120 },
  { id: 'bag', name: 'Laptop bag', price: 1500 },
];

export default function App() {
  const [cart, setCart] = useState({});
  const add = (id) => setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const remove = (id) => setCart((c) => { const n = { ...c }; if (n[id] > 1) n[id] -= 1; else delete n[id]; return n; });
  const lines = PRODUCTS.filter((p) => cart[p.id]);
  const count = lines.reduce((s, p) => s + cart[p.id], 0);
  const total = lines.reduce((s, p) => s + cart[p.id] * p.price, 0);
  return (
    <main>
      <h1>Stationery shop</h1>
      <ProductList products={PRODUCTS} onAdd={add} />
      <section aria-label="Cart">
        <h2>Cart (<span className="cart-count">{count}</span>)</h2>
        {lines.length === 0 ? <p className="empty">Your cart is empty</p> : (
          <ul className="cart">
            {lines.map((p) => (
              <li key={p.id} className="cart-line">
                <span className="line-name">{p.name}</span> × <span className="qty">{cart[p.id]}</span>
                <button type="button" aria-label={'Remove one ' + p.name} onClick={() => remove(p.id)}>−</button>
              </li>
            ))}
          </ul>
        )}
        <p className="total">Total: ₹{total}</p>
      </section>
    </main>
  );
}
`;
const CART_LIST = `export default function ProductList({ products, onAdd }) {
  return (
    <ul className="products">
      {products.map((p) => (
        <li key={p.id} className="product">
          <span>{p.name}</span> <span className="price">₹{p.price}</span>
          <button type="button" aria-label={'Add ' + p.name + ' to cart'} onClick={() => onAdd(p.id)}>Add</button>
        </li>
      ))}
    </ul>
  );
}
`;

test('student builds a React app with live preview, then submits it', async ({ page }) => {
  const problems = guard(page);
  await login(page, 'student@demo.edu');
  await expect(page).toHaveURL(/\/practice\/$/);
  await page.getByLabel('Search').fill('React Shopping Cart');
  await page.getByRole('link', { name: /React Shopping Cart/ }).click();
  await expect(page.getByText('What is checked')).toBeVisible();

  // The starter renders in the preview. frameLocator re-resolves to the current iframe, which
  // the preview replaces on every rebuild.
  const preview = page.frameLocator('[data-testid="preview"]');
  await expect(preview.getByRole('heading', { name: 'Stationery shop' })).toBeVisible();

  await page.getByRole('tab', { name: 'ProductList.jsx' }).click();
  await setCode(page, CART_LIST);
  await page.getByRole('tab', { name: 'App.jsx' }).click();
  await setCode(page, CART_APP);

  // The preview rebuilds (350 ms after the last edit, in a new iframe) and is interactive. Wait
  // until it has settled: clicking an intermediate build loses the clicks when it is replaced.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const f = document.querySelector('[data-testid="preview"]') as HTMLElement | null;
        if (!f) return false;
        f.dataset.probe = '1';
        await new Promise((r) => setTimeout(r, 1000));
        return document.querySelector('[data-testid="preview"]')?.getAttribute('data-probe') === '1';
      }),
    )
    .toBe(true);
  await expect(preview.getByRole('button', { name: 'Add Notebook to cart' })).toHaveCount(1, { timeout: 15_000 });
  await preview.getByRole('button', { name: 'Add Notebook to cart' }).click();
  await preview.getByRole('button', { name: 'Add Notebook to cart' }).click();
  await expect(preview.locator('p.total')).toHaveText('Total: ₹240');
  if (shots) await page.screenshot({ path: `${shots}/10-react-preview.png`, fullPage: true });

  await page.getByRole('button', { name: /Run/ }).click();
  await expect(page.getByTestId('verdict')).toHaveText('Accepted');
  await expect(page.getByTestId('check')).toHaveCount(2);
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByTestId('verdict')).toHaveText('Accepted');
  await expect(page.getByText('Score: 100%')).toBeVisible();
  await expect(page.getByTestId('hidden-results').locator('span')).toHaveCount(10);
  if (shots) await page.screenshot({ path: `${shots}/11-react-result.png`, fullPage: true });

  // Drafts survive a reload (server-side).
  await page.waitForTimeout(2000);
  await page.reload();
  await page.getByRole('tab', { name: 'App.jsx' }).click();
  await expect(page.locator('.monaco-editor').first()).toContainText('Stationery shop');
  expect(problems).toEqual([]);
});

test('the preview sandbox isolates student code from the app and the network', async ({ page }) => {
  const problems = guard(page);
  await login(page, 'student@demo.edu');
  await page.getByLabel('Search').fill('To-do List');
  await page.getByRole('link', { name: /To-do List/ }).click();
  const frame = await previewFrame(page);
  await expect(frame.locator('#count')).toHaveText('0 tasks left');

  const probe = await frame.evaluate(async (api) => {
    const r: Record<string, string> = { origin: String(self.origin) };
    try {
      r.parentDocument = String(window.parent.document.title);
    } catch (e) {
      r.parentDocument = `blocked:${(e as Error).name}`;
    }
    try {
      r.cookie = document.cookie;
    } catch (e) {
      r.cookie = `blocked:${(e as Error).name}`;
    }
    try {
      localStorage.setItem('x', '1');
      r.storage = 'open';
    } catch (e) {
      r.storage = `blocked:${(e as Error).name}`;
    }
    r.fetchApi = await fetch(`${api}/health`).then(() => 'open', () => 'blocked');
    r.fetchSelf = await fetch('/practice/').then(() => 'open', () => 'blocked');
    return r;
  }, API);
  expect(probe).toEqual({ origin: 'null', parentDocument: 'blocked:SecurityError', cookie: 'blocked:SecurityError', storage: 'blocked:SecurityError', fetchApi: 'blocked', fetchSelf: 'blocked' });
  // The only CSP reports allowed are the preview's own refusals of exactly these two fetches.
  const probed = [`${API}/health`, new URL('/practice/', page.url()).href];
  const own = (t: string) => probed.some((u) => t.includes(u)) && (t.includes("connect-src 'none'") || t.includes("violates the document's Content Security Policy"));
  expect(problems.filter((t) => !own(t))).toEqual([]);
  problems.length = 0;

  // Top-level navigation from the preview is not allowed either.
  await frame.evaluate(() => {
    try {
      window.top!.location.href = 'https://example.com/';
    } catch {
      /* blocked */
    }
  });
  await page.waitForTimeout(500);
  expect(page.url()).toContain('/solve');
  expect(problems).toEqual([]);
});

test('student solves a SQL question in PostgreSQL and MySQL', async ({ page }) => {
  const problems = guard(page);
  await login(page, 'student@demo.edu');
  await page.getByLabel('Search').fill('Top Earner per Department');
  await page.getByRole('link', { name: /Top Earner per Department/ }).click();
  await page.getByLabel('Database').selectOption('postgres');
  // Sample expected output (computed by the reference during validation) is shown.
  await expect(page.getByRole('table', { name: 'Expected' }).first()).toContainText('Ravi');

  await setCode(page, 'SELECT d.name AS department, e.name AS employee, e.salary FROM departments d JOIN employees e ON e.dept_id = d.id ORDER BY d.name');
  await page.getByRole('button', { name: /Run/ }).click();
  await expect(page.getByTestId('verdict')).toHaveText('Wrong answer');
  await expect(page.getByTestId('detail').first()).toContainText('row');
  await expect(page.getByRole('table', { name: 'Your result' }).first()).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/12-sql-wrong.png`, fullPage: true });

  const query = `SELECT d.name AS department, e.name AS employee, e.salary
FROM departments d JOIN employees e ON e.dept_id = d.id
WHERE NOT EXISTS (SELECT 1 FROM employees x WHERE x.dept_id = e.dept_id AND (x.salary > e.salary OR (x.salary = e.salary AND x.id < e.id)))
ORDER BY d.name`;
  await setCode(page, query);
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByTestId('verdict')).toHaveText('Accepted');
  await expect(page.getByText('Score: 100%')).toBeVisible();

  await page.getByLabel('Database').selectOption('mysql');
  await setCode(page, query);
  await page.getByRole('button', { name: /Run/ }).click();
  await expect(page.getByTestId('verdict')).toHaveText('Accepted');
  // Writes are refused: the run database is read-only for query questions.
  await setCode(page, 'DELETE FROM employees');
  await page.getByRole('button', { name: /Run/ }).click();
  await expect(page.getByTestId('verdict')).not.toHaveText('Accepted');
  if (shots) await page.screenshot({ path: `${shots}/13-sql-mysql.png`, fullPage: true });
  expect(problems).toEqual([]);
});

test('student solves the Pandas and MongoDB questions', async ({ page }) => {
  const problems = guard(page);
  await login(page, 'student@demo.edu');
  await page.getByLabel('Search').fill('Monthly Revenue by Region');
  await page.getByRole('link', { name: /Monthly Revenue by Region/ }).click();
  await setCode(page, "import pandas as pd\n\ndef solve(sales):\n    df = sales.copy()\n    df['month'] = pd.to_datetime(df['date']).dt.strftime('%Y-%m')\n    out = df.groupby(['month', 'region'], as_index=False)['amount'].sum().rename(columns={'amount': 'revenue'})\n    return out.sort_values(['month', 'region'])[['month', 'region', 'revenue']]\n");
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByTestId('verdict')).toHaveText('Accepted', { timeout: 60_000 });

  await page.goto('/practice/');
  await page.getByLabel('Search').fill('Paid Order Totals by Customer');
  await page.getByRole('link', { name: /Paid Order Totals by Customer/ }).click();
  await setCode(page, '{"collection": "orders", "pipeline": [{"$where": "true"}]}');
  await page.getByRole('button', { name: /Run/ }).click();
  await expect(page.getByTestId('result')).toContainText('$where');
  expect(problems).toEqual([]);
});

test('teacher opens the web and database question editors', async ({ page }) => {
  const problems = guard(page);
  await login(page, 'teacher@demo.edu');
  await expect(page).toHaveURL(/\/questions\/$/);
  await expect(page.getByRole('cell', { name: 'Database' }).first()).toBeVisible();

  await page.getByRole('link', { name: 'New web question' }).click();
  await expect(page.getByRole('heading', { name: 'New web question' })).toBeVisible();
  await page.getByRole('tab', { name: 'Files' }).click();
  await expect(page.getByTestId('preview')).toBeAttached();
  await page.getByRole('tab', { name: /Checks/ }).click();
  await page.getByRole('button', { name: 'Add hidden check' }).click();
  await expect(page.getByTestId('check-row')).toHaveCount(1);
  await expect(page.getByText('8–15 hidden checks are required')).toBeVisible();

  await page.goto('/questions/');
  await page.getByRole('link', { name: 'New database question' }).click();
  await expect(page.getByRole('heading', { name: 'New database question' })).toBeVisible();
  await page.getByRole('tab', { name: /Datasets/ }).click();
  await page.getByRole('button', { name: 'Add sample' }).click();
  await expect(page.getByTestId('dataset')).toHaveCount(1);
  if (shots) await page.screenshot({ path: `${shots}/14-db-authoring.png`, fullPage: true });
  expect(problems).toEqual([]);
});
