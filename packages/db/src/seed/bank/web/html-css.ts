import type { WebQuestionInput } from '@hbe/shared';
import { profileCard } from '../../questions/web-questions.js';

const page = (title: string, body: string, opts: { lang?: boolean; css?: boolean } = {}) =>
  `<!doctype html>\n<html${opts.lang === false ? '' : ' lang="en"'}>\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${title}</title>\n${opts.css === false ? '' : '  <link rel="stylesheet" href="styles.css">\n'}</head>\n<body>\n${body}\n</body>\n</html>\n`;
const starter = (title: string) => page(title, '  <!-- Build the page here -->', { lang: false });
const MOBILE = { width: 375, height: 740 };

const semanticPage: WebQuestionInput = {
  type: 'web',
  framework: 'html',
  title: 'Semantic Blog Page',
  statement:
    'Mark up a blog post page with semantic HTML in `index.html`:\n\n' +
    '- A `<header>` with the site name in the page\'s only `<h1>` ("The Daily Byte") and a `<nav>` holding a `<ul>` of three links: Home (`/`), Archive (`/archive`) and About (`/about`).\n' +
    '- A `<main>` containing one `<article>` with an `<h2>` title, a `<time datetime="2026-09-14">` element, at least two paragraphs, and an image with meaningful `alt` text inside a `<figure>` with a `<figcaption>`.\n' +
    '- A `<footer>` whose text contains `©`.\n' +
    '- The page declares its language.',
  difficulty: 'easy',
  tags: ['html', 'semantics', 'accessibility'],
  isPractice: true,
  starterFiles: [{ path: 'index.html', content: starter('The Daily Byte') }, { path: 'styles.css', content: '/* optional */\n' }],
  referenceFiles: [
    {
      path: 'index.html',
      content: page(
        'The Daily Byte',
        `  <header>\n    <h1>The Daily Byte</h1>\n    <nav aria-label="Main">\n      <ul>\n        <li><a href="/">Home</a></li>\n        <li><a href="/archive">Archive</a></li>\n        <li><a href="/about">About</a></li>\n      </ul>\n    </nav>\n  </header>\n  <main>\n    <article>\n      <h2>Why semantic HTML matters</h2>\n      <p>Published <time datetime="2026-09-14">14 September 2026</time></p>\n      <p>Screen readers, search engines and your future self all understand the page better.</p>\n      <p>Use elements for their meaning, not their default look.</p>\n      <figure>\n        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='60'/%3E" alt="Diagram of a page split into header, main and footer">\n        <figcaption>Landmarks help people jump around the page.</figcaption>\n      </figure>\n    </article>\n  </main>\n  <footer><p>© 2026 The Daily Byte</p></footer>`,
      ),
    },
    { path: 'styles.css', content: 'body { font-family: system-ui, sans-serif; max-width: 720px; margin: 0 auto; }\n' },
  ],
  samples: [
    { title: 'The site name is the h1', weight: 1, spec: { kind: 'text', selector: 'header h1', match: { equals: 'The Daily Byte' } } },
    { title: 'Three navigation links', weight: 1, spec: { kind: 'exists', selector: 'header nav ul li a', count: { eq: 3 } } },
  ],
  hidden: [
    { title: 'Archive link', weight: 1, spec: { kind: 'attribute', selector: 'nav a[href="/archive"]', name: 'href', match: { equals: '/archive' } } },
    { title: 'Article inside main', weight: 1, spec: { kind: 'exists', selector: 'main > article', count: { eq: 1 } } },
    { title: 'Article title is an h2', weight: 1, spec: { kind: 'exists', selector: 'main article h2', count: { min: 1 } } },
    { title: 'Machine-readable date', weight: 1, spec: { kind: 'attribute', selector: 'article time', name: 'datetime', match: { equals: '2026-09-14' } } },
    { title: 'At least two paragraphs', weight: 1, spec: { kind: 'exists', selector: 'article p', count: { min: 2 } } },
    { title: 'Figure with caption', weight: 1, spec: { kind: 'exists', selector: 'article figure > figcaption', count: { eq: 1 } } },
    { title: 'Images have alt text', weight: 1, spec: { kind: 'a11y', rule: 'img-alt' } },
    { title: 'Footer copyright', weight: 1, spec: { kind: 'text', selector: 'footer', match: { contains: '©' } } },
    { title: 'Page language', weight: 1, spec: { kind: 'a11y', rule: 'document-lang' } },
    { title: 'Single h1', weight: 1, spec: { kind: 'a11y', rule: 'single-h1' } },
  ],
  checkTimeoutMs: 5000,
};

