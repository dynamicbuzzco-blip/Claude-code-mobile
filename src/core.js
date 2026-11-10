// BarOps API core — platform-neutral (Node.js 18+ and Cloudflare Workers).
// Uses only web-standard APIs: Request/Response, WebCrypto, URL.
//
// createApp(store) where store = { load(): object|null, save(db): void }
// returns { handle(request, { ip }) : Promise<Response> } for /api/* requests.

export const COLLECTIONS = [
  'clients', 'leads', 'events', 'invoices', 'staff', 'shifts',
  'inventory', 'expenses', 'tasks', 'packages', 'activities',
];

export const DEFAULT_SETTINGS = {
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

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const MAX_BODY = 2 * 1024 * 1024;
const PBKDF2_ITERATIONS = 100000; // Workers' WebCrypto maximum

// ---------------------------------------------------------------- utils
export const uid = () => crypto.randomUUID();

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (h) => new Uint8Array((h.match(/.{2}/g) || []).map((x) => parseInt(x, 16)));
export function token() { return b64url(crypto.getRandomValues(new Uint8Array(24))); }

async function pbkdf2(pw, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(pw, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${hex(salt)}$${hex(hash)}`;
}

export async function verifyPassword(pw, stored) {
  if (!stored || !stored.startsWith('pbkdf2$')) return false;
  const [, iter, saltHex, hashHex] = stored.split('$');
  const test = await pbkdf2(pw, fromHex(saltHex), Number(iter));
  const known = fromHex(hashHex);
  if (known.length !== test.length) return false;
  let diff = 0;
  for (let i = 0; i < known.length; i++) diff |= known[i] ^ test[i];
  return diff === 0;
}

export function invoiceTotals(inv) {
  const items = Array.isArray(inv.items) ? inv.items : [];
  const line = (it) => (Number(it.qty) || 0) * (Number(it.rate) || 0);
  const subtotal = items.reduce((a, it) => a + line(it), 0);
  const taxable = items.filter((it) => it.taxable !== false).reduce((a, it) => a + line(it), 0);
  const discount = Number(inv.discount) || 0;
  const service = (subtotal - discount) * ((Number(inv.serviceChargePct) || 0) / 100);
  const tax = Math.max(0, taxable - discount) * ((Number(inv.taxRate) || 0) / 100);
  const total = Math.max(0, subtotal - discount + service + tax);
  const paid = (inv.payments || []).reduce((a, p) => a + (Number(p.amount) || 0), 0);
  return { subtotal, discount, service, tax, total, paid, balance: Math.max(0, total - paid) };
}

export function emptyDb() {
  const d = { version: 1, users: [], sessions: {}, settings: { ...DEFAULT_SETTINGS } };
  for (const c of COLLECTIONS) d[c] = [];
  const now = new Date().toISOString();
  d.packages = DEFAULT_PACKAGES.map((p) => ({ id: uid(), active: true, createdAt: now, updatedAt: now, ...p }));
  return d;
}

export function normalizeDb(d) {
  d.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  d.sessions = d.sessions || {};
  d.users = d.users || [];
  for (const c of COLLECTIONS) d[c] = d[c] || [];
  return d;
}

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
  });
}
const fail = (status, message) => json(status, { error: message });

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Payload too large');
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'Invalid JSON'); }
}

function parseCookies(request) {
  const out = {};
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const publicUser = (u) => u && { id: u.id, email: u.email, name: u.name, role: u.role, staffId: u.staffId || null };
const isManager = (u) => u && (u.role === 'owner' || u.role === 'manager');

// ---------------------------------------------------------------- app
export function createApp(store, options = {}) {
  let db = null;
  const loginAttempts = new Map();

  function ensureDb() {
    if (db) return db;
    const loaded = store.load();
    if (loaded) db = normalizeDb(loaded);
    else { db = emptyDb(); store.save(db); }
    return db;
  }
  const save = () => store.save(db);

  function throttled(key) {
    const now = Date.now();
    const rec = loginAttempts.get(key) || { count: 0, first: now };
    if (now - rec.first > 15 * 60 * 1000) { rec.count = 0; rec.first = now; }
    rec.count += 1;
    loginAttempts.set(key, rec);
    return rec.count > 20;
  }

  function sessionCookie(sid, maxAgeSec, secure) {
    return `sid=${sid}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
  }

  function currentUser(request) {
    const sid = parseCookies(request).sid;
    if (!sid) return null;
    const s = db.sessions[sid];
    if (!s) return null;
    if (s.expires < Date.now()) { delete db.sessions[sid]; save(); return null; }
    return db.users.find((u) => u.id === s.userId && !u.disabled) || null;
  }

  function newSession(userId) {
    const now = Date.now();
    // prune expired sessions
    for (const [k, s] of Object.entries(db.sessions)) if (s.expires < now) delete db.sessions[k];
    const sid = token();
    db.sessions[sid] = { userId, expires: now + SESSION_TTL_MS };
    return sid;
  }

  function nextDocNumber(kind) {
    const s = db.settings;
    if (kind === 'quote') { const n = s.nextQuoteNumber++; return `${s.quotePrefix}${n}`; }
    const n = s.nextInvoiceNumber++;
    return `${s.invoicePrefix}${n}`;
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

  function staffScope(user) {
    const staffId = user.staffId;
    const staff = db.staff.filter((s) => s.id === staffId);
    const shifts = db.shifts.filter((s) => s.staffId === staffId);
    const eventIds = new Set(shifts.map((s) => s.eventId));
    const events = db.events.filter((e) => eventIds.has(e.id)).map((e) => ({
      id: e.id, title: e.title, date: e.date, startTime: e.startTime, endTime: e.endTime, venue: e.venue,
      address: e.address, guestCount: e.guestCount, serviceType: e.serviceType, status: e.status,
      menu: e.menu, staffNotes: e.staffNotes, dressCode: e.dressCode, contactOnSite: e.contactOnSite,
      alcoholBy: e.alcoholBy, checklist: e.checklist, arrivalTime: e.arrivalTime,
    }));
    const coShiftStaffIds = new Set(db.shifts.filter((s) => eventIds.has(s.eventId)).map((s) => s.staffId));
    const coworkers = db.staff.filter((s) => coShiftStaffIds.has(s.id) && s.id !== staffId).map((s) => ({ id: s.id, name: s.name, phone: s.phone, roles: s.roles, color: s.color }));
    const coShifts = db.shifts.filter((s) => eventIds.has(s.eventId) && s.staffId !== staffId)
      .map((s) => ({ id: s.id, eventId: s.eventId, staffId: s.staffId, role: s.role, start: s.start, end: s.end, status: s.status }));
    const tasks = db.tasks.filter((t) => t.assigneeStaffId === staffId);
    return { staff: [...staff, ...coworkers], shifts: [...shifts, ...coShifts], events, tasks };
  }

  async function route(request, url, ctx) {
    const method = request.method;
    const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop 'api'
    const secure = url.protocol === 'https:' || !!options.secureCookies;
    const user = currentUser(request);

    if (parts[0] === 'health') return json(200, { ok: true });

    // ---- auth
    if (parts[0] === 'auth') {
      if (parts[1] === 'status' && method === 'GET') {
        return json(200, { needsSetup: db.users.length === 0, needsSetupCode: db.users.length === 0 && !!options.setupCode, user: publicUser(user), businessName: db.settings.businessName });
      }
      if (parts[1] === 'setup' && method === 'POST') {
        if (db.users.length) return fail(400, 'Setup already completed');
        const b = await readBody(request);
        if (options.setupCode && String(b.setupCode || '').trim() !== options.setupCode) {
          if (throttled('setup|' + (ctx.ip || ''))) return fail(429, 'Too many attempts, try again later');
          return fail(403, 'Invalid setup code');
        }
        if (!b.email || !b.password || String(b.password).length < 8) return fail(400, 'Email and a password of at least 8 characters are required');
        const passwordHash = await hashPassword(String(b.password));
        if (db.users.length) return fail(400, 'Setup already completed');
        const u = { id: uid(), email: String(b.email).toLowerCase().trim(), name: b.name || 'Owner', role: 'owner', passwordHash, createdAt: new Date().toISOString() };
        db.users.push(u);
        if (b.businessName) db.settings.businessName = String(b.businessName);
        const sid = newSession(u.id);
        save();
        return json(200, { user: publicUser(u) }, { 'Set-Cookie': sessionCookie(sid, SESSION_TTL_MS / 1000, secure) });
      }
      if (parts[1] === 'login' && method === 'POST') {
        const b = await readBody(request);
        const email = String(b.email || '').toLowerCase().trim();
        if (throttled(email + '|' + (ctx.ip || ''))) return fail(429, 'Too many attempts, try again later');
        const u = db.users.find((x) => x.email === email && !x.disabled);
        if (!u || !(await verifyPassword(String(b.password || ''), u.passwordHash))) return fail(401, 'Invalid email or password');
        const sid = newSession(u.id);
        save();
        return json(200, { user: publicUser(u) }, { 'Set-Cookie': sessionCookie(sid, SESSION_TTL_MS / 1000, secure) });
      }
      if (parts[1] === 'logout' && method === 'POST') {
        const sid = parseCookies(request).sid;
        if (sid && db.sessions[sid]) { delete db.sessions[sid]; save(); }
        return json(200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0, secure) });
      }
      if (parts[1] === 'password' && method === 'POST') {
        if (!user) return fail(401, 'Not signed in');
        const b = await readBody(request);
        if (!(await verifyPassword(String(b.current || ''), user.passwordHash))) return fail(400, 'Current password is incorrect');
        if (String(b.next || '').length < 8) return fail(400, 'New password must be at least 8 characters');
        user.passwordHash = await hashPassword(String(b.next));
        save();
        return json(200, { ok: true });
      }
      return fail(404, 'Not found');
    }

    // ---- public (no auth)
    if (parts[0] === 'public') {
      if (parts[1] === 'info' && method === 'GET') {
        const s = db.settings;
        return json(200, {
          businessName: s.businessName, tagline: s.tagline, email: s.email, phone: s.phone, website: s.website,
          packages: db.packages.filter((p) => p.active !== false).map((p) => ({ id: p.id, name: p.name, description: p.description, category: p.category })),
        });
      }
      if (parts[1] === 'inquiry' && method === 'POST') {
        const b = await readBody(request);
        if (b.website_url) return json(200, { ok: true }); // honeypot
        if (!b.name || !(b.email || b.phone)) return fail(400, 'Name and an email or phone number are required');
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
        return json(200, { ok: true });
      }
      if (parts[1] === 'doc' && parts[2]) {
        const inv = db.invoices.find((i) => i.publicToken && i.publicToken === parts[2]);
        if (!inv || inv.status === 'void') return fail(404, 'Document not found');
        if (method === 'GET') {
          if (!inv.viewedAt) { inv.viewedAt = new Date().toISOString(); save(); }
          return json(200, publicInvoiceView(inv));
        }
        if (parts[3] === 'accept' && method === 'POST') {
          const b = await readBody(request);
          if (inv.kind !== 'quote') return fail(400, 'Only quotes can be accepted');
          if (!b.signature || String(b.signature).trim().length < 2) return fail(400, 'Please type your full name to sign');
          inv.acceptedBy = String(b.signature).slice(0, 200);
          inv.acceptedAt = new Date().toISOString();
          inv.status = 'accepted';
          inv.updatedAt = inv.acceptedAt;
          db.activities.push({ id: uid(), createdAt: inv.acceptedAt, type: 'quote', text: `Quote ${inv.number} accepted by ${inv.acceptedBy}`, refId: inv.id });
          save();
          return json(200, publicInvoiceView(inv));
        }
      }
      return fail(404, 'Not found');
    }

    if (!user) return fail(401, 'Not signed in');

    if (parts[0] === 'bootstrap' && method === 'GET') {
      const data = {};
      if (isManager(user)) for (const c of COLLECTIONS) data[c] = db[c];
      else Object.assign(data, staffScope(user));
      const settings = isManager(user) ? db.settings : { businessName: db.settings.businessName, currency: db.settings.currency };
      const users = isManager(user) ? db.users.map(publicUser) : [];
      return json(200, { user: publicUser(user), settings, data, users });
    }

    // ---- staff self-service
    if (parts[0] === 'me') {
      if (!user.staffId) return fail(400, 'Your login is not linked to a staff profile');
      if (parts[1] === 'shifts' && parts[2] && method === 'PATCH') {
        const sh = db.shifts.find((s) => s.id === parts[2] && s.staffId === user.staffId);
        if (!sh) return fail(404, 'Shift not found');
        const b = await readBody(request);
        const now = new Date().toISOString();
        if (b.action === 'confirm') sh.status = 'confirmed';
        else if (b.action === 'decline') { sh.status = 'declined'; sh.declineReason = String(b.reason || '').slice(0, 500); }
        else if (b.action === 'clockIn') { sh.clockIn = now; sh.status = 'confirmed'; }
        else if (b.action === 'clockOut') { sh.clockOut = now; if (b.tips !== undefined) sh.tips = Number(b.tips) || 0; }
        else return fail(400, 'Unknown action');
        sh.updatedAt = now;
        const st = db.staff.find((s) => s.id === user.staffId);
        db.activities.push({ id: uid(), createdAt: now, type: 'shift', text: `${st ? st.name : 'Staff'}: ${b.action} shift`, refId: sh.id });
        save();
        return json(200, sh);
      }
      if (parts[1] === 'profile' && method === 'PATCH') {
        const st = db.staff.find((s) => s.id === user.staffId);
        if (!st) return fail(404, 'Profile not found');
        const b = await readBody(request);
        for (const k of ['phone', 'unavailableDates', 'weeklyAvailability', 'certifications', 'emergencyContact']) if (b[k] !== undefined) st[k] = b[k];
        st.updatedAt = new Date().toISOString();
        save();
        return json(200, st);
      }
      if (parts[1] === 'tasks' && parts[2] && method === 'PATCH') {
        const t = db.tasks.find((x) => x.id === parts[2] && x.assigneeStaffId === user.staffId);
        if (!t) return fail(404, 'Task not found');
        const b = await readBody(request);
        t.done = !!b.done;
        t.updatedAt = new Date().toISOString();
        save();
        return json(200, t);
      }
      return fail(404, 'Not found');
    }

    // ---- manager-only below
    if (!isManager(user)) return fail(403, 'Not allowed');

    if (parts[0] === 'settings') {
      if (method === 'GET') return json(200, db.settings);
      if (method === 'PUT') {
        const b = await readBody(request);
        for (const k of Object.keys(DEFAULT_SETTINGS)) if (b[k] !== undefined) db.settings[k] = b[k];
        save();
        return json(200, db.settings);
      }
    }

    if (parts[0] === 'users') {
      if (method === 'GET') return json(200, db.users.map(publicUser));
      if (method === 'POST' && !parts[1]) {
        const b = await readBody(request);
        const email = String(b.email || '').toLowerCase().trim();
        if (!email || String(b.password || '').length < 8) return fail(400, 'Email and a password of at least 8 characters are required');
        if (db.users.some((u) => u.email === email)) return fail(400, 'A login with that email already exists');
        const role = ['manager', 'staff'].includes(b.role) ? b.role : 'staff';
        if (role === 'manager' && user.role !== 'owner') return fail(403, 'Only the owner can create managers');
        const passwordHash = await hashPassword(String(b.password));
        const u = { id: uid(), email, name: b.name || email, role, staffId: b.staffId || null, passwordHash, createdAt: new Date().toISOString() };
        db.users.push(u);
        if (u.staffId) { const st = db.staff.find((s) => s.id === u.staffId); if (st) st.userId = u.id; }
        save();
        return json(201, publicUser(u));
      }
      if (parts[1] && method === 'DELETE') {
        const u = db.users.find((x) => x.id === parts[1]);
        if (!u) return fail(404, 'Not found');
        if (u.role === 'owner') return fail(400, 'The owner login cannot be removed');
        if (u.role === 'manager' && user.role !== 'owner') return fail(403, 'Only the owner can remove managers');
        db.users = db.users.filter((x) => x.id !== u.id);
        for (const [sid, s] of Object.entries(db.sessions)) if (s.userId === u.id) delete db.sessions[sid];
        for (const st of db.staff) if (st.userId === u.id) st.userId = null;
        save();
        return json(200, { ok: true });
      }
      if (parts[1] && method === 'PATCH') {
        const u = db.users.find((x) => x.id === parts[1]);
        if (!u) return fail(404, 'Not found');
        if (u.role === 'owner' && user.id !== u.id) return fail(403, 'Not allowed');
        if (u.role === 'manager' && user.role !== 'owner' && user.id !== u.id) return fail(403, 'Only the owner can change managers');
        const b = await readBody(request);
        if (b.password) {
          if (String(b.password).length < 8) return fail(400, 'Password must be at least 8 characters');
          u.passwordHash = await hashPassword(String(b.password));
        }
        if (b.name) u.name = String(b.name);
        save();
        return json(200, publicUser(u));
      }
    }

    if (parts[0] === 'export' && method === 'GET') {
      const copy = { ...db, sessions: undefined, users: db.users.map(publicUser) };
      return json(200, copy, { 'Content-Disposition': `attachment; filename="barops-backup-${new Date().toISOString().slice(0, 10)}.json"` });
    }

    if (parts[0] === 'import' && method === 'POST') {
      if (user.role !== 'owner') return fail(403, 'Only the owner can restore a backup');
      const b = await readBody(request);
      for (const c of COLLECTIONS) if (Array.isArray(b[c])) db[c] = b[c];
      if (b.settings && typeof b.settings === 'object') db.settings = { ...DEFAULT_SETTINGS, ...b.settings };
      save();
      return json(200, { ok: true });
    }

    if (parts[0] === 'c' && COLLECTIONS.includes(parts[1])) {
      const name = parts[1];
      const list = db[name];
      const id = parts[2];
      const now = new Date().toISOString();
      if (method === 'GET' && !id) return json(200, list);
      if (method === 'GET' && id) {
        const item = list.find((x) => x.id === id);
        return item ? json(200, item) : fail(404, 'Not found');
      }
      if (method === 'POST' && !id) {
        const b = await readBody(request);
        if (typeof b !== 'object' || Array.isArray(b)) return fail(400, 'Expected an object');
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
        return json(201, item);
      }
      if ((method === 'PUT' || method === 'PATCH') && id) {
        const idx = list.findIndex((x) => x.id === id);
        if (idx < 0) return fail(404, 'Not found');
        const b = await readBody(request);
        if (typeof b !== 'object' || Array.isArray(b)) return fail(400, 'Expected an object');
        const prev = list[idx];
        const next = method === 'PUT'
          ? { ...b, id, createdAt: prev.createdAt, updatedAt: now }
          : { ...prev, ...b, id, createdAt: prev.createdAt, updatedAt: now };
        if (name === 'invoices') {
          next.publicToken = prev.publicToken;
          if (!next.number) next.number = prev.number;
          if (prev.kind === 'quote' && next.kind === 'invoice' && String(next.number).startsWith(db.settings.quotePrefix)) {
            next.quoteNumber = prev.number;
            next.number = nextDocNumber('invoice');
          }
        }
        list[idx] = next;
        save();
        return json(200, next);
      }
      if (method === 'DELETE' && id) {
        const idx = list.findIndex((x) => x.id === id);
        if (idx < 0) return fail(404, 'Not found');
        list.splice(idx, 1);
        if (name === 'events') db.shifts = db.shifts.filter((s) => s.eventId !== id);
        if (name === 'staff') db.shifts = db.shifts.filter((s) => s.staffId !== id);
        save();
        return json(200, { ok: true });
      }
    }

    return fail(404, 'Not found');
  }

  return {
    get db() { return ensureDb(); },
    async handle(request, ctx = {}) {
      ensureDb();
      const url = new URL(request.url);
      try {
        // CSRF defence: state-changing calls must be JSON (forces a CORS preflight cross-origin).
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
          const ct = request.headers.get('content-type') || '';
          if (!ct.includes('application/json')) return fail(415, 'Content-Type must be application/json');
        }
        return await route(request, url, ctx);
      } catch (e) {
        if (e instanceof HttpError) return fail(e.status, e.message);
        console.error(e);
        return fail(500, 'Server error');
      }
    },
  };
}
