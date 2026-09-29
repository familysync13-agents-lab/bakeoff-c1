import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const base = (process.argv[2] || '').replace(/\/$/, '');
const unique = label => `T6 ${label} ${randomUUID()}`;
const norm = s => s.replace(/\s+/g, ' ').trim();
const label = (p, name) => p.getByLabel(name, { exact: true });
const button = (p, name) => p.getByRole('button', { name, exact: true });
async function poll(fn, message, ms = 8000) {
  const end = Date.now() + ms;
  let last;
  do {
    try { if (await fn()) return; } catch (e) { last = e; }
    await new Promise(r => setTimeout(r, 100));
  } while (Date.now() < end);
  throw new Error(`${message}${last ? `: ${last.message}` : ''}`);
}
async function heading(p, name) {
  await p.getByRole('heading', { name, exact: true, level: 1 }).waitFor();
}
async function login(p) {
  await p.goto(`${base}/login`);
  await label(p, 'Email').fill('alice@example.test');
  await label(p, 'Password').fill('Correct-Horse-1');
  await button(p, 'Sign in').click();
  await p.waitForURL(u => u.pathname === '/lists');
  await p.getByRole('heading', { name: 'My lists', exact: true }).waitFor();
}
async function create(p, name, description) {
  await p.goto(`${base}/lists/new`);
  await label(p, 'Name').fill(name);
  await label(p, 'Description').waitFor();
  if (description !== undefined) await label(p, 'Description').fill(description);
  await button(p, 'Create list').click();
  await p.waitForURL(u => /^\/lists\/[^/]+$/.test(u.pathname) && u.pathname !== '/lists/new');
  await heading(p, name);
  return p.url();
}
async function edit(p) {
  await p.getByRole('link', { name: 'Edit', exact: true }).click();
  await label(p, 'Description').waitFor();
}
async function save(p, url, name) {
  await button(p, 'Save').click();
  await p.waitForURL(url);
  await heading(p, name);
}
async function description(p, name, value) {
  await heading(p, name);
  // Read rendered text in document order, ignoring hidden nodes and markup.
  // This permits layout wrappers without requiring a particular HTML tag.
  await poll(async () => p.getByRole('heading', { name, exact: true, level: 1 }).evaluate((h, expected) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let text = '', node;
    while ((node = walker.nextNode())) {
      if (h.contains(node) || !(h.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      const el = node.parentElement;
      if (!el || el.closest('script,style,noscript')) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      if (!range.getBoundingClientRect().width || !range.getBoundingClientRect().height) continue;
      if (getComputedStyle(el).visibility !== 'visible') continue;
      text += node.textContent + ' ';
      if (text.replace(/\s+/g, ' ').trim().length >= expected.length) break;
    }
    return text.replace(/\s+/g, ' ').trim() === expected;
  }, norm(value)), 'Current description is not rendered as text directly below the h1');
}
async function share(p) {
  await label(p, 'Link expires in').selectOption({ label: '7 days' });
  await button(p, 'Create share link').click();
  await poll(async () => /^https?:\/\//.test(await label(p, 'Share link').inputValue()), 'Share link was not produced');
  const url = new URL(await label(p, 'Share link').inputValue());
  assert.match(url.pathname, /^\/s\/[^/]+$/);
  // APP_URL may differ from the only reachable preview origin.
  return `${base}${url.pathname}${url.search}${url.hash}`;
}
async function alertDescription(p) {
  await p.getByRole('alert').filter({ hasText: /description/i }).first().waitFor();
}
async function noPlaceholder(p, name) {
  await heading(p, name);
  const text = await p.locator('body').innerText();
  assert(!/\b(?:no description(?: provided| available| yet)?|description\s*:\s*(?:none|n\/a|not set)?\s*$|add (?:a )?description|description goes here|enter (?:a )?description|description is empty)\b/im.test(text), 'Empty-description placeholder text is visible');
}

const cases = {
  AC1: async (p) => {
    const name = unique('current'), first = unique('Original description'), second = unique('Edited description');
    const url = await create(p, name, first);
    await description(p, name, first);
    await p.reload(); await description(p, name, first);
    await edit(p);
    assert.equal(await label(p, 'Description').inputValue(), first);
    await label(p, 'Description').fill(second);
    await save(p, url, name); await description(p, name, second);
    await p.reload(); await description(p, name, second);
    assert(!(await p.locator('body').innerText()).includes(first), 'Old description remains visible');
  },
  AC2: async (p, actor) => {
    const name = unique('shared'), value = unique('Shared description');
    await create(p, name, value);
    const url = await share(p);
    const anon = await actor();
    await anon.goto(url); await description(anon, name, value);
    await anon.reload(); await description(anon, name, value);
  },
  AC3: async (p, actor) => {
    const invalidName = unique('invalid create');
    const tooLong = 'X'.repeat(501), boundary = 'Y'.repeat(500);
    await p.goto(`${base}/lists/new`);
    await label(p, 'Name').fill(invalidName);
    await label(p, 'Description').fill(tooLong);
    await button(p, 'Create list').click();
    await alertDescription(p);
    // A separate page checks persisted state without destroying the rejected form.
    const inspect = await p.context().newPage();
    await inspect.goto(`${base}/lists`);
    assert.equal(await inspect.getByRole('link', { name: invalidName, exact: true }).count(), 0, 'Invalid create saved a list');
    const name = unique('boundary');
    const url = await create(p, name, boundary);
    await description(p, name, boundary);
    await p.reload(); await description(p, name, boundary);
    await edit(p);
    const invalidRename = unique('invalid rename');
    await label(p, 'Name').fill(invalidRename);
    await label(p, 'Description').fill(tooLong);
    await button(p, 'Save').click(); await alertDescription(p);
    await inspect.goto(url); await heading(inspect, name); await description(inspect, name, boundary);
    await edit(inspect);
    assert.equal(await label(inspect, 'Description').inputValue(), boundary, 'Invalid edit changed stored description');
    assert.equal(await label(inspect, 'Name').inputValue(), name, 'Invalid edit changed stored name');
    const editedBoundary = 'Z'.repeat(500);
    await label(inspect, 'Description').fill(editedBoundary);
    await save(inspect, url, name); await description(inspect, name, editedBoundary);
    await inspect.reload(); await description(inspect, name, editedBoundary);
  },
  AC4: async (p, actor) => {
    const name = unique('optional');
    const url = await create(p, name);
    await noPlaceholder(p, name);
    await p.reload(); await noPlaceholder(p, name);
    const shared = await share(p), anon = await actor();
    await anon.goto(shared); await noPlaceholder(anon, name);
    await edit(p);
    assert.equal(await label(p, 'Description').inputValue(), '', 'Absent description did not remain empty');
    const renamed = unique('optional renamed');
    await label(p, 'Name').fill(renamed);
    await save(p, url, renamed); await noPlaceholder(p, renamed);
    await p.reload(); await noPlaceholder(p, renamed);
    await anon.reload(); await noPlaceholder(anon, renamed);
    await edit(p);
    assert.equal(await label(p, 'Description').inputValue(), '', 'Editing populated absent description');
  }
};

for (const [criterion, run] of Object.entries(cases)) {
  let browser, timer;
  try {
    await Promise.race([
      (async () => {
        assert(base && /^https?:\/\//.test(base), 'Pass a baseURL argument');
        browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'], timeout: 15000 });
        const actor = async () => {
          const context = await browser.newContext();
          context.setDefaultTimeout(8000); context.setDefaultNavigationTimeout(15000);
          return context.newPage();
        };
        const owner = await actor(); await login(owner); await run(owner, actor);
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Criterion exceeded 120 seconds')), 120000); })
    ]);
    console.log(JSON.stringify({ criterion, result: 'pass' }));
  } catch (error) {
    console.log(JSON.stringify({ criterion, result: 'fail', detail: String(error.message || error).slice(0, 700) }));
  } finally {
    clearTimeout(timer);
    if (browser) await browser.close().catch(() => {});
  }
}
process.exitCode = 0;