const signupForm: WebQuestionInput = {
  type: 'web',
  framework: 'html',
  title: 'Accessible Sign-up Form',
  statement:
    'Build a sign-up form in `index.html` (no JavaScript needed):\n\n' +
    '- A `<form id="signup">` with a `<fieldset>` whose `<legend>` reads "Create your account".\n' +
    '- Three labelled fields: **Full name** (`#name`, text), **Email** (`#email`, type `email`) and **Password** (`#password`, type `password`, at least 8 characters via `minlength`). All three are `required`; the email field has `autocomplete="email"`.\n' +
    '- A checkbox `#terms` labelled "I accept the terms".\n' +
    '- A submit button whose accessible name is "Create account".\n' +
    '- Every form control has a label (use `<label for>` or wrap the control).',
  difficulty: 'easy',
  tags: ['html', 'forms', 'accessibility'],
  isPractice: true,
  starterFiles: [{ path: 'index.html', content: starter('Sign up') }, { path: 'styles.css', content: '/* optional */\n' }],
  referenceFiles: [
    {
      path: 'index.html',
      content: page(
        'Sign up',
        `  <main>\n    <h1>Sign up</h1>\n    <form id="signup">\n      <fieldset>\n        <legend>Create your account</legend>\n        <label for="name">Full name</label>\n        <input id="name" name="name" type="text" required>\n        <label for="email">Email</label>\n        <input id="email" name="email" type="email" autocomplete="email" required>\n        <label for="password">Password</label>\n        <input id="password" name="password" type="password" minlength="8" required>\n        <label><input id="terms" type="checkbox" name="terms"> I accept the terms</label>\n      </fieldset>\n      <button type="submit">Create account</button>\n    </form>\n  </main>`,
      ),
    },
    { path: 'styles.css', content: 'label { display: block; margin-top: 8px; }\n' },
  ],
  samples: [
    { title: 'The fieldset has a legend', weight: 1, spec: { kind: 'text', selector: '#signup fieldset legend', match: { equals: 'Create your account' } } },
    { title: 'Email field type', weight: 1, spec: { kind: 'attribute', selector: '#email', name: 'type', match: { equals: 'email' } } },
  ],
  hidden: [
    { title: 'Name is required', weight: 1, spec: { kind: 'attribute', selector: '#name', name: 'required' } },
    { title: 'Email is required', weight: 1, spec: { kind: 'attribute', selector: '#email', name: 'required' } },
    { title: 'Email autocomplete', weight: 1, spec: { kind: 'attribute', selector: '#email', name: 'autocomplete', match: { equals: 'email' } } },
    { title: 'Password type', weight: 1, spec: { kind: 'attribute', selector: '#password', name: 'type', match: { equals: 'password' } } },
    { title: 'Password minimum length', weight: 1, spec: { kind: 'attribute', selector: '#password', name: 'minlength', match: { equals: '8' } } },
    { title: 'Terms checkbox', weight: 1, spec: { kind: 'attribute', selector: '#terms', name: 'type', match: { equals: 'checkbox' } } },
    { title: 'Email field labelled', weight: 1, spec: { kind: 'role', role: 'textbox', name: 'Email', count: { eq: 1 } } },
    { title: 'Terms checkbox labelled', weight: 1, spec: { kind: 'role', role: 'checkbox', name: 'I accept the terms', count: { eq: 1 } } },
    { title: 'Submit button name', weight: 1, spec: { kind: 'role', role: 'button', name: 'Create account', count: { eq: 1 } } },
    { title: 'Every control has a label', weight: 2, spec: { kind: 'a11y', rule: 'input-labels' } },
  ],
  checkTimeoutMs: 5000,
};

