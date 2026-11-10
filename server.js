// BarOps — all-in-one business management for mobile bartending & beverage catering.
// Zero-dependency Node.js server: static hosting, auth, JSON persistence, REST API.
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const MAX_BODY = 2 * 1024 * 1024;
const SECURE_COOKIES = process.env.SECURE_COOKIES === '1';

// Collections managed through the generic CRUD API (owner/manager only).
const COLLECTIONS = [
  'clients', 'leads', 'events', 'invoices', 'staff', 'shifts',
  'inventory', 'expenses', 'tasks', 'packages', 'activities',
];

const DEFAULT_SETTINGS = {
  businessName: 'My Mobile Bar Co.',
  tagline: 'Craft cocktails, anywhere.',
  email: '',
  phone: '',
  address: '',
  website: '',
  currency: 'USD',
  taxRate: 8.25,
  serviceChargePct: 18,
  depositPct: 50,
  invoicePrefix: 'INV-',
  quotePrefix: 'Q-',
  nextInvoiceNumber: 1001,
  nextQuoteNumber: 1001,
  paymentTermsDays: 14,
  paymentLinkUrl: '',
  paymentInstructions: 'Pay by card, Zelle, Venmo or check. Deposit secures your date.',
  terms: 'A non-refundable deposit is required to reserve your date. Final balance is due 7 days before the event. Final guest count is due 14 days prior. We reserve the right to refuse service to any guest who appears intoxicated or underage.',
  travelFeePerMile: 1.25,
  freeTravelMiles: 25,
  drinksFirstHour: 2,
  drinksPerHourAfter: 1,
  defaultShiftPadMinutes: 60,
  payrollPeriodDays: 14,
};

const DEFAULT_PACKAGES = [
  { name: 'Beer & Wine Bar', pricingType: 'per_person', price: 18, minimum: 900, description: 'Licensed bartender service, beer & wine pour, cups, ice, napkins, garnish.', category: 'Bar service' },
  { name: 'Full Open Bar', pricingType: 'per_person', price: 32, minimum: 1600, description: 'Full bar with 2 signature cocktails, mixers, garnishes, ice, disposable drinkware.', category: 'Bar service' },
  { name: 'Dry Hire (BYO Alcohol)', pricingType: 'per_hour', price: 75, minimum: 300, description: 'Bartender(s), mobile bar, mixers & ice — client supplies alcohol.', category: 'Bar service' },
  { name: 'Mocktail & Zero-Proof Bar', pricingType: 'per_person', price: 14, minimum: 700, description: 'Craft mocktails, fresh juices, sodas and garnish bar.', category: 'Beverage' },
  { name: 'Espresso / Coffee Cart', pricingType: 'per_hour', price: 150, minimum: 450, description: 'Barista-staffed espresso cart with lattes, cold brew and alt milks.', category: 'Beverage' },
  { name: 'Champagne Toast', pricingType: 'per_person', price: 5, minimum: 0, description: 'Sparkling wine pour for the toast, flutes included.', category: 'Add-on' },
  { name: 'Glassware Upgrade', pricingType: 'per_person', price: 3, minimum: 0, description: 'Real glassware instead of disposable cups.', category: 'Add-on' },
  { name: 'Additional Bartender', pricingType: 'per_hour', price: 45, minimum: 0, description: 'Extra bartender per hour.', category: 'Staffing' },
];

// ---------------------------------------------------------------- persistence
let db;
let saveTimer = null;

function emptyDb() {
  const d = { version: 1, users: [], sessions: {}, settings: { ...DEFAULT_SETTINGS } };
  for (const c of COLLECTIONS) d[c] = [];
  const now = new Date().toISOString();
  d.packages = DEFAULT_PACKAGES.map((p) => ({ id: uid(), active: true, createdAt: now, updatedAt: now, ...p }));
  return d;
}

function loadDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db.settings = { ...DEFAULT_SETTINGS, ...(db.settings || {}) };
    db.sessions = db.sessions || {};
    db.users = db.users || [];
    for (const c of COLLECTIONS) db[c] = db[c] || [];
  } else {
    db = emptyDb();
    saveNow();
  }
}

function saveNow() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}

function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; try { saveNow(); } catch (e) { console.error('save failed', e); } }, 50);
}

