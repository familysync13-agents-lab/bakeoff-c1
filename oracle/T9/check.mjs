import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = process.argv[2]?.replace(/\/$/, '');
const ids = ['AC1', 'AC2', 'AC3', 'AC4', 'AC5', 'AC6', 'AC7'];
const emitted = new Set();
const output = (id, error) => {
  if (emitted.has(id)) return;
  emitted.add(id);
  console.log(JSON.stringify(error ? { criterion: id, result: 'fail', detail: String(error.message || error).slice(0, 1400) } : { criterion: id, result: 'pass' }));
};
let browser, owner, page, fixture, setupError;
const deadline = setTimeout(() => {
  for (const id of ids) output(id, new Error('Verifier exceeded its 9 minute deadline'));
  process.exit(0);
}, 540000);
const eq = (a, b, message) => assert.deepEqual(a, b, message);
const button = (p, name) => p.getByRole('button', { name, exact: true });
const label = (p, name) => p.getByLabel(name, { exact: true });
async function poll(fn, message, timeout = 12000) {
  const end = Date.now() + timeout;
  let last;
  do {
    try { return await fn(); } catch (e) { last = e; }
    await new Promise(resolve => setTimeout(resolve, 150));
  } while (Date.now() < end);
  throw new Error(`${message}: ${last?.message || 'timed out'}`);
}
async function go(p, path) {
  const response = await p.goto(new URL(path, base).href, { waitUntil: 'domcontentloaded' });
  assert(response && response.status() < 400, `GET ${path}: HTTP ${response?.status()}`);
  return response;
}
async function login(p) {
  await go(p, '/login');
  await label(p, 'Email').fill('alice@example.test');
  await label(p, 'Password').fill('Correct-Horse-1');
  await button(p, 'Sign in').click();
  await p.waitForURL(u => u.pathname === '/lists');
  await button(p, 'Sign out').waitFor({ state: 'visible' });
}
async function create(p, name) {
  await go(p, '/lists/new');
  await label(p, 'Name').fill(name);
  await button(p, 'Create list').click();
  await p.waitForURL(u => /^\/lists\/[^/]+$/.test(u.pathname) && u.pathname !== '/lists/new');
  await p.getByRole('heading', { name, exact: true, level: 1 }).waitFor();
  return new URL(p.url()).pathname;
}
const lower = s => s.toLowerCase();
const cmp = (a, b) => lower(a) < lower(b) ? -1 : lower(a) > lower(b) ? 1 : 0;
const titleOrder = books => [...books].sort((a, b) => cmp(a.title, b.title) || a.index - b.index);
const authorOrder = books => [...books].sort((a, b) => {
  const au = a.author === 'Unknown author', bu = b.author === 'Unknown author';
  return Number(au) - Number(bu) || (au && bu ? 0 : cmp(a.author, b.author)) || cmp(a.title, b.title) || a.index - b.index;
});