const PLANS = [
  ['Starter', '₹0', '1 project', 'Community'],
  ['Pro', '₹499', '10 projects', 'Email'],
  ['Team', '₹1,999', 'Unlimited', 'Priority'],
];
const pricingTable: WebQuestionInput = {
  type: 'web',
  framework: 'html',
  title: 'Accessible Pricing Table',
  statement:
    'Present the plans below as a data table in `index.html`:\n\n' +
    '| Plan | Price per month | Projects | Support |\n|---|---|---|---|\n' +
    PLANS.map((p) => `| ${p.join(' | ')} |`).join('\n') +
    '\n\n- Use `<table id="plans">` with a `<caption>` "Pricing plans".\n- Column headers go in `<thead>` as `<th scope="col">`; each plan name is a row header `<th scope="row">` in `<tbody>`.\n' +
    '- In `styles.css`, collapse the borders (`border-collapse: collapse`) and right-align the price column cells (`td.price` with `text-align: right`).',
  difficulty: 'easy',
  tags: ['html', 'tables', 'css'],
  isPractice: true,
  starterFiles: [{ path: 'index.html', content: starter('Pricing') }, { path: 'styles.css', content: '/* Style the table here */\n' }],
  referenceFiles: [
    {
      path: 'index.html',
      content: page(
        'Pricing',
        `  <main>\n    <h1>Pricing</h1>\n    <table id="plans">\n      <caption>Pricing plans</caption>\n      <thead>\n        <tr><th scope="col">Plan</th><th scope="col">Price per month</th><th scope="col">Projects</th><th scope="col">Support</th></tr>\n      </thead>\n      <tbody>\n${PLANS.map((p) => `        <tr><th scope="row">${p[0]}</th><td class="price">${p[1]}</td><td>${p[2]}</td><td>${p[3]}</td></tr>`).join('\n')}\n      </tbody>\n    </table>\n  </main>`,
      ),
    },
    { path: 'styles.css', content: '#plans { border-collapse: collapse; }\n#plans th, #plans td { border: 1px solid rgb(203, 213, 225); padding: 6px 10px; }\ntd.price { text-align: right; }\n' },
  ],
  samples: [
    { title: 'The table has a caption', weight: 1, spec: { kind: 'text', selector: '#plans caption', match: { equals: 'Pricing plans' } } },
    { title: 'Four column headers', weight: 1, spec: { kind: 'exists', selector: '#plans thead th[scope="col"]', count: { eq: 4 } } },
  ],
  hidden: [
    { title: 'Three body rows', weight: 1, spec: { kind: 'exists', selector: '#plans tbody tr', count: { eq: 3 } } },
    { title: 'Row headers', weight: 1, spec: { kind: 'exists', selector: '#plans tbody th[scope="row"]', count: { eq: 3 } } },
    { title: 'First plan name', weight: 1, spec: { kind: 'text', selector: '#plans tbody tr:nth-child(1) th', match: { equals: 'Starter' } } },
    { title: 'Pro price', weight: 1, spec: { kind: 'text', selector: '#plans tbody tr:nth-child(2) td.price', match: { equals: '₹499' } } },
    { title: 'Team projects', weight: 1, spec: { kind: 'text', selector: '#plans tbody tr:nth-child(3) td:nth-of-type(2)', match: { equals: 'Unlimited' } } },
    { title: 'Support column header', weight: 1, spec: { kind: 'text', selector: '#plans thead th:nth-child(4)', match: { equals: 'Support' } } },
    { title: 'Collapsed borders', weight: 1, spec: { kind: 'style', selector: '#plans', property: 'border-collapse', match: { equals: 'collapse' } } },
    { title: 'Prices right-aligned', weight: 1, spec: { kind: 'style', selector: 'td.price', property: 'text-align', match: { equals: 'right' } } },
  ],
  checkTimeoutMs: 5000,
};

