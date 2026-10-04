import type { WebQuestionInput } from '@hbe/shared';
import { shoppingCart } from '../../questions/web-questions.js';

type Step = { action: 'click' | 'fill' | 'press' | 'hover' | 'check' | 'uncheck' | 'select'; selector: string; value?: string };
const click = (selector: string): Step => ({ action: 'click', selector });
const fill = (selector: string, value: string): Step => ({ action: 'fill', selector, value });
const select = (selector: string, value: string): Step => ({ action: 'select', selector, value });
const check = (selector: string): Step => ({ action: 'check', selector });
const times = (n: number, s: Step) => Array.from({ length: n }, () => s);
const app = (body: string, imports = "import { useState } from 'react';") => `${imports}\n\n${body.trim()}\n`;

const greeting: WebQuestionInput = {
  type: 'web',
  framework: 'react',
  title: 'Greeting With a Controlled Input',
  statement:
    'In `App.jsx`, keep the text of the input `#name` (labelled "Your name") in state and show a greeting in `h2.greeting`:\n\n- `Hello, stranger!` while the trimmed name is empty.\n- `Hello, <name>!` otherwise, using the trimmed name.\n- Below it, `p.length` shows `<n> letters` — the number of characters in the trimmed name (`1 letter` for exactly one).',
  difficulty: 'easy',
  tags: ['react', 'state', 'forms'],
  isPractice: true,
  starterFiles: [{ path: 'App.jsx', content: app("export default function App() {\n  return (\n    <main>\n      <h1>Greeter</h1>\n      {/* input #name and the greeting */}\n    </main>\n  );\n}") }],
  referenceFiles: [
    {
      path: 'App.jsx',
      content: app(
        "export default function App() {\n  const [name, setName] = useState('');\n  const clean = name.trim();\n  return (\n    <main>\n      <h1>Greeter</h1>\n      <label htmlFor=\"name\">Your name</label>\n      <input id=\"name\" value={name} onChange={(e) => setName(e.target.value)} />\n      <h2 className=\"greeting\">{clean ? `Hello, ${clean}!` : 'Hello, stranger!'}</h2>\n      <p className=\"length\">{clean.length} {clean.length === 1 ? 'letter' : 'letters'}</p>\n    </main>\n  );\n}",
      ),
    },
  ],
  samples: [
    { title: 'Default greeting', weight: 1, spec: { kind: 'text', selector: 'h2.greeting', match: { equals: 'Hello, stranger!' } } },
    { title: 'Greets by name', weight: 1, spec: { kind: 'interaction', steps: [fill('#name', 'Asha')], then: { kind: 'text', selector: 'h2.greeting', match: { equals: 'Hello, Asha!' } } } },
  ],
  hidden: [
    { title: 'Name is trimmed', weight: 1, spec: { kind: 'interaction', steps: [fill('#name', '   Ravi  ')], then: { kind: 'text', selector: 'h2.greeting', match: { equals: 'Hello, Ravi!' } } } },
    { title: 'Spaces only means stranger', weight: 2, spec: { kind: 'interaction', steps: [fill('#name', '    ')], then: { kind: 'text', selector: 'h2.greeting', match: { equals: 'Hello, stranger!' } } } },
    { title: 'Clearing restores the default', weight: 1, spec: { kind: 'interaction', steps: [fill('#name', 'Meera'), fill('#name', '')], then: { kind: 'text', selector: 'h2.greeting', match: { equals: 'Hello, stranger!' } } } },
    { title: 'Letter count', weight: 1, spec: { kind: 'interaction', steps: [fill('#name', 'Kiran')], then: { kind: 'text', selector: 'p.length', match: { equals: '5 letters' } } } },
    { title: 'Singular letter', weight: 1, spec: { kind: 'interaction', steps: [fill('#name', ' Q ')], then: { kind: 'text', selector: 'p.length', match: { equals: '1 letter' } } } },
    { title: 'Zero letters', weight: 1, spec: { kind: 'text', selector: 'p.length', match: { equals: '0 letters' } } },
    { title: 'Input is labelled', weight: 1, spec: { kind: 'role', role: 'textbox', name: 'Your name', count: { eq: 1 } } },
    { title: 'Names with spaces inside', weight: 1, spec: { kind: 'interaction', steps: [fill('#name', 'Asha Rao')], then: { kind: 'text', selector: 'h2.greeting', match: { equals: 'Hello, Asha Rao!' } } } },
  ],
  checkTimeoutMs: 5000,
};

