import type { WebQuestionInput } from '@hbe/shared';
import { todoList } from '../../questions/web-questions.js';

type Step = { action: 'click' | 'fill' | 'press' | 'hover' | 'check' | 'uncheck' | 'select'; selector: string; value?: string };
const page = (title: string, body: string, css = true) =>
  `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <title>${title}</title>\n${css ? '  <link rel="stylesheet" href="styles.css">\n' : ''}</head>\n<body>\n${body}\n  <script src="script.js"></script>\n</body>\n</html>\n`;
const click = (selector: string): Step => ({ action: 'click', selector });
const fill = (selector: string, value: string): Step => ({ action: 'fill', selector, value });
const press = (selector: string, value: string): Step => ({ action: 'press', selector, value });
const times = (n: number, s: Step) => Array.from({ length: n }, () => s);

const COUNTER_HTML = page(
  'Counter',
  '  <main>\n    <h1>Counter</h1>\n    <p>Count: <span id="count">0</span></p>\n    <button type="button" id="dec" aria-label="Decrease">−</button>\n    <button type="button" id="inc" aria-label="Increase">+</button>\n    <button type="button" id="reset">Reset</button>\n  </main>',
  false,
);
const counter: WebQuestionInput = {
  type: 'web',
  framework: 'html',
  title: 'Click Counter',
  statement:
    'Make the counter work in `script.js`:\n\n- **+** (`#inc`) adds 1 and **−** (`#dec`) subtracts 1 from the number shown in `#count`.\n- The count never goes below 0.\n- **Reset** (`#reset`) sets it back to 0.',
  difficulty: 'easy',
  tags: ['javascript', 'dom', 'events'],
  isPractice: true,
  starterFiles: [{ path: 'index.html', content: COUNTER_HTML }, { path: 'script.js', content: "const count = document.getElementById('count');\n\n// Your code here\n" }],
  referenceFiles: [
    { path: 'index.html', content: COUNTER_HTML },
    {
      path: 'script.js',
      content:
        "const count = document.getElementById('count');\nlet value = 0;\nconst render = () => { count.textContent = String(value); };\ndocument.getElementById('inc').addEventListener('click', () => { value++; render(); });\ndocument.getElementById('dec').addEventListener('click', () => { value = Math.max(0, value - 1); render(); });\ndocument.getElementById('reset').addEventListener('click', () => { value = 0; render(); });\n",
    },
  ],
  samples: [
    { title: 'Starts at 0', weight: 1, spec: { kind: 'text', selector: '#count', match: { equals: '0' } } },
    { title: 'Plus adds one', weight: 1, spec: { kind: 'interaction', steps: [click('#inc')], then: { kind: 'text', selector: '#count', match: { equals: '1' } } } },
  ],
  hidden: [
    { title: 'Several clicks', weight: 1, spec: { kind: 'interaction', steps: times(5, click('#inc')), then: { kind: 'text', selector: '#count', match: { equals: '5' } } } },
    { title: 'Minus subtracts', weight: 1, spec: { kind: 'interaction', steps: [...times(3, click('#inc')), click('#dec')], then: { kind: 'text', selector: '#count', match: { equals: '2' } } } },
    { title: 'Never below zero', weight: 2, spec: { kind: 'interaction', steps: [click('#dec'), click('#dec')], then: { kind: 'text', selector: '#count', match: { equals: '0' } } } },
    { title: 'Back up after hitting zero', weight: 1, spec: { kind: 'interaction', steps: [click('#dec'), click('#inc')], then: { kind: 'text', selector: '#count', match: { equals: '1' } } } },
    { title: 'Reset', weight: 1, spec: { kind: 'interaction', steps: [...times(4, click('#inc')), click('#reset')], then: { kind: 'text', selector: '#count', match: { equals: '0' } } } },
    { title: 'Counting after reset', weight: 1, spec: { kind: 'interaction', steps: [click('#inc'), click('#reset'), click('#inc'), click('#inc')], then: { kind: 'text', selector: '#count', match: { equals: '2' } } } },
    { title: 'Buttons are named', weight: 1, spec: { kind: 'a11y', rule: 'button-names' } },
    { title: 'Large counts', weight: 1, spec: { kind: 'interaction', steps: times(12, click('#inc')), then: { kind: 'text', selector: '#count', match: { equals: '12' } } } },
  ],
  checkTimeoutMs: 5000,
};