const NAV_HTML = page(
  'Navbar',
  `  <header class="navbar">\n    <a class="brand" href="/">Brand</a>\n    <nav aria-label="Main">\n      <ul class="links">\n        <li><a href="/products">Products</a></li>\n        <li><a href="/pricing">Pricing</a></li>\n        <li><a href="/docs">Docs</a></li>\n        <li><a class="cta" href="/signup">Sign up</a></li>\n      </ul>\n    </nav>\n  </header>\n  <main><h1>Welcome</h1></main>`,
);
const navbar: WebQuestionInput = {
  type: 'web',
  framework: 'html',
  title: 'Responsive Flexbox Navbar',
  statement:
    'The HTML for a navigation bar is given. Style it with Flexbox in `styles.css`:\n\n' +
    '- `.navbar` is a flex container with `justify-content: space-between` and `align-items: center`.\n' +
    '- `.links` is a flex row without bullets (`list-style: none`), margin 0, padding 0, with a `gap` of `16px`.\n' +
    '- Links have no underline (`text-decoration: none`); `.cta` has background `rgb(37, 99, 235)`, white text and `border-radius: 6px`.\n' +
    '- At **600px wide or less**, `.navbar` stacks its children (`flex-direction: column`) and `.links` becomes a column too.',
  difficulty: 'moderate',
  tags: ['css', 'flexbox', 'responsive'],
  isPractice: true,
  starterFiles: [{ path: 'index.html', content: NAV_HTML }, { path: 'styles.css', content: '/* Style the navbar here */\n' }],
  referenceFiles: [
    { path: 'index.html', content: NAV_HTML },
    {
      path: 'styles.css',
      content:
        'body { margin: 0; font-family: system-ui, sans-serif; }\n.navbar { display: flex; justify-content: space-between; align-items: center; padding: 12px 24px; }\n.links { display: flex; list-style: none; margin: 0; padding: 0; gap: 16px; }\n.links a, .brand { text-decoration: none; }\n.cta { background: rgb(37, 99, 235); color: rgb(255, 255, 255); border-radius: 6px; padding: 6px 12px; }\n@media (max-width: 600px) {\n  .navbar { flex-direction: column; }\n  .links { flex-direction: column; }\n}\n',
    },
  ],
  samples: [
    { title: 'The navbar is a flex container', weight: 1, spec: { kind: 'style', selector: '.navbar', property: 'display', match: { equals: 'flex' } } },
    { title: 'Items spread across the bar', weight: 1, spec: { kind: 'style', selector: '.navbar', property: 'justify-content', match: { equals: 'space-between' } } },
  ],
  hidden: [
    { title: 'Vertically centred', weight: 1, spec: { kind: 'style', selector: '.navbar', property: 'align-items', match: { equals: 'center' } } },
    { title: 'Links in a row', weight: 1, spec: { kind: 'style', selector: '.links', property: 'display', match: { equals: 'flex' } } },
    { title: 'No bullets', weight: 1, spec: { kind: 'style', selector: '.links', property: 'list-style-type', match: { equals: 'none' } } },
    { title: 'Gap between links', weight: 1, spec: { kind: 'style', selector: '.links', property: 'column-gap', match: { equals: '16px' } } },
    { title: 'No underline', weight: 1, spec: { kind: 'style', selector: '.links a', property: 'text-decoration-line', match: { equals: 'none' } } },
    { title: 'Call to action colour', weight: 1, spec: { kind: 'style', selector: '.cta', property: 'background-color', match: { equals: 'rgb(37, 99, 235)' } } },
    { title: 'Call to action text', weight: 1, spec: { kind: 'style', selector: '.cta', property: 'color', match: { equals: 'rgb(255, 255, 255)' } } },
    { title: 'Rounded call to action', weight: 1, spec: { kind: 'style', selector: '.cta', property: 'border-top-left-radius', match: { equals: '6px' } } },
    { title: 'Stacked on mobile', weight: 2, viewport: MOBILE, spec: { kind: 'style', selector: '.navbar', property: 'flex-direction', match: { equals: 'column' } } },
    { title: 'Links stacked on mobile', weight: 2, viewport: MOBILE, spec: { kind: 'style', selector: '.links', property: 'flex-direction', match: { equals: 'column' } } },
    { title: 'Row on desktop', weight: 1, spec: { kind: 'style', selector: '.links', property: 'flex-direction', match: { equals: 'row' } } },
  ],
  checkTimeoutMs: 5000,
};

const GALLERY_HTML = page(
  'Gallery',
  `  <main>\n    <h1>Gallery</h1>\n    <div class="gallery">\n${Array.from({ length: 6 }, (_, i) => `      <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='30'/%3E" alt="Photo ${i + 1}">`).join('\n')}\n    </div>\n  </main>`,
);
const gallery: WebQuestionInput = {
  type: 'web',
  framework: 'html',
  title: 'CSS Grid Photo Gallery',
  statement:
    'Lay out the gallery with CSS Grid in `styles.css`:\n\n' +
    '- `.gallery` is a grid with **three 240px columns** (`repeat(3, 240px)`) and a `gap` of `12px`.\n' +
    '- Each image fills its cell: `width: 100%`, `aspect-ratio: 4 / 3` and `object-fit: cover`, with `border-radius: 8px`.\n' +
    '- At **600px wide or less**, use **two 160px columns** instead.',
  difficulty: 'moderate',
  tags: ['css', 'grid', 'responsive'],
  isPractice: true,
  starterFiles: [{ path: 'index.html', content: GALLERY_HTML }, { path: 'styles.css', content: '/* Lay out the gallery here */\n' }],
  referenceFiles: [
    { path: 'index.html', content: GALLERY_HTML },
    {
      path: 'styles.css',
      content:
        '.gallery { display: grid; grid-template-columns: repeat(3, 240px); gap: 12px; }\n.gallery img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 8px; }\n@media (max-width: 600px) {\n  .gallery { grid-template-columns: repeat(2, 160px); }\n}\n',
    },
  ],
  samples: [
    { title: 'The gallery is a grid', weight: 1, spec: { kind: 'style', selector: '.gallery', property: 'display', match: { equals: 'grid' } } },
    { title: 'Three 240px columns', weight: 1, spec: { kind: 'style', selector: '.gallery', property: 'grid-template-columns', match: { equals: '240px 240px 240px' } } },
  ],
  hidden: [
    { title: 'Row gap', weight: 1, spec: { kind: 'style', selector: '.gallery', property: 'row-gap', match: { equals: '12px' } } },
    { title: 'Column gap', weight: 1, spec: { kind: 'style', selector: '.gallery', property: 'column-gap', match: { equals: '12px' } } },
    { title: 'Images cover their cell', weight: 1, spec: { kind: 'style', selector: '.gallery img', property: 'object-fit', match: { equals: 'cover' } } },
    { title: 'Aspect ratio', weight: 1, spec: { kind: 'style', selector: '.gallery img', property: 'aspect-ratio', match: { equals: '4 / 3' } } },
    { title: 'Rounded images', weight: 1, spec: { kind: 'style', selector: '.gallery img', property: 'border-top-right-radius', match: { equals: '8px' } } },
    { title: 'Images fill the column', weight: 1, spec: { kind: 'style', selector: '.gallery img', property: 'width', match: { equals: '240px' } } },
    { title: 'Two columns on mobile', weight: 2, viewport: MOBILE, spec: { kind: 'style', selector: '.gallery', property: 'grid-template-columns', match: { equals: '160px 160px' } } },
    { title: 'Mobile image width', weight: 1, viewport: MOBILE, spec: { kind: 'style', selector: '.gallery img', property: 'width', match: { equals: '160px' } } },
    { title: 'Images keep their alt text', weight: 1, spec: { kind: 'a11y', rule: 'img-alt' } },
  ],
  checkTimeoutMs: 5000,
};

