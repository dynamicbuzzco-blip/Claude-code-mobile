// API integration tests (node --test). Uses a temp data dir and an ephemeral port.
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'barops-test-'));
process.env.DATA_DIR = dir;
process.env.BAROPS_SETUP_CODE = 'open-sesame';
const { createServer, invoiceTotals } = await import('../server.js');

let server; let base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await new Promise((r) => setTimeout(r, 120)); fs.rmSync(dir, { recursive: true, force: true }); });

function client() {
  let cookie = '';
  return async (method, p, body) => {
    const res = await fetch(base + '/api' + p, {
      method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, body: json };
  };
}

const owner = client();
const staffUser = client();
const anon = client();
let staffId; let eventId; let shiftId; let quote;

test('setup creates owner and blocks second setup', async () => {
  let r = await owner('GET', '/auth/status');
  assert.equal(r.body.needsSetup, true);
  assert.equal(r.body.needsSetupCode, true);
  assert.equal((await owner('POST', '/auth/setup', { email: 'a@b.com', password: 'password123', setupCode: 'nope' })).status, 403);
  r = await owner('POST', '/auth/setup', { setupCode: 'open-sesame', email: 'Owner@Test.com', password: 'password123', name: 'Olivia Owner', businessName: 'Test Bar Co' });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.role, 'owner');
  r = await anon('POST', '/auth/setup', { email: 'x@y.com', password: 'password123' });
  assert.equal(r.status, 400);
});

test('unauthenticated requests are rejected', async () => {
  assert.equal((await anon('GET', '/bootstrap')).status, 401);
  assert.equal((await anon('GET', '/c/clients')).status, 401);
});

test('login rejects bad password and accepts good one', async () => {
  const c = client();
  assert.equal((await c('POST', '/auth/login', { email: 'owner@test.com', password: 'nope' })).status, 401);
  assert.equal((await c('POST', '/auth/login', { email: 'owner@test.com', password: 'password123' })).status, 200);
});

test('bootstrap returns default packages and settings', async () => {
  const r = await owner('GET', '/bootstrap');
  assert.equal(r.status, 200);
  assert.ok(r.body.data.packages.length >= 5);
  assert.equal(r.body.settings.businessName, 'Test Bar Co');
});

test('CRUD on clients, events, staff and shifts', async () => {
  const c = await owner('POST', '/c/clients', { name: 'Emily Client', email: 'e@example.com' });
  assert.equal(c.status, 201);
  const ev = await owner('POST', '/c/events', { title: 'Wedding', date: '2030-06-01', startTime: '17:00', endTime: '22:00', clientId: c.body.id, staffNotes: 'Use side door', notes: 'Secret margin note' });
  eventId = ev.body.id;
  const st = await owner('POST', '/c/staff', { name: 'Sam Staff', payRate: 25 });
  staffId = st.body.id;
  const sh = await owner('POST', '/c/shifts', { eventId, staffId, role: 'bartender', start: '2030-06-01T16:00', end: '2030-06-01T22:45', status: 'assigned' });
  shiftId = sh.body.id;
  const upd = await owner('PATCH', '/c/clients/' + c.body.id, { phone: '555' });
  assert.equal(upd.body.phone, '555');
  assert.equal(upd.body.name, 'Emily Client');
  assert.equal((await owner('GET', '/c/nope')).status, 404);
});

test('invoices get numbers, public tokens; quote converts to invoice number', async () => {
  const q = await owner('POST', '/c/invoices', { kind: 'quote', items: [{ desc: 'Bar', qty: 100, rate: 30 }], taxRate: 10, serviceChargePct: 20, eventId });
  assert.match(q.body.number, /^Q-/);
  assert.ok(q.body.publicToken.length > 20);
  quote = q.body;
  const t = invoiceTotals(q.body);
  assert.equal(t.subtotal, 3000); assert.equal(t.service, 600); assert.equal(t.tax, 300); assert.equal(t.total, 3900);
  const conv = await owner('PUT', '/c/invoices/' + q.body.id, { ...q.body, kind: 'invoice' });
  assert.match(conv.body.number, /^INV-/);
  assert.equal(conv.body.quoteNumber, q.body.number);
  assert.equal(conv.body.publicToken, q.body.publicToken);
});

test('public document view and quote acceptance', async () => {
  const q = await owner('POST', '/c/invoices', { kind: 'quote', items: [{ desc: 'Bar', qty: 1, rate: 500 }] });
  const pub = await anon('GET', '/public/doc/' + q.body.publicToken);
  assert.equal(pub.status, 200);
  assert.equal(pub.body.invoice.totals.total, 500);
  assert.equal(pub.body.invoice.publicToken, undefined);
  assert.equal((await anon('POST', `/public/doc/${q.body.publicToken}/accept`, { signature: '' })).status, 400);
  const acc = await anon('POST', `/public/doc/${q.body.publicToken}/accept`, { signature: 'Emily Client' });
  assert.equal(acc.body.invoice.status, 'accepted');
  assert.equal((await anon('GET', '/public/doc/bogus')).status, 404);
});