const stepCounter: WebQuestionInput = {
  type: 'web',
  framework: 'react',
  title: 'Counter With a Step Size',
  statement:
    'Build a counter in `App.jsx`:\n\n- `span.count` shows the value, starting at 0. Buttons named **Increase** and **Decrease** (`button.inc` and `button.dec`) change it by the current step; it may go negative.\n- A `<select id="step">` labelled "Step" offers 1, 5 and 10 (default 1).\n- A **Reset** button (`button.reset`) sets the value back to 0 but keeps the step.',
  difficulty: 'easy',
  tags: ['react', 'state', 'events'],
  isPractice: true,
  starterFiles: [{ path: 'App.jsx', content: app('export default function App() {\n  return <main><h1>Counter</h1></main>;\n}') }],
  referenceFiles: [
    {
      path: 'App.jsx',
      content: app(
        "export default function App() {\n  const [count, setCount] = useState(0);\n  const [step, setStep] = useState(1);\n  return (\n    <main>\n      <h1>Counter</h1>\n      <p>Value: <span className=\"count\">{count}</span></p>\n      <label htmlFor=\"step\">Step</label>\n      <select id=\"step\" value={step} onChange={(e) => setStep(Number(e.target.value))}>\n        <option value=\"1\">1</option>\n        <option value=\"5\">5</option>\n        <option value=\"10\">10</option>\n      </select>\n      <button type=\"button\" className=\"dec\" onClick={() => setCount((c) => c - step)}>Decrease</button>\n      <button type=\"button\" className=\"inc\" onClick={() => setCount((c) => c + step)}>Increase</button>\n      <button type=\"button\" className=\"reset\" onClick={() => setCount(0)}>Reset</button>\n    </main>\n  );\n}",
      ),
    },
  ],
  samples: [
    { title: 'Starts at 0', weight: 1, spec: { kind: 'text', selector: 'span.count', match: { equals: '0' } } },
    { title: 'Increase adds the step', weight: 1, spec: { kind: 'interaction', steps: [click('button.inc')], then: { kind: 'text', selector: 'span.count', match: { equals: '1' } } } },
  ],
  hidden: [
    { title: 'Decrease can go negative', weight: 1, spec: { kind: 'interaction', steps: [click('button.dec'), click('button.dec')], then: { kind: 'text', selector: 'span.count', match: { equals: '-2' } } } },
    { title: 'Step of 5', weight: 2, spec: { kind: 'interaction', steps: [select('#step', '5'), click('button.inc'), click('button.inc')], then: { kind: 'text', selector: 'span.count', match: { equals: '10' } } } },
    { title: 'Changing step mid-way', weight: 2, spec: { kind: 'interaction', steps: [click('button.inc'), select('#step', '10'), click('button.dec')], then: { kind: 'text', selector: 'span.count', match: { equals: '-9' } } } },
    { title: 'Reset', weight: 1, spec: { kind: 'interaction', steps: [...times(3, click('button.inc')), click('button.reset')], then: { kind: 'text', selector: 'span.count', match: { equals: '0' } } } },
    { title: 'Reset keeps the step', weight: 1, spec: { kind: 'interaction', steps: [select('#step', '5'), click('button.reset'), click('button.inc')], then: { kind: 'text', selector: 'span.count', match: { equals: '5' } } } },
    { title: 'Three step options', weight: 1, spec: { kind: 'exists', selector: '#step option', count: { eq: 3 } } },
    { title: 'Step select is labelled', weight: 1, spec: { kind: 'role', role: 'combobox', name: 'Step', count: { eq: 1 } } },
    { title: 'Buttons are named', weight: 1, spec: { kind: 'role', role: 'button', name: 'Increase', count: { eq: 1 } } },
  ],
  checkTimeoutMs: 5000,
};

const DETAILS = ['Duration: 6 weeks', 'Level: beginner', 'Certificate included'];
const showMore: WebQuestionInput = {
  type: 'web',
  framework: 'react',
  title: 'Show More / Show Less',
  statement:
    'In `App.jsx`, a course card shows its details only on request:\n\n- A button `button.toggle` reads **Show details** and has `aria-expanded="false"` while collapsed.\n- Clicking it renders `ul.details` with these items, changes the text to **Hide details** and sets `aria-expanded="true"`; clicking again removes the list.\n\n' +
    DETAILS.map((d) => `- ${d}`).join('\n'),
  difficulty: 'easy',
  tags: ['react', 'state', 'conditional-rendering'],
  isPractice: true,
  starterFiles: [{ path: 'App.jsx', content: app("export const DETAILS = " + JSON.stringify(DETAILS) + ";\n\nexport default function App() {\n  return (\n    <main>\n      <h1>Intro to Programming</h1>\n    </main>\n  );\n}") }],
  referenceFiles: [
    {
      path: 'App.jsx',
      content: app(
        "export const DETAILS = " + JSON.stringify(DETAILS) + ";\n\nexport default function App() {\n  const [open, setOpen] = useState(false);\n  return (\n    <main>\n      <h1>Intro to Programming</h1>\n      <button type=\"button\" className=\"toggle\" aria-expanded={open} onClick={() => setOpen((o) => !o)}>\n        {open ? 'Hide details' : 'Show details'}\n      </button>\n      {open && (\n        <ul className=\"details\">\n          {DETAILS.map((d) => <li key={d}>{d}</li>)}\n        </ul>\n      )}\n    </main>\n  );\n}",
      ),
    },
  ],
  samples: [
    { title: 'Collapsed at first', weight: 1, spec: { kind: 'exists', selector: 'ul.details', count: { eq: 0 } } },
    { title: 'Click shows the details', weight: 1, spec: { kind: 'interaction', steps: [click('button.toggle')], then: { kind: 'exists', selector: 'ul.details li', count: { eq: 3 } } } },
  ],
  hidden: [
    { title: 'Button text collapsed', weight: 1, spec: { kind: 'text', selector: 'button.toggle', match: { equals: 'Show details' } } },
    { title: 'aria-expanded false', weight: 1, spec: { kind: 'attribute', selector: 'button.toggle', name: 'aria-expanded', match: { equals: 'false' } } },
    { title: 'Button text expanded', weight: 1, spec: { kind: 'interaction', steps: [click('button.toggle')], then: { kind: 'text', selector: 'button.toggle', match: { equals: 'Hide details' } } } },
    { title: 'aria-expanded true', weight: 1, spec: { kind: 'interaction', steps: [click('button.toggle')], then: { kind: 'attribute', selector: 'button.toggle', name: 'aria-expanded', match: { equals: 'true' } } } },
    { title: 'Item text', weight: 1, spec: { kind: 'interaction', steps: [click('button.toggle')], then: { kind: 'text', selector: 'ul.details li:nth-child(2)', match: { equals: DETAILS[1]! } } } },
    { title: 'Second click hides', weight: 2, spec: { kind: 'interaction', steps: [click('button.toggle'), click('button.toggle')], then: { kind: 'exists', selector: 'ul.details', count: { eq: 0 } } } },
    { title: 'Text back after hiding', weight: 1, spec: { kind: 'interaction', steps: [click('button.toggle'), click('button.toggle')], then: { kind: 'text', selector: 'button.toggle', match: { equals: 'Show details' } } } },
    { title: 'Third click shows again', weight: 1, spec: { kind: 'interaction', steps: times(3, click('button.toggle')), then: { kind: 'exists', selector: 'ul.details', count: { eq: 1 } } } },
  ],
  checkTimeoutMs: 5000,
};