const BUTTONS_HTML = page(
  'Buttons',
  `  <main>\n    <h1>Buttons</h1>\n    <button type="button" class="btn">Save</button>\n    <button type="button" class="btn btn-secondary">Cancel</button>\n    <button type="button" class="btn" disabled>Disabled</button>\n  </main>`,
);
const buttonStates: WebQuestionInput = {
  type: 'web',
  framework: 'html',
  title: 'Button States with CSS',
  statement:
    'Style the buttons in `styles.css`:\n\n' +
    '- `.btn`: background `rgb(37, 99, 235)`, white text, no border (`border-style: none`), `border-radius: 8px`, `padding: 8px 16px` and `cursor: pointer`. Do not add a `transition`: the checker reads the colours right after hovering.\n' +
    '- `.btn:hover`: background `rgb(29, 78, 216)`.\n' +
    '- `.btn-secondary`: white background with text colour `rgb(37, 99, 235)`; on hover its background becomes `rgb(239, 246, 255)`.\n' +
    '- Disabled buttons (`.btn:disabled`) have `opacity: 0.5` and `cursor: not-allowed`, and do not change colour on hover.',
  difficulty: 'moderate',
  tags: ['css', 'pseudo-classes', 'states'],
  isPractice: true,
  starterFiles: [{ path: 'index.html', content: BUTTONS_HTML }, { path: 'styles.css', content: '/* Style the buttons here */\n' }],
  referenceFiles: [
    { path: 'index.html', content: BUTTONS_HTML },
    {
      path: 'styles.css',
      content:
        '.btn { background-color: rgb(37, 99, 235); color: rgb(255, 255, 255); border: none; border-radius: 8px; padding: 8px 16px; cursor: pointer; }\n.btn:hover { background-color: rgb(29, 78, 216); }\n.btn-secondary { background-color: rgb(255, 255, 255); color: rgb(37, 99, 235); }\n.btn-secondary:hover { background-color: rgb(239, 246, 255); }\n.btn:disabled, .btn:disabled:hover { opacity: 0.5; cursor: not-allowed; background-color: rgb(37, 99, 235); }\n',
    },
  ],
  samples: [
    { title: 'Primary background', weight: 1, spec: { kind: 'style', selector: '.btn', property: 'background-color', match: { equals: 'rgb(37, 99, 235)' } } },
    { title: 'Pointer cursor', weight: 1, spec: { kind: 'style', selector: '.btn', property: 'cursor', match: { equals: 'pointer' } } },
  ],
  hidden: [
    { title: 'White text', weight: 1, spec: { kind: 'style', selector: '.btn', property: 'color', match: { equals: 'rgb(255, 255, 255)' } } },
    { title: 'No border', weight: 1, spec: { kind: 'style', selector: '.btn', property: 'border-top-style', match: { equals: 'none' } } },
    { title: 'Rounded corners', weight: 1, spec: { kind: 'style', selector: '.btn', property: 'border-bottom-left-radius', match: { equals: '8px' } } },
    { title: 'Padding', weight: 1, spec: { kind: 'style', selector: '.btn', property: 'padding-left', match: { equals: '16px' } } },
    { title: 'Secondary background', weight: 1, spec: { kind: 'style', selector: '.btn-secondary', property: 'background-color', match: { equals: 'rgb(255, 255, 255)' } } },
    { title: 'Hover darkens', weight: 2, spec: { kind: 'interaction', steps: [{ action: 'hover', selector: '.btn' }], then: { kind: 'style', selector: '.btn:hover', property: 'background-color', match: { equals: 'rgb(29, 78, 216)' } } } },
    { title: 'Secondary colours', weight: 1, spec: { kind: 'style', selector: '.btn-secondary', property: 'color', match: { equals: 'rgb(37, 99, 235)' } } },
    { title: 'Secondary hover', weight: 2, spec: { kind: 'interaction', steps: [{ action: 'hover', selector: '.btn-secondary' }], then: { kind: 'style', selector: '.btn-secondary:hover', property: 'background-color', match: { equals: 'rgb(239, 246, 255)' } } } },
    { title: 'Disabled opacity', weight: 1, spec: { kind: 'style', selector: '.btn:disabled', property: 'opacity', match: { equals: '0.5' } } },
    { title: 'Disabled cursor', weight: 1, spec: { kind: 'style', selector: '.btn:disabled', property: 'cursor', match: { equals: 'not-allowed' } } },
  ],
  checkTimeoutMs: 5000,
};

