import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const base = (process.argv[2] || '').replace(/\/$/, '');
const done = new Set();
const ids = Array.from({ length: 8 }, (_, i) => `AC${i + 1}`);
const emit = (criterion, result, detail) => {
  if (done.has(criterion)) return;
  done.add(criterion);
  console.log(JSON.stringify({ criterion, result, ...(detail ? { detail } : {}) }));
};
const deadline = setTimeout(() => {
  for (const id of ids) emit(id, 'fail', 'Run exceeded time budget; not verified');
  process.exit(0);
}, 550_000);
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const norm = s => s.replace(/\s+/g, ' ').trim();
const books = [
  { title: 'The Hobbit', author: 'J.R.R. Tolkien', year: '1937', query: 'tolkien' },
  { title: 'Dune', author: 'Frank Herbert', year: '1965', query: 'dune' },
  { title: 'Animal Farm', author: 'George Orwell', year: '1945', query: 'orwell' },
];
const added = books.map(b => b.title);
const titleOrder = ['Animal Farm', 'Dune', 'The Hobbit'];
const authorOrder = ['Dune', 'Animal Farm', 'The Hobbit'];
let browser, owner, visitor, fixturePromise;
const button = (p, name) => p.getByRole('button', { name, exact: true });
const label = (p, name) => p.getByLabel(name, { exact: true });
async function visible(l) { await l.waitFor({ state: 'visible', timeout: 12_000 }); }
async function eventually(fn, message) {
  const end = Date.now() + 12_000;
  let last;
  do {
    try { return await fn(); } catch (e) { last = e; }
    await new Promise(resolve => setTimeout(resolve, 150));
  } while (Date.now() < end);
  throw new Error(`${message}: ${last?.message || 'timeout'}`);
}
async function init() {
  if (browser) return;
  assert(/^https?:\/\//.test(base), 'Usage: node check.mjs <baseURL>');
  browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const a = await browser.newContext();
  const b = await browser.newContext();
  a.setDefaultTimeout(12_000); b.setDefaultTimeout(12_000);
  a.setDefaultNavigationTimeout(20_000); b.setDefaultNavigationTimeout(20_000);
  owner = await a.newPage(); visitor = await b.newPage();
  await login();
}
async function goto(p, path) {
  const r = await p.goto(new URL(path, base).href, { waitUntil: 'domcontentloaded' });
  assert(r && r.status() < 400, `GET ${path}: HTTP ${r?.status()}`);
  return r;
}
async function login() {
  await goto(owner, '/login');
  await label(owner, 'Email').fill('alice@example.test');
  await label(owner, 'Password').fill('Correct-Horse-1');
  await button(owner, 'Sign in').click();
  await owner.waitForURL(u => u.pathname === '/lists');
  await visible(button(owner, 'Sign out'));
}
async function create(suffix) {
  const name = `T9 ${suffix} ${randomUUID()}`;
  await goto(owner, '/lists/new');
  await label(owner, 'Name').fill(name);
  await button(owner, 'Create list').click();
  await owner.waitForURL(u => /^\/lists\/[^/]+$/.test(u.pathname) && u.pathname !== '/lists/new');
  await visible(owner.getByRole('heading', { name, level: 1, exact: true }));
  return { name, path: new URL(owner.url()).pathname };
}
function section(p) {
  return p.getByRole('heading', { name: 'Books', exact: true }).locator('xpath=ancestor::*[self::section or @role="region"][1]');
}
async function sectionText(p) {
  const s = section(p); await visible(s);
  return norm(await s.evaluate(el => {
    const clone = el.cloneNode(true);
    for (const h of clone.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')) {
      if (h.textContent.trim() === 'Books') h.remove();
    }
    return clone.textContent;
  }));
}
async function checkBooks(p, order = added, expectedBooks = books) {
  await eventually(async () => {
    const s = section(p); await visible(s);
    const result = await s.evaluate((el, expected) => {
      const text = el.innerText.replace(/\s+/g, ' ').trim();
      const found = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const n = walker.currentNode;
        for (const b of expected) {
          // Titles may share a text node with metadata; boundaries prevent Dune matching Dune Messiah.
          if (n.textContent.trim() === b.title) found.push({ title: b.title, node: n.parentElement });
        }
      }
      return { text, found: found.map(({ title, node }) => {
        const b = expected.find(x => x.title === title);
        let item = node.closest('li,[role="listitem"],article');
        if (!item || !el.contains(item)) {
          item = node;
          while (item !== el && !(item.textContent.includes(b.author) && item.textContent.includes(b.year))) item = item.parentElement;
        }
        const t = item?.innerText || '';
        const titleCount = found.filter(f => item?.contains(f.node)).length;
        return { title, itemText: t, titleCount, isSection: item === el };
      }), listItems: el.querySelectorAll('li,[role="listitem"]').length };
    }, expectedBooks);
    assert(JSON.stringify(result.found.map(x => x.title)) === JSON.stringify(order), `Books order/count: ${JSON.stringify(result.found.map(x => x.title))}; expected ${JSON.stringify(order)}`);
    if (result.listItems) assert(result.listItems === order.length, `Unexpected book item count ${result.listItems}`);
    for (const b of expectedBooks) {
      const row = result.found.find(x => x.title === b.title);
      assert(row && !row.isSection && row.titleCount === 1, `Cannot identify distinct book item for ${b.title}`);
      assert(row.itemText.includes(b.author), `${b.title}: missing author ${b.author}`);
      assert(new RegExp(`\\b${b.year}\\b`).test(row.itemText), `${b.title}: missing year ${b.year}`);
    }
  }, 'Book contents did not settle');
}
async function add(b) {
  await label(owner, 'Search books').fill(b.query);
  await button(owner, 'Search').click();
  // The interface specifies an accessible name, but does not prescribe its role.
  const target = owner.getByRole('listitem').filter({ has: owner.getByText(b.title, { exact: true }) }).filter({ has: button(owner, 'Add') });
  await visible(target);
  assert(await target.evaluate(el => {
    for (let a = el.parentElement; a; a = a.parentElement) {
      const text = (a.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
      if (a.getAttribute('aria-label') === 'Search results' || text === 'Search results') return true;
    }
    return false;
  }), 'Add result is not inside Search results');
  await target.getByRole('button', { name: 'Add', exact: true }).click();
  await visible(section(owner).getByText(b.title, { exact: true }));
  // Ensure strictly separated additions even with second-resolution timestamps.
  await new Promise(resolve => setTimeout(resolve, 1100));
}
async function fixture() {
  await init();
  if (!fixturePromise) fixturePromise = (async () => {
    const f = await create('books');
    for (const b of books) await add(b);
    await goto(owner, f.path);
    await visible(section(owner));
    return f;
  })();
  return fixturePromise;
}
async function selected(p, text) {
  await visible(label(p, 'Sort by'));
  await eventually(async () => assert(await label(p, 'Sort by').evaluate(el => el.tagName === 'SELECT' && el.selectedOptions[0]?.textContent.trim() === text), `Expected ${text} selected`), 'Selection');
}
async function sort(f, text, value, order) {
  await label(owner, 'Sort by').selectOption({ label: text });
  await button(owner, 'Sort').click();
  await owner.waitForURL(u => u.pathname === f.path && u.search === `?sort=${value}`);
  await selected(owner, text); await checkBooks(owner, order);
}
async function noError(p) {
  const alerts = [];
  for (const alert of await p.getByRole('alert').all()) {
    if (await alert.isVisible()) alerts.push(await alert.innerText());
  }
  assert(!alerts.some(t => /error|invalid|unavailable|failed|failure|exception/i.test(t)), `Error alert: ${alerts.join('; ')}`);
  const text = await p.locator('body').innerText();
  assert(!/internal server error|application error|something went wrong|unexpected error|invalid sort|unknown sort/i.test(text), 'Page displays an error');
}
async function share(f) {
  await goto(owner, f.path);
  await label(owner, 'Link expires in').selectOption({ label: '7 days' });
  await button(owner, 'Create share link').click();
  await eventually(async () => assert(/^https?:\/\/.+\/s\/[^/\s]+$/.test(await label(owner, 'Share link').inputValue()), 'Missing absolute Share link'), 'Share link creation');
  const u = new URL(await label(owner, 'Share link').inputValue());
  assert(/^\/s\/[^/]+$/.test(u.pathname), 'Share link route');
  // APP_URL may use the gate-internal alias; navigate through the supplied reachable origin.
  return u.pathname + u.search;
}
async function readOnly(p) {
  for (const name of ['Edit', 'Delete list', 'Search', 'Add', 'Create share link']) {
    for (const role of ['button', 'link']) assert(await p.getByRole(role, { name, exact: true }).count() === 0, `Share exposes ${name}`);
  }
  assert(await label(p, 'Search books').count() === 0, 'Share exposes Search books');
}

const checks = {
  AC1: async () => {
    const f = await fixture(); await goto(owner, f.path);
    await checkBooks(owner); await selected(owner, 'Date added');
    const options = await label(owner, 'Sort by').locator('option').allTextContents();
    assert(JSON.stringify(options.map(norm)) === JSON.stringify(['Date added', 'Title', 'Author']), 'Sort by options differ');
    await visible(button(owner, 'Sort'));
    const h = owner.getByRole('heading', { name: 'Books', exact: true });
    assert(await h.evaluate(el => el.tagName === 'H2'), 'Books heading must be h2');
    const handles = await Promise.all([label(owner, 'Sort by'), button(owner, 'Sort'), label(owner, 'Link expires in'), label(owner, 'Search books')].map(l => l.elementHandle()));
    assert(await h.evaluate((heading, [select, sortButton, expiry, search]) => {
      const s = heading.closest('section,[role="region"]');
      const before = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (!s || s.contains(select) || s.contains(sortButton)) return false;
      let common = s.parentElement;
      while (common && !(common.contains(select) && common.contains(sortButton))) common = common.parentElement;
      return common && !common.querySelector('h1') && [select, sortButton].every(c => before(heading, c) && before(c, expiry) && before(c, search));
    }, handles), 'Sort controls violate Books/common-container/document-order placement');
  },
  AC2: async () => {
    const f = await fixture(); await goto(owner, f.path);
    await sort(f, 'Title', 'title', titleOrder);
    const r = await owner.reload({ waitUntil: 'domcontentloaded' }); assert(r?.status() < 400, 'Reload error');
    await selected(owner, 'Title'); await checkBooks(owner, titleOrder);
  },
  AC3: async () => {
    const f = await fixture(); await goto(owner, f.path);
    await sort(f, 'Author', 'author', authorOrder);
    const r = await owner.reload({ waitUntil: 'domcontentloaded' }); assert(r?.status() < 400, 'Reload error');
    await selected(owner, 'Author'); await checkBooks(owner, authorOrder);
  },
  AC4: async () => {
    const f = await fixture(); await goto(owner, `${f.path}?sort=title`);
    await selected(owner, 'Title'); await checkBooks(owner, titleOrder);
    await sort(f, 'Date added', 'added', added); await noError(owner);
    for (const query of ['', '?sort=added', '?sort=bogus']) {
      await goto(owner, f.path + query); await selected(owner, 'Date added');
      await checkBooks(owner); await noError(owner);
    }
  },
  AC5: async () => {
    const f = await fixture(); await goto(owner, f.path);
    await sort(f, 'Title', 'title', titleOrder); await sort(f, 'Author', 'author', authorOrder);
    const link = await share(f);
    await goto(owner, f.path); await selected(owner, 'Date added'); await checkBooks(owner);
    await button(owner, 'Sign out').click(); await owner.waitForURL(u => u.pathname === '/');
    await login(); await goto(owner, f.path); await selected(owner, 'Date added'); await checkBooks(owner);
    for (const path of [link, `${link}${link.includes('?') ? '&' : '?'}sort=title`]) {
      await goto(visitor, path); await visible(visitor.getByRole('heading', { name: f.name, level: 1, exact: true }));
      await checkBooks(visitor);
      assert(await label(visitor, 'Sort by').count() === 0, 'Share page has Sort by');
    }
    await goto(owner, f.path); await checkBooks(owner);
  },
  AC6: async () => {
    await init();
    const f = await create('empty');
    for (const query of ['', '?sort=author']) {
      await goto(owner, f.path + query);
      await visible(section(owner).getByText('This list has no books yet.', { exact: true })); await noError(owner);
      await visible(owner.getByRole('link', { name: 'Edit', exact: true }));
      for (const name of ['Delete list', 'Search', 'Create share link']) { await visible(button(owner, name)); assert(await button(owner, name).isEnabled(), `${name} disabled`); }
      await label(owner, 'Search books').fill('zzzz-nothing'); await button(owner, 'Search').click();
      await visible(owner.getByText('No books found', { exact: true })); await noError(owner);
      await button(owner, 'Create share link').click();
      await eventually(async () => assert((await label(owner, 'Share link').inputValue()).includes('/s/'), 'No share URL'), 'Empty list sharing');
      const link = new URL(await label(owner, 'Share link').inputValue());
      await goto(visitor, link.pathname + link.search);
      await visible(section(visitor).getByText('This list has no books yet.', { exact: true }));
      await owner.getByRole('link', { name: 'Edit', exact: true }).click();
      await visible(label(owner, 'Name')); await label(owner, 'Name').fill(f.name);
      await button(owner, 'Save').click(); await owner.waitForURL(u => u.pathname === f.path);
      await visible(owner.getByRole('heading', { name: f.name, level: 1, exact: true }));
    }
    await button(owner, 'Delete list').click(); await owner.waitForURL(u => u.pathname === '/lists');
    assert(await owner.getByRole('link', { name: f.name, exact: true }).count() === 0, 'Deleted empty list remains');
  },
  AC7: async () => {
    const f = await fixture(); const link = await share(f);
    await goto(owner, f.path); await checkBooks(owner);
    const ownerText = await sectionText(owner);
    assert(!/\b(?:Sort by|Date added|Sort)\b/.test(ownerText), 'Sort control text leaked into Books');
    await goto(visitor, link); await checkBooks(visitor);
    assert(ownerText === await sectionText(visitor), 'Owner/share Books text differs');
    await visible(visitor.getByRole('heading', { name: f.name, level: 1, exact: true })); await readOnly(visitor);
    const second = await create('other-share');
    const otherBook = { title: 'Nineteen Eighty-Four', author: 'George Orwell', year: '1949', query: 'orwell' };
    await add(otherBook); const otherLink = await share(second);
    for (const [url, own, other, expected] of [[link, f, second, books], [otherLink, second, f, [otherBook]]]) {
      await goto(visitor, url);
      await visible(visitor.getByRole('heading', { name: own.name, level: 1, exact: true }));
      assert(!(await visitor.locator('body').innerText()).includes(other.name), 'Share shows another list name');
      await checkBooks(visitor, expected.map(b => b.title), expected); await readOnly(visitor);
      const text = await sectionText(visitor);
      for (const b of (own === f ? [otherBook] : books)) assert(!text.includes(b.title), 'Share shows another list book');
    }
  },
  AC8: async () => {
    let axe;
    try { axe = await readFile('/node_modules/axe-core/axe.min.js', 'utf8'); }
    catch (e) { throw new Error(`not verified: pinned axe-core bundle cannot be loaded: ${e.message}`); }
    const f = await fixture(); const failures = [];
    for (const width of [375, 768, 1280]) {
      await owner.setViewportSize({ width, height: 900 });
      await goto(owner, `${f.path}?sort=title`); await selected(owner, 'Title'); await checkBooks(owner, titleOrder);
      await owner.addScriptTag({ content: axe });
      const violations = await owner.evaluate(async () => {
        if (!window.axe?.run) throw new Error('not verified: axe-core failed to load');
        const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
        return r.violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`);
      });
      if (violations.length) failures.push(`${width}px: ${violations.join('; ')}`);
    }
    assert(!failures.length, failures.join(' | '));
  },
};
try {
  for (const id of ids) {
    try { await checks[id](); emit(id, 'pass'); }
    catch (e) { emit(id, 'fail', String(e?.message || e).slice(0, 2400)); }
  }
} finally {
  await browser?.close().catch(() => {});
  clearTimeout(deadline);
  process.exitCode = 0;
}