const STUDENTS = [
  { name: 'Asha', score: 82 },
  { name: 'Ravi', score: 95 },
  { name: 'Meera', score: 67 },
  { name: 'Kiran', score: 95 },
  { name: 'Dev', score: 74 },
];
const STUDENTS_JS = `export const STUDENTS = ${JSON.stringify(STUDENTS, null, 2)};\n`;
const studentTable: WebQuestionInput = {
  type: 'web',
  framework: 'react',
  title: 'Render a Ranked List',
  statement:
    '`students.js` exports an array of `{ name, score }`. In `App.jsx`, render it as a ranking:\n\n' +
    '- A `<table className="ranking">` with one `<tr>` per student in `<tbody>`, sorted by score (highest first); equal scores are ordered by name A→Z. Each row has three cells: rank (1, 2, 3, …), name, score.\n' +
    '- `p.summary` reads `5 students, average 82.6` (average rounded to one decimal).\n' +
    '- Do not change the imported array (sort a copy).',
  difficulty: 'easy',
  tags: ['react', 'lists', 'keys'],
  isPractice: true,
  starterFiles: [
    { path: 'App.jsx', content: "import { STUDENTS } from './students';\n\nexport default function App() {\n  return (\n    <main>\n      <h1>Ranking</h1>\n    </main>\n  );\n}\n" },
    { path: 'students.js', content: STUDENTS_JS },
  ],
  referenceFiles: [
    {
      path: 'App.jsx',
      content:
        "import { STUDENTS } from './students';\n\nexport default function App() {\n  const ranked = [...STUDENTS].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));\n  const avg = Math.round((STUDENTS.reduce((s, x) => s + x.score, 0) / STUDENTS.length) * 10) / 10;\n  return (\n    <main>\n      <h1>Ranking</h1>\n      <table className=\"ranking\">\n        <thead>\n          <tr><th>Rank</th><th>Name</th><th>Score</th></tr>\n        </thead>\n        <tbody>\n          {ranked.map((s, i) => (\n            <tr key={s.name}><td>{i + 1}</td><td>{s.name}</td><td>{s.score}</td></tr>\n          ))}\n        </tbody>\n      </table>\n      <p className=\"summary\">{STUDENTS.length} students, average {avg}</p>\n    </main>\n  );\n}\n",
    },
    { path: 'students.js', content: STUDENTS_JS },
  ],
  samples: [
    { title: 'One row per student', weight: 1, spec: { kind: 'exists', selector: 'table.ranking tbody tr', count: { eq: 5 } } },
    { title: 'Top student first', weight: 1, spec: { kind: 'text', selector: 'table.ranking tbody tr:first-child td:nth-child(2)', match: { equals: 'Kiran' } } },
  ],
  hidden: [
    { title: 'Ties by name', weight: 2, spec: { kind: 'text', selector: 'table.ranking tbody tr:nth-child(2) td:nth-child(2)', match: { equals: 'Ravi' } } },
    { title: 'Rank numbers', weight: 1, spec: { kind: 'text', selector: 'table.ranking tbody tr:nth-child(3) td:first-child', match: { equals: '3' } } },
    { title: 'Third place', weight: 1, spec: { kind: 'text', selector: 'table.ranking tbody tr:nth-child(3) td:nth-child(2)', match: { equals: 'Asha' } } },
    { title: 'Scores shown', weight: 1, spec: { kind: 'text', selector: 'table.ranking tbody tr:nth-child(4) td:nth-child(3)', match: { equals: '74' } } },
    { title: 'Last place', weight: 1, spec: { kind: 'text', selector: 'table.ranking tbody tr:last-child td:nth-child(2)', match: { equals: 'Meera' } } },
    { title: 'Three cells per row', weight: 1, spec: { kind: 'exists', selector: 'table.ranking tbody tr:first-child td', count: { eq: 3 } } },
    { title: 'Summary', weight: 2, spec: { kind: 'text', selector: 'p.summary', match: { equals: '5 students, average 82.6' } } },
    { title: 'Header row', weight: 1, spec: { kind: 'exists', selector: 'table.ranking thead th', count: { eq: 3 } } },
  ],
  checkTimeoutMs: 5000,
};