const CHARS_HTML = page(
  'Message',
  '  <main>\n    <h1>Send a message</h1>\n    <label for="message">Message</label>\n    <textarea id="message" maxlength="140" rows="4"></textarea>\n    <p id="remaining">140 characters left</p>\n  </main>',
);
const charCounter: WebQuestionInput = {
  type: 'web',
  framework: 'html',
  title: 'Live Character Counter',
  statement:
    'The textarea `#message` allows at most 140 characters. As the user types, keep `#remaining` up to date in `script.js`:\n\n' +
    '- Show `N characters left`, or `1 character left` when exactly one is left.\n' +
    '- When no characters are left, also add the class `limit` to `#remaining`; remove it again when there is room. In `styles.css`, `.limit` has colour `rgb(220, 38, 38)`.',
  difficulty: 'easy',
  tags: ['javascript', 'dom', 'events'],
  isPractice: true,
  starterFiles: [
    { path: 'index.html', content: CHARS_HTML },
    { path: 'script.js', content: "const message = document.getElementById('message');\nconst remaining = document.getElementById('remaining');\n\n// Your code here\n" },
    { path: 'styles.css', content: '/* add the .limit style */\n' },
  ],
  referenceFiles: [
    { path: 'index.html', content: CHARS_HTML },
    {
      path: 'script.js',
      content:
        "const message = document.getElementById('message');\nconst remaining = document.getElementById('remaining');\nconst MAX = 140;\nmessage.addEventListener('input', () => {\n  const left = MAX - message.value.length;\n  remaining.textContent = left + (left === 1 ? ' character left' : ' characters left');\n  remaining.classList.toggle('limit', left === 0);\n});\n",
    },
    { path: 'styles.css', content: '.limit { color: rgb(220, 38, 38); }\n' },
  ],
  samples: [
    { title: 'Starts at 140', weight: 1, spec: { kind: 'text', selector: '#remaining', match: { equals: '140 characters left' } } },
    { title: 'Typing updates the count', weight: 1, spec: { kind: 'interaction', steps: [fill('#message', 'hello')], then: { kind: 'text', selector: '#remaining', match: { equals: '135 characters left' } } } },
  ],
  hidden: [
    { title: 'Spaces count', weight: 1, spec: { kind: 'interaction', steps: [fill('#message', 'a b c')], then: { kind: 'text', selector: '#remaining', match: { equals: '135 characters left' } } } },
    { title: 'Singular', weight: 2, spec: { kind: 'interaction', steps: [fill('#message', 'x'.repeat(139))], then: { kind: 'text', selector: '#remaining', match: { equals: '1 character left' } } } },
    { title: 'Zero left', weight: 1, spec: { kind: 'interaction', steps: [fill('#message', 'y'.repeat(140))], then: { kind: 'text', selector: '#remaining', match: { equals: '0 characters left' } } } },
    { title: 'Limit class at zero', weight: 1, spec: { kind: 'interaction', steps: [fill('#message', 'y'.repeat(140))], then: { kind: 'exists', selector: '#remaining.limit', count: { eq: 1 } } } },
    { title: 'Limit colour', weight: 1, spec: { kind: 'interaction', steps: [fill('#message', 'z'.repeat(140))], then: { kind: 'style', selector: '#remaining', property: 'color', match: { equals: 'rgb(220, 38, 38)' } } } },
    { title: 'Limit class removed', weight: 2, spec: { kind: 'interaction', steps: [fill('#message', 'y'.repeat(140)), fill('#message', 'short')], then: { kind: 'exists', selector: '#remaining.limit', count: { eq: 0 } } } },
    { title: 'Clearing restores 140', weight: 1, spec: { kind: 'interaction', steps: [fill('#message', 'abc'), fill('#message', '')], then: { kind: 'text', selector: '#remaining', match: { equals: '140 characters left' } } } },
    { title: 'Textarea is labelled', weight: 1, spec: { kind: 'a11y', rule: 'input-labels' } },
  ],
  checkTimeoutMs: 5000,
};

const PW_HTML = page(
  'Login',
  '  <main>\n    <h1>Log in</h1>\n    <label for="password">Password</label>\n    <input id="password" type="password" autocomplete="current-password">\n    <button type="button" id="toggle" aria-pressed="false" aria-controls="password">Show</button>\n  </main>',
  false,
);
const passwordToggle: WebQuestionInput = {
  type: 'web',
  framework: 'html',
  title: 'Show / Hide Password',
  statement:
    'Make `#toggle` reveal and hide the password in `script.js`:\n\n- Clicking it switches `#password` between `type="password"` and `type="text"`.\n- The button text is **Show** while the password is hidden and **Hide** while it is visible.\n- `aria-pressed` on the button is `"true"` while the password is visible and `"false"` otherwise.',
  difficulty: 'easy',
  tags: ['javascript', 'dom', 'accessibility'],
  isPractice: true,
  starterFiles: [{ path: 'index.html', content: PW_HTML }, { path: 'script.js', content: '// Your code here\n' }],
  referenceFiles: [
    { path: 'index.html', content: PW_HTML },
    {
      path: 'script.js',
      content:
        "const input = document.getElementById('password');\nconst toggle = document.getElementById('toggle');\ntoggle.addEventListener('click', () => {\n  const show = input.type === 'password';\n  input.type = show ? 'text' : 'password';\n  toggle.textContent = show ? 'Hide' : 'Show';\n  toggle.setAttribute('aria-pressed', String(show));\n});\n",
    },
  ],
  samples: [
    { title: 'Hidden at first', weight: 1, spec: { kind: 'attribute', selector: '#password', name: 'type', match: { equals: 'password' } } },
    { title: 'Click reveals', weight: 1, spec: { kind: 'interaction', steps: [click('#toggle')], then: { kind: 'attribute', selector: '#password', name: 'type', match: { equals: 'text' } } } },
  ],
  hidden: [
    { title: 'Button says Hide', weight: 1, spec: { kind: 'interaction', steps: [click('#toggle')], then: { kind: 'text', selector: '#toggle', match: { equals: 'Hide' } } } },
    { title: 'aria-pressed true', weight: 1, spec: { kind: 'interaction', steps: [click('#toggle')], then: { kind: 'attribute', selector: '#toggle', name: 'aria-pressed', match: { equals: 'true' } } } },
    { title: 'Second click hides', weight: 1, spec: { kind: 'interaction', steps: [click('#toggle'), click('#toggle')], then: { kind: 'attribute', selector: '#password', name: 'type', match: { equals: 'password' } } } },
    { title: 'Button says Show again', weight: 1, spec: { kind: 'interaction', steps: [click('#toggle'), click('#toggle')], then: { kind: 'text', selector: '#toggle', match: { equals: 'Show' } } } },
    { title: 'aria-pressed false again', weight: 1, spec: { kind: 'interaction', steps: [click('#toggle'), click('#toggle')], then: { kind: 'attribute', selector: '#toggle', name: 'aria-pressed', match: { equals: 'false' } } } },
    { title: 'Typed text is kept', weight: 2, spec: { kind: 'interaction', steps: [fill('#password', 'secret-123'), click('#toggle')], then: { kind: 'attribute', selector: '#password', name: 'type', match: { equals: 'text' } } } },
    { title: 'Three clicks', weight: 1, spec: { kind: 'interaction', steps: times(3, click('#toggle')), then: { kind: 'text', selector: '#toggle', match: { equals: 'Hide' } } } },
    { title: 'Toggle button is named', weight: 1, spec: { kind: 'role', role: 'button', name: 'Show', count: { eq: 1 } } },
  ],
  checkTimeoutMs: 5000,
};