// Inspect rendered elements only. Do not assume framework classes or data attributes.
async function bookSnapshot(p, books, share = false) {
  return p.evaluate(({ books, share }) => {
    const visible = e => !!(e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
    const norm = s => s.replace(/\s+/g, ' ').trim();
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')].filter(visible);
    const heading = headings.find(e => norm(e.textContent) === 'Books');
    if (!heading && !share) throw new Error('Missing Books heading');
    const level = e => Number(e.getAttribute('aria-level') || e.tagName.slice(1) || 2);
    const stop = heading && headings.find(e => (heading.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING) && level(e) <= level(heading));
    const inBooks = e => (!heading || !!(heading.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING)) && (!stop || !!(e.compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_FOLLOWING)) && !e.closest('[aria-label="Search results"]');
    const elements = [...document.body.querySelectorAll('*')].filter(e => visible(e) && inBooks(e));
    const found = [];
    for (const book of books) {
      const matches = elements.filter(e => norm(e.textContent) === norm(book.title) && ![...e.children].some(c => norm(c.textContent) === norm(book.title)));
      if (matches.length !== 1) throw new Error(`Expected exactly one book title ${book.title}; found ${matches.length}`);
      const title = matches[0];
      let row = title.closest('li,article,tr,[role="listitem"],[role="row"]');
      if (!row) {
        row = title.parentElement;
        while (row && !norm(row.textContent).includes(norm(book.author))) row = row.parentElement;
      }
      if (!row || !norm(row.textContent).includes(norm(book.author))) throw new Error(`Author missing from item for ${book.title}`);
      if (books.some(b => b.title !== book.title && norm(row.textContent).includes(norm(b.title)))) throw new Error(`Cannot identify separate book item for ${book.title}`);
      if (!share && book.year != null && !new RegExp(`\\b${book.year}\\b`).test(row.innerText)) throw new Error(`First publish year missing for ${book.title}`);
      // Author order is based on the first displayed author, not a surname or a later coauthor.
      const authorText = norm(row.innerText).replace(norm(book.title), '');
      const positions = book.authors.map(a => authorText.indexOf(norm(a))).filter(i => i >= 0);
      if (positions.length && authorText.indexOf(norm(book.author)) !== Math.min(...positions)) throw new Error(`Wrong first displayed author for ${book.title}`);
      found.push({ title: book.title, node: title, row });
    }
    const parent = found[0]?.row.parentElement;
    if (parent && found.every(f => f.row.parentElement === parent) && /^(UL|OL|TBODY)$/.test(parent.tagName)) {
      if ([...parent.children].filter(visible).length !== books.length) throw new Error('Unexpected book item count');
    }
    found.sort((a, b) => a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    return found.map(f => f.title);
  }, { books, share });
}
async function ordered(p, expected, share = false) {
  await poll(async () => eq(await bookSnapshot(p, expected, share), expected.map(b => b.title), 'Book order differs'), 'Books did not reach expected order');
}
async function selected(p, text) {
  await poll(async () => eq(await label(p, 'Sort by').locator('option:checked').textContent(), text), 'Sort selection differs');
}
async function sort(p, text, value, path) {
  await label(p, 'Sort by').selectOption({ label: text });
  // Change may navigate immediately; wait for the button on the resulting view.
  await button(p, 'Sort').click();
  await p.waitForURL(u => u.pathname === path && u.search === `?sort=${value}`);
  await selected(p, text);
}
async function noError(p) {
  const text = await p.locator('body').innerText();
  assert(!/\b(internal server error|application error|something went wrong|invalid sort|unknown sort|error:|exception:)\b/i.test(text), 'Visible error message');
  for (const alert of await p.getByRole('alert').all()) {
    if (await alert.isVisible()) assert(!/\b(error|invalid|failed|unavailable|exception)\b/i.test(await alert.innerText()), 'Error alert shown');
  }
}
async function shareLink(p) {
  await label(p, 'Link expires in').selectOption({ label: '7 days' });
  await button(p, 'Create share link').click();
  const field = label(p, 'Share link');
  await field.waitFor();
  return poll(async () => {
    const url = new URL(await field.inputValue());
    assert(/^\/s\/[^/]+$/.test(url.pathname), 'Invalid Share link');
    // APP_URL may use a different name for the same preview service.
    return new URL(url.pathname + url.search, base).href;
  }, 'Share link not produced');
}
async function search(p, query) {
  await label(p, 'Search books').fill(query);
  await button(p, 'Search').click();
  const results = p.getByRole('listitem').filter({ has: button(p, 'Add') });
  await results.first().waitFor();
  return results;
}
async function prepare() {
  assert(base, 'Usage: node check.mjs <baseURL>');
  browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  owner = await browser.newContext();
  page = await owner.newPage();
  page.setDefaultTimeout(12000);
  page.setDefaultNavigationTimeout(20000);
  await login(page);
  const response = await fetch('http://books:9100/search.json?q=dune&limit=10', { signal: AbortSignal.timeout(12000) });
  assert(response.ok, 'Book test double unavailable');
  const data = await response.json();
  const seen = new Set();
  const books = data.docs.slice(0, 10).filter(d => typeof d.title === 'string' && d.title.trim() && !seen.has(d.title) && seen.add(d.title)).map(d => ({
    title: d.title, author: d.author_name?.[0] || 'Unknown author', authors: d.author_name || [], year: d.first_publish_year, key: d.key
  }));
  assert(books.length >= 3 && new Set(books.map(b => lower(b.author))).size >= 3, 'Fixture needs at least three distinct titles and first authors');
  let added = [...books].reverse().map((b, index) => ({ ...b, index }));
  for (let i = 0; i < books.length * 2; i++) {
    const titles = added.map(b => b.title).join('\n');
    if (titles !== titleOrder(added).map(b => b.title).join('\n') && titles !== authorOrder(added).map(b => b.title).join('\n')) break;
    added.push(added.shift());
    if (i === books.length - 1) added.reverse();
  }
  added = added.map((b, index) => ({ ...b, index }));
  assert.notDeepEqual(added.map(b => b.title), titleOrder(added).map(b => b.title));
  assert.notDeepEqual(added.map(b => b.title), authorOrder(added).map(b => b.title));
  const name = `T9 oracle ${randomUUID()}`;
  const path = await create(page, name);
  for (const book of added) {
    await search(page, 'dune');
    const item = page.getByRole('listitem').filter({ has: page.getByText(book.title, { exact: true }) }).filter({ has: button(page, 'Add') });
    await button(item, 'Add').click();
    // Wait for the saved item in Books before navigating, so an asynchronous
    // Add request cannot be interrupted by the following GET.
    await ordered(page, added.slice(0, book.index + 1));
    await go(page, path);
    await ordered(page, added.slice(0, book.index + 1));
    // Avoid equal coarse timestamps when the storage uses second precision.
    await page.waitForTimeout(1100);
  }
  return { path, name, books: added };
}
async function criterion(id, fn, needsFixture = true) {
  try {
    if (needsFixture && setupError) throw new Error(`Fixture setup failed: ${setupError.message}`);
    await fn();
    output(id);
  } catch (e) { output(id, e); }
}
try {
  try { fixture = await prepare(); } catch (e) { setupError = e; }
  await criterion('AC1', async () => {
    await go(page, fixture.path);
    await selected(page, 'Date added');
    eq(await label(page, 'Sort by').locator('option').allTextContents(), ['Date added', 'Title', 'Author'], 'Sort options differ');
    await button(page, 'Sort').waitFor();
    assert(await label(page, 'Sort by').evaluate(el => {
      const h = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')].find(e => e.textContent.trim() === 'Books');
      let container = h?.parentElement;
      while (container && container !== document.body) {
        if (container.contains(el) && !container.querySelector('h1')) return true;
        container = container.parentElement;
      }
      return false;
    }), 'Sort by is not in the Books section');
    await ordered(page, fixture.books);
  });
  await criterion('AC2', async () => {
    await go(page, fixture.path);
    await sort(page, 'Title', 'title', fixture.path);
    await ordered(page, titleOrder(fixture.books));
    await go(page, page.url());
    await selected(page, 'Title');
    await ordered(page, titleOrder(fixture.books));
  });
  await criterion('AC3', async () => {
    await go(page, fixture.path);
    await sort(page, 'Author', 'author', fixture.path);
    await ordered(page, authorOrder(fixture.books));
    await go(page, page.url());
    await selected(page, 'Author');
    await ordered(page, authorOrder(fixture.books));
    assert(fixture.books.some(b => b.author === 'Unknown author'), 'Fixture cannot exercise Unknown author last: test double has no such book');
    assert(fixture.books.some((b, i, all) => b.author !== 'Unknown author' && all.some((c, j) => i !== j && lower(b.author) === lower(c.author))), 'Fixture cannot exercise equal-author title tie break');
  });
  await criterion('AC4', async () => {
    await go(page, `${fixture.path}?sort=title`);
    await sort(page, 'Date added', 'added', fixture.path);
    await ordered(page, fixture.books);
    await noError(page);
    for (const suffix of ['', '?sort=bogus', '?sort=added']) {
      await go(page, fixture.path + suffix);
      await selected(page, 'Date added');
      await ordered(page, fixture.books);
      await noError(page);
    }
  });
  await criterion('AC5', async () => {
    for (const [text, value] of [['Title', 'title'], ['Author', 'author']]) {
      await go(page, fixture.path);
      await sort(page, text, value, fixture.path);
    }
    const link = await shareLink(page);
    await go(page, fixture.path);
    await selected(page, 'Date added');
    await ordered(page, fixture.books);
    await button(page, 'Sign out').click();
    await page.waitForURL(u => u.pathname === '/');
    await login(page);
    await go(page, fixture.path);
    await selected(page, 'Date added');
    await ordered(page, fixture.books);
    const anon = await browser.newContext();
    try {
      const visitor = await anon.newPage();
      visitor.setDefaultTimeout(12000);
      for (const target of [link, `${link}?sort=title`]) {
        await go(visitor, target);
        await visitor.getByRole('heading', { name: fixture.name, exact: true, level: 1 }).waitFor();
        eq(await label(visitor, 'Sort by').count(), 0, 'Share page has Sort by control');
        await ordered(visitor, fixture.books, true);
      }
    } finally { await anon.close(); }
    await go(page, fixture.path);
    await ordered(page, fixture.books);
  });
  await criterion('AC6', async () => {
    assert(browser, 'Browser unavailable');
    const ctx = await browser.newContext();
    try {
      const p = await ctx.newPage();
      p.setDefaultTimeout(12000);
      await login(p);
      for (const suffix of ['', '?sort=author']) {
        const name = `T9 empty ${randomUUID()}`;
        const path = await create(p, name);
        await go(p, path + suffix);
        await p.getByText('This list has no books yet.', { exact: true }).waitFor();
        await noError(p);
        await p.getByRole('link', { name: 'Edit', exact: true }).click();
        await label(p, 'Name').fill(`${name} edited`);
        await button(p, 'Save').click();
        await p.getByRole('heading', { name: `${name} edited`, exact: true, level: 1 }).waitFor();
        await go(p, path + suffix);
        const link = await shareLink(p);
        const anon = await browser.newContext();
        try {
          const visitor = await anon.newPage();
          await go(visitor, link);
          await visitor.getByRole('heading', { name: `${name} edited`, exact: true, level: 1 }).waitFor();
        } finally { await anon.close(); }
        await go(p, path + suffix);
        await search(p, 'dune');
        await noError(p);
        await button(p, 'Delete list').click();
        await p.waitForURL(u => u.pathname === '/lists');
        eq(await p.getByRole('link', { name: `${name} edited`, exact: true }).count(), 0, 'Delete list did not remove empty list');
      }
    } finally { await ctx.close(); }
  }, false);
  await criterion('AC7', async () => {
    const failures = [];
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await go(page, `${fixture.path}?sort=title`);
      await ordered(page, titleOrder(fixture.books));
      // The environment supplies only playwright and Node built-ins. Use a real
      // axe engine if one is exposed; never substitute ad hoc accessibility rules.
      const available = await page.evaluate(() => typeof globalThis.axe?.run === 'function');
      assert(available, 'Cannot measure AC7: axe-core is not supplied by the verifier environment (see NOTES.md)');
      const result = await page.evaluate(async () => globalThis.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
      }));
      for (const v of result.violations.filter(v => ['serious', 'critical'].includes(v.impact))) failures.push({ width, id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) });
    }
    eq(failures, [], `Serious/critical axe violations: ${JSON.stringify(failures)}`);
  });
} catch (e) {
  for (const id of ids) output(id, e);
} finally {
  clearTimeout(deadline);
  if (browser) await browser.close().catch(() => {});
  for (const id of ids) if (!emitted.has(id)) output(id, new Error('Criterion did not execute'));
  process.exitCode = 0;
}
