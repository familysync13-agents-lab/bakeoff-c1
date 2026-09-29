import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Only Playwright and Node built-ins are imported. See NOTES.md for AC8's
// missing test-harness resource; absence of real axe-core is a failure.
const base = process.argv[2]?.replace(/\/$/, '');
const runID = randomUUID();
const added = ['The Hobbit', 'Dune', 'Animal Farm'];
const titleOrder = ['Animal Farm', 'Dune', 'The Hobbit'];
const authorOrder = ['Dune', 'Animal Farm', 'The Hobbit'];
const records = {
  'The Hobbit': { query: 'tolkien', author: 'J.R.R. Tolkien', year: '1937' },
  Dune: { query: 'dune', author: 'Frank Herbert', year: '1965' },
  'Animal Farm': { query: 'orwell', author: 'George Orwell', year: '1945' },
};
let browser;
let fixture;
let serial = 0;
function assert(condition, message) { if (!condition) throw new Error(message); }
async function poll(fn, message, timeout = 7000) {
  const until = Date.now() + timeout;
  let last;
  do {
    try { const value = await fn(); if (value) return value; } catch (e) { last = e; }
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < until);
  throw new Error(`${message}${last ? `: ${last.message}` : ''}`);
}
async function visible(locator) { await locator.waitFor({ state: 'visible' }); return locator; }
function heading(page) { return page.getByRole('heading', { name: 'Books', exact: true }); }
function books(page) {
  return heading(page).locator('xpath=ancestor::*[self::section or @role="region"][1]');
}
async function goto(page, path) {
  const response = await page.goto(new URL(path, base).href, { waitUntil: 'domcontentloaded' });
  assert(response && response.status() < 400, `GET ${path}: HTTP ${response?.status() ?? 'no response'}`);
  return response;
}
async function ready(page, name) {
  await visible(page.getByRole('heading', { name, exact: true, level: 1 }));
  await visible(heading(page));
  await visible(books(page));
}
async function noError(page) {
  const alerts = await page.getByRole('alert').all();
  for (const alert of alerts) {
    if (await alert.isVisible()) assert(!/\b(error|invalid|unavailable|failed|failure|forbidden|not found)\b/i.test(await alert.innerText()), `Error alert: ${await alert.innerText()}`);
  }
  const text = await page.locator('body').innerText();
  assert(!/\b(internal server error|application error|something went wrong|unexpected error|invalid sort|unknown sort|unsupported sort|bad request)\b/i.test(text), 'Page displays an error');
}
async function login(page) {
  await goto(page, '/login');
  await page.getByLabel('Email', { exact: true }).fill('alice@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Correct-Horse-1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/lists');
  await visible(page.getByRole('button', { name: 'Sign out', exact: true }));
}
async function createList(page, kind) {
  const name = `T9 ${kind} ${runID} ${++serial}`;
  await goto(page, '/lists/new');
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Create list', exact: true }).click();
  await page.waitForURL(url => /^\/lists\/[^/]+$/.test(url.pathname) && url.pathname !== '/lists/new');
  await ready(page, name);
  return { name, path: new URL(page.url()).pathname };
}
async function addBook(page, title) {
  await page.getByLabel('Search books', { exact: true }).fill(records[title].query);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  // The interface specifies an accessible name but does not prescribe a role.
  const namedResults = page.getByRole('region', { name: 'Search results', exact: true })
    .or(page.getByRole('list', { name: 'Search results', exact: true }))
    .or(page.getByRole('group', { name: 'Search results', exact: true }))
    .or(page.locator('[aria-label="Search results"]'));
  // aria-labelledby also names generic result containers; resolve through the DOM
  // if no standard role/aria-label locator finds the named element.
  await poll(async () => {
    if (await namedResults.count()) return true;
    return page.evaluate(() => [...document.querySelectorAll('[aria-labelledby]')].some(el =>
      el.getAttribute('aria-labelledby').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim() === 'Search results'));
  }, 'Search results container did not appear');
  let container = namedResults.first();
  if (!(await container.count())) {
    const ids = await page.evaluate(() => [...document.querySelectorAll('[aria-labelledby]')]
      .filter(el => el.getAttribute('aria-labelledby').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim() === 'Search results')
      .map(el => el.getAttribute('aria-labelledby')));
    container = page.locator(`[aria-labelledby=${JSON.stringify(ids[0])}]`).first();
  }
  const row = container.getByRole('listitem').filter({ has: page.getByText(title, { exact: true }) });
  await visible(row);
  await row.getByRole('button', { name: 'Add', exact: true }).click();
  await visible(books(page).getByText(title, { exact: true }));
}
async function mainFixture(page) {
  if (!fixture) {
    const candidate = await createList(page, 'sorting');
    for (const title of added) {
      await addBook(page, title);
      // Separate additions even on stores with whole-second timestamps.
      await new Promise(resolve => setTimeout(resolve, 1100));
    }
    fixture = candidate;
  }
  await goto(page, fixture.path);
  await ready(page, fixture.name);
  return fixture;
}
async function checkBooks(page, expected) {
  await poll(async () => { await checkBooksOnce(page, expected); return true; }, 'Books did not reach the expected state');
}
async function checkBooksOnce(page, expected) {
  const section = books(page);
  await visible(section);
  for (const title of expected) await visible(section.getByText(title, { exact: true }));
  const observed = await section.evaluate((section, data) => {
    const normalize = text => text.replace(/\s+/g, ' ').trim();
    const all = [...section.querySelectorAll('*')];
    const rows = [];
    const titleNodes = [];
    for (const title of data.expected) {
      const matches = all.filter(el => normalize(el.textContent || '') === title &&
        ![...el.children].some(child => normalize(child.textContent || '') === title));
      if (matches.length !== 1) return { error: `${title}: expected one title, found ${matches.length}` };
      const node = matches[0];
      titleNodes.push({ title, node });
      let row = node.closest('li, [role="listitem"], article');
      if (!row || !section.contains(row)) {
        row = node.parentElement;
        while (row && row !== section && !row.textContent.includes(data.records[title].author)) row = row.parentElement;
      }
      if (!row || row === section || !section.contains(row)) return { error: `${title}: cannot identify its book item` };
      const text = normalize(row.innerText);
      if (!text.includes(data.records[title].author)) return { error: `${title}: missing author in its book item` };
      if (!new RegExp(`\\b${data.records[title].year}\\b`).test(text)) return { error: `${title}: missing first publish year in its book item` };
      if (data.expected.some(other => other !== title && [...row.querySelectorAll('*')].some(el => normalize(el.textContent || '') === other)))
        return { error: `${title}: book item combines multiple titles` };
      rows.push(row);
    }
    const listItems = [...section.querySelectorAll('li, [role="listitem"]')].filter(el =>
      !el.parentElement.closest('li, [role="listitem"]') || !section.contains(el.parentElement.closest('li, [role="listitem"]')));
    if (listItems.length && listItems.length !== data.expected.length) return { error: `Expected ${data.expected.length} book items, found ${listItems.length}` };
    titleNodes.sort((a, b) => a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    return { order: titleNodes.map(entry => entry.title), distinct: new Set(rows).size };
  }, { expected, records });
  assert(!observed.error, observed.error);
  assert(observed.distinct === expected.length, 'Books do not have distinct items');
  assert(JSON.stringify(observed.order) === JSON.stringify(expected), `Book order: ${JSON.stringify(observed.order)}, expected ${JSON.stringify(expected)}`);
}
async function selection(page, label) {
  const select = page.getByLabel('Sort by', { exact: true });
  await visible(select);
  assert(await select.evaluate(el => el.tagName === 'SELECT'), 'Sort by is not a select');
  await poll(async () => await select.locator('option:checked').innerText() === label, `Expected selected option ${label}`);
}
async function applySort(page, list, label, value, expected) {
  await page.getByLabel('Sort by', { exact: true }).selectOption({ label });
  await page.getByRole('button', { name: 'Sort', exact: true }).click();
  await page.waitForURL(url => url.pathname === list.path && url.search === `?sort=${value}` && !url.hash);
  await selection(page, label);
  await checkBooks(page, expected);
}
async function share(page) {
  await page.getByLabel('Link expires in', { exact: true }).selectOption({ label: '7 days' });
  await page.getByRole('button', { name: 'Create share link', exact: true }).click();
  const field = page.getByLabel('Share link', { exact: true });
  await visible(field);
  const value = await poll(async () => {
    const value = await field.inputValue();
    return /^https?:\/\//.test(value) ? value : false;
  }, 'Share link is not an absolute URL');
  const url = new URL(value);
  assert(/^\/s\/[^/]+$/.test(url.pathname), 'Share link has unexpected path');
  // APP_URL may use a different internal alias from the gate's baseURL.
  return new URL(url.pathname + url.search, base).href;
}
async function sectionText(page) {
  return books(page).evaluate(section => {
    const clone = section.cloneNode(true);
    for (const h of clone.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')) {
      if (h.textContent.trim() === 'Books') h.remove();
    }
    return clone.textContent.replace(/\s+/g, ' ').trim();
  });
}
async function noShareControls(page) {
  for (const name of ['Edit', 'Delete list', 'Search', 'Add', 'Create share link', 'Sort']) {
    for (const role of ['button', 'link']) {
      assert(await page.getByRole(role, { name, exact: true }).count() === 0, `Share page has ${name} control`);
    }
  }
  for (const label of ['Sort by', 'Search books']) assert(await page.getByLabel(label, { exact: true }).count() === 0, `Share page has ${label} control`);
}

const checks = {
  AC1: async ({ owner }) => {
    const page = await owner();
    await mainFixture(page);
    await selection(page, 'Date added');
    const select = page.getByLabel('Sort by', { exact: true });
    assert(JSON.stringify(await select.locator('option').allTextContents()) === JSON.stringify(['Date added', 'Title', 'Author']), 'Sort options differ from the three specified options');
    await visible(page.getByRole('button', { name: 'Sort', exact: true }));
    await visible(page.getByLabel('Link expires in', { exact: true }));
    await visible(page.getByLabel('Search books', { exact: true }));
    const placement = await select.evaluate((select) => {
      const h = [...document.querySelectorAll('h2,[role="heading"][aria-level="2"]')].find(el => el.textContent.trim() === 'Books');
      const section = h?.closest('section,[role="region"]');
      const button = [...document.querySelectorAll('button,input[type="submit"]')].find(el => (el.textContent || el.value).trim() === 'Sort');
      function byLabel(name) {
        const label = [...document.querySelectorAll('label')].find(el => el.textContent.trim() === name);
        return label?.control || [...document.querySelectorAll('[aria-label]')].find(el => el.getAttribute('aria-label') === name) ||
          [...document.querySelectorAll('[aria-labelledby]')].find(el => el.getAttribute('aria-labelledby').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim() === name);
      }
      const expires = byLabel('Link expires in'), search = byLabel('Search books');
      const before = (a, b) => !!(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING));
      let container = section?.parentElement;
      while (container && !(container.contains(select) && container.contains(button))) container = container.parentElement;
      return !!(section && button && !section.contains(select) && !section.contains(button) &&
        before(h, select) && before(h, button) && before(select, expires) && before(button, expires) &&
        before(select, search) && before(button, search) && container && !container.querySelector('h1,[role="heading"][aria-level="1"]'));
    });
    assert(placement, 'Sort controls violate Books/Share/Search placement or common-container requirement');
    await checkBooks(page, added);
  },
  AC2: async ({ owner }) => {
    const page = await owner(), list = await mainFixture(page);
    await applySort(page, list, 'Title', 'title', titleOrder);
    const response = await page.reload({ waitUntil: 'domcontentloaded' });
    assert(response?.status() < 400, 'Title reload returned an error status');
    await selection(page, 'Title');
    await checkBooks(page, titleOrder);
    assert(new URL(page.url()).search === '?sort=title', 'Reload lost title URL');
  },
  AC3: async ({ owner }) => {
    const page = await owner(), list = await mainFixture(page);
    await applySort(page, list, 'Author', 'author', authorOrder);
    const response = await page.reload({ waitUntil: 'domcontentloaded' });
    assert(response?.status() < 400, 'Author reload returned an error status');
    await selection(page, 'Author');
    await checkBooks(page, authorOrder);
    assert(new URL(page.url()).search === '?sort=author', 'Reload lost author URL');
  },
  AC4: async ({ owner }) => {
    const page = await owner(), list = await mainFixture(page);
    await goto(page, `${list.path}?sort=title`);
    await selection(page, 'Title');
    await applySort(page, list, 'Date added', 'added', added);
    await noError(page);
    // Re-request the applied URL so its document HTTP status is checked too.
    for (const query of ['?sort=added', '', '?sort=bogus']) {
      await goto(page, list.path + query);
      await selection(page, 'Date added');
      await checkBooks(page, added);
      await noError(page);
    }
  },
  AC5: async ({ owner, anonymous }) => {
    const page = await owner(), list = await mainFixture(page);
    await applySort(page, list, 'Title', 'title', titleOrder);
    await applySort(page, list, 'Author', 'author', authorOrder);
    const link = await share(page);
    await goto(page, list.path);
    await selection(page, 'Date added');
    await checkBooks(page, added);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/');
    await login(page);
    await goto(page, list.path);
    await selection(page, 'Date added');
    await checkBooks(page, added);
    const visitor = await anonymous();
    for (const url of [link, `${link}?sort=title`]) {
      await goto(visitor, url);
      await ready(visitor, list.name);
      await checkBooks(visitor, added);
      assert(await visitor.getByLabel('Sort by', { exact: true }).count() === 0, 'Share page exposes Sort by');
    }
    await goto(page, list.path);
    await checkBooks(page, added);
  },
  AC6: async ({ owner, anonymous }) => {
    const page = await owner();
    for (const query of ['', '?sort=author']) {
      // Independent empty lists let every control actually be exercised.
      const list = await createList(page, 'empty');
      await goto(page, list.path + query);
      await ready(page, list.name);
      await visible(books(page).getByText('This list has no books yet.', { exact: true }));
      await noError(page);
      await page.getByRole('link', { name: 'Edit', exact: true }).click();
      await page.waitForURL(url => url.pathname === `${list.path}/edit`);
      const renamed = `${list.name} edited`;
      await page.getByLabel('Name', { exact: true }).fill(renamed);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await page.waitForURL(url => url.pathname === list.path);
      await ready(page, renamed);
      await goto(page, list.path + query);
      const link = await share(page);
      const visitor = await anonymous();
      await goto(visitor, link);
      await ready(visitor, renamed);
      await visible(books(visitor).getByText('This list has no books yet.', { exact: true }));
      await goto(page, list.path + query);
      await addBook(page, 'Dune');
      await goto(page, list.path + query);
      await checkBooks(page, ['Dune']);
      await page.getByRole('button', { name: 'Delete list', exact: true }).click();
      await page.waitForURL(url => url.pathname === '/lists');
      await visible(page.getByRole('heading', { name: 'My lists', exact: true }));
      assert(await page.getByRole('link', { name: renamed, exact: true }).count() === 0, 'Deleted empty-test list still appears');
      const response = await page.goto(new URL(list.path, base).href, { waitUntil: 'domcontentloaded' });
      assert(response?.status() === 404, 'Deleted list does not return 404');
    }
  },
  AC7: async ({ owner, anonymous }) => {
    const page = await owner(), list = await mainFixture(page);
    const link = await share(page);
    await goto(page, list.path);
    await checkBooks(page, added);
    const ownerText = await sectionText(page);
    assert(!/\bSort by\b|\bDate added\b|\bSort\b/.test(ownerText), 'Books section contains sort control text');
    const visitor = await anonymous();
    await goto(visitor, link);
    await ready(visitor, list.name);
    await checkBooks(visitor, added);
    await noShareControls(visitor);
    assert(ownerText === await sectionText(visitor), 'Owner/share Books section text differs');
    // The T4 AC1/AC3 consequences explicitly incorporated by T9 AC7.
    const other = await createList(page, 'share isolation');
    const otherLink = await share(page);
    await goto(visitor, otherLink);
    await ready(visitor, other.name);
    await visible(books(visitor).getByText('This list has no books yet.', { exact: true }));
    assert(!(await visitor.locator('body').innerText()).includes(list.name), 'Second share exposes first list name');
    for (const title of added) assert(await books(visitor).getByText(title, { exact: true }).count() === 0, 'Second share exposes first list books');
    await noShareControls(visitor);
    await goto(visitor, link);
    await ready(visitor, list.name);
    await checkBooks(visitor, added);
    assert(!(await visitor.locator('body').innerText()).includes(other.name), 'First share exposes second list name');
  },
  AC8: async ({ owner }) => {
    const page = await owner(), list = await mainFixture(page);
    // A genuine axe-core bundle must be supplied by the harness. Never replace
    // the stated metric with a homegrown accessibility approximation.
    let source;
    if (process.env.AXE_CORE_PATH) source = await readFile(process.env.AXE_CORE_PATH, 'utf8');
    const failures = [];
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await goto(page, `${list.path}?sort=title`);
      await ready(page, list.name);
      await selection(page, 'Title');
      await checkBooks(page, titleOrder);
      if (source) await page.addScriptTag({ content: source });
      assert(await page.evaluate(() => typeof window.axe?.run === 'function' && typeof window.axe?.version === 'string'),
        'Cannot measure AC8: axe-core is unavailable; provide AXE_CORE_PATH (see NOTES.md)');
      const violations = await page.evaluate(async () => {
        await document.fonts.ready;
        const result = await window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        });
        return result.violations.filter(v => ['serious', 'critical'].includes(v.impact))
          .map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) }));
      });
      if (violations.length) failures.push({ width, violations });
    }
    assert(!failures.length, `axe-core violations: ${JSON.stringify(failures)}`);
  },
};