const todoFilters: WebQuestionInput = {
  type: 'web',
  framework: 'react',
  title: 'React To-dos With Filters',
  statement:
    'Build a to-do list in `App.jsx`:\n\n' +
    '- A form with an input `#new` (labelled "New to-do") and an **Add** button adds the trimmed text as an `li.todo` in `ul.todos` (ignore empty text) and clears the input.\n' +
    '- Each to-do has a checkbox (`input[type=checkbox]`, labelled with the to-do text) that marks it done; a done item has the class `done`.\n' +
    '- Three filter buttons — **All**, **Active**, **Done** — show all items, only unfinished ones, or only finished ones. The active filter button has `aria-pressed="true"`, the others `"false"`.\n' +
    '- `p.left` shows `N items left` (unfinished items, whatever the filter; `1 item left` for one).',
  difficulty: 'moderate',
  tags: ['react', 'state', 'lists', 'forms'],
  isPractice: true,
  starterFiles: [{ path: 'App.jsx', content: app('export default function App() {\n  return <main><h1>To-dos</h1></main>;\n}') }],
  referenceFiles: [
    {
      path: 'App.jsx',
      content: app(
        "const FILTERS = ['All', 'Active', 'Done'];\n\nexport default function App() {\n  const [todos, setTodos] = useState([]);\n  const [text, setText] = useState('');\n  const [filter, setFilter] = useState('All');\n  const add = (e) => {\n    e.preventDefault();\n    const t = text.trim();\n    if (!t) return;\n    setTodos((xs) => [...xs, { id: xs.length + 1, text: t, done: false }]);\n    setText('');\n  };\n  const toggle = (id) => setTodos((xs) => xs.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));\n  const shown = todos.filter((x) => filter === 'All' || (filter === 'Done') === x.done);\n  const left = todos.filter((x) => !x.done).length;\n  return (\n    <main>\n      <h1>To-dos</h1>\n      <form onSubmit={add}>\n        <label htmlFor=\"new\">New to-do</label>\n        <input id=\"new\" value={text} onChange={(e) => setText(e.target.value)} />\n        <button type=\"submit\">Add</button>\n      </form>\n      <div className=\"filters\">\n        {FILTERS.map((f) => (\n          <button key={f} type=\"button\" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>\n        ))}\n      </div>\n      <ul className=\"todos\">\n        {shown.map((x) => (\n          <li key={x.id} className={x.done ? 'todo done' : 'todo'}>\n            <label><input type=\"checkbox\" checked={x.done} onChange={() => toggle(x.id)} /> {x.text}</label>\n          </li>\n        ))}\n      </ul>\n      <p className=\"left\">{left} {left === 1 ? 'item' : 'items'} left</p>\n    </main>\n  );\n}",
      ),
    },
  ],
  samples: [
    { title: 'Adding shows the item', weight: 1, spec: { kind: 'interaction', steps: [fill('#new', 'Read'), click('button[type="submit"]')], then: { kind: 'text', selector: 'li.todo', match: { equals: 'Read' } } } },
    { title: 'Counter starts at 0', weight: 1, spec: { kind: 'text', selector: 'p.left', match: { equals: '0 items left' } } },
  ],
  hidden: [
    { title: 'Input cleared and text trimmed', weight: 1, spec: { kind: 'interaction', steps: [fill('#new', '  Walk  '), click('button[type="submit"]'), click('button[type="submit"]')], then: { kind: 'exists', selector: 'li.todo', count: { eq: 1 } } } },
    { title: 'Empty text ignored', weight: 1, spec: { kind: 'interaction', steps: [fill('#new', '   '), click('button[type="submit"]')], then: { kind: 'exists', selector: 'li.todo', count: { eq: 0 } } } },
    { title: 'Checking marks done', weight: 1, spec: { kind: 'interaction', steps: [fill('#new', 'A'), click('button[type="submit"]'), check('li.todo input[type="checkbox"]')], then: { kind: 'exists', selector: 'li.todo.done', count: { eq: 1 } } } },
    { title: 'Items left', weight: 1, spec: { kind: 'interaction', steps: [fill('#new', 'A'), click('button[type="submit"]'), fill('#new', 'B'), click('button[type="submit"]'), check('li.todo input[type="checkbox"]')], then: { kind: 'text', selector: 'p.left', match: { equals: '1 item left' } } } },
    { title: 'Active filter', weight: 2, spec: { kind: 'interaction', steps: [fill('#new', 'A'), click('button[type="submit"]'), fill('#new', 'B'), click('button[type="submit"]'), check('li.todo input[type="checkbox"]'), click('.filters button:nth-child(2)')], then: { kind: 'text', selector: 'li.todo', match: { equals: 'B' } } } },
    { title: 'Done filter', weight: 2, spec: { kind: 'interaction', steps: [fill('#new', 'A'), click('button[type="submit"]'), fill('#new', 'B'), click('button[type="submit"]'), check('li.todo input[type="checkbox"]'), click('.filters button:nth-child(3)')], then: { kind: 'exists', selector: 'li.todo', count: { eq: 1 } } } },
    { title: 'Pressed filter button', weight: 1, spec: { kind: 'interaction', steps: [click('.filters button:nth-child(2)')], then: { kind: 'attribute', selector: '.filters button:nth-child(2)', name: 'aria-pressed', match: { equals: 'true' } } } },
    { title: 'All filter pressed by default', weight: 1, spec: { kind: 'attribute', selector: '.filters button:nth-child(1)', name: 'aria-pressed', match: { equals: 'true' } } },
    { title: 'Checkbox labelled by text', weight: 1, spec: { kind: 'interaction', steps: [fill('#new', 'Buy milk'), click('button[type="submit"]')], then: { kind: 'role', role: 'checkbox', name: 'Buy milk', count: { eq: 1 } } } },
    { title: 'Counter ignores the filter', weight: 1, spec: { kind: 'interaction', steps: [fill('#new', 'A'), click('button[type="submit"]'), click('.filters button:nth-child(3)')], then: { kind: 'text', selector: 'p.left', match: { equals: '1 item left' } } } },
  ],
  checkTimeoutMs: 6000,
};

