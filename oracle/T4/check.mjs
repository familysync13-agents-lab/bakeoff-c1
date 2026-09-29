import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
const base = new URL(process.argv[2]).origin;
const suffix = randomUUID().slice(0, 12);
const reported = new Set();
const emit = (criterion, error) => {
  if (reported.has(criterion)) return;
  reported.add(criterion);
  console.log(JSON.stringify(error ? { criterion, result: 'fail', detail: String(error.message || error).slice(0, 450) } : { criterion, result: 'pass' }));
};
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const check = async (id, fn) => { try { await fn(); emit(id); } catch (e) { emit(id, e); } };
// A hard deadline also covers a hung browser/network operation; always emit all six results.
const deadline = setTimeout(() => {
  for (let i = 1; i <= 6; i++) emit(`AC${i}`, new Error('Run exceeded 9 minute deadline'));
  process.exit(0);
}, 540000);
let browser, owner, anon, op, ap;
const go = async (page, url) => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
const heading = (page, name) => page.getByRole('heading', { level: 1, name, exact: true });
const visible = async locator => locator.waitFor({ state: 'visible', timeout: 10000 });
const body = async page => (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
async function create(name) {
  await go(op, `${base}/lists/new`);
  await op.getByLabel('Name', { exact: true }).fill(name);
  await op.getByRole('button', { name: 'Create list', exact: true }).click();
  await op.waitForURL(url => /^\/lists\/[^/]+$/.test(url.pathname) && url.pathname !== '/lists/new');
  await visible(heading(op, name));
  return { name, url: op.url() };
}
async function share(list, duration = '7 days') {
  await go(op, list.url);
  const select = op.getByLabel('Link expires in', { exact: true });
  await visible(select);
  await select.selectOption({ label: duration });
  await op.getByRole('button', { name: 'Create share link', exact: true }).click();
  const field = op.getByLabel('Share link', { exact: true });
  await visible(field);
  await op.waitForFunction(() => {
    const els = [...document.querySelectorAll('input,textarea')];
    return els.some(e => /^https?:\/\/[^/]+\/s\/.+/.test(e.value));
  });
  const url = await field.inputValue();
  assert(await field.evaluate(e => e.readOnly), 'Share link field is not read-only');
  const parsed = new URL(url);
  assert(parsed.origin === base && /^\/s\/[^/]+$/.test(parsed.pathname), 'Share link must be an absolute app /s/{token} URL');
  return url;
}
async function booksText(page) {
  const h = page.getByRole('heading', { name: 'Books', exact: true });
  await visible(h);
  return h.evaluate(el => {
    const section = el.closest('section,[role="region"]');
    if (section) return section.innerText.replace(el.innerText, '').replace(/\s+/g, ' ').trim();
    const range = document.createRange();
    range.setStartAfter(el);
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')];
    const next = headings.find(e => !!(el.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING));
    if (next) range.setEndBefore(next); else range.setEndAfter(document.body.lastChild);
    return range.toString().replace(/\s+/g, ' ').trim();
  });
}
async function search() {
  await op.getByLabel('Search books', { exact: true }).fill('dune');
  await op.getByRole('button', { name: 'Search', exact: true }).click();
  // Accessible name is contractual; getByLabel also supports aria-label/aria-labelledby on generic containers.
  const region = op.getByLabel('Search results', { exact: true });
  await visible(region);
  const first = region.getByRole('listitem').filter({ has: op.getByRole('button', { name: 'Add', exact: true }) }).first();
  await visible(first);
  return first.getByRole('button', { name: 'Add', exact: true });
}
async function denied(url, name, statuses = [403, 404, 410]) {
  const response = await go(ap, url);
  assert(response && statuses.includes(response.status()), `Expected ${statuses.join('/')} for share request, got ${response?.status()}`);
  assert(!(await response.text()).includes(name), 'Denied HTTP response discloses list name');
  assert(!(await body(ap)).includes(name), 'Denied page discloses list name');
}
async function capture(action) {
  const records = [], pending = [];
  const listener = request => {
    if (new URL(request.url()).origin !== base || ['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return;
    pending.push((async () => records.push({ url: request.url(), method: request.method(), data: request.postDataBuffer(), headers: await request.allHeaders(), cookies: await owner.cookies(request.url()) }))());
  };
  const blocker = route => {
    const r = route.request();
    return new URL(r.url()).origin === base && !['GET', 'HEAD', 'OPTIONS'].includes(r.method()) ? route.abort('blockedbyclient') : route.continue();
  };
  await op.route('**/*', blocker);
  op.on('request', listener);
  try {
    const sent = op.waitForEvent('requestfailed', { predicate: r => new URL(r.url()).origin === base && !['GET', 'HEAD', 'OPTIONS'].includes(r.method()), timeout: 10000 });
    await Promise.all([action(), sent]);
    await Promise.all(pending);
    assert(records.length > 0, 'No owner mutation request captured');
    return records;
  } finally { op.off('request', listener); await op.unroute('**/*', blocker); }
}
const decode = value => { try { return decodeURIComponent(value); } catch { return value; } };
async function replay(records) {
  for (const record of records) {
    const cookies = await anon.cookies(record.url);
    const headers = {};
    for (const [key, value] of Object.entries(record.headers)) {
      if (['cookie', 'host', 'content-length'].includes(key.toLowerCase())) continue;
      const matching = record.cookies.find(c => value === c.value || decode(value) === decode(c.value));
      headers[key] = matching ? (cookies.find(c => c.name === matching.name)?.value || '') : value;
    }
    const response = await anon.request.fetch(record.url, { method: record.method, headers, data: record.data ?? undefined, timeout: 15000, failOnStatusCode: false });
    await response.dispose();
  }
}
try {
  browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  owner = await browser.newContext(); anon = await browser.newContext();
  op = await owner.newPage(); ap = await anon.newPage();
  for (const page of [op, ap]) { page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(15000); }
  await go(op, `${base}/login`);
  await op.getByLabel('Email', { exact: true }).fill('alice@example.test');
  await op.getByLabel('Password', { exact: true }).fill('Correct-Horse-1');
  await op.getByRole('button', { name: 'Sign in', exact: true }).click();
  await op.waitForURL(`${base}/lists`);
  await visible(op.getByRole('heading', { name: 'My lists', exact: true }));
  let expiry;
  // Start expiry before all other checks; creation timestamp is conservatively after URL receipt.
  try {
    const list = await create(`T4 expiry ${suffix}`);
    const url = await share(list, '1 minute');
    const created = Date.now();
    await go(ap, url); await visible(heading(ap, list.name));
    expiry = { list, url, created };
  } catch (e) { emit('AC4', e); }
  let primary, primaryURL, bookText;
  await check('AC1', async () => {
    primary = await create(`T4 books ${suffix}`);
    const add = await search();
    await Promise.all([
      op.waitForResponse(r => new URL(r.url()).origin === base && !['GET', 'HEAD', 'OPTIONS'].includes(r.request().method()) && r.status() < 400),
      add.click()
    ]);
    // Reload removes search-result text so the expected book content is persisted list content.
    await go(op, primary.url);
    bookText = await booksText(op);
    assert(bookText && !/^(no books|no books yet|this list is empty)[.!]?$/i.test(bookText), 'No persisted book content');
    primaryURL = await share(primary);
    await go(ap, primaryURL); await visible(heading(ap, primary.name));
    assert((await body(ap)).includes(bookText), 'Shared page is missing persisted title/author content');
    for (const name of ['Edit', 'Delete list', 'Search', 'Add', 'Create share link']) {
      for (const role of ['button', 'link', 'menuitem']) {
        const controls = ap.getByRole(role, { name, exact: true });
        for (let i = 0; i < await controls.count(); i++) assert(!await controls.nth(i).isVisible(), `Shared page exposes ${name}`);
      }
    }
    assert(!await ap.getByLabel('Search books', { exact: true }).isVisible(), 'Shared page exposes book search');
  });
  await check('AC2', async () => {
    const list = await create(`T4 tamper ${suffix}`);
    const url = new URL(await share(list));
    await go(ap, url.href); await visible(heading(ap, list.name));
    const token = url.pathname.slice(3);
    // Exercise every token position, including the signature tail, without assuming an encoding.
    assert(token.length <= 4096, 'Token too long to exhaustively mutate within run budget');
    const variants = [...token].map((char, i) => token.slice(0, i) + (char === 'A' ? 'B' : 'A') + token.slice(i + 1));
    variants.push(token.slice(0, -1), token + 'A');
    // HTTP requests share the anonymous browser cookie jar. Bounded concurrency avoids a long serial scan.
    let index = 0;
    await Promise.all(Array.from({ length: 8 }, async () => {
      while (index < variants.length) {
        const value = variants[index++];
        const response = await anon.request.get(`${base}/s/${value}`, { timeout: 10000, failOnStatusCode: false });
        try {
          assert([403, 404, 410].includes(response.status()), `Tampered token accepted (HTTP ${response.status()})`);
          assert(!(await response.text()).includes(list.name), 'Tampered token discloses list name');
        } finally { await response.dispose(); }
      }
    }));
  });
  await check('AC3', async () => {
    assert(primary && primaryURL && bookText, 'Book-bearing shared-list setup failed');
    const other = await create(`T4 other ${suffix}`);
    const otherURL = await share(other);
    await go(ap, primaryURL); await visible(heading(ap, primary.name));
    assert(!(await body(ap)).includes(other.name), 'First link shows second list');
    assert((await body(ap)).includes(bookText), 'First link lost its books');
    await go(ap, otherURL); await visible(heading(ap, other.name));
    const text = await body(ap);
    assert(!text.includes(primary.name) && !text.includes(bookText), 'Second link leaks first list or books');
  });
  await check('AC5', async () => {
    const list = await create(`T4 replay ${suffix}`);
    const url = await share(list);
    await go(ap, url); await visible(heading(ap, list.name));
    await go(op, list.url); const before = await booksText(op);
    await op.getByRole('link', { name: 'Edit', exact: true }).click();
    await op.getByLabel('Name', { exact: true }).fill(`T4 attacked ${suffix}`);
    const rename = await capture(() => op.getByRole('button', { name: 'Save', exact: true }).click());
    await go(op, list.url);
    const add = await search();
    const adding = await capture(() => add.click());
    await go(op, list.url);
    const deleting = await capture(() => op.getByRole('button', { name: 'Delete list', exact: true }).click());
    for (const requests of [rename, adding, deleting]) {
      await replay(requests);
      await go(op, list.url); await visible(heading(op, list.name));
      assert(await booksText(op) === before, 'Anonymous replay changed book content');
      await go(op, `${base}/lists`);
      await visible(op.getByRole('link', { name: list.name, exact: true }));
    }
    await go(ap, url); await visible(heading(ap, list.name));
  });
  await check('AC6', async () => {
    const list = await create(`T4 delete ${suffix}`);
    const url = await share(list);
    await go(ap, url); await visible(heading(ap, list.name));
    await go(op, list.url);
    await op.getByRole('button', { name: 'Delete list', exact: true }).click();
    await op.waitForURL(`${base}/lists`);
    await denied(url, list.name, [404, 410]);
  });
  if (!reported.has('AC4')) await check('AC4', async () => {
    assert(expiry, 'Expiry setup failed');
    await new Promise(resolve => setTimeout(resolve, Math.max(0, expiry.created + 71000 - Date.now())));
    await denied(expiry.url, expiry.list.name);
  });
} catch (e) {
  for (let i = 1; i <= 6; i++) emit(`AC${i}`, e);
} finally {
  for (let i = 1; i <= 6; i++) if (!reported.has(`AC${i}`)) emit(`AC${i}`, new Error('Check did not complete'));
  await browser?.close().catch(() => {});
  clearTimeout(deadline);
  process.exitCode = 0;
}