for (const [criterion, check] of Object.entries(checks)) {
  const contexts = [];
  let timer;
  let finished = false;
  try {
    await Promise.race([
      (async () => {
        assert(base && /^https?:\/\//.test(base), 'Usage: node check.mjs <baseURL>');
        browser ||= await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'], timeout: 12000 });
        async function actor(authenticated) {
          assert(!finished, 'Criterion timed out');
          const context = await browser.newContext();
          contexts.push(context);
          if (finished) { await context.close(); throw new Error('Criterion timed out'); }
          context.setDefaultTimeout(7000);
          context.setDefaultNavigationTimeout(12000);
          const page = await context.newPage();
          if (authenticated) await login(page);
          return page;
        }
        await check({ owner: () => actor(true), anonymous: () => actor(false) });
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Criterion exceeded 65 seconds')), 65000); }),
    ]);
    console.log(JSON.stringify({ criterion, result: 'pass' }));
  } catch (error) {
    console.log(JSON.stringify({ criterion, result: 'fail', detail: String(error?.message || error).slice(0, 1800) }));
  } finally {
    finished = true;
    clearTimeout(timer);
    await Promise.allSettled(contexts.map(context => context.close()));
  }
}
if (browser) await browser.close().catch(() => {});
process.exitCode = 0;