function uid() { return crypto.randomUUID(); }
function token() { return crypto.randomBytes(24).toString('base64url'); }

// ---------------------------------------------------------------- auth helpers
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(pw, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(pw, salt, 64);
  const known = Buffer.from(hash, 'hex');
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function currentUser(req) {
  const sid = parseCookies(req).sid;
  if (!sid) return null;
  const s = db.sessions[sid];
  if (!s) return null;
  if (s.expires < Date.now()) { delete db.sessions[sid]; save(); return null; }
  const user = db.users.find((u) => u.id === s.userId && !u.disabled);
  return user || null;
}

function sessionCookie(sid, maxAgeSec) {
  return `sid=${sid}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSec}${SECURE_COOKIES ? '; Secure' : ''}`;
}

function publicUser(u) {
  return u && { id: u.id, email: u.email, name: u.name, role: u.role, staffId: u.staffId || null };
}

const isManager = (u) => u && (u.role === 'owner' || u.role === 'manager');

// Simple in-memory login throttle.
const loginAttempts = new Map();
function throttled(key) {
  const now = Date.now();
  const rec = loginAttempts.get(key) || { count: 0, first: now };
  if (now - rec.first > 15 * 60 * 1000) { rec.count = 0; rec.first = now; }
  rec.count += 1;
  loginAttempts.set(key, rec);
  return rec.count > 20;
}

// ---------------------------------------------------------------- http helpers
function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && body !== null && !Buffer.isBuffer(body);
  const payload = isObj ? JSON.stringify(body) : body;
  res.writeHead(status, {
    'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(payload);
}

const fail = (res, status, message) => send(res, status, { error: message });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return fail(res, 403, 'Forbidden');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // SPA fallback for unknown non-asset paths
      if (!path.extname(rel)) return serveStatic(req, res, '/index.html');
      return fail(res, 404, 'Not found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(file).pipe(res);
  });
}

// ---------------------------------------------------------------- domain helpers
function nextDocNumber(kind) {
  const s = db.settings;
  if (kind === 'quote') { const n = s.nextQuoteNumber++; return `${s.quotePrefix}${n}`; }
  const n = s.nextInvoiceNumber++;
  return `${s.invoicePrefix}${n}`;
}

function invoiceTotals(inv) {
  const items = Array.isArray(inv.items) ? inv.items : [];
  const subtotal = items.reduce((a, it) => a + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0);
  const taxable = items.filter((it) => it.taxable !== false).reduce((a, it) => a + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0);
  const discount = Number(inv.discount) || 0;
  const service = (subtotal - discount) * ((Number(inv.serviceChargePct) || 0) / 100);
  const tax = Math.max(0, taxable - discount) * ((Number(inv.taxRate) || 0) / 100);
  const total = Math.max(0, subtotal - discount + service + tax);
  const paid = (inv.payments || []).reduce((a, p) => a + (Number(p.amount) || 0), 0);
  return { subtotal, discount, service, tax, total, paid, balance: Math.max(0, total - paid) };
}

function publicInvoiceView(inv) {
  const client = db.clients.find((c) => c.id === inv.clientId) || null;
  const event = db.events.find((e) => e.id === inv.eventId) || null;
  const s = db.settings;
  return {
    invoice: {
      id: inv.id, number: inv.number, kind: inv.kind, issueDate: inv.issueDate, dueDate: inv.dueDate,
      items: inv.items, taxRate: inv.taxRate, serviceChargePct: inv.serviceChargePct, discount: inv.discount,
      depositPct: inv.depositPct, payments: (inv.payments || []).map((p) => ({ date: p.date, amount: p.amount, method: p.method })),
      notes: inv.notes, status: inv.status, acceptedBy: inv.acceptedBy, acceptedAt: inv.acceptedAt, totals: invoiceTotals(inv),
    },
    client: client && { name: client.name, company: client.company, email: client.email, phone: client.phone, address: client.address },
    event: event && { title: event.title, date: event.date, startTime: event.startTime, endTime: event.endTime, venue: event.venue, address: event.address, guestCount: event.guestCount },
    business: {
      businessName: s.businessName, tagline: s.tagline, email: s.email, phone: s.phone, address: s.address,
      website: s.website, currency: s.currency, paymentInstructions: s.paymentInstructions, terms: s.terms,
      paymentLinkUrl: /^https:\/\//.test(s.paymentLinkUrl || '') ? s.paymentLinkUrl : '',
    },
  };
}

