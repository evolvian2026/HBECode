import type { WebQuestionInput } from '@hbe/shared';

/**
 * Seed web questions. Validation checks that the reference passes every check and the starter
 * files fail at least one hidden check, in the same jailed Chromium that grades students.
 */

const PROFILE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Profile</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <article class="card">
    <img class="avatar" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Ccircle cx='48' cy='48' r='48' fill='%236366f1'/%3E%3C/svg%3E" alt="Portrait of Asha Rao">
    <div class="info">
      <h1 class="name">Asha Rao</h1>
      <p class="role">Frontend Engineer</p>
      <ul class="stats">
        <li><strong>128</strong> posts</li>
        <li><strong>4.2k</strong> followers</li>
        <li><strong>310</strong> following</li>
      </ul>
      <a class="contact" href="mailto:asha@example.com">Email Asha</a>
      <button type="button" class="follow">Follow</button>
    </div>
  </article>
</body>
</html>
`;
const PROFILE_CSS = `body { margin: 0; font-family: system-ui, sans-serif; background: #f1f5f9; }
.card { display: flex; flex-direction: row; gap: 24px; max-width: 640px; margin: 40px auto; padding: 24px; background: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15); }
.avatar { width: 96px; height: 96px; border-radius: 50%; }
.name { margin: 0; font-size: 28px; }
.role { margin: 4px 0 12px; color: rgb(100, 116, 139); }
.stats { display: flex; gap: 16px; list-style: none; padding: 0; margin: 0 0 12px; }
.follow { background: rgb(79, 70, 229); color: rgb(255, 255, 255); border: 0; border-radius: 6px; padding: 8px 16px; cursor: pointer; }
@media (max-width: 600px) {
  .card { flex-direction: column; align-items: center; text-align: center; margin: 0; border-radius: 0; }
  .stats { justify-content: center; }
}
`;

export const profileCard: WebQuestionInput = {
  type: 'web',
  framework: 'html',
  title: 'Responsive Profile Card',
  statement:
    'Build a profile card for **Asha Rao**, a *Frontend Engineer*, in `index.html` and `styles.css`.\n\n' +
    '- An `<article class="card">` containing an avatar image (`img.avatar`, with meaningful alt text), the name in the page\'s only `<h1 class="name">`, the role in `p.role`, ' +
    'a `ul.stats` list with three items (posts, followers, following), an email link `a.contact` to `mailto:asha@example.com`, and a **Follow** button (`button.follow`).\n' +
    '- On wide screens the card lays out its children in a row (`display: flex`, `flex-direction: row`); at **600px wide or less** it stacks them (`flex-direction: column`).\n' +
    '- The avatar is a circle (`border-radius: 50%`), the stats list is a flex row without bullets (`list-style: none`), and the button has background `rgb(79, 70, 229)` with white text.\n' +
    '- The page declares its language.',
  difficulty: 'easy',
  tags: ['html', 'css', 'flexbox', 'responsive'],
  isPractice: true,
  starterFiles: [
    { path: 'index.html', content: '<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <title>Profile</title>\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n  <!-- Build the card here -->\n</body>\n</html>\n' },
    { path: 'styles.css', content: '/* Style the card here */\n' },
  ],
  referenceFiles: [
    { path: 'index.html', content: PROFILE_HTML },
    { path: 'styles.css', content: PROFILE_CSS },
  ],
  samples: [
    { title: 'The name is shown in the h1', weight: 1, spec: { kind: 'text', selector: 'h1.name', match: { equals: 'Asha Rao' } } },
    { title: 'The card is a flex container', weight: 1, spec: { kind: 'style', selector: '.card', property: 'display', match: { equals: 'flex' } } },
  ],
  hidden: [
    { title: 'Role text', weight: 1, spec: { kind: 'text', selector: '.card p.role', match: { equals: 'Frontend Engineer' } } },
    { title: 'Avatar has alt text', weight: 1, spec: { kind: 'attribute', selector: '.card img.avatar', name: 'alt', match: { matches: '\\S{3,}' } } },
    { title: 'Avatar is round', weight: 1, spec: { kind: 'style', selector: 'img.avatar', property: 'border-top-left-radius', match: { equals: '50%' } } },
    { title: 'Three stats', weight: 1, spec: { kind: 'exists', selector: '.card ul.stats > li', count: { eq: 3 } } },
    { title: 'Stats list has no bullets', weight: 1, spec: { kind: 'style', selector: 'ul.stats', property: 'list-style-type', match: { equals: 'none' } } },
    { title: 'Email link', weight: 1, spec: { kind: 'attribute', selector: 'a.contact', name: 'href', match: { equals: 'mailto:asha@example.com' } } },
    { title: 'Follow button', weight: 1, spec: { kind: 'role', role: 'button', name: 'Follow', count: { eq: 1 } } },
    { title: 'Button colour', weight: 1, spec: { kind: 'style', selector: 'button.follow', property: 'background-color', match: { equals: 'rgb(79, 70, 229)' } } },
    { title: 'Row layout on desktop', weight: 2, spec: { kind: 'style', selector: '.card', property: 'flex-direction', match: { equals: 'row' } } },
    { title: 'Stacked on mobile', weight: 2, viewport: { width: 375, height: 740 }, spec: { kind: 'style', selector: '.card', property: 'flex-direction', match: { equals: 'column' } } },
    { title: 'Page language', weight: 1, spec: { kind: 'a11y', rule: 'document-lang' } },
    { title: 'Single h1', weight: 1, spec: { kind: 'a11y', rule: 'single-h1' } },
  ],
  checkTimeoutMs: 5000,
};

// ---------------------------------------------------------------------------------------------

const TODO_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Todo</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main>
    <h1>My tasks</h1>
    <form id="new-task">
      <label for="task">New task</label>
      <input id="task" type="text" autocomplete="off">
      <button type="submit" id="add">Add</button>
    </form>
    <ul id="list"></ul>
    <p id="count">0 tasks left</p>
  </main>
  <script src="script.js"></script>
</body>
</html>
`;
const TODO_JS = `const form = document.getElementById('new-task');
const input = document.getElementById('task');
const list = document.getElementById('list');
const count = document.getElementById('count');

function updateCount() {
  const left = list.querySelectorAll('li:not(.done)').length;
  count.textContent = left + (left === 1 ? ' task left' : ' tasks left');
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  const li = document.createElement('li');
  const label = document.createElement('span');
  label.className = 'text';
  label.textContent = text;
  const done = document.createElement('button');
  done.type = 'button';
  done.className = 'toggle';
  done.textContent = 'Done';
  done.setAttribute('aria-label', 'Mark ' + text + ' as done');
  done.addEventListener('click', () => { li.classList.toggle('done'); updateCount(); });
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'delete';
  del.textContent = 'Delete';
  del.setAttribute('aria-label', 'Delete ' + text);
  del.addEventListener('click', () => { li.remove(); updateCount(); });
  li.append(label, done, del);
  list.appendChild(li);
  input.value = '';
  updateCount();
});
`;
const TODO_CSS = `body { font-family: system-ui, sans-serif; max-width: 480px; margin: 40px auto; }
#list { padding: 0; list-style: none; }
#list li { display: flex; gap: 8px; align-items: center; padding: 6px 0; }
#list li .text { flex: 1; }
#list li.done .text { text-decoration: line-through; color: rgb(148, 163, 184); }
`;
const add = (v: string) => [{ action: 'fill' as const, selector: '#task', value: v }, { action: 'click' as const, selector: '#add' }];

