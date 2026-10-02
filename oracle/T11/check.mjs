import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = process.argv[2]?.replace(/\/$/, '');
let browser, setupError;
try {
  if (!base) throw new Error('Missing baseURL argument');
  new URL(base);
  const { chromium } = await import('playwright');
  browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
} catch (e) { setupError = `HARNESS: ${e.message}`; }
const unique = tag => `T11 ${tag} ${randomUUID()}`;
const path = p => new URL(p.url()).pathname;
const field = (p, name) => p.getByLabel(name, { exact: true });
const button = (p, name) => p.getByRole('button', { name, exact: true });
async function eventually(fn, message, timeout = 12000) {
  const end = Date.now() + timeout;
  let last;
  do {
    try { return await fn(); } catch (e) { last = e; }
    await new Promise(r => setTimeout(r, 120));
  } while (Date.now() < end);
  throw new Error(`${message}: ${last?.message || 'timed out'}`);
}
async function go(p, route) {
  const response = await p.goto(new URL(route, base).href, { waitUntil: 'domcontentloaded' });
  assert(!response || response.status() < 400, `GET ${route} returned ${response?.status()}`);
}
async function login(p) {
  await go(p, '/login');
  await field(p, 'Email').fill('alice@example.test');
  await field(p, 'Password').fill('Correct-Horse-1');
  await button(p, 'Sign in').click();
  await p.waitForURL(u => u.pathname === '/lists');
}
async function heading(p, name) {
  const h = p.getByRole('heading', { level: 1, name, exact: true });
  await h.waitFor({ state: 'visible' });
  return h;
}
async function shown(p, name, description) {
  const h = await heading(p, name);
  const d = p.getByText(description, { exact: true });
  await d.waitFor({ state: 'visible' });
  await eventually(async () => {
    const placement = await h.evaluate((title, expected) => {
      // Find a visible, exact-text element; wrapper markup is allowed.
      const candidates = [...document.querySelectorAll('body *')].filter(el =>
        el instanceof HTMLElement && el.innerText === expected &&
        el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
      return candidates.some(el => {
        if (!(title.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
        const range = document.createRange();
        range.setStartAfter(title); range.setEndBefore(el);
        const fragment = range.cloneContents();
        fragment.querySelectorAll('script,style,[hidden],[aria-hidden="true"]').forEach(n => n.remove());
        // Read individual text nodes, never concatenate structured text.
        const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) return false;
        const a = title.getBoundingClientRect(), b = el.getBoundingClientRect();
        return b.top >= a.bottom - 2 && !el.matches('input,textarea,[contenteditable="true"]') &&
          !el.querySelector('input,textarea,[contenteditable="true"]');
      });
    }, description);
    assert(placement, 'Description is not plain text directly below h1');
  }, 'Description placement');
}
async function create(p, name, description) {
  await go(p, '/lists/new');
  await field(p, 'Name').fill(name);
  await field(p, 'Description').fill(description);
  await button(p, 'Create list').click();
  await p.waitForURL(u => /^\/lists\/[^/]+$/.test(u.pathname) && u.pathname !== '/lists/new');
  await heading(p, name);
  return path(p);
}
async function edit(p, route, expected) {
  await go(p, `${route}/edit`);
  await field(p, 'Description').waitFor({ state: 'visible' });
  assert.equal(await field(p, 'Description').inputValue(), expected, 'Description pre-fill differs');
}
async function save(p, route) {
  await button(p, 'Save').click();
  await p.waitForURL(u => u.pathname === route);
}
async function share(p) {
  await button(p, 'Create share link').click();
  const f = field(p, 'Share link');
  await f.waitFor({ state: 'visible' });
  let url;
  await eventually(async () => {
    url = new URL(await f.inputValue());
    assert(/^\/s\/[^/]+$/.test(url.pathname), 'Share link must be /s/{token}');
  }, 'Share link URL');
  assert(await f.evaluate(el => el.readOnly), 'Share link is not read-only');
  // APP_URL may use a different internal hostname; visit the same path on the gate origin.
  return url.pathname + url.search;
}
async function emptyDescription(p, name) {
  const h = await heading(p, name);
  const problems = await h.evaluate(title => {
    const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
    const bad = [];
    // Inspect the title region, including wrappers, up to the first subsequent control or heading.
    const all = [...document.querySelectorAll('body *')];
    for (const el of all.slice(all.indexOf(title) + 1)) {
      if (title.contains(el) || !visible(el)) continue;
      if (el.matches('a,button,input,select,textarea,h1,h2,h3,[role="button"],[role="heading"]')) break;
      if (el instanceof HTMLElement && !el.children.length) {
        const text = el.innerText.trim();
        if (/description/i.test(text) || /^(none|n\/a|not provided|—|-)$/i.test(text)) bad.push(text);
        if (el.matches('p,[role="paragraph"]') && !text) bad.push('empty paragraph');
      }
    }
    // Also detect explicitly identified visible description placeholders anywhere after h1.
    for (const el of all) {
      if (!(title.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) || !visible(el)) continue;
      if (/description/i.test(`${el.id} ${el.getAttribute('data-testid') || ''} ${el.getAttribute('aria-label') || ''}`) &&
          !el.matches('input,textarea,label')) bad.push('visible description region');
    }
    return bad;
  });
  assert.deepEqual(problems, [], `Empty description placeholder: ${problems.join(', ')}`);
}
async function invalid(p, submit, route) {
  await button(p, submit).click();
  await eventually(async () => {
    const alerts = p.getByRole('alert');
    let found = false;
    for (let i = 0; i < await alerts.count(); i++) {
      if (await alerts.nth(i).isVisible() && /description/i.test(await alerts.nth(i).innerText())) found = true;
    }
    assert(found, 'No visible role=alert mentioning description');
  }, 'Description validation');
  assert.equal(path(p), route, 'Invalid submission did not redisplay the form');
  await field(p, 'Description').waitFor({ state: 'visible' });
  assert(await button(p, submit).isVisible(), 'Form submit control missing');
}
const tests = {
  AC1: async (p) => {
    const name = unique('280'), description = 'A'.repeat(139) + ' ' + 'B'.repeat(140);
    await create(p, name, description);
    await shown(p, name, description);
    await p.reload({ waitUntil: 'domcontentloaded' });
    await shown(p, name, description);
  },
  AC2: async (p) => {
    const name = unique('edits'), route = await create(p, name, '');
    let current = '';
    for (const next of ['First short description.', 'A different short description.']) {
      await edit(p, route, current);
      await field(p, 'Description').fill(next);
      await save(p, route);
      await shown(p, name, next);
      await edit(p, route, next);
      current = next;
    }
  },
  AC3: async (p, actor) => {
    const name = unique('shared'), description = 'Shared description visible to an anonymous reader.';
    await create(p, name, description);
    const route = await share(p), anonymous = await actor();
    await go(anonymous, route);
    await shown(anonymous, name, description);
    for (const role of ['button', 'link']) {
      const controls = anonymous.getByRole(role, { name: /\b(edit|save|rename)\b/i });
      for (let i = 0; i < await controls.count(); i++) assert(!await controls.nth(i).isVisible(), 'Share page offers an edit control');
    }
    for (const label of ['Name', 'Description']) {
      const controls = field(anonymous, label);
      for (let i = 0; i < await controls.count(); i++) assert(!await controls.nth(i).isVisible(), `Share page offers ${label} editing`);
    }
    assert.equal(await anonymous.locator('[contenteditable="true"]:visible').count(), 0, 'Share page has editable content');
  },
  AC4: async (p, actor) => {
    const name = unique('empty'), route = await create(p, name, '');
    await emptyDescription(p, name);
    const shared = await share(p), anonymous = await actor();
    await go(anonymous, shared);
    await emptyDescription(anonymous, name);
    await edit(p, route, '');
    assert.equal(await field(p, 'Name').inputValue(), name);
    await save(p, route);
    await emptyDescription(p, name);
    await p.reload({ waitUntil: 'domcontentloaded' });
    await emptyDescription(p, name);
    await edit(p, route, '');
    await anonymous.reload({ waitUntil: 'domcontentloaded' });
    await emptyDescription(anonymous, name);
  },
  AC5: async (p) => {
    const rejectedName = unique('rejected'), acceptedName = unique('boundary');
    const tooLong = 'X'.repeat(501), boundary = 'Y'.repeat(500);
    await go(p, '/lists/new');
    await field(p, 'Name').fill(rejectedName);
    await field(p, 'Description').fill(tooLong);
    await invalid(p, 'Create list', '/lists/new');
    await go(p, '/lists');
    await p.getByRole('heading', { name: 'My lists', exact: true }).waitFor();
    assert.equal(await p.getByRole('link', { name: rejectedName, exact: true }).count(), 0, 'Invalid create saved a list');
    const route = await create(p, acceptedName, boundary);
    await shown(p, acceptedName, boundary);
    await p.reload({ waitUntil: 'domcontentloaded' });
    await shown(p, acceptedName, boundary);
    await edit(p, route, boundary);
    const changedName = unique('must not save');
    await field(p, 'Name').fill(changedName);
    await field(p, 'Description').fill(tooLong);
    await invalid(p, 'Save', `${route}/edit`);
    await go(p, route);
    await shown(p, acceptedName, boundary);
    await edit(p, route, boundary);
    assert.equal(await field(p, 'Name').inputValue(), acceptedName, 'Invalid edit changed name');
    const editedBoundary = 'Z'.repeat(500);
    await field(p, 'Description').fill(editedBoundary);
    await save(p, route);
    await shown(p, acceptedName, editedBoundary);
    await p.reload({ waitUntil: 'domcontentloaded' });
    await shown(p, acceptedName, editedBoundary);
    await edit(p, route, editedBoundary);
  }
};
for (const [criterion, test] of Object.entries(tests)) {
  const contexts = [];
  let timer;
  try {
    if (setupError) throw new Error(setupError);
    const actor = async () => {
      const context = await browser.newContext(); contexts.push(context);
      context.setDefaultTimeout(12000); context.setDefaultNavigationTimeout(20000);
      return context.newPage();
    };
    await Promise.race([
      (async () => { const p = await actor(); await login(p); await test(p, actor); })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Criterion exceeded 100 seconds')), 100000); })
    ]);
    console.log(JSON.stringify({ criterion, result: 'pass' }));
  } catch (e) {
    let detail = e.message || String(e);
    if (/net::ERR_(CONNECTION_REFUSED|NAME_NOT_RESOLVED|ADDRESS_UNREACHABLE)|browser has been closed|Target page, context or browser has been closed/i.test(detail)) detail = `HARNESS: ${detail}`;
    console.log(JSON.stringify({ criterion, result: 'fail', detail: detail.slice(0, 1400) }));
  } finally {
    clearTimeout(timer);
    await Promise.allSettled(contexts.map(c => c.close()));
  }
}
await browser?.close().catch(() => {});
process.exitCode = 0;