// Data visible to a staff (non-manager) user.
function staffScope(user) {
  const staffId = user.staffId;
  const staff = db.staff.filter((s) => s.id === staffId);
  const shifts = db.shifts.filter((s) => s.staffId === staffId);
  const eventIds = new Set(shifts.map((s) => s.eventId));
  const events = db.events.filter((e) => eventIds.has(e.id)).map((e) => ({
    id: e.id, title: e.title, date: e.date, startTime: e.startTime, endTime: e.endTime, venue: e.venue,
    address: e.address, guestCount: e.guestCount, serviceType: e.serviceType, status: e.status,
    menu: e.menu, staffNotes: e.staffNotes, dressCode: e.dressCode, contactOnSite: e.contactOnSite,
    alcoholBy: e.alcoholBy, checklist: e.checklist,
  }));
  // Co-workers on the same events (names/roles only).
  const coShiftStaffIds = new Set(db.shifts.filter((s) => eventIds.has(s.eventId)).map((s) => s.staffId));
  const coworkers = db.staff.filter((s) => coShiftStaffIds.has(s.id) && s.id !== staffId).map((s) => ({ id: s.id, name: s.name, phone: s.phone, roles: s.roles }));
  const coShifts = db.shifts.filter((s) => eventIds.has(s.eventId) && s.staffId !== staffId)
    .map((s) => ({ id: s.id, eventId: s.eventId, staffId: s.staffId, role: s.role, start: s.start, end: s.end, status: s.status }));
  const tasks = db.tasks.filter((t) => t.assigneeStaffId === staffId);
  return { staff: [...staff, ...coworkers], shifts: [...shifts, ...coShifts], events, tasks };
}