const tempConverter: WebQuestionInput = {
  type: 'web',
  framework: 'react',
  title: 'Temperature Converter',
  statement:
    'In `App.jsx`, convert the Celsius value typed in `#celsius` (labelled "Celsius"):\n\n' +
    '- `p.fahrenheit` shows `<F> °F` with F = C × 9/5 + 32, rounded to **one** decimal place; `p.kelvin` shows `<K> K` with K = C + 273.15, rounded to **two** decimal places. Drop trailing zeros (100 °C gives `212 °F` and `373.15 K`; 37 °C gives `98.6 °F`).\n' +
    '- While the input is empty or not a number, both outputs read `—` and `p.error` says `Enter a number` (no `p.error` otherwise).\n' +
    '- Below absolute zero (−273.15 °C), show `p.error` with `Below absolute zero` and `—` for both outputs.',
  difficulty: 'moderate',
  tags: ['react', 'state', 'derived-state'],
  isPractice: true,
  starterFiles: [{ path: 'App.jsx', content: app('export default function App() {\n  return <main><h1>Temperature</h1></main>;\n}') }],
  referenceFiles: [
    {
      path: 'App.jsx',
      content: app(
        "const fmt = (x, digits) => String(Math.round(x * 10 ** digits) / 10 ** digits);\n\nexport default function App() {\n  const [text, setText] = useState('');\n  const c = text.trim() === '' ? NaN : Number(text);\n  const error = Number.isNaN(c) ? 'Enter a number' : c < -273.15 ? 'Below absolute zero' : '';\n  return (\n    <main>\n      <h1>Temperature</h1>\n      <label htmlFor=\"celsius\">Celsius</label>\n      <input id=\"celsius\" value={text} onChange={(e) => setText(e.target.value)} />\n      <p className=\"fahrenheit\">{error ? '—' : `${fmt((c * 9) / 5 + 32, 1)} °F`}</p>\n      <p className=\"kelvin\">{error ? '—' : `${fmt(c + 273.15, 2)} K`}</p>\n      {error && <p className=\"error\">{error}</p>}\n    </main>\n  );\n}",
      ),
    },
  ],
  samples: [
    { title: 'Boiling point', weight: 1, spec: { kind: 'interaction', steps: [fill('#celsius', '100')], then: { kind: 'text', selector: 'p.fahrenheit', match: { equals: '212 °F' } } } },
    { title: 'Empty input', weight: 1, spec: { kind: 'text', selector: 'p.error', match: { equals: 'Enter a number' } } },
  ],
  hidden: [
    { title: 'Kelvin', weight: 1, spec: { kind: 'interaction', steps: [fill('#celsius', '100')], then: { kind: 'text', selector: 'p.kelvin', match: { equals: '373.15 K' } } } },
    { title: 'Body temperature', weight: 1, spec: { kind: 'interaction', steps: [fill('#celsius', '37')], then: { kind: 'text', selector: 'p.fahrenheit', match: { equals: '98.6 °F' } } } },
    { title: 'Minus forty', weight: 1, spec: { kind: 'interaction', steps: [fill('#celsius', '-40')], then: { kind: 'text', selector: 'p.fahrenheit', match: { equals: '-40 °F' } } } },
    { title: 'Decimals', weight: 1, spec: { kind: 'interaction', steps: [fill('#celsius', '21.5')], then: { kind: 'text', selector: 'p.fahrenheit', match: { equals: '70.7 °F' } } } },
    { title: 'Not a number', weight: 2, spec: { kind: 'interaction', steps: [fill('#celsius', 'abc')], then: { kind: 'text', selector: 'p.kelvin', match: { equals: '—' } } } },
    { title: 'Error message for text', weight: 1, spec: { kind: 'interaction', steps: [fill('#celsius', '12x')], then: { kind: 'text', selector: 'p.error', match: { equals: 'Enter a number' } } } },
    { title: 'No error for a valid number', weight: 1, spec: { kind: 'interaction', steps: [fill('#celsius', '0')], then: { kind: 'exists', selector: 'p.error', count: { eq: 0 } } } },
    { title: 'Absolute zero in kelvin', weight: 1, spec: { kind: 'interaction', steps: [fill('#celsius', '-273.15')], then: { kind: 'text', selector: 'p.kelvin', match: { equals: '0 K' } } } },
    { title: 'Below absolute zero', weight: 2, spec: { kind: 'interaction', steps: [fill('#celsius', '-300')], then: { kind: 'text', selector: 'p.error', match: { equals: 'Below absolute zero' } } } },
    { title: 'Input is labelled', weight: 1, spec: { kind: 'role', role: 'textbox', name: 'Celsius', count: { eq: 1 } } },
  ],
  checkTimeoutMs: 5000,
};