const STICKY_HTML = page(
  'Guide',
  `  <header class="site-header">\n    <nav aria-label="Sections">\n      <a href="#intro">Intro</a>\n      <a href="#setup">Setup</a>\n      <a href="#usage">Usage</a>\n    </nav>\n  </header>\n  <main>\n    <h1>User guide</h1>\n    <section id="intro"><h2>Intro</h2><p>Start here.</p></section>\n    <section id="setup"><h2>Setup</h2><p>Install the tools.</p></section>\n    <section id="usage"><h2>Usage</h2><p>Run the commands.</p></section>\n  </main>`,
);
const stickyHeader: WebQuestionInput = {
  type: 'web',
  framework: 'html',
  title: 'Sticky Header and Section Links',
  statement:
    'Make the header stay at the top while scrolling, in `styles.css`:\n\n' +
    '- `.site-header` uses `position: sticky` with `top: 0`, `z-index: 10` and background `rgb(255, 255, 255)`, plus a bottom border `1px solid rgb(226, 232, 240)`.\n' +
    '- The page scrolls smoothly to anchors (`html { scroll-behavior: smooth; }`), and each `section` gets `scroll-margin-top: 64px` so headings are not hidden behind the header.\n' +
    '- Each section is at least `600px` tall (`min-height`).\n' +
    '- The nav links are spaced with `gap: 12px` inside a flex `nav`.',
  difficulty: 'moderate',
  tags: ['css', 'positioning'],
  isPractice: true,
  starterFiles: [{ path: 'index.html', content: STICKY_HTML }, { path: 'styles.css', content: '/* Style the page here */\n' }],
  referenceFiles: [
    { path: 'index.html', content: STICKY_HTML },
    {
      path: 'styles.css',
      content:
        'html { scroll-behavior: smooth; }\nbody { margin: 0; }\n.site-header { position: sticky; top: 0; z-index: 10; background: rgb(255, 255, 255); border-bottom: 1px solid rgb(226, 232, 240); padding: 12px; }\n.site-header nav { display: flex; gap: 12px; }\nsection { min-height: 600px; scroll-margin-top: 64px; }\n',
    },
  ],
  samples: [
    { title: 'Sticky header', weight: 1, spec: { kind: 'style', selector: '.site-header', property: 'position', match: { equals: 'sticky' } } },
    { title: 'Pinned to the top', weight: 1, spec: { kind: 'style', selector: '.site-header', property: 'top', match: { equals: '0px' } } },
  ],
  hidden: [
    { title: 'Stacking order', weight: 1, spec: { kind: 'style', selector: '.site-header', property: 'z-index', match: { equals: '10' } } },
    { title: 'Opaque background', weight: 1, spec: { kind: 'style', selector: '.site-header', property: 'background-color', match: { equals: 'rgb(255, 255, 255)' } } },
    { title: 'Bottom border', weight: 1, spec: { kind: 'style', selector: '.site-header', property: 'border-bottom-color', match: { equals: 'rgb(226, 232, 240)' } } },
    { title: 'Border width', weight: 1, spec: { kind: 'style', selector: '.site-header', property: 'border-bottom-width', match: { equals: '1px' } } },
    { title: 'Smooth scrolling', weight: 1, spec: { kind: 'style', selector: 'html', property: 'scroll-behavior', match: { equals: 'smooth' } } },
    { title: 'Scroll margin', weight: 1, spec: { kind: 'style', selector: 'section', property: 'scroll-margin-top', match: { equals: '64px' } } },
    { title: 'Tall sections', weight: 1, spec: { kind: 'style', selector: 'section', property: 'min-height', match: { equals: '600px' } } },
    { title: 'Flex nav with gap', weight: 1, spec: { kind: 'style', selector: '.site-header nav', property: 'column-gap', match: { equals: '12px' } } },
    { title: 'Section links', weight: 1, spec: { kind: 'exists', selector: '.site-header nav a[href^="#"]', count: { eq: 3 } } },
  ],
  checkTimeoutMs: 5000,
};