// ---------------------------------------------------------------- router
async function handleApi(req, res, url) {
  const method = req.method;
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop 'api'
  const user = currentUser(req);

  // ---- health
  if (parts[0] === 'health') return send(res, 200, { ok: true });

  // ---- auth
  if (parts[0] === 'auth') {
    if (parts[1] === 'status' && method === 'GET') {
      return send(res, 200, { needsSetup: db.users.length === 0, user: publicUser(user), businessName: db.settings.businessName });
    }
    if (parts[1] === 'setup' && method === 'POST') {
      if (db.users.length) return fail(res, 400, 'Setup already completed');
      const b = await readBody(req);
      if (!b.email || !b.password || String(b.password).length < 8) return fail(res, 400, 'Email and a password of at least 8 characters are required');
      const u = { id: uid(), email: String(b.email).toLowerCase().trim(), name: b.name || 'Owner', role: 'owner', passwordHash: hashPassword(String(b.password)), createdAt: new Date().toISOString() };
      db.users.push(u);
      if (b.businessName) db.settings.businessName = String(b.businessName);
      const sid = token();
      db.sessions[sid] = { userId: u.id, expires: Date.now() + SESSION_TTL_MS };
      save();
      return send(res, 200, { user: publicUser(u) }, { 'Set-Cookie': sessionCookie(sid, SESSION_TTL_MS / 1000) });
    }
    if (parts[1] === 'login' && method === 'POST') {
      const b = await readBody(req);
      const email = String(b.email || '').toLowerCase().trim();
      if (throttled(email + '|' + (req.socket.remoteAddress || ''))) return fail(res, 429, 'Too many attempts, try again later');
      const u = db.users.find((x) => x.email === email && !x.disabled);
      if (!u || !verifyPassword(String(b.password || ''), u.passwordHash)) return fail(res, 401, 'Invalid email or password');
      const sid = token();
      db.sessions[sid] = { userId: u.id, expires: Date.now() + SESSION_TTL_MS };
      save();
      return send(res, 200, { user: publicUser(u) }, { 'Set-Cookie': sessionCookie(sid, SESSION_TTL_MS / 1000) });
    }
    if (parts[1] === 'logout' && method === 'POST') {
      const sid = parseCookies(req).sid;
      if (sid) { delete db.sessions[sid]; save(); }
      return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
    }
    if (parts[1] === 'password' && method === 'POST') {
      if (!user) return fail(res, 401, 'Not signed in');
      const b = await readBody(req);
      if (!verifyPassword(String(b.current || ''), user.passwordHash)) return fail(res, 400, 'Current password is incorrect');
      if (String(b.next || '').length < 8) return fail(res, 400, 'New password must be at least 8 characters');
      user.passwordHash = hashPassword(String(b.next));
      save();
      return send(res, 200, { ok: true });
    }
    return fail(res, 404, 'Not found');
  }

  // ---- public (no auth): business info, inquiry form, shared invoices/quotes
  if (parts[0] === 'public') {
    if (parts[1] === 'info' && method === 'GET') {
      const s = db.settings;
      return send(res, 200, {
        businessName: s.businessName, tagline: s.tagline, email: s.email, phone: s.phone, website: s.website,
        packages: db.packages.filter((p) => p.active !== false).map((p) => ({ id: p.id, name: p.name, description: p.description, category: p.category })),
      });
    }
    if (parts[1] === 'inquiry' && method === 'POST') {
      const b = await readBody(req);
      if (b.website_url) return send(res, 200, { ok: true }); // honeypot
      if (!b.name || !(b.email || b.phone)) return fail(res, 400, 'Name and an email or phone number are required');
      const now = new Date().toISOString();
      const lead = {
        id: uid(), createdAt: now, updatedAt: now, stage: 'new', source: 'Website form',
        name: String(b.name).slice(0, 200), email: String(b.email || '').slice(0, 200), phone: String(b.phone || '').slice(0, 50),
        eventDate: String(b.eventDate || '').slice(0, 10), eventType: String(b.eventType || '').slice(0, 100),
        guestCount: Number(b.guestCount) || 0, venue: String(b.venue || '').slice(0, 300),
        hours: Number(b.hours) || 0, budget: Number(b.budget) || 0, packageId: String(b.packageId || ''),
        notes: String(b.message || '').slice(0, 4000),
      };
      db.leads.push(lead);
      db.activities.push({ id: uid(), createdAt: now, type: 'lead', text: `New web inquiry from ${lead.name}`, refId: lead.id });
      save();
      return send(res, 200, { ok: true });
    }
    if (parts[1] === 'doc' && parts[2]) {
      const inv = db.invoices.find((i) => i.publicToken && i.publicToken === parts[2]);
      if (!inv || inv.status === 'void') return fail(res, 404, 'Document not found');
      if (method === 'GET') {
        if (!inv.viewedAt) { inv.viewedAt = new Date().toISOString(); save(); }
        return send(res, 200, publicInvoiceView(inv));
      }
      if (parts[3] === 'accept' && method === 'POST') {
        const b = await readBody(req);
        if (inv.kind !== 'quote') return fail(res, 400, 'Only quotes can be accepted');
        if (!b.signature || String(b.signature).trim().length < 2) return fail(res, 400, 'Please type your full name to sign');
        inv.acceptedBy = String(b.signature).slice(0, 200);
        inv.acceptedAt = new Date().toISOString();
        inv.status = 'accepted';
        inv.updatedAt = inv.acceptedAt;
        db.activities.push({ id: uid(), createdAt: inv.acceptedAt, type: 'quote', text: `Quote ${inv.number} accepted by ${inv.acceptedBy}`, refId: inv.id });
        save();
        return send(res, 200, publicInvoiceView(inv));
      }
    }
    return fail(res, 404, 'Not found');
  }

  // ---- everything below requires auth
  if (!user) return fail(res, 401, 'Not signed in');

  if (parts[0] === 'bootstrap' && method === 'GET') {
    const data = {};
    if (isManager(user)) {
      for (const c of COLLECTIONS) data[c] = db[c];
    } else {
      Object.assign(data, staffScope(user));
    }
    const settings = isManager(user) ? db.settings : { businessName: db.settings.businessName, currency: db.settings.currency };
    const users = isManager(user) ? db.users.map(publicUser) : [];
    return send(res, 200, { user: publicUser(user), settings, data, users });
  }

  // ---- staff self-service
  if (parts[0] === 'me') {
    if (!user.staffId) return fail(res, 400, 'Your login is not linked to a staff profile');
    if (parts[1] === 'shifts' && parts[2] && method === 'PATCH') {
      const sh = db.shifts.find((s) => s.id === parts[2] && s.staffId === user.staffId);
      if (!sh) return fail(res, 404, 'Shift not found');
      const b = await readBody(req);
      const now = new Date().toISOString();
      if (b.action === 'confirm') sh.status = 'confirmed';
      else if (b.action === 'decline') { sh.status = 'declined'; sh.declineReason = String(b.reason || '').slice(0, 500); }
      else if (b.action === 'clockIn') { sh.clockIn = now; sh.status = 'confirmed'; }
      else if (b.action === 'clockOut') { sh.clockOut = now; if (b.tips !== undefined) sh.tips = Number(b.tips) || 0; }
      else return fail(res, 400, 'Unknown action');
      sh.updatedAt = now;
      const st = db.staff.find((s) => s.id === user.staffId);
      db.activities.push({ id: uid(), createdAt: now, type: 'shift', text: `${st ? st.name : 'Staff'}: ${b.action} shift`, refId: sh.id });
      save();
      return send(res, 200, sh);
    }
    if (parts[1] === 'profile' && method === 'PATCH') {
      const st = db.staff.find((s) => s.id === user.staffId);
      if (!st) return fail(res, 404, 'Profile not found');
      const b = await readBody(req);
      for (const k of ['phone', 'unavailableDates', 'weeklyAvailability', 'certifications', 'emergencyContact']) {
        if (b[k] !== undefined) st[k] = b[k];
      }
      st.updatedAt = new Date().toISOString();
      save();
      return send(res, 200, st);
    }
    if (parts[1] === 'tasks' && parts[2] && method === 'PATCH') {
      const t = db.tasks.find((x) => x.id === parts[2] && x.assigneeStaffId === user.staffId);
      if (!t) return fail(res, 404, 'Task not found');
      const b = await readBody(req);
      t.done = !!b.done;
      t.updatedAt = new Date().toISOString();
      save();
      return send(res, 200, t);
    }
    return fail(res, 404, 'Not found');
  }

  // ---- manager-only below
  if (!isManager(user)) return fail(res, 403, 'Not allowed');

  if (parts[0] === 'settings') {
    if (method === 'GET') return send(res, 200, db.settings);
    if (method === 'PUT') {
      const b = await readBody(req);
      for (const k of Object.keys(DEFAULT_SETTINGS)) if (b[k] !== undefined) db.settings[k] = b[k];
      save();
      return send(res, 200, db.settings);
    }
  }

  if (parts[0] === 'users') {
    if (method === 'GET') return send(res, 200, db.users.map(publicUser));
    if (method === 'POST') {
      const b = await readBody(req);
      const email = String(b.email || '').toLowerCase().trim();
      if (!email || String(b.password || '').length < 8) return fail(res, 400, 'Email and a password of at least 8 characters are required');
      if (db.users.some((u) => u.email === email)) return fail(res, 400, 'A login with that email already exists');
      const role = ['manager', 'staff'].includes(b.role) ? b.role : 'staff';
      if (role === 'manager' && user.role !== 'owner') return fail(res, 403, 'Only the owner can create managers');
      const u = { id: uid(), email, name: b.name || email, role, staffId: b.staffId || null, passwordHash: hashPassword(String(b.password)), createdAt: new Date().toISOString() };
      db.users.push(u);
      if (u.staffId) { const st = db.staff.find((s) => s.id === u.staffId); if (st) st.userId = u.id; }
      save();
      return send(res, 201, publicUser(u));
    }
    if (parts[1] && method === 'DELETE') {
      const u = db.users.find((x) => x.id === parts[1]);
      if (!u) return fail(res, 404, 'Not found');
      if (u.role === 'owner') return fail(res, 400, 'The owner login cannot be removed');
      db.users = db.users.filter((x) => x.id !== u.id);
      for (const [sid, s] of Object.entries(db.sessions)) if (s.userId === u.id) delete db.sessions[sid];
      for (const st of db.staff) if (st.userId === u.id) st.userId = null;
      save();
      return send(res, 200, { ok: true });
    }
    if (parts[1] && method === 'PATCH') {
      const u = db.users.find((x) => x.id === parts[1]);
      if (!u) return fail(res, 404, 'Not found');
      const b = await readBody(req);
      if (b.password) {
        if (String(b.password).length < 8) return fail(res, 400, 'Password must be at least 8 characters');
        u.passwordHash = hashPassword(String(b.password));
      }
      if (b.name) u.name = String(b.name);
      save();
      return send(res, 200, publicUser(u));
    }
  }

  if (parts[0] === 'export' && method === 'GET') {
    const copy = { ...db, sessions: undefined, users: db.users.map(publicUser) };
    return send(res, 200, copy, { 'Content-Disposition': `attachment; filename="barops-backup-${new Date().toISOString().slice(0, 10)}.json"` });
  }

  if (parts[0] === 'import' && method === 'POST') {
    if (user.role !== 'owner') return fail(res, 403, 'Only the owner can restore a backup');
    const b = await readBody(req);
    for (const c of COLLECTIONS) if (Array.isArray(b[c])) db[c] = b[c];
    if (b.settings && typeof b.settings === 'object') db.settings = { ...DEFAULT_SETTINGS, ...b.settings };
    save();
    return send(res, 200, { ok: true });
  }

  if (parts[0] === 'c' && COLLECTIONS.includes(parts[1])) {
    const name = parts[1];
    const list = db[name];
    const id = parts[2];
    const now = new Date().toISOString();
    if (method === 'GET' && !id) return send(res, 200, list);
    if (method === 'GET' && id) {
      const item = list.find((x) => x.id === id);
      return item ? send(res, 200, item) : fail(res, 404, 'Not found');
    }
    if (method === 'POST' && !id) {
      const b = await readBody(req);
      if (typeof b !== 'object' || Array.isArray(b)) return fail(res, 400, 'Expected an object');
      const item = { ...b, id: uid(), createdAt: now, updatedAt: now };
      if (name === 'invoices') {
        item.kind = item.kind === 'quote' ? 'quote' : 'invoice';
        if (!item.number) item.number = nextDocNumber(item.kind);
        item.publicToken = token();
        item.status = item.status || 'draft';
        item.payments = item.payments || [];
      }
      list.push(item);
      save();
      return send(res, 201, item);
    }
    if ((method === 'PUT' || method === 'PATCH') && id) {
      const idx = list.findIndex((x) => x.id === id);
      if (idx < 0) return fail(res, 404, 'Not found');
      const b = await readBody(req);
      const prev = list[idx];
      const next = method === 'PUT'
        ? { ...b, id, createdAt: prev.createdAt, updatedAt: now }
        : { ...prev, ...b, id, createdAt: prev.createdAt, updatedAt: now };
      if (name === 'invoices') {
        next.publicToken = prev.publicToken;
        if (!next.number) next.number = prev.number;
        // Converting quote -> invoice assigns a new invoice number.
        if (prev.kind === 'quote' && next.kind === 'invoice' && String(next.number).startsWith(db.settings.quotePrefix)) {
          next.quoteNumber = prev.number;
          next.number = nextDocNumber('invoice');
        }
      }
      list[idx] = next;
      save();
      return send(res, 200, next);
    }
    if (method === 'DELETE' && id) {
      const idx = list.findIndex((x) => x.id === id);
      if (idx < 0) return fail(res, 404, 'Not found');
      list.splice(idx, 1);
      // cascade: removing an event removes its shifts
      if (name === 'events') db.shifts = db.shifts.filter((s) => s.eventId !== id);
      if (name === 'staff') db.shifts = db.shifts.filter((s) => s.staffId !== id);
      save();
      return send(res, 200, { ok: true });
    }
  }

  return fail(res, 404, 'Not found');
}

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        // Basic CSRF defence: state-changing API calls must be JSON (forces CORS preflight cross-origin).
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
          const ct = req.headers['content-type'] || '';
          if (!ct.includes('application/json')) return fail(res, 415, 'Content-Type must be application/json');
        }
        return await handleApi(req, res, url);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Method not allowed');
      return serveStatic(req, res, url.pathname);
    } catch (e) {
      if (e.status) return fail(res, e.status, e.message);
      console.error(e);
      return fail(res, 500, 'Server error');
    }
  });
}

function flushAndExit() {
  try { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } saveNow(); } catch (e) { console.error(e); }
  process.exit(0);
}

if (require.main === module) {
  loadDb();
  process.on('SIGINT', flushAndExit);
  process.on('SIGTERM', flushAndExit);
  createServer().listen(PORT, () => console.log(`BarOps running at http://localhost:${PORT}  (data: ${DB_FILE})`));
}

module.exports = { createServer, loadDb, invoiceTotals, _db: () => db, saveNow };