const THEME_HTML = page('Theme', '  <main>\n    <h1>Reading mode</h1>\n    <p>Switch between light and dark themes.</p>\n    <button type="button" id="theme">Dark mode</button>\n  </main>');
const themeToggle: WebQuestionInput = {
  type: 'web',
  framework: 'html',
  title: 'Dark Mode Toggle',
  statement:
    'Add a theme switch:\n\n- In `script.js`, clicking `#theme` toggles the class `dark` on `<body>`. The button text is **Dark mode** in the light theme and **Light mode** in the dark theme.\n' +
    '- In `styles.css`, the light theme has background `rgb(255, 255, 255)` and text `rgb(15, 23, 42)`; `body.dark` has background `rgb(15, 23, 42)` and text `rgb(241, 245, 249)`.',
  difficulty: 'easy',
  tags: ['javascript', 'dom', 'css'],
  isPractice: true,
  starterFiles: [{ path: 'index.html', content: THEME_HTML }, { path: 'script.js', content: '// Your code here\n' }, { path: 'styles.css', content: '/* Light and dark themes */\n' }],
  referenceFiles: [
    { path: 'index.html', content: THEME_HTML },
    { path: 'script.js', content: "const btn = document.getElementById('theme');\nbtn.addEventListener('click', () => {\n  const dark = document.body.classList.toggle('dark');\n  btn.textContent = dark ? 'Light mode' : 'Dark mode';\n});\n" },
    { path: 'styles.css', content: 'body { background-color: rgb(255, 255, 255); color: rgb(15, 23, 42); }\nbody.dark { background-color: rgb(15, 23, 42); color: rgb(241, 245, 249); }\n' },
  ],
  samples: [
    { title: 'Light background', weight: 1, spec: { kind: 'style', selector: 'body', property: 'background-color', match: { equals: 'rgb(255, 255, 255)' } } },
    { title: 'Clicking adds the dark class', weight: 1, spec: { kind: 'interaction', steps: [click('#theme')], then: { kind: 'exists', selector: 'body.dark', count: { eq: 1 } } } },
  ],
  hidden: [
    { title: 'Light text colour', weight: 1, spec: { kind: 'style', selector: 'body', property: 'color', match: { equals: 'rgb(15, 23, 42)' } } },
    { title: 'Dark background', weight: 1, spec: { kind: 'interaction', steps: [click('#theme')], then: { kind: 'style', selector: 'body', property: 'background-color', match: { equals: 'rgb(15, 23, 42)' } } } },
    { title: 'Dark text colour', weight: 1, spec: { kind: 'interaction', steps: [click('#theme')], then: { kind: 'style', selector: 'body', property: 'color', match: { equals: 'rgb(241, 245, 249)' } } } },
    { title: 'Button text in dark mode', weight: 1, spec: { kind: 'interaction', steps: [click('#theme')], then: { kind: 'text', selector: '#theme', match: { equals: 'Light mode' } } } },
    { title: 'Toggles back', weight: 1, spec: { kind: 'interaction', steps: [click('#theme'), click('#theme')], then: { kind: 'exists', selector: 'body.dark', count: { eq: 0 } } } },
    { title: 'Button text back', weight: 1, spec: { kind: 'interaction', steps: [click('#theme'), click('#theme')], then: { kind: 'text', selector: '#theme', match: { equals: 'Dark mode' } } } },
    { title: 'Light colours back', weight: 2, spec: { kind: 'interaction', steps: [click('#theme'), click('#theme')], then: { kind: 'style', selector: 'body', property: 'background-color', match: { equals: 'rgb(255, 255, 255)' } } } },
    { title: 'Not dark at first', weight: 1, spec: { kind: 'exists', selector: 'body.dark', count: { eq: 0 } } },
  ],
  checkTimeoutMs: 5000,
};