const SECTIONS = [
  ['Shipping', 'Orders ship within 2 working days.'],
  ['Returns', 'Return any item within 30 days.'],
  ['Warranty', 'All products have a 1-year warranty.'],
];
const accordion: WebQuestionInput = {
  type: 'web',
  framework: 'react',
  title: 'Accordion With One Open Panel',
  statement:
    'Build an accordion in `App.jsx` from the `SECTIONS` array:\n\n' +
    '- Each section has a heading `<h2>` containing a `button.header` with the title; the button has `aria-expanded` and `aria-controls` pointing to its panel `div.panel` (`id` like `panel-0`).\n' +
    '- At most **one** panel is open: clicking a closed header opens it and closes any other; clicking the open header closes it. Closed panels are not rendered.\n' +
    '- All panels start closed.',
  difficulty: 'moderate',
  tags: ['react', 'state', 'accessibility'],
  isPractice: true,
  starterFiles: [{ path: 'App.jsx', content: app("export const SECTIONS = " + JSON.stringify(SECTIONS) + ";\n\nexport default function App() {\n  return <main><h1>Help</h1></main>;\n}") }],
  referenceFiles: [
    {
      path: 'App.jsx',
      content: app(
        "export const SECTIONS = " + JSON.stringify(SECTIONS) + ";\n\nexport default function App() {\n  const [open, setOpen] = useState(-1);\n  return (\n    <main>\n      <h1>Help</h1>\n      {SECTIONS.map(([title, body], i) => (\n        <section key={title}>\n          <h2>\n            <button type=\"button\" className=\"header\" aria-expanded={open === i} aria-controls={`panel-${i}`} onClick={() => setOpen(open === i ? -1 : i)}>{title}</button>\n          </h2>\n          {open === i && <div className=\"panel\" id={`panel-${i}`}>{body}</div>}\n        </section>\n      ))}\n    </main>\n  );\n}",
      ),
    },
  ],
  samples: [
    { title: 'Three headers', weight: 1, spec: { kind: 'exists', selector: 'h2 button.header', count: { eq: 3 } } },
    { title: 'Click opens a panel', weight: 1, spec: { kind: 'interaction', steps: [click('section:nth-of-type(2) button.header')], then: { kind: 'text', selector: 'div.panel', match: { equals: SECTIONS[1]![1]! } } } },
  ],
  hidden: [
    { title: 'All closed at first', weight: 1, spec: { kind: 'exists', selector: 'div.panel', count: { eq: 0 } } },
    { title: 'aria-expanded', weight: 1, spec: { kind: 'interaction', steps: [click('section:nth-of-type(1) button.header')], then: { kind: 'attribute', selector: 'section:nth-of-type(1) button.header', name: 'aria-expanded', match: { equals: 'true' } } } },
    { title: 'aria-controls', weight: 1, spec: { kind: 'attribute', selector: 'section:nth-of-type(3) button.header', name: 'aria-controls', match: { equals: 'panel-2' } } },
    { title: 'Panel id', weight: 1, spec: { kind: 'interaction', steps: [click('section:nth-of-type(3) button.header')], then: { kind: 'exists', selector: '#panel-2.panel', count: { eq: 1 } } } },
    { title: 'Only one open', weight: 2, spec: { kind: 'interaction', steps: [click('section:nth-of-type(1) button.header'), click('section:nth-of-type(3) button.header')], then: { kind: 'exists', selector: 'div.panel', count: { eq: 1 } } } },
    { title: 'Previous header collapsed', weight: 1, spec: { kind: 'interaction', steps: [click('section:nth-of-type(1) button.header'), click('section:nth-of-type(3) button.header')], then: { kind: 'attribute', selector: 'section:nth-of-type(1) button.header', name: 'aria-expanded', match: { equals: 'false' } } } },
    { title: 'Clicking the open header closes it', weight: 2, spec: { kind: 'interaction', steps: [click('section:nth-of-type(2) button.header'), click('section:nth-of-type(2) button.header')], then: { kind: 'exists', selector: 'div.panel', count: { eq: 0 } } } },
    { title: 'Correct panel after switching', weight: 1, spec: { kind: 'interaction', steps: [click('section:nth-of-type(1) button.header'), click('section:nth-of-type(3) button.header')], then: { kind: 'text', selector: 'div.panel', match: { equals: SECTIONS[2]![1]! } } } },
  ],
  checkTimeoutMs: 5000,
};

