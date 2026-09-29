import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const ids = Array.from({ length: 8 }, (_, i) => `AC${i + 1}`);
const reported = new Set();
function report(criterion, error) {
  if (reported.has(criterion)) return;
  reported.add(criterion);
  console.log(JSON.stringify(error ? { criterion, result: 'fail', detail: String(error.message || error).slice(0, 1800) } : { criterion, result: 'pass' }));
}
const deadline = setTimeout(() => {
  for (const id of ids) report(id, new Error('Not verified: verifier exceeded its nine-minute budget'));
  process.exit(0);
}, 540000);
const assert = (value, message) => { if (!value) throw new Error(message); };
const normalize = value => value.replace(/\s+/g, ' ').trim();
const fixture = [
  { query: 'tolkien', title: 'The Hobbit', author: 'J.R.R. Tolkien', year: '1937' },
  { query: 'dune', title: 'Dune', author: 'Frank Herbert', year: '1965' },
  { query: 'orwell', title: 'Animal Farm', author: 'George Orwell', year: '1945' },
];
const added = fixture.map(book => book.title);
const titleOrder = ['Animal Farm', 'Dune', 'The Hobbit'];
const authorOrder = ['Dune', 'Animal Farm', 'The Hobbit'];
let browser, owner, anonymous, page, visitor, base, primary, setupError;
async function eventually(fn, description, timeout = 12000) {
  const until = Date.now() + timeout;
  let last;
  do {
    try { return await fn(); } catch (error) { last = error; }
    await new Promise(resolve => setTimeout(resolve, 150));
  } while (Date.now() < until);
  throw new Error(`${description}: ${last?.message || 'timed out'}`);
}
async function visible(locator) { await locator.waitFor({ state: 'visible' }); }
async function goto(p, path) {
  const response = await p.goto(new URL(path, base).href, { waitUntil: 'domcontentloaded' });
  assert(response && response.status() < 400, `GET ${path}: HTTP ${response?.status()}`);
  return response;
}
async function noError(p) {
  const alerts = await p.getByRole('alert').allTextContents();
  assert(!alerts.some(text => /error|invalid|unavailable|failed|failure|something went wrong/i.test(text)), `Error alert: ${alerts.join(' / ')}`);
  const body = await p.locator('body').innerText();
  assert(!/internal server error|application error|something went wrong|\b500\s*[-:]?\s*server error/i.test(body), 'Error page/message displayed');
}
async function login() {
  await goto(page, '/login');
  await page.getByLabel('Email', { exact: true }).fill('alice@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Correct-Horse-1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/lists');
  await visible(page.getByRole('heading', { name: 'My lists', exact: true }));
}
function books(p) {
  return p.getByRole('heading', { name: 'Books', exact: true }).locator('xpath=ancestor::*[self::section or @role="region"][1]');
}
async function bookText(p) {
  await visible(books(p));
  return normalize(await books(p).evaluate(element => {
    const clone = element.cloneNode(true);
    for (const heading of clone.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')) {
      if (heading.textContent.trim() === 'Books') heading.remove();
    }
    return clone.textContent;
  }));
}
async function checkBooks(p, order) {
  await eventually(async () => {
    const section = books(p);
    const text = await bookText(p);
    const matches = [...text.matchAll(/The Hobbit|Animal Farm|Dune(?![\p{L}\p{N}])/gu)];
    assert(JSON.stringify(matches.map(m => m[0])) === JSON.stringify(order), `Books order/count: ${text}`);
    const items = section.getByRole('listitem');
    const count = await items.count();
    if (count) assert(count === order.length, `Expected ${order.length} book items, found ${count}`);
    for (let i = 0; i < order.length; i++) {
      const expected = fixture.find(book => book.title === order[i]);
      const itemText = count ? normalize(await items.nth(i).innerText()) : text.slice(matches[i].index, matches[i + 1]?.index ?? text.length);
      assert(itemText.includes(expected.title) && itemText.includes(expected.author) && itemText.includes(expected.year), `Missing/misplaced book fields for ${expected.title}: ${itemText}`);
    }
  }, 'Books');
}
async function selection(p, expected) {
  const select = p.getByLabel('Sort by', { exact: true });
  await visible(select);
  await eventually(async () => {
    // Browser callbacks have no access to Node lexical variables.
    const actual = await select.evaluate(element => element.tagName === 'SELECT' ? element.selectedOptions[0]?.textContent.trim() : null);
    assert(actual === expected, `Expected selected option ${expected}; got ${actual}`);
  }, 'Selection');
}
async function createList(label) {
  const name = `T9 ${label} ${randomUUID()}`;
  await goto(page, '/lists/new');
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Create list', exact: true }).click();
  await page.waitForURL(url => /^\/lists\/[^/]+$/.test(url.pathname) && url.pathname !== '/lists/new');
  await visible(page.getByRole('heading', { level: 1, name, exact: true }));
  return { name, path: new URL(page.url()).pathname };
}
async function addBook(book) {
  await page.getByLabel('Search books', { exact: true }).fill(book.query);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const results = page.getByRole('listitem').filter({ has: page.getByText(book.title, { exact: true }) });
  // Search results are named by contract, but their container's role is unspecified.
  const row = results.filter({ has: page.getByRole('button', { name: 'Add', exact: true }) });
  await visible(row);
  assert((await row.innerText()).includes(book.author), `Wrong search result for ${book.title}`);
  await row.getByRole('button', { name: 'Add', exact: true }).click();
  await eventually(async () => assert((await bookText(page)).includes(book.title), `Book not added: ${book.title}`), 'Add');
  // Re-enter the owner view to avoid retaining stale search results between additions.
  await goto(page, new URL(page.url()).pathname);
}
async function mainFixture() {
  if (setupError) throw new Error(`Fixture unavailable: ${setupError.message}`);
  if (primary) return primary;
  try {
    const list = await createList('sort');
    for (const book of fixture) await addBook(book);
    primary = list;
    return list;
  } catch (error) { setupError = error; throw error; }
}
async function applySort(list, label, value) {
  await page.getByLabel('Sort by', { exact: true }).selectOption({ label });
  await page.getByRole('button', { name: 'Sort', exact: true }).click();
  await page.waitForURL(url => url.pathname === list.path && url.search === `?sort=${value}`);
  await selection(page, label);
}
async function share(list) {
  await goto(page, list.path);
  await page.getByLabel('Link expires in', { exact: true }).selectOption({ label: '7 days' });
  await page.getByRole('button', { name: 'Create share link', exact: true }).click();
  const field = page.getByLabel('Share link', { exact: true });
  await visible(field);
  let link;
  await eventually(async () => {
    link = await field.inputValue();
    assert(/^https?:\/\//.test(link), 'Share link is not absolute');
    assert(/^\/s\/[^/]+$/.test(new URL(link).pathname), 'Share link has wrong route');
  }, 'Share link');
  // APP_URL can name the same preview through a different internal hostname.
  const url = new URL(link);
  return new URL(url.pathname + url.search, base).href;
}
async function readOnly(p) {
  for (const name of ['Edit', 'Delete list', 'Search', 'Add', 'Create share link']) {
    for (const role of ['button', 'link']) assert(await p.getByRole(role, { name, exact: true }).count() === 0, `Share page has ${name} control`);
  }
  assert(await p.getByLabel('Search books', { exact: true }).count() === 0, 'Share page has search field');
  assert(await p.getByLabel('Sort by', { exact: true }).count() === 0, 'Share page has Sort by');
}

const checks = {
  AC1: async () => {
    const list = await mainFixture();
    await goto(page, list.path);
    await selection(page, 'Date added');
    const select = page.getByLabel('Sort by', { exact: true });
    const options = await select.locator('option').allTextContents();
    assert(JSON.stringify(options.map(normalize)) === JSON.stringify(['Date added', 'Title', 'Author']), `Sort options: ${options}`);
    await visible(page.getByRole('button', { name: 'Sort', exact: true }));
    const heading = await page.getByRole('heading', { name: 'Books', exact: true }).elementHandle();
    const section = await books(page).elementHandle();
    const button = await page.getByRole('button', { name: 'Sort', exact: true }).elementHandle();
    const expires = await page.getByLabel('Link expires in', { exact: true }).elementHandle();
    const search = await page.getByLabel('Search books', { exact: true }).elementHandle();
    const placement = await select.evaluate((control, { heading, section, button, expires, search }) => {
      const before = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      let common = section.parentElement;
      while (common && !(common.contains(control) && common.contains(button))) common = common.parentElement;
      return !section.contains(control) && !section.contains(button) && before(heading, control) && before(heading, button) && before(control, expires) && before(button, expires) && before(control, search) && before(button, search) && Boolean(common && !common.querySelector('h1,[role="heading"][aria-level="1"]'));
    }, { heading, section, button, expires, search });
    assert(placement, 'Sort controls violate Books/common-container/document-order placement');
    await checkBooks(page, added);
  },
  AC2: async () => {
    const list = await mainFixture();
    await goto(page, list.path);
    await applySort(list, 'Title', 'title');
    await checkBooks(page, titleOrder);
    const response = await page.reload({ waitUntil: 'domcontentloaded' });
    assert(response?.status() < 400, 'Reload error status');
    await selection(page, 'Title');
    await checkBooks(page, titleOrder);
  },
  AC3: async () => {
    const list = await mainFixture();
    await goto(page, list.path);
    await applySort(list, 'Author', 'author');
    await checkBooks(page, authorOrder);
    const response = await page.reload({ waitUntil: 'domcontentloaded' });
    assert(response?.status() < 400, 'Reload error status');
    await selection(page, 'Author');
    await checkBooks(page, authorOrder);
  },
  AC4: async () => {
    const list = await mainFixture();
    await goto(page, `${list.path}?sort=title`);
    await selection(page, 'Title');
    await applySort(list, 'Date added', 'added');
    await checkBooks(page, added);
    await noError(page);
    for (const suffix of ['', '?sort=added', '?sort=bogus']) {
      await goto(page, list.path + suffix);
      await selection(page, 'Date added');
      await checkBooks(page, added);
      await noError(page);
    }
  },
  AC5: async () => {
    const list = await mainFixture();
    await goto(page, list.path);
    await applySort(list, 'Title', 'title');
    await checkBooks(page, titleOrder);
    await applySort(list, 'Author', 'author');
    await checkBooks(page, authorOrder);
    const link = await share(list);
    await goto(page, list.path);
    await selection(page, 'Date added');
    await checkBooks(page, added);
    // Leave an active sort choice immediately before ending the session.
    await applySort(list, 'Title', 'title');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/');
    await login();
    await goto(page, list.path);
    await selection(page, 'Date added');
    await checkBooks(page, added);
    for (const suffix of ['', '?sort=title']) {
      await goto(visitor, link + suffix);
      await checkBooks(visitor, added);
      assert(await visitor.getByLabel('Sort by', { exact: true }).count() === 0, 'Anonymous share exposes Sort by');
    }
    await goto(page, list.path);
    await checkBooks(page, added);
  },
  AC6: async () => {
    // This fixture is independent of the populated fixture and sorting controls.
    await goto(page, '/lists');
    if (new URL(page.url()).pathname === '/login') await login();
    const list = await createList('empty');
    for (const suffix of ['', '?sort=author']) {
      await goto(page, list.path + suffix);
      await visible(books(page).getByText('This list has no books yet.', { exact: true }));
      await noError(page);
      await visible(page.getByRole('link', { name: 'Edit', exact: true }));
      await visible(page.getByRole('button', { name: 'Delete list', exact: true }));
      await visible(page.getByLabel('Search books', { exact: true }));
      await visible(page.getByRole('button', { name: 'Create share link', exact: true }));
      await page.getByRole('link', { name: 'Edit', exact: true }).click();
      await visible(page.getByLabel('Name', { exact: true }));
      list.name = `T9 empty edited ${randomUUID()}`;
      await page.getByLabel('Name', { exact: true }).fill(list.name);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.waitForURL(url => url.pathname === list.path);
      await visible(page.getByRole('heading', { level: 1, name: list.name, exact: true }));
      await goto(page, list.path + suffix);
      await page.getByLabel('Search books', { exact: true }).fill('dune');
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await visible(page.getByRole('listitem').filter({ has: page.getByText('Dune', { exact: true }) }).getByRole('button', { name: 'Add', exact: true }));
      await visible(books(page).getByText('This list has no books yet.', { exact: true }));
      const link = await share(list);
      await goto(visitor, link);
      await visible(visitor.getByRole('heading', { level: 1, name: list.name, exact: true }));
      await visible(books(visitor).getByText('This list has no books yet.', { exact: true }));
    }
    await goto(page, `${list.path}?sort=author`);
    await page.getByRole('button', { name: 'Delete list', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/lists');
    assert(await page.getByRole('link', { name: list.name, exact: true }).count() === 0, 'Deleted empty list remains');
    const response = await page.goto(new URL(list.path, base).href, { waitUntil: 'domcontentloaded' });
    assert(response?.status() === 404, 'Deleted empty list is still accessible');
  },
  AC7: async () => {
    const list = await mainFixture();
    const link = await share(list);
    await goto(page, list.path);
    await checkBooks(page, added);
    const ownerText = await bookText(page);
    assert(!/\bSort by\b|\bDate added\b|\bSort\b/.test(ownerText), `Books contains sorting control text: ${ownerText}`);
    await goto(visitor, link);
    await visible(visitor.getByRole('heading', { level: 1, name: list.name, exact: true }));
    await checkBooks(visitor, added);
    assert(ownerText === await bookText(visitor), 'Owner/share Books text differs');
    await readOnly(visitor);
    // T9 AC7 explicitly references T4 AC3: use disjoint books to expose cross-list leakage.
    const second = await createList('share isolation');
    const secondLink = await share(second);
    await goto(visitor, secondLink);
    await visible(visitor.getByRole('heading', { level: 1, name: second.name, exact: true }));
    await visible(books(visitor).getByText('This list has no books yet.', { exact: true }));
    assert(!(await visitor.locator('body').innerText()).includes(list.name), 'Second share leaks first list name');
    for (const book of fixture) assert(!(await bookText(visitor)).includes(book.title), 'Second share leaks first list books');
    await goto(visitor, link);
    await visible(visitor.getByRole('heading', { level: 1, name: list.name, exact: true }));
    await checkBooks(visitor, added);
    assert(!(await visitor.locator('body').innerText()).includes(second.name), 'First share leaks second list name');
    await readOnly(visitor);
  },
  AC8: async () => {
    let axe;
    try { axe = await readFile('/node_modules/axe-core/axe.min.js', 'utf8'); }
    catch (error) { throw new Error(`Not verified: pinned axe-core bundle /node_modules/axe-core/axe.min.js cannot be loaded: ${error.message}`); }
    const list = await mainFixture();
    const failures = [];
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await goto(page, `${list.path}?sort=title`);
      await visible(books(page));
      await visible(page.getByLabel('Sort by', { exact: true }));
      await page.evaluate(async () => { if (document.fonts) await document.fonts.ready; });
      await page.addScriptTag({ content: axe });
      const violations = await page.evaluate(async () => {
        if (!globalThis.axe?.run) throw new Error('Not verified: axe-core injection failed');
        const result = await globalThis.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
        return result.violations.filter(item => ['serious', 'critical'].includes(item.impact)).map(item => ({ id: item.id, impact: item.impact, targets: item.nodes.map(node => node.target) }));
      });
      if (violations.length) failures.push({ width, violations });
    }
    assert(failures.length === 0, `Serious/critical axe violations: ${JSON.stringify(failures)}`);
  },
};
try {
  base = new URL(process.argv[2]).href;
  browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  owner = await browser.newContext();
  anonymous = await browser.newContext();
  for (const context of [owner, anonymous]) {
    context.setDefaultTimeout(12000);
    context.setDefaultNavigationTimeout(20000);
  }
  page = await owner.newPage();
  visitor = await anonymous.newPage();
  await login();
  for (const id of ids) {
    try { await checks[id](); report(id); }
    catch (error) { report(id, error); }
  }
} catch (error) {
  for (const id of ids) report(id, error);
} finally {
  await browser?.close().catch(() => {});
  clearTimeout(deadline);
  process.exitCode = 0;
}