export const todoList: WebQuestionInput = {
  type: 'web',
  framework: 'html',
  title: 'To-do List with Vanilla JavaScript',
  statement:
    'The HTML for a to-do list is given. Make it work in `script.js` (and style completed tasks in `styles.css`).\n\n' +
    '- Submitting the form (button **Add** or the Enter key) adds the trimmed text of `#task` as a new `<li>` in `#list`, with the text inside a `span.text`, then clears the input. Empty or whitespace-only input adds nothing.\n' +
    '- Each task has a `button.toggle` that toggles the class `done` on its `<li>`, and a `button.delete` that removes it. Give both buttons accessible names.\n' +
    '- `#count` always shows how many tasks are not done: `0 tasks left`, `1 task left`, `2 tasks left`, …\n' +
    '- A done task\'s text is struck through (`text-decoration: line-through`).',
  difficulty: 'moderate',
  tags: ['javascript', 'dom', 'events'],
  isPractice: true,
  starterFiles: [
    { path: 'index.html', content: TODO_HTML },
    { path: 'script.js', content: "const form = document.getElementById('new-task');\nconst input = document.getElementById('task');\nconst list = document.getElementById('list');\nconst count = document.getElementById('count');\n\n// Your code here\n" },
    { path: 'styles.css', content: TODO_CSS.replace(/#list li\.done[^\n]*\n/, '') },
  ],
  referenceFiles: [
    { path: 'index.html', content: TODO_HTML },
    { path: 'script.js', content: TODO_JS },
    { path: 'styles.css', content: TODO_CSS },
  ],
  samples: [
    { title: 'Adding a task shows it in the list', weight: 1, spec: { kind: 'interaction', steps: add('Buy milk'), then: { kind: 'text', selector: '#list li .text', match: { equals: 'Buy milk' } } } },
    { title: 'The counter starts at 0 tasks left', weight: 1, spec: { kind: 'text', selector: '#count', match: { equals: '0 tasks left' } } },
  ],
  hidden: [
    // Clicking Add again without typing must not add a second "Walk" (the input was cleared).
    { title: 'Input is cleared after adding', weight: 1, spec: { kind: 'interaction', steps: [...add('Walk'), { action: 'click', selector: '#add' }], then: { kind: 'exists', selector: '#list li', count: { eq: 1 } } } },
    { title: 'Text is trimmed', weight: 1, spec: { kind: 'interaction', steps: add('   Read   '), then: { kind: 'text', selector: '#list li .text', match: { matches: '^Read$' } } } },
    { title: 'Whitespace-only input is ignored', weight: 2, spec: { kind: 'interaction', steps: add('    '), then: { kind: 'exists', selector: '#list li', count: { eq: 0 } } } },
    { title: 'Enter key adds a task', weight: 1, spec: { kind: 'interaction', steps: [{ action: 'fill', selector: '#task', value: 'Cook' }, { action: 'press', selector: '#task', value: 'Enter' }], then: { kind: 'exists', selector: '#list li', count: { eq: 1 } } } },
    { title: 'Singular counter', weight: 1, spec: { kind: 'interaction', steps: add('One'), then: { kind: 'text', selector: '#count', match: { equals: '1 task left' } } } },
    { title: 'Plural counter', weight: 1, spec: { kind: 'interaction', steps: [...add('A'), ...add('B'), ...add('C')], then: { kind: 'text', selector: '#count', match: { equals: '3 tasks left' } } } },
    { title: 'Done marks the task', weight: 1, spec: { kind: 'interaction', steps: [...add('A'), { action: 'click', selector: '#list li button.toggle' }], then: { kind: 'exists', selector: '#list li.done', count: { eq: 1 } } } },
    { title: 'Done tasks are not counted', weight: 2, spec: { kind: 'interaction', steps: [...add('A'), ...add('B'), { action: 'click', selector: '#list li button.toggle' }], then: { kind: 'text', selector: '#count', match: { equals: '1 task left' } } } },
    { title: 'Delete removes the task', weight: 2, spec: { kind: 'interaction', steps: [...add('A'), ...add('B'), { action: 'click', selector: '#list li button.delete' }], then: { kind: 'text', selector: '#list li .text', match: { equals: 'B' } } } },
    { title: 'Done tasks are struck through', weight: 1, spec: { kind: 'interaction', steps: [...add('A'), { action: 'click', selector: 'button.toggle' }], then: { kind: 'style', selector: '#list li.done .text', property: 'text-decoration-line', match: { equals: 'line-through' } } } },
    { title: 'Task buttons have accessible names', weight: 1, spec: { kind: 'interaction', steps: add('Plan trip'), then: { kind: 'a11y', rule: 'button-names' } } },
  ],
  checkTimeoutMs: 5000,
};

// ---------------------------------------------------------------------------------------------

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
  const remove = (id) =>
    setCart((c) => {
      const n = { ...c };
      if (n[id] > 1) n[id] -= 1;
      else delete n[id];
      return n;
    });
  const lines = PRODUCTS.filter((p) => cart[p.id]);
  const count = lines.reduce((s, p) => s + cart[p.id], 0);
  const total = lines.reduce((s, p) => s + cart[p.id] * p.price, 0);
  return (
    <main>
      <h1>Stationery shop</h1>
      <ProductList products={PRODUCTS} onAdd={add} />
      <section aria-label="Cart">
        <h2>Cart (<span className="cart-count">{count}</span>)</h2>
        {lines.length === 0 ? (
          <p className="empty">Your cart is empty</p>
        ) : (
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
const addP = (i: number) => ({ action: 'click' as const, selector: `.products li:nth-child(${i}) button` });

export const shoppingCart: WebQuestionInput = {
  type: 'web',
  framework: 'react',
  title: 'React Shopping Cart',
  statement:
    'Complete the shop in `App.jsx` and `ProductList.jsx` using React state.\n\n' +
    '- `ProductList` renders every product as an `li.product` inside `ul.products`, with an **Add** button whose accessible name is `Add <name> to cart`.\n' +
    '- The cart heading shows the number of items in `span.cart-count`. With no items, show `p.empty` with the text `Your cart is empty`.\n' +
    '- Each product in the cart is one `li.cart-line` (in product order) showing `span.line-name` and the quantity in `span.qty`, plus a button named `Remove one <name>` that lowers the quantity (removing the line at zero).\n' +
    '- `p.total` shows `Total: ₹<sum of quantity × price>`.',
  difficulty: 'moderate',
  tags: ['react', 'state', 'components'],
  isPractice: true,
  starterFiles: [
    { path: 'App.jsx', content: CART_APP.slice(0, CART_APP.indexOf('export default function App')) + "export default function App() {\n  // Keep the cart in state and render it here\n  return (\n    <main>\n      <h1>Stationery shop</h1>\n      <ProductList products={PRODUCTS} onAdd={() => {}} />\n    </main>\n  );\n}\n" },
    { path: 'ProductList.jsx', content: 'export default function ProductList({ products, onAdd }) {\n  return <ul className="products"></ul>;\n}\n' },
    { path: 'App.css', content: '.products, .cart { list-style: none; padding: 0; }\n' },
  ],
  referenceFiles: [
    { path: 'App.jsx', content: CART_APP },
    { path: 'ProductList.jsx', content: CART_LIST },
    { path: 'App.css', content: '.products, .cart { list-style: none; padding: 0; }\n.total { font-weight: 700; }\n' },
  ],
  samples: [
    { title: 'Every product is listed', weight: 1, spec: { kind: 'exists', selector: 'ul.products > li.product', count: { eq: 3 } } },
    { title: 'An empty cart says so', weight: 1, spec: { kind: 'text', selector: 'p.empty', match: { equals: 'Your cart is empty' } } },
  ],
  hidden: [
    { title: 'Add buttons are named', weight: 1, spec: { kind: 'role', role: 'button', name: 'Add Notebook to cart', count: { eq: 1 } } },
    { title: 'Count starts at zero', weight: 1, spec: { kind: 'text', selector: '.cart-count', match: { equals: '0' } } },
    { title: 'Adding updates the count', weight: 1, spec: { kind: 'interaction', steps: [addP(1), addP(2)], then: { kind: 'text', selector: '.cart-count', match: { equals: '2' } } } },
    { title: 'Same product twice is one line', weight: 2, spec: { kind: 'interaction', steps: [addP(2), addP(2)], then: { kind: 'exists', selector: 'li.cart-line', count: { eq: 1 } } } },
    { title: 'Quantity shown', weight: 1, spec: { kind: 'interaction', steps: [addP(3), addP(3), addP(3)], then: { kind: 'text', selector: 'li.cart-line .qty', match: { equals: '3' } } } },
    { title: 'Total price', weight: 2, spec: { kind: 'interaction', steps: [addP(1), addP(1), addP(3)], then: { kind: 'text', selector: 'p.total', match: { equals: 'Total: ₹1580' } } } },
    { title: 'Lines follow product order', weight: 1, spec: { kind: 'interaction', steps: [addP(3), addP(1)], then: { kind: 'text', selector: 'li.cart-line .line-name', match: { equals: 'Gel pen' } } } },
    { title: 'Remove lowers the quantity', weight: 1, spec: { kind: 'interaction', steps: [addP(2), addP(2), { action: 'click', selector: 'li.cart-line button' }], then: { kind: 'text', selector: 'li.cart-line .qty', match: { equals: '1' } } } },
    { title: 'Removing the last item empties the cart', weight: 2, spec: { kind: 'interaction', steps: [addP(1), { action: 'click', selector: 'li.cart-line button' }], then: { kind: 'exists', selector: 'p.empty', count: { eq: 1 } } } },
    { title: 'Remove buttons are named', weight: 1, spec: { kind: 'interaction', steps: [addP(2)], then: { kind: 'role', role: 'button', name: 'Remove one Notebook', count: { eq: 1 } } } },
  ],
  checkTimeoutMs: 5000,
};