const FAQ = [
  ['What is HBECode?', 'An online coding assessment platform.'],
  ['Which languages are supported?', 'Eight programming languages plus web and database questions.'],
  ['Can I practise for free?', 'Yes, practice questions are free for students.'],
];
const faqAccordion: WebQuestionInput = {
  type: 'web',
  framework: 'html',
  title: 'FAQ Accordion Without JavaScript',
  statement:
    'Build an FAQ with native disclosure widgets — no JavaScript:\n\n' +
    '- Inside `<section class="faq">` with an `<h1>` "Frequently asked questions", add one `<details class="item">` per question below; the question goes in its `<summary>` and the answer in a `<p>`.\n' +
    '- The first item is open when the page loads (`open` attribute); the others are closed.\n' +
    '- `summary` has `cursor: pointer` and `font-weight: 600`; an open item (`.item[open]`) has background `rgb(248, 250, 252)`.\n\n' +
    FAQ.map((f, i) => `${i + 1}. **${f[0]}** — ${f[1]}`).join('\n'),
  difficulty: 'hard',
  tags: ['html', 'css', 'accessibility'],
  isPractice: true,
  starterFiles: [{ path: 'index.html', content: starter('FAQ') }, { path: 'styles.css', content: '/* Style the FAQ here */\n' }],
  referenceFiles: [
    {
      path: 'index.html',
      content: page('FAQ', `  <section class="faq">\n    <h1>Frequently asked questions</h1>\n${FAQ.map((f, i) => `    <details class="item"${i === 0 ? ' open' : ''}>\n      <summary>${f[0]}</summary>\n      <p>${f[1]}</p>\n    </details>`).join('\n')}\n  </section>`),
    },
    { path: 'styles.css', content: '.faq summary { cursor: pointer; font-weight: 600; }\n.item[open] { background: rgb(248, 250, 252); }\n.item { padding: 8px; }\n' },
  ],
  samples: [
    { title: 'Three questions', weight: 1, spec: { kind: 'exists', selector: '.faq details.item', count: { eq: 3 } } },
    { title: 'Questions are summaries', weight: 1, spec: { kind: 'text', selector: '.faq details:nth-of-type(2) summary', match: { equals: FAQ[1]![0]! } } },
  ],
  hidden: [
    { title: 'First item open', weight: 1, spec: { kind: 'exists', selector: '.faq details:nth-of-type(1)[open]', count: { eq: 1 } } },
    { title: 'Others closed', weight: 1, spec: { kind: 'exists', selector: '.faq details[open]', count: { eq: 1 } } },
    { title: 'Answers are paragraphs', weight: 1, spec: { kind: 'text', selector: '.faq details:nth-of-type(3) p', match: { equals: FAQ[2]![1]! } } },
    { title: 'Clicking a question opens it', weight: 2, spec: { kind: 'interaction', steps: [{ action: 'click', selector: '.faq details:nth-of-type(2) summary' }], then: { kind: 'exists', selector: '.faq details:nth-of-type(2)[open]', count: { eq: 1 } } } },
    { title: 'Clicking an open question closes it', weight: 2, spec: { kind: 'interaction', steps: [{ action: 'click', selector: '.faq details:nth-of-type(1) summary' }], then: { kind: 'exists', selector: '.faq details[open]', count: { eq: 0 } } } },
    { title: 'Pointer cursor', weight: 1, spec: { kind: 'style', selector: '.faq summary', property: 'cursor', match: { equals: 'pointer' } } },
    { title: 'Bold questions', weight: 1, spec: { kind: 'style', selector: '.faq summary', property: 'font-weight', match: { equals: '600' } } },
    { title: 'Open item highlighted', weight: 1, spec: { kind: 'style', selector: '.item[open]', property: 'background-color', match: { equals: 'rgb(248, 250, 252)' } } },
    { title: 'No scripts', weight: 1, spec: { kind: 'exists', selector: 'script', count: { eq: 0 } } },
    { title: 'Heading', weight: 1, spec: { kind: 'text', selector: '.faq h1', match: { equals: 'Frequently asked questions' } } },
  ],
  checkTimeoutMs: 5000,
};