const PRODUCTS = Array.from({ length: 23 }, (_, i) => ({ id: i + 1, name: `Item ${String(i + 1).padStart(2, '0')}`, price: ((i * 37) % 23) * 10 + 50 }));
const PRODUCTS_JS = `export const PRODUCTS = ${JSON.stringify(PRODUCTS)};\n`;
const dataTable: WebQuestionInput = {
  type: 'web',
  framework: 'react',
  title: 'Data Table With Search, Sorting and Pages',
  statement:
    '`products.js` exports 23 products `{ id, name, price }`. Build a table in `App.jsx`:\n\n' +
    '- Show **5 rows per page** in `table.products tbody` (cells: name, price). `p.page` reads `Page X of Y`. **Previous** and **Next** buttons (`button.prev`, `button.next`) change the page and are `disabled` at the first/last page.\n' +
    '- An input `#search` (labelled "Search") keeps rows whose name contains the text (case-insensitive) and jumps back to page 1. With no matches, the table body is empty and `p.page` reads `Page 1 of 1`.\n' +
    '- A `button.sort` (labelled **Sort by price**) sorts by price ascending; pressing it again sorts descending, then ascending, and so on. Equal prices keep id order. Sorting also returns to page 1.\n' +
    '- Without sorting, rows are in id order.',
  difficulty: 'hard',
  tags: ['react', 'state', 'derived-state', 'pagination'],
  isPractice: true,
  starterFiles: [
    { path: 'App.jsx', content: "import { useState } from 'react';\nimport { PRODUCTS } from './products';\n\nexport default function App() {\n  return <main><h1>Products</h1></main>;\n}\n" },
    { path: 'products.js', content: PRODUCTS_JS },
  ],
  referenceFiles: [
    {
      path: 'App.jsx',
      content:
        "import { useState } from 'react';\nimport { PRODUCTS } from './products';\n\nconst SIZE = 5;\n\nexport default function App() {\n  const [query, setQuery] = useState('');\n  const [dir, setDir] = useState(0);\n  const [page, setPage] = useState(1);\n  const q = query.trim().toLowerCase();\n  let rows = PRODUCTS.filter((p) => p.name.toLowerCase().includes(q));\n  if (dir) rows = [...rows].sort((a, b) => (a.price - b.price) * dir || a.id - b.id);\n  const pages = Math.max(1, Math.ceil(rows.length / SIZE));\n  const shown = rows.slice((page - 1) * SIZE, page * SIZE);\n  return (\n    <main>\n      <h1>Products</h1>\n      <label htmlFor=\"search\">Search</label>\n      <input id=\"search\" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />\n      <button type=\"button\" className=\"sort\" onClick={() => { setDir(dir === 1 ? -1 : 1); setPage(1); }}>Sort by price</button>\n      <table className=\"products\">\n        <thead><tr><th>Name</th><th>Price</th></tr></thead>\n        <tbody>\n          {shown.map((p) => <tr key={p.id}><td>{p.name}</td><td>{p.price}</td></tr>)}\n        </tbody>\n      </table>\n      <p className=\"page\">Page {page} of {pages}</p>\n      <button type=\"button\" className=\"prev\" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>\n      <button type=\"button\" className=\"next\" disabled={page === pages} onClick={() => setPage(page + 1)}>Next</button>\n    </main>\n  );\n}\n",
    },
    { path: 'products.js', content: PRODUCTS_JS },
  ],
  samples: [
    { title: 'Five rows on the first page', weight: 1, spec: { kind: 'exists', selector: 'table.products tbody tr', count: { eq: 5 } } },
    { title: 'Page indicator', weight: 1, spec: { kind: 'text', selector: 'p.page', match: { equals: 'Page 1 of 5' } } },
  ],
  hidden: [
    { title: 'Previous disabled on page 1', weight: 1, spec: { kind: 'attribute', selector: 'button.prev', name: 'disabled' } },
    { title: 'Next page', weight: 1, spec: { kind: 'interaction', steps: [click('button.next')], then: { kind: 'text', selector: 'table.products tbody tr:first-child td:first-child', match: { equals: 'Item 06' } } } },
    { title: 'Last page has three rows', weight: 2, spec: { kind: 'interaction', steps: times(4, click('button.next')), then: { kind: 'exists', selector: 'table.products tbody tr', count: { eq: 3 } } } },
    { title: 'Next disabled on the last page', weight: 1, spec: { kind: 'interaction', steps: times(4, click('button.next')), then: { kind: 'attribute', selector: 'button.next', name: 'disabled' } } },
    { title: 'Search filters', weight: 1, spec: { kind: 'interaction', steps: [fill('#search', 'item 1')], then: { kind: 'text', selector: 'p.page', match: { equals: 'Page 1 of 2' } } } },
    { title: 'Search returns to page 1', weight: 2, spec: { kind: 'interaction', steps: [click('button.next'), click('button.next'), fill('#search', '2')], then: { kind: 'text', selector: 'table.products tbody tr:first-child td:first-child', match: { equals: 'Item 02' } } } },
    { title: 'No matches', weight: 1, spec: { kind: 'interaction', steps: [fill('#search', 'zzz')], then: { kind: 'exists', selector: 'table.products tbody tr', count: { eq: 0 } } } },
    { title: 'Sort ascending', weight: 2, spec: { kind: 'interaction', steps: [click('button.sort')], then: { kind: 'text', selector: 'table.products tbody tr:first-child td:nth-child(2)', match: { equals: String(Math.min(...PRODUCTS.map((p) => p.price))) } } } },
    { title: 'Sort descending', weight: 2, spec: { kind: 'interaction', steps: [click('button.sort'), click('button.sort')], then: { kind: 'text', selector: 'table.products tbody tr:first-child td:nth-child(2)', match: { equals: String(Math.max(...PRODUCTS.map((p) => p.price))) } } } },
    { title: 'Sorting returns to page 1', weight: 1, spec: { kind: 'interaction', steps: [click('button.next'), click('button.sort')], then: { kind: 'text', selector: 'p.page', match: { equals: 'Page 1 of 5' } } } },
    { title: 'Ties keep id order', weight: 1, spec: { kind: 'interaction', steps: [click('button.sort')], then: { kind: 'text', selector: 'table.products tbody tr:first-child td:first-child', match: { equals: [...PRODUCTS].sort((a, b) => a.price - b.price || a.id - b.id)[0]!.name } } } },
  ],
  checkTimeoutMs: 6000,
};