const TABS_HTML = page(
  'Tabs',
  '  <main>\n    <h1>Course</h1>\n    <div role="tablist" aria-label="Course sections">\n      <button type="button" role="tab" id="tab-1" aria-controls="panel-1" aria-selected="true">Overview</button>\n      <button type="button" role="tab" id="tab-2" aria-controls="panel-2" aria-selected="false" tabindex="-1">Syllabus</button>\n      <button type="button" role="tab" id="tab-3" aria-controls="panel-3" aria-selected="false" tabindex="-1">Reviews</button>\n    </div>\n    <section role="tabpanel" id="panel-1" aria-labelledby="tab-1"><p>Learn the basics.</p></section>\n    <section role="tabpanel" id="panel-2" aria-labelledby="tab-2" hidden><p>Ten weekly modules.</p></section>\n    <section role="tabpanel" id="panel-3" aria-labelledby="tab-3" hidden><p>4.8 out of 5.</p></section>\n  </main>',
);
const tabs: WebQuestionInput = {
  type: 'web',
  framework: 'html',
  title: 'Accessible Tabs',
  statement:
    'The tab markup is given. Make it work in `script.js`:\n\n' +
    '- Clicking a tab selects it: it gets `aria-selected="true"` and `tabindex="0"`, all other tabs get `aria-selected="false"` and `tabindex="-1"`.\n' +
    '- Only the selected tab\'s panel (its `aria-controls`) is visible; the other panels get the `hidden` attribute.\n' +
    '- With focus on a tab, **ArrowRight** selects the next tab and **ArrowLeft** the previous one, wrapping around at the ends.',
  difficulty: 'moderate',
  tags: ['javascript', 'dom', 'accessibility', 'keyboard'],
  isPractice: true,
  starterFiles: [{ path: 'index.html', content: TABS_HTML }, { path: 'script.js', content: "const tabs = [...document.querySelectorAll('[role=\"tab\"]')];\n\n// Your code here\n" }],
  referenceFiles: [
    { path: 'index.html', content: TABS_HTML },
    {
      path: 'script.js',
      content:
        "const tabs = [...document.querySelectorAll('[role=\"tab\"]')];\nfunction select(tab) {\n  for (const t of tabs) {\n    const on = t === tab;\n    t.setAttribute('aria-selected', String(on));\n    t.tabIndex = on ? 0 : -1;\n    document.getElementById(t.getAttribute('aria-controls')).hidden = !on;\n  }\n  tab.focus();\n}\ntabs.forEach((t, i) => {\n  t.addEventListener('click', () => select(t));\n  t.addEventListener('keydown', (e) => {\n    if (e.key === 'ArrowRight') select(tabs[(i + 1) % tabs.length]);\n    if (e.key === 'ArrowLeft') select(tabs[(i - 1 + tabs.length) % tabs.length]);\n  });\n});\n",
    },
  ],
  samples: [
    { title: 'First tab selected', weight: 1, spec: { kind: 'attribute', selector: '#tab-1', name: 'aria-selected', match: { equals: 'true' } } },
    { title: 'Clicking a tab selects it', weight: 1, spec: { kind: 'interaction', steps: [click('#tab-2')], then: { kind: 'attribute', selector: '#tab-2', name: 'aria-selected', match: { equals: 'true' } } } },
  ],
  hidden: [
    { title: 'Previous tab deselected', weight: 1, spec: { kind: 'interaction', steps: [click('#tab-2')], then: { kind: 'attribute', selector: '#tab-1', name: 'aria-selected', match: { equals: 'false' } } } },
    { title: 'Panel shown', weight: 2, spec: { kind: 'interaction', steps: [click('#tab-3')], then: { kind: 'exists', selector: '#panel-3:not([hidden])', count: { eq: 1 } } } },
    { title: 'Other panels hidden', weight: 2, spec: { kind: 'interaction', steps: [click('#tab-3')], then: { kind: 'exists', selector: '[role="tabpanel"][hidden]', count: { eq: 2 } } } },
    { title: 'Roving tabindex', weight: 1, spec: { kind: 'interaction', steps: [click('#tab-2')], then: { kind: 'attribute', selector: '#tab-2', name: 'tabindex', match: { equals: '0' } } } },
    { title: 'Old tab leaves the tab order', weight: 1, spec: { kind: 'interaction', steps: [click('#tab-2')], then: { kind: 'attribute', selector: '#tab-1', name: 'tabindex', match: { equals: '-1' } } } },
    { title: 'ArrowRight', weight: 1, spec: { kind: 'interaction', steps: [press('#tab-1', 'ArrowRight')], then: { kind: 'attribute', selector: '#tab-2', name: 'aria-selected', match: { equals: 'true' } } } },
    { title: 'ArrowLeft wraps', weight: 2, spec: { kind: 'interaction', steps: [press('#tab-1', 'ArrowLeft')], then: { kind: 'exists', selector: '#panel-3:not([hidden])', count: { eq: 1 } } } },
    { title: 'ArrowRight wraps', weight: 1, spec: { kind: 'interaction', steps: [click('#tab-3'), press('#tab-3', 'ArrowRight')], then: { kind: 'attribute', selector: '#tab-1', name: 'aria-selected', match: { equals: 'true' } } } },
    { title: 'Back to the first tab', weight: 1, spec: { kind: 'interaction', steps: [click('#tab-2'), click('#tab-1')], then: { kind: 'exists', selector: '#panel-1:not([hidden])', count: { eq: 1 } } } },
  ],
  checkTimeoutMs: 5000,
};