const DASH_HTML = page(
  'Dashboard',
  `  <div class="dashboard">\n    <header class="top">Dashboard</header>\n    <nav class="side" aria-label="Sections"><a href="#">Overview</a></nav>\n    <main class="content"><h1>Overview</h1></main>\n    <footer class="bottom">v1.0</footer>\n  </div>`,
);
const dashboardAreas: WebQuestionInput = {
  type: 'web',
  framework: 'html',
  title: 'Dashboard Layout With Grid Areas',
  statement:
    'Lay out the dashboard with named grid areas in `styles.css`:\n\n' +
    '- `.dashboard` is a grid with `grid-template-columns: 220px 1fr`, `min-height: 100vh` and these areas:\n  ```\n  "header header"\n  "sidebar main"\n  "footer footer"\n  ```\n' +
    '- `.top`, `.side`, `.content` and `.bottom` are placed with `grid-area: header`, `sidebar`, `main` and `footer`.\n' +
    '- At **700px wide or less**, use one column (`grid-template-columns: 1fr`) with the areas `"header" "main" "sidebar" "footer"` — the sidebar moves below the content.\n' +
    '- The sidebar has background `rgb(15, 23, 42)` and text `rgb(226, 232, 240)`.',
  difficulty: 'hard',
  tags: ['css', 'grid', 'responsive'],
  isPractice: true,
  starterFiles: [{ path: 'index.html', content: DASH_HTML }, { path: 'styles.css', content: 'body { margin: 0; }\n/* Lay out the dashboard here */\n' }],
  referenceFiles: [
    { path: 'index.html', content: DASH_HTML },
    {
      path: 'styles.css',
      content:
        'body { margin: 0; }\n.dashboard { display: grid; grid-template-columns: 220px 1fr; grid-template-areas: "header header" "sidebar main" "footer footer"; min-height: 100vh; }\n.top { grid-area: header; }\n.side { grid-area: sidebar; background: rgb(15, 23, 42); color: rgb(226, 232, 240); }\n.content { grid-area: main; }\n.bottom { grid-area: footer; }\n@media (max-width: 700px) {\n  .dashboard { grid-template-columns: 1fr; grid-template-areas: "header" "main" "sidebar" "footer"; }\n}\n',
    },
  ],
  samples: [
    { title: 'The dashboard is a grid', weight: 1, spec: { kind: 'style', selector: '.dashboard', property: 'display', match: { equals: 'grid' } } },
    { title: 'Named areas on desktop', weight: 1, spec: { kind: 'style', selector: '.dashboard', property: 'grid-template-areas', match: { equals: '"header header" "sidebar main" "footer footer"' } } },
  ],
  hidden: [
    { title: 'Sidebar column width', weight: 1, spec: { kind: 'style', selector: '.side', property: 'width', match: { equals: '220px' } } },
    { title: 'Header area', weight: 1, spec: { kind: 'style', selector: '.top', property: 'grid-row-start', match: { equals: 'header' } } },
    { title: 'Sidebar area', weight: 1, spec: { kind: 'style', selector: '.side', property: 'grid-column-start', match: { equals: 'sidebar' } } },
    { title: 'Main area', weight: 1, spec: { kind: 'style', selector: '.content', property: 'grid-row-start', match: { equals: 'main' } } },
    { title: 'Footer area', weight: 1, spec: { kind: 'style', selector: '.bottom', property: 'grid-column-start', match: { equals: 'footer' } } },
    { title: 'Full height (100vh of the 800px-tall checker window)', weight: 1, spec: { kind: 'style', selector: '.dashboard', property: 'min-height', match: { equals: '800px' } } },
    { title: 'Mobile areas', weight: 2, viewport: { width: 600, height: 800 }, spec: { kind: 'style', selector: '.dashboard', property: 'grid-template-areas', match: { equals: '"header" "main" "sidebar" "footer"' } } },
    { title: 'Mobile single column', weight: 2, viewport: { width: 600, height: 800 }, spec: { kind: 'style', selector: '.side', property: 'width', match: { equals: '600px' } } },
    { title: 'Sidebar colours', weight: 1, spec: { kind: 'style', selector: '.side', property: 'background-color', match: { equals: 'rgb(15, 23, 42)' } } },
    { title: 'Sidebar text colour', weight: 1, spec: { kind: 'style', selector: '.side', property: 'color', match: { equals: 'rgb(226, 232, 240)' } } },
  ],
  checkTimeoutMs: 5000,
};

export const HTML_CSS: WebQuestionInput[] = [profileCard, semanticPage, signupForm, pricingTable, navbar, gallery, buttonStates, stickyHeader, faqAccordion, dashboardAreas];