const wizard: WebQuestionInput = {
  type: 'web',
  framework: 'react',
  title: 'Multi-step Form Wizard',
  statement:
    'Build a three-step sign-up wizard in `App.jsx`. `p.step` always reads `Step N of 3`.\n\n' +
    '1. **Account** — input `#email` (labelled "Email"). **Next** (`button.next`) only advances if the trimmed email contains `@`; otherwise `p.error` shows `Enter your email`.\n' +
    '2. **Profile** — input `#name` (labelled "Name"). **Next** requires a non-empty trimmed name, otherwise `p.error` shows `Enter your name`. **Back** (`button.back`) returns to step 1 with the email still filled in.\n' +
    '3. **Review** — shows `p.summary` with `<name> <email>` (trimmed values, separated by one space) and a **Finish** button (`button.finish`) that replaces the wizard with `p.done` reading `Welcome, <name>!`.\n\n' +
    'There is no Back button on step 1, and the error disappears once a step is valid.',
  difficulty: 'hard',
  tags: ['react', 'state', 'forms', 'validation'],
  isPractice: true,
  starterFiles: [{ path: 'App.jsx', content: app('export default function App() {\n  return <main><h1>Sign up</h1></main>;\n}') }],
  referenceFiles: [
    {
      path: 'App.jsx',
      content: app(
        "export default function App() {\n  const [step, setStep] = useState(1);\n  const [email, setEmail] = useState('');\n  const [name, setName] = useState('');\n  const [error, setError] = useState('');\n  const [done, setDone] = useState(false);\n  const next = () => {\n    if (step === 1 && !email.trim().includes('@')) return setError('Enter your email');\n    if (step === 2 && !name.trim()) return setError('Enter your name');\n    setError('');\n    setStep(step + 1);\n  };\n  if (done) return <main><h1>Sign up</h1><p className=\"done\">Welcome, {name.trim()}!</p></main>;\n  return (\n    <main>\n      <h1>Sign up</h1>\n      <p className=\"step\">Step {step} of 3</p>\n      {step === 1 && (\n        <div>\n          <label htmlFor=\"email\">Email</label>\n          <input id=\"email\" value={email} onChange={(e) => setEmail(e.target.value)} />\n        </div>\n      )}\n      {step === 2 && (\n        <div>\n          <label htmlFor=\"name\">Name</label>\n          <input id=\"name\" value={name} onChange={(e) => setName(e.target.value)} />\n        </div>\n      )}\n      {step === 3 && <p className=\"summary\">{name.trim()} {email.trim()}</p>}\n      {error && <p className=\"error\">{error}</p>}\n      {step > 1 && <button type=\"button\" className=\"back\" onClick={() => { setError(''); setStep(step - 1); }}>Back</button>}\n      {step < 3 && <button type=\"button\" className=\"next\" onClick={next}>Next</button>}\n      {step === 3 && <button type=\"button\" className=\"finish\" onClick={() => setDone(true)}>Finish</button>}\n    </main>\n  );\n}",
      ),
    },
  ],
  samples: [
    { title: 'Starts on step 1', weight: 1, spec: { kind: 'text', selector: 'p.step', match: { equals: 'Step 1 of 3' } } },
    { title: 'Valid email advances', weight: 1, spec: { kind: 'interaction', steps: [fill('#email', 'asha@example.com'), click('button.next')], then: { kind: 'text', selector: 'p.step', match: { equals: 'Step 2 of 3' } } } },
  ],
  hidden: [
    { title: 'Invalid email blocked', weight: 1, spec: { kind: 'interaction', steps: [fill('#email', 'asha'), click('button.next')], then: { kind: 'text', selector: 'p.step', match: { equals: 'Step 1 of 3' } } } },
    { title: 'Email error message', weight: 1, spec: { kind: 'interaction', steps: [click('button.next')], then: { kind: 'text', selector: 'p.error', match: { equals: 'Enter your email' } } } },
    { title: 'No back button on step 1', weight: 1, spec: { kind: 'exists', selector: 'button.back', count: { eq: 0 } } },
    { title: 'Name required', weight: 1, spec: { kind: 'interaction', steps: [fill('#email', 'a@b.c'), click('button.next'), fill('#name', '   '), click('button.next')], then: { kind: 'text', selector: 'p.error', match: { equals: 'Enter your name' } } } },
    { title: 'Back keeps the email', weight: 2, spec: { kind: 'interaction', steps: [fill('#email', 'kept@example.com'), click('button.next'), click('button.back'), click('button.next')], then: { kind: 'text', selector: 'p.step', match: { equals: 'Step 2 of 3' } } } },
    { title: 'Error cleared when valid', weight: 1, spec: { kind: 'interaction', steps: [click('button.next'), fill('#email', 'x@y.z'), click('button.next')], then: { kind: 'exists', selector: 'p.error', count: { eq: 0 } } } },
    { title: 'Review summary', weight: 2, spec: { kind: 'interaction', steps: [fill('#email', ' ravi@example.com '), click('button.next'), fill('#name', ' Ravi '), click('button.next')], then: { kind: 'text', selector: 'p.summary', match: { equals: 'Ravi ravi@example.com' } } } },
    { title: 'Finish', weight: 2, spec: { kind: 'interaction', steps: [fill('#email', 'm@e.in'), click('button.next'), fill('#name', 'Meera'), click('button.next'), click('button.finish')], then: { kind: 'text', selector: 'p.done', match: { equals: 'Welcome, Meera!' } } } },
    { title: 'Step 3 indicator', weight: 1, spec: { kind: 'interaction', steps: [fill('#email', 'm@e.in'), click('button.next'), fill('#name', 'Meera'), click('button.next')], then: { kind: 'text', selector: 'p.step', match: { equals: 'Step 3 of 3' } } } },
    { title: 'Inputs are labelled', weight: 1, spec: { kind: 'role', role: 'textbox', name: 'Email', count: { eq: 1 } } },
  ],
  checkTimeoutMs: 6000,
};

export const REACT: WebQuestionInput[] = [greeting, stepCounter, showMore, studentTable, shoppingCart, todoFilters, tempConverter, accordion, dataTable, wizard];