const FRUITS = ['Apple', 'Apricot', 'Banana', 'Blueberry', 'Cherry', 'Grape', 'Mango', 'Pineapple'];
const SEARCH_HTML = page(
  'Fruit search',
  `  <main>\n    <h1>Fruits</h1>\n    <label for="search">Search fruits</label>\n    <input id="search" type="search" autocomplete="off">\n    <p id="summary">${FRUITS.length} of ${FRUITS.length} shown</p>\n    <ul id="fruits">\n${FRUITS.map((f) => `      <li>${f}</li>`).join('\n')}\n    </ul>\n    <p id="empty" hidden>No matches</p>\n  </main>`,
);
const liveSearch: WebQuestionInput = {
  type: 'web',
  framework: 'html',
  title: 'Live Search Filter',
  statement:
    'Filter the list as the user types in `#search` (in `script.js`):\n\n' +
    '- An item stays visible if its text contains the query, ignoring case and leading/trailing spaces; other items get the `hidden` attribute. An empty query shows everything.\n' +
    '- `#summary` reads `N of 8 shown`.\n' +
    '- `#empty` is visible (no `hidden` attribute) only when nothing matches.',
  difficulty: 'moderate',
  tags: ['javascript', 'dom', 'events'],
  isPractice: true,
  starterFiles: [{ path: 'index.html', content: SEARCH_HTML }, { path: 'script.js', content: "const search = document.getElementById('search');\nconst items = [...document.querySelectorAll('#fruits li')];\n\n// Your code here\n" }],
  referenceFiles: [
    { path: 'index.html', content: SEARCH_HTML },
    {
      path: 'script.js',
      content:
        "const search = document.getElementById('search');\nconst items = [...document.querySelectorAll('#fruits li')];\nconst summary = document.getElementById('summary');\nconst empty = document.getElementById('empty');\nsearch.addEventListener('input', () => {\n  const q = search.value.trim().toLowerCase();\n  let shown = 0;\n  for (const li of items) {\n    const match = li.textContent.toLowerCase().includes(q);\n    li.hidden = !match;\n    if (match) shown++;\n  }\n  summary.textContent = shown + ' of ' + items.length + ' shown';\n  empty.hidden = shown > 0;\n});\n",
    },
  ],
  samples: [
    { title: 'All shown at first', weight: 1, spec: { kind: 'exists', selector: '#fruits li:not([hidden])', count: { eq: 8 } } },
    { title: 'Typing filters', weight: 1, spec: { kind: 'interaction', steps: [fill('#search', 'berry')], then: { kind: 'exists', selector: '#fruits li:not([hidden])', count: { eq: 1 } } } },
  ],
  hidden: [
    { title: 'Case-insensitive', weight: 1, spec: { kind: 'interaction', steps: [fill('#search', 'AP')], then: { kind: 'exists', selector: '#fruits li:not([hidden])', count: { eq: 4 } } } },
    { title: 'Trimmed query', weight: 1, spec: { kind: 'interaction', steps: [fill('#search', '  mango  ')], then: { kind: 'text', selector: '#fruits li:not([hidden])', match: { equals: 'Mango' } } } },
    { title: 'Summary updates', weight: 1, spec: { kind: 'interaction', steps: [fill('#search', 'an')], then: { kind: 'text', selector: '#summary', match: { equals: '2 of 8 shown' } } } },
    { title: 'Empty message when nothing matches', weight: 2, spec: { kind: 'interaction', steps: [fill('#search', 'kiwi')], then: { kind: 'exists', selector: '#empty:not([hidden])', count: { eq: 1 } } } },
    { title: 'Zero shown', weight: 1, spec: { kind: 'interaction', steps: [fill('#search', 'kiwi')], then: { kind: 'text', selector: '#summary', match: { equals: '0 of 8 shown' } } } },
    { title: 'Empty message hidden again', weight: 1, spec: { kind: 'interaction', steps: [fill('#search', 'kiwi'), fill('#search', 'a')], then: { kind: 'exists', selector: '#empty[hidden]', count: { eq: 1 } } } },
    { title: 'Clearing shows everything', weight: 2, spec: { kind: 'interaction', steps: [fill('#search', 'grape'), fill('#search', '')], then: { kind: 'exists', selector: '#fruits li[hidden]', count: { eq: 0 } } } },
    { title: 'Hidden items use the hidden attribute', weight: 1, spec: { kind: 'interaction', steps: [fill('#search', 'cherry')], then: { kind: 'exists', selector: '#fruits li[hidden]', count: { eq: 7 } } } },
    { title: 'Search box labelled', weight: 1, spec: { kind: 'a11y', rule: 'input-labels' } },
  ],
  checkTimeoutMs: 5000,
};

