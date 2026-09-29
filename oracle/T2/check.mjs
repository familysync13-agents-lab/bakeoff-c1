import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = new URL(process.argv[2] || 'http://preview:8080');
const origin = base.origin;
const unique = (prefix = 'List') => `${prefix}-${randomUUID()}`;
let browser;
let startupError;
try { browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'], timeout: 30000 }); }
catch (e) { startupError = e; }
const accounts = {
  alice: { email: 'alice@example.test', password: 'Correct-Horse-1' },
  bob: { email: 'bob@example.test', password: 'Battery-Staple-2' }
};
const button = (p, name) => p.getByRole('button', { name, exact: true });
const field = (p, name) => p.getByLabel(name, { exact: true });
const pathname = p => new URL(p.url()).pathname;
async function at(p, path) { await p.waitForURL(u => u.pathname === path, { timeout: 15000 }); }
async function visible(l) { await l.waitFor({ state: 'visible', timeout: 15000 }); }
async function absent(l) { assert.equal(await l.count(), 0, 'Unexpected matching element'); }
async function go(p, path) { const r = await p.goto(new URL(path, origin).href, { waitUntil: 'domcontentloaded', timeout: 20000 }); await p.locator('body').waitFor(); return r; }
async function login(p, account = accounts.alice) {
  await go(p, '/login'); await visible(field(p, 'Email'));
  await field(p, 'Email').fill(account.email); await field(p, 'Password').fill(account.password);
  await button(p, 'Sign in').click(); await at(p, '/lists');
  await visible(p.getByRole('heading', { name: 'My lists', exact: true })); await visible(button(p, 'Sign out'));
}
async function signup(p) {
  const account = { email: `${unique('verifier')}@example.test`, password: 'Verifier-Password-123!' };
  await go(p, '/signup'); await visible(field(p, 'Name'));
  await field(p, 'Name').fill(unique('Reader')); await field(p, 'Email').fill(account.email);
  await field(p, 'Password').fill(account.password); await button(p, 'Sign up').click();
  await at(p, '/lists'); await visible(p.getByRole('heading', { name: 'My lists', exact: true }));
  await visible(button(p, 'Sign out')); return account;
}
async function heading(p, name) { await visible(p.locator('h1').filter({ hasText: name })); assert.equal((await p.locator('h1').innerText()).trim(), name); }
async function create(p, name = unique()) {
  await go(p, '/lists/new'); await visible(field(p, 'Name')); await field(p, 'Name').fill(name);
  await button(p, 'Create list').click();
  await p.waitForURL(u => /^\/lists\/[^/]+$/.test(u.pathname) && u.pathname !== '/lists/new', { timeout: 15000 });
  await heading(p, name); return { path: pathname(p), name };
}
async function edit(p, list, name) {
  await go(p, list.path); await heading(p, list.name);
  const link = p.getByRole('link', { name: 'Edit', exact: true }); await visible(link);
  assert.equal(new URL(await link.getAttribute('href'), p.url()).pathname, `${list.path}/edit`);
  await link.click(); await at(p, `${list.path}/edit`); await visible(field(p, 'Name'));
  assert.equal(await field(p, 'Name').inputValue(), list.name);
  await field(p, 'Name').fill(name); await button(p, 'Save').click(); await at(p, list.path);
  await heading(p, name); list.name = name;
}
async function signout(p) { await visible(button(p, 'Sign out')); await button(p, 'Sign out').click(); await at(p, '/'); }
async function index(p) {
  await go(p, '/lists'); await visible(p.getByRole('heading', { name: 'My lists', exact: true }));
  return (await p.getByRole('link').evaluateAll(ls => ls.map(l => ({ text: l.textContent.trim(), href: new URL(l.href).pathname })).filter(l => /^\/lists\/[^/]+$/.test(l.href) && l.href !== '/lists/new'))).sort((a,b) => a.href.localeCompare(b.href));
}
async function noName(p, name) { assert.equal(await p.getByText(name, { exact: false }).filter({ visible: true }).count(), 0, 'Private list name is visible'); }
async function deleted(p, list) { const r = await go(p, list.path); assert.equal(r?.status(), 404, 'Deleted list must return HTTP 404'); }

const checks = {
AC1: async actor => { const p = await actor(); await signup(p); },
AC2: async actor => {
  await login(await actor()); const p = await actor(); await go(p, '/login');
  await field(p, 'Email').fill(accounts.alice.email); await field(p, 'Password').fill(unique('Wrong'));
  await button(p, 'Sign in').click(); await visible(p.getByRole('alert').filter({ hasText: 'Invalid' }));
  await at(p, '/login'); assert.equal(await button(p, 'Sign out').isVisible(), false);
  await go(p, '/lists'); await at(p, '/login');
},
AC3: async actor => {
  const p = await actor(); await signup(p); const list = await create(p);
  await signout(p); await go(p, '/lists'); await at(p, '/login'); await noName(p, list.name);
},
AC4: async actor => {
  const p = await actor(); await signup(p);
  const entry = p.getByRole('link', { name: 'New list', exact: true }).or(button(p, 'New list'));
  await visible(entry); await entry.click(); await at(p, '/lists/new');
  const list = await create(p, 'X'); await index(p);
  const link = p.getByRole('link', { name: list.name, exact: true }); await visible(link); assert.equal(await link.count(), 1);
  assert.equal(new URL(await link.getAttribute('href'), p.url()).pathname, list.path);
},
AC5: async actor => {
  const p = await actor(); await signup(p); const list = await create(p); const before = await index(p);
  for (const mode of ['create', 'edit']) {
    for (const value of ['', unique().padEnd(101, 'x')]) {
      const path = mode === 'create' ? '/lists/new' : `${list.path}/edit`;
      await go(p, path); await visible(field(p, 'Name')); await field(p, 'Name').fill(value);
      await button(p, mode === 'create' ? 'Create list' : 'Save').click();
      await visible(p.getByRole('alert').filter({ hasText: /name/i })); await visible(field(p, 'Name'));
      assert.deepEqual(await index(p), before, 'Invalid submission changed index');
      await go(p, list.path); await heading(p, list.name);
    }
  }
  const boundary = unique('Boundary').padEnd(100, 'x'); await create(p, boundary);
  await edit(p, list, unique('Renamed').padEnd(100, 'y')); await p.reload(); await heading(p, list.name);
},
AC6: async actor => {
  const p = await actor(); const account = await signup(p); const list = await create(p);
  await edit(p, list, unique('Renamed')); await p.reload({ waitUntil: 'domcontentloaded' }); await heading(p, list.name);
  await signout(p); await login(p, account); await go(p, list.path); await heading(p, list.name);
},
AC7: async actor => {
  const p = await actor(); await signup(p); const list = await create(p); let dialogSeen = false;
  p.on('dialog', async d => { dialogSeen = true; await d.dismiss().catch(() => {}); });
  await button(p, 'Delete list').click(); await at(p, '/lists'); assert.equal(dialogSeen, false, 'Delete opened browser dialog');
  await index(p); await absent(p.getByRole('link', { name: list.name, exact: true }));
  await deleted(p, list); const bob = await actor(); await login(bob, accounts.bob); await deleted(bob, list);
  await deleted(await actor(), list);
},
AC8: async actor => {
  const owner = await actor(); await login(owner); const list = await create(owner); const p = await actor();
  for (const path of ['/lists', '/lists/new', list.path, `${list.path}/edit`]) {
    const r = await go(p, path); if (![401,403,404].includes(r?.status())) await at(p, '/login');
    await noName(p, list.name);
  }
},
AC9: async actor => {
  const owner = await actor(); await login(owner); const list = await create(owner);
  const bob = await actor(); await login(bob, accounts.bob); await index(bob); await noName(bob, list.name);
  for (const path of [list.path, `${list.path}/edit`]) {
    const r = await go(bob, path);
    if (![403,404].includes(r?.status())) await bob.waitForURL(u => u.pathname !== path, { timeout: 15000 });
    await noName(bob, list.name);
  }
},
AC10: async actor => {
  const owner = await actor(); await login(owner); const list = await create(owner);
  const bob = await actor(); await login(bob, accounts.bob); const anon = await actor(); await go(anon, '/login');
  let recording = false; let records = [];
  const pending = [];
  owner.on('request', r => {
    if (recording && new URL(r.url()).origin === origin && !['GET','HEAD','OPTIONS'].includes(r.method())) {
      const target = records;
      pending.push((async () => target.push({ url: r.url(), method: r.method(), body: r.postDataBuffer(), headers: await r.allHeaders(), cookies: await owner.context().cookies(r.url()) }))());
    }
  });
  async function replay(requests, p) {
    assert.ok(requests.length, 'No state-changing browser requests captured');
    // Prime session-specific anti-forgery cookies without assuming an API endpoint.
    await go(p, '/lists/new');
    for (const r of requests) {
      const cookies = await p.context().cookies(r.url); const headers = {};
      const decode = v => { try { return decodeURIComponent(v); } catch { return v; } };
      for (const [key, value] of Object.entries(r.headers)) {
        if (['cookie','host','content-length'].includes(key.toLowerCase())) continue;
        const matched = r.cookies.find(c => value === c.value || decode(value) === decode(c.value));
        if (matched) {
          const replacement = cookies.find(c => c.name === matched.name);
          assert.ok(replacement, `Missing replay-session cookie for ${key}`);
          headers[key] = value === matched.value ? replacement.value : decode(replacement.value);
        } else headers[key] = value;
      }
      const response = await p.context().request.fetch(r.url, { method: r.method, headers, ...(r.body === null ? {} : { data: r.body }), timeout: 15000, maxRedirects: 0, failOnStatusCode: false });
      await response.dispose(); await go(owner, list.path); await heading(owner, list.name);
    }
  }
  recording = true; await edit(owner, list, unique('CapturedRename')); recording = false; await Promise.all(pending);
  const renameRequests = records; await edit(owner, list, unique('ProtectedBaseline'));
  await replay(renameRequests, bob); await replay(renameRequests, anon);
  records = [];
  // Intercept only the owner's outgoing deletion, preserving the live target for hostile replays.
  // The request event still records the exact browser-produced request before interception.
  await owner.route('**/*', async route => {
    const r = route.request();
    if (new URL(r.url()).origin === origin && !['GET','HEAD','OPTIONS'].includes(r.method())) await route.abort('blockedbyclient');
    else await route.continue();
  });
  recording = true;
  const captured = owner.waitForRequest(r => new URL(r.url()).origin === origin && !['GET','HEAD','OPTIONS'].includes(r.method()), { timeout: 15000 });
  await button(owner, 'Delete list').click({ noWaitAfter: true }); await captured;
  await owner.waitForTimeout(300); recording = false; await Promise.all(pending); await owner.unroute('**/*');
  await go(owner, list.path); await heading(owner, list.name);
  await replay(records, bob); await replay(records, anon);
},
AC11: async actor => {
  const p = await actor(); await signup(p); const list = await create(p);
  await button(p, 'Delete list').click(); await at(p, '/lists'); await go(p, list.path);
  await visible(p.getByText(list.name, { exact: true })); await visible(p.getByText('Deleted', { exact: true }));
  await visible(button(p, 'Restore list')); await button(p, 'Restore list').click();
  await at(p, list.path); await heading(p, list.name); await p.reload({ waitUntil: 'domcontentloaded' }); await heading(p, list.name);
  assert.equal(await button(p, 'Restore list').isVisible(), false);
  await index(p); await visible(p.getByRole('link', { name: list.name, exact: true }));
}
};
for (const [criterion, check] of Object.entries(checks)) {
  const contexts = []; let timer;
  try {
    if (startupError) throw startupError;
    const actor = async () => {
      const context = await browser.newContext(); contexts.push(context);
      context.setDefaultTimeout(15000); context.setDefaultNavigationTimeout(20000);
      return context.newPage();
    };
    await Promise.race([check(actor), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Criterion exceeded 48-second budget')), 48000); })]);
    console.log(JSON.stringify({ criterion, result: 'pass' }));
  } catch (e) { console.log(JSON.stringify({ criterion, result: 'fail', detail: String(e.message || e).slice(0, 700) })); }
  finally { clearTimeout(timer); await Promise.allSettled(contexts.map(c => c.close())); }
}
await browser?.close();
process.exitCode = 0;