test('public inquiry creates a lead; honeypot is ignored', async () => {
  assert.equal((await anon('POST', '/public/inquiry', { name: 'Lead Person' })).status, 400);
  assert.equal((await anon('POST', '/public/inquiry', { name: 'Lead Person', email: 'l@x.com', guestCount: '80', eventDate: '2030-01-01' })).status, 200);
  await anon('POST', '/public/inquiry', { name: 'Bot', email: 'b@x.com', website_url: 'spam' });
  const leads = (await owner('GET', '/c/leads')).body;
  assert.equal(leads.length, 1);
  assert.equal(leads[0].guestCount, 80);
  assert.equal(leads[0].stage, 'new');
});

test('staff login sees only own scope and can confirm/clock shifts', async () => {
  const u = await owner('POST', '/users', { email: 'sam@test.com', password: 'staffpass1', name: 'Sam Staff', role: 'staff', staffId });
  assert.equal(u.status, 201);
  assert.equal((await staffUser('POST', '/auth/login', { email: 'sam@test.com', password: 'staffpass1' })).status, 200);
  const b = await staffUser('GET', '/bootstrap');
  assert.equal(b.body.user.role, 'staff');
  assert.equal(b.body.data.invoices, undefined);
  assert.equal(b.body.data.clients, undefined);
  assert.equal(b.body.data.events.length, 1);
  assert.equal(b.body.data.events[0].notes, undefined, 'internal notes hidden');
  assert.equal(b.body.data.events[0].staffNotes, 'Use side door');
  assert.equal(b.body.settings.taxRate, undefined);
  assert.equal((await staffUser('GET', '/c/clients')).status, 403);
  assert.equal((await staffUser('POST', '/c/events', { title: 'x' })).status, 403);
  assert.equal((await staffUser('PUT', '/settings', { businessName: 'hacked' })).status, 403);
  let r = await staffUser('PATCH', '/me/shifts/' + shiftId, { action: 'confirm' });
  assert.equal(r.body.status, 'confirmed');
  r = await staffUser('PATCH', '/me/shifts/' + shiftId, { action: 'clockIn' });
  assert.ok(r.body.clockIn);
  r = await staffUser('PATCH', '/me/shifts/' + shiftId, { action: 'clockOut', tips: 42.5 });
  assert.equal(r.body.tips, 42.5);
  r = await staffUser('PATCH', '/me/profile', { unavailableDates: ['2030-07-04'], payRate: 999 });
  assert.deepEqual(r.body.unavailableDates, ['2030-07-04']);
  assert.equal(r.body.payRate, 25, 'staff cannot change own pay');
});

test('staff cannot create managers; owner can', async () => {
  assert.equal((await staffUser('POST', '/users', { email: 'm@x.com', password: 'password123', role: 'manager' })).status, 403);
  const m = await owner('POST', '/users', { email: 'mgr@test.com', password: 'password123', role: 'manager', name: 'Max' });
  assert.equal(m.body.role, 'manager');
});

test('bulk create keeps client ids and numbers invoices', async () => {
  const cid = crypto.randomUUID();
  const r = await owner('POST', '/bulk', { items: { clients: [{ id: cid, name: 'Bulk Client' }], invoices: [{ kind: 'quote', clientId: cid, items: [] }] } });
  assert.equal(r.body.created, 2);
  const invs = (await owner('GET', '/c/invoices')).body.filter((i) => i.clientId === cid);
  assert.match(invs[0].number, /^Q-/);
  assert.ok(invs[0].publicToken);
  assert.equal((await staffUser('POST', '/bulk', { items: {} })).status, 403);
});

test('deleting an event cascades its shifts', async () => {
  await owner('DELETE', '/c/events/' + eventId);
  const shifts = (await owner('GET', '/c/shifts')).body;
  assert.equal(shifts.filter((s) => s.eventId === eventId).length, 0);
});

test('non-JSON state-changing requests are rejected (CSRF guard)', async () => {
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' });
  assert.equal(res.status, 415);
});

test('static files are served and path traversal is blocked', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /BarOps/);
  const bad = await fetch(base + '/..%2fserver.js');
  assert.notEqual(bad.status, 200);
});

test('backup export omits password hashes and sessions', async () => {
  const r = await owner('GET', '/export');
  assert.equal(r.body.sessions, undefined);
  assert.ok(r.body.users.every((u) => u.passwordHash === undefined));
});