const FORM_HTML = page(
  'Create account',
  '  <main>\n    <h1>Create account</h1>\n    <form id="signup" novalidate>\n      <label for="email">Email</label>\n      <input id="email" type="email" aria-describedby="email-error">\n      <span id="email-error" class="error"></span>\n      <label for="password">Password</label>\n      <input id="password" type="password" aria-describedby="password-error">\n      <span id="password-error" class="error"></span>\n      <label for="confirm">Confirm password</label>\n      <input id="confirm" type="password" aria-describedby="confirm-error">\n      <span id="confirm-error" class="error"></span>\n      <button type="submit">Sign up</button>\n    </form>\n    <p id="success" hidden>Account created</p>\n  </main>',
);
const formValidation: WebQuestionInput = {
  type: 'web',
  framework: 'html',
  title: 'Client-side Form Validation',
  statement:
    'Validate the sign-up form when it is submitted (in `script.js`; prevent the real submission):\n\n' +
    '- **Email** must look like `name@domain.tld` (no spaces, one `@`, a dot after it). Otherwise `#email-error` says `Enter a valid email`.\n' +
    '- **Password** needs at least 8 characters, else `#password-error` says `At least 8 characters`.\n' +
    '- **Confirm password** must equal the password, else `#confirm-error` says `Passwords do not match`.\n' +
    '- Each invalid field gets `aria-invalid="true"`; valid fields get `aria-invalid="false"` and an empty error.\n' +
    '- If everything is valid, show `#success` (remove its `hidden` attribute); otherwise keep it hidden.',
  difficulty: 'moderate',
  tags: ['javascript', 'dom', 'forms', 'validation'],
  isPractice: true,
  starterFiles: [{ path: 'index.html', content: FORM_HTML }, { path: 'script.js', content: "const form = document.getElementById('signup');\n\n// Your code here\n" }],
  referenceFiles: [
    { path: 'index.html', content: FORM_HTML },
    {
      path: 'script.js',
      content:
        "const form = document.getElementById('signup');\nconst field = (id) => document.getElementById(id);\nfunction check(id, ok, message) {\n  field(id).setAttribute('aria-invalid', String(!ok));\n  field(id + '-error').textContent = ok ? '' : message;\n  return ok;\n}\nform.addEventListener('submit', (e) => {\n  e.preventDefault();\n  const email = field('email').value.trim();\n  const pw = field('password').value;\n  const a = check('email', /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email), 'Enter a valid email');\n  const b = check('password', pw.length >= 8, 'At least 8 characters');\n  const c = check('confirm', field('confirm').value === pw && pw !== '', 'Passwords do not match');\n  field('success').hidden = !(a && b && c);\n});\n",
    },
  ],
  samples: [
    { title: 'Invalid email message', weight: 1, spec: { kind: 'interaction', steps: [fill('#email', 'not-an-email'), click('button[type="submit"]')], then: { kind: 'text', selector: '#email-error', match: { equals: 'Enter a valid email' } } } },
    { title: 'Success when valid', weight: 1, spec: { kind: 'interaction', steps: [fill('#email', 'asha@example.com'), fill('#password', 'longenough'), fill('#confirm', 'longenough'), click('button[type="submit"]')], then: { kind: 'exists', selector: '#success:not([hidden])', count: { eq: 1 } } } },
  ],
  hidden: [
    { title: 'Email marked invalid', weight: 1, spec: { kind: 'interaction', steps: [fill('#email', 'a@b'), click('button[type="submit"]')], then: { kind: 'attribute', selector: '#email', name: 'aria-invalid', match: { equals: 'true' } } } },
    { title: 'Short password', weight: 1, spec: { kind: 'interaction', steps: [fill('#password', 'short'), click('button[type="submit"]')], then: { kind: 'text', selector: '#password-error', match: { equals: 'At least 8 characters' } } } },
    { title: 'Mismatched confirmation', weight: 1, spec: { kind: 'interaction', steps: [fill('#password', 'longenough'), fill('#confirm', 'different1'), click('button[type="submit"]')], then: { kind: 'text', selector: '#confirm-error', match: { equals: 'Passwords do not match' } } } },
    { title: 'Valid field not flagged', weight: 1, spec: { kind: 'interaction', steps: [fill('#email', 'asha@example.com'), click('button[type="submit"]')], then: { kind: 'attribute', selector: '#email', name: 'aria-invalid', match: { equals: 'false' } } } },
    { title: 'No success while invalid', weight: 2, spec: { kind: 'interaction', steps: [fill('#email', 'asha@example.com'), fill('#password', 'longenough'), fill('#confirm', 'longenougH'), click('button[type="submit"]')], then: { kind: 'exists', selector: '#success[hidden]', count: { eq: 1 } } } },
    { title: 'Error cleared after fixing', weight: 2, spec: { kind: 'interaction', steps: [fill('#email', 'bad'), click('button[type="submit"]'), fill('#email', 'good@example.org'), click('button[type="submit"]')], then: { kind: 'text', selector: '#email-error', match: { equals: '' } } } },
    { title: 'Email with spaces rejected', weight: 1, spec: { kind: 'interaction', steps: [fill('#email', 'as ha@example.com'), click('button[type="submit"]')], then: { kind: 'attribute', selector: '#email', name: 'aria-invalid', match: { equals: 'true' } } } },
    { title: 'Page does not navigate', weight: 1, spec: { kind: 'interaction', steps: [fill('#email', 'asha@example.com'), click('button[type="submit"]')], then: { kind: 'exists', selector: '#signup', count: { eq: 1 } } } },
    { title: 'All fields labelled', weight: 1, spec: { kind: 'a11y', rule: 'input-labels' } },
  ],
  checkTimeoutMs: 5000,
};

const PEOPLE = [
  ['Ravi', 34, 'Pune'],
  ['Asha', 28, 'Delhi'],
  ['Meera', 41, 'Chennai'],
  ['Kiran', 9, 'Agra'],
  ['Dev', 28, 'Bengaluru'],
] as const;
const TABLE_HTML = page(
  'People',
  `  <main>\n    <h1>People</h1>\n    <table id="people">\n      <thead>\n        <tr>\n          <th aria-sort="none"><button type="button" data-key="name">Name</button></th>\n          <th aria-sort="none"><button type="button" data-key="age">Age</button></th>\n          <th aria-sort="none"><button type="button" data-key="city">City</button></th>\n        </tr>\n      </thead>\n      <tbody>\n${PEOPLE.map((p) => `        <tr><td>${p[0]}</td><td>${p[1]}</td><td>${p[2]}</td></tr>`).join('\n')}\n      </tbody>\n    </table>\n  </main>`,
);
const sortableTable: WebQuestionInput = {
  type: 'web',
  framework: 'html',
  title: 'Sortable Table',
  statement:
    'Make the column header buttons sort the table (in `script.js`):\n\n' +
    '- Clicking a header sorts the rows by that column in **ascending** order; clicking the same header again toggles to **descending**, and so on. Clicking a different column starts ascending again.\n' +
    '- **Age** sorts numerically (9 before 28); Name and City sort alphabetically. Rows with equal values keep their current relative order (a stable sort).\n' +
    '- The sorted column\'s `<th>` gets `aria-sort="ascending"` or `"descending"`; the other headers get `aria-sort="none"`.',
  difficulty: 'hard',
  tags: ['javascript', 'dom', 'sorting', 'accessibility'],
  isPractice: true,
  starterFiles: [{ path: 'index.html', content: TABLE_HTML }, { path: 'script.js', content: "const table = document.getElementById('people');\n\n// Your code here\n" }],
  referenceFiles: [
    { path: 'index.html', content: TABLE_HTML },
    {
      path: 'script.js',
      content:
        "const table = document.getElementById('people');\nconst tbody = table.tBodies[0];\nconst headers = [...table.querySelectorAll('th')];\nconst KEYS = ['name', 'age', 'city'];\nlet current = null;\nlet dir = 1;\nheaders.forEach((th) => {\n  const btn = th.querySelector('button');\n  btn.addEventListener('click', () => {\n    const key = btn.dataset.key;\n    dir = key === current ? -dir : 1;\n    current = key;\n    const col = KEYS.indexOf(key);\n    const rows = [...tbody.rows];\n    const val = (r) => r.cells[col].textContent.trim();\n    rows.sort((a, b) => {\n      const x = val(a), y = val(b);\n      const c = key === 'age' ? Number(x) - Number(y) : x.localeCompare(y);\n      return c * dir;\n    });\n    tbody.append(...rows);\n    headers.forEach((h) => h.setAttribute('aria-sort', h === th ? (dir === 1 ? 'ascending' : 'descending') : 'none'));\n  });\n});\n",
    },
  ],
  samples: [
    { title: 'Sort by name', weight: 1, spec: { kind: 'interaction', steps: [click('[data-key="name"]')], then: { kind: 'text', selector: '#people tbody tr:first-child td:first-child', match: { equals: 'Asha' } } } },
    { title: 'aria-sort ascending', weight: 1, spec: { kind: 'interaction', steps: [click('[data-key="name"]')], then: { kind: 'attribute', selector: '#people th:nth-child(1)', name: 'aria-sort', match: { equals: 'ascending' } } } },
  ],
  hidden: [
    { title: 'Second click descends', weight: 1, spec: { kind: 'interaction', steps: [click('[data-key="name"]'), click('[data-key="name"]')], then: { kind: 'text', selector: '#people tbody tr:first-child td:first-child', match: { equals: 'Ravi' } } } },
    { title: 'aria-sort descending', weight: 1, spec: { kind: 'interaction', steps: [click('[data-key="name"]'), click('[data-key="name"]')], then: { kind: 'attribute', selector: '#people th:nth-child(1)', name: 'aria-sort', match: { equals: 'descending' } } } },
    { title: 'Numeric age sort', weight: 2, spec: { kind: 'interaction', steps: [click('[data-key="age"]')], then: { kind: 'text', selector: '#people tbody tr:first-child td:first-child', match: { equals: 'Kiran' } } } },
    { title: 'Oldest first on second click', weight: 1, spec: { kind: 'interaction', steps: [click('[data-key="age"]'), click('[data-key="age"]')], then: { kind: 'text', selector: '#people tbody tr:first-child td:nth-child(2)', match: { equals: '41' } } } },
    { title: 'Stable for equal ages', weight: 2, spec: { kind: 'interaction', steps: [click('[data-key="age"]')], then: { kind: 'text', selector: '#people tbody tr:nth-child(2) td:first-child', match: { equals: 'Asha' } } } },
    { title: 'Other headers reset', weight: 1, spec: { kind: 'interaction', steps: [click('[data-key="name"]'), click('[data-key="city"]')], then: { kind: 'attribute', selector: '#people th:nth-child(1)', name: 'aria-sort', match: { equals: 'none' } } } },
    { title: 'New column starts ascending', weight: 1, spec: { kind: 'interaction', steps: [click('[data-key="name"]'), click('[data-key="name"]'), click('[data-key="city"]')], then: { kind: 'text', selector: '#people tbody tr:first-child td:nth-child(3)', match: { equals: 'Agra' } } } },
    { title: 'Last row after city sort', weight: 1, spec: { kind: 'interaction', steps: [click('[data-key="city"]')], then: { kind: 'text', selector: '#people tbody tr:last-child td:nth-child(3)', match: { equals: 'Pune' } } } },
    { title: 'Rows are kept', weight: 1, spec: { kind: 'interaction', steps: [click('[data-key="age"]'), click('[data-key="city"]')], then: { kind: 'exists', selector: '#people tbody tr', count: { eq: 5 } } } },
  ],
  checkTimeoutMs: 5000,
};

const STARS_HTML = page(
  'Rate',
  `  <main>\n    <h1>Rate this course</h1>\n    <div id="rating" role="radiogroup" aria-label="Rating">\n${[1, 2, 3, 4, 5].map((v) => `      <button type="button" class="star" role="radio" aria-checked="false" data-value="${v}" aria-label="${v} star${v > 1 ? 's' : ''}">★</button>`).join('\n')}\n    </div>\n    <p id="label">No rating</p>\n  </main>`,
);
const starRating: WebQuestionInput = {
  type: 'web',
  framework: 'html',
  title: 'Star Rating Widget',
  statement:
    'Make the star rating work (in `script.js`, styles in `styles.css`):\n\n' +
    '- Clicking star *n* sets the rating to *n*: stars 1…n get the class `on`, the rest lose it, and `#label` reads `n of 5`. Clicking the star of the **current** rating clears it (rating 0, label `No rating`).\n' +
    '- Only the selected star has `aria-checked="true"`; all others `"false"` (none when the rating is 0).\n' +
    '- With focus on any star, **ArrowRight** raises and **ArrowLeft** lowers the rating by one, staying between 1 and 5 (ArrowRight from 0 gives 1).\n' +
    '- `.star.on` has colour `rgb(245, 158, 11)`.',
  difficulty: 'hard',
  tags: ['javascript', 'dom', 'accessibility', 'keyboard'],
  isPractice: true,
  starterFiles: [{ path: 'index.html', content: STARS_HTML }, { path: 'script.js', content: "const stars = [...document.querySelectorAll('.star')];\n\n// Your code here\n" }, { path: 'styles.css', content: '.star { font-size: 28px; background: none; border: none; color: rgb(203, 213, 225); }\n' }],
  referenceFiles: [
    { path: 'index.html', content: STARS_HTML },
    {
      path: 'script.js',
      content:
        "const stars = [...document.querySelectorAll('.star')];\nconst label = document.getElementById('label');\nlet rating = 0;\nfunction set(n) {\n  rating = n;\n  stars.forEach((s, i) => {\n    s.classList.toggle('on', i < n);\n    s.setAttribute('aria-checked', String(i + 1 === n));\n  });\n  label.textContent = n ? n + ' of 5' : 'No rating';\n}\nstars.forEach((s, i) => {\n  s.addEventListener('click', () => set(rating === i + 1 ? 0 : i + 1));\n  s.addEventListener('keydown', (e) => {\n    if (e.key === 'ArrowRight') set(Math.min(5, rating + 1));\n    if (e.key === 'ArrowLeft') set(Math.max(1, rating - 1));\n  });\n});\n",
    },
    { path: 'styles.css', content: '.star { font-size: 28px; background: none; border: none; color: rgb(203, 213, 225); }\n.star.on { color: rgb(245, 158, 11); }\n' },
  ],
  samples: [
    { title: 'Clicking sets the rating', weight: 1, spec: { kind: 'interaction', steps: [click('.star[data-value="3"]')], then: { kind: 'text', selector: '#label', match: { equals: '3 of 5' } } } },
    { title: 'Stars light up', weight: 1, spec: { kind: 'interaction', steps: [click('.star[data-value="3"]')], then: { kind: 'exists', selector: '.star.on', count: { eq: 3 } } } },
  ],
  hidden: [
    { title: 'Selected star is checked', weight: 1, spec: { kind: 'interaction', steps: [click('.star[data-value="4"]')], then: { kind: 'exists', selector: '.star[aria-checked="true"]', count: { eq: 1 } } } },
    { title: 'The right star is checked', weight: 1, spec: { kind: 'interaction', steps: [click('.star[data-value="2"]')], then: { kind: 'attribute', selector: '.star[data-value="2"]', name: 'aria-checked', match: { equals: 'true' } } } },
    { title: 'Lowering the rating', weight: 1, spec: { kind: 'interaction', steps: [click('.star[data-value="5"]'), click('.star[data-value="2"]')], then: { kind: 'exists', selector: '.star.on', count: { eq: 2 } } } },
    { title: 'Clicking the current star clears', weight: 2, spec: { kind: 'interaction', steps: [click('.star[data-value="3"]'), click('.star[data-value="3"]')], then: { kind: 'text', selector: '#label', match: { equals: 'No rating' } } } },
    { title: 'Nothing checked after clearing', weight: 1, spec: { kind: 'interaction', steps: [click('.star[data-value="3"]'), click('.star[data-value="3"]')], then: { kind: 'exists', selector: '.star[aria-checked="true"], .star.on', count: { eq: 0 } } } },
    { title: 'ArrowRight from zero', weight: 1, spec: { kind: 'interaction', steps: [press('.star[data-value="1"]', 'ArrowRight')], then: { kind: 'text', selector: '#label', match: { equals: '1 of 5' } } } },
    { title: 'ArrowRight stops at 5', weight: 2, spec: { kind: 'interaction', steps: [click('.star[data-value="5"]'), press('.star[data-value="5"]', 'ArrowRight')], then: { kind: 'text', selector: '#label', match: { equals: '5 of 5' } } } },
    { title: 'ArrowLeft stops at 1', weight: 1, spec: { kind: 'interaction', steps: [click('.star[data-value="2"]'), press('.star[data-value="2"]', 'ArrowLeft'), press('.star[data-value="2"]', 'ArrowLeft')], then: { kind: 'text', selector: '#label', match: { equals: '1 of 5' } } } },
    { title: 'Lit star colour', weight: 1, spec: { kind: 'interaction', steps: [click('.star[data-value="1"]')], then: { kind: 'style', selector: '.star.on', property: 'color', match: { equals: 'rgb(245, 158, 11)' } } } },
  ],
  checkTimeoutMs: 5000,
};

export const DOM: WebQuestionInput[] = [counter, charCounter, passwordToggle, themeToggle, todoList, tabs, liveSearch, formValidation, sortableTable, starRating];
