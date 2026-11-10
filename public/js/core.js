// Core: API client, app state, formatting, form/modal helpers and business logic.

export const state = { user: null, settings: {}, data: {}, users: [] };
// Hooks set by app.js so views can trigger a re-render / navigation.
export const ui = { rerender: () => {}, go: (hash) => { location.hash = hash; } };

// ------------------------------------------------------------------ API
export async function api(method, path, body) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined || !['GET', 'HEAD'].includes(method)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body ?? {});
  }
  const res = await fetch('/api' + path, opts);
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    const err = new Error((json && json.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return json;
}

export async function loadAll() {
  const b = await api('GET', '/bootstrap');
  state.user = b.user;
  state.settings = b.settings;
  state.data = b.data;
  state.users = b.users || [];
  for (const k of ['clients', 'leads', 'events', 'invoices', 'staff', 'shifts', 'inventory', 'expenses', 'tasks', 'packages', 'activities']) {
    state.data[k] = state.data[k] || [];
  }
}

export const isManager = () => state.user && (state.user.role === 'owner' || state.user.role === 'manager');

export function list(col) { return state.data[col] || []; }
export function byId(col, id) { return id ? list(col).find((x) => x.id === id) : undefined; }

export async function saveItem(col, item) {
  let saved;
  if (item.id) saved = await api('PUT', `/c/${col}/${item.id}`, item);
  else saved = await api('POST', `/c/${col}`, item);
  const arr = list(col);
  const i = arr.findIndex((x) => x.id === saved.id);
  if (i >= 0) arr[i] = saved; else arr.push(saved);
  return saved;
}

export async function patchItem(col, id, patch) {
  const saved = await api('PATCH', `/c/${col}/${id}`, patch);
  const arr = list(col);
  const i = arr.findIndex((x) => x.id === id);
  if (i >= 0) arr[i] = saved;
  return saved;
}

export async function removeItem(col, id) {
  await api('DELETE', `/c/${col}/${id}`);
  state.data[col] = list(col).filter((x) => x.id !== id);
  if (col === 'events') state.data.shifts = list('shifts').filter((s) => s.eventId !== id);
  if (col === 'staff') state.data.shifts = list('shifts').filter((s) => s.staffId !== id);
}

export async function logActivity(type, text, refId) {
  try { await saveItem('activities', { type, text, refId }); } catch { /* non-critical */ }
}

// ------------------------------------------------------------------ formatting
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function money(n, currency) {
  const cur = currency || state.settings.currency || 'USD';
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(Number(n) || 0); }
  catch { return '$' + (Number(n) || 0).toFixed(2); }
}

export function pad(n) { return String(n).padStart(2, '0'); }
export function isoDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function today() { return isoDate(new Date()); }
export function parseDate(s) { if (!s) return null; const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d); }
export function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }

export function fmtDate(s, opts) {
  if (!s) return '—';
  const d = parseDate(s);
  if (!d || isNaN(d)) return esc(s);
  return d.toLocaleDateString(undefined, opts || { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
export function fmtShortDate(s) { return fmtDate(s, { month: 'short', day: 'numeric' }); }

export function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'pm' : 'am';
  const hh = ((h + 11) % 12) + 1;
  return m ? `${hh}:${pad(m)}${ap}` : `${hh}${ap}`;
}
export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function timeAgo(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtShortDate(iso.slice(0, 10));
}

export const titleCase = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function badge(text, kind) {
  return `<span class="badge badge-${esc(kind || String(text).toLowerCase().replace(/\s+/g, '-'))}">${esc(titleCase(text))}</span>`;
}

// ------------------------------------------------------------------ business constants
export const EVENT_TYPES = ['Wedding', 'Corporate', 'Birthday', 'Private Party', 'Graduation', 'Holiday Party', 'Festival', 'Fundraiser', 'Brand Activation', 'Other'];
export const SERVICE_TYPES = ['Full Bar', 'Beer & Wine', 'Dry Hire (BYO)', 'Mocktail Bar', 'Coffee / Espresso', 'Champagne / Mimosa Bar', 'Custom'];
export const EVENT_STATUSES = ['inquiry', 'tentative', 'confirmed', 'completed', 'cancelled'];
export const STAFF_ROLES = ['bartender', 'lead bartender', 'barback', 'barista', 'server', 'event manager', 'driver'];
export const LEAD_STAGES = [
  ['new', 'New inquiry'], ['contacted', 'Contacted'], ['quoted', 'Quote sent'], ['negotiating', 'Follow-up'], ['won', 'Booked'], ['lost', 'Lost'],
];
export const LEAD_SOURCES = ['Website form', 'Instagram', 'Facebook', 'Google', 'The Knot', 'WeddingWire', 'Thumbtack', 'Referral', 'Venue partner', 'Planner', 'Repeat client', 'Other'];
export const EXPENSE_CATEGORIES = ['Alcohol', 'Mixers & Garnish', 'Ice', 'Disposables', 'Equipment', 'Vehicle & Fuel', 'Insurance', 'Licenses & Permits', 'Marketing', 'Software', 'Staff Payroll', 'Rentals', 'Other'];
export const INVENTORY_CATEGORIES = ['Bar & Equipment', 'Glassware', 'Tools', 'Coolers & Ice', 'Decor & Signage', 'Liquor', 'Beer & Wine', 'Mixers', 'Garnish', 'Disposables', 'Coffee'];
export const PAYMENT_METHODS = ['Card', 'Cash', 'Check', 'Zelle', 'Venmo', 'Cash App', 'PayPal', 'Bank transfer', 'Other'];

export const DEFAULT_CHECKLIST = [
  'Contract / quote signed', 'Deposit received', 'Final guest count confirmed', 'Drink menu finalized',
  'Shopping list / alcohol order placed', 'Staff scheduled & confirmed', 'Venue load-in & parking details confirmed',
  'Ice ordered', 'Van loaded (bar, coolers, tools, signage)', 'Final balance paid', 'Post-event follow-up & review request',
];

// ------------------------------------------------------------------ business logic
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
  const deposit = total * ((Number(inv.depositPct) || 0) / 100);
  return { subtotal, discount, service, tax, total, paid, deposit, balance: Math.max(0, round2(total - paid)) };
}
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Computed display status.
export function invoiceStatus(inv) {
  if (inv.status === 'void') return 'void';
  const t = invoiceTotals(inv);
  if (inv.kind === 'quote') {
    if (inv.status === 'accepted' || inv.acceptedAt) return 'accepted';
    if (inv.status === 'declined') return 'declined';
    if (inv.expiresOn && inv.expiresOn < today()) return 'expired';
    return inv.status === 'sent' ? 'sent' : 'draft';
  }
  if (t.total > 0 && t.balance <= 0.004) return 'paid';
  if (t.paid > 0) return inv.dueDate && inv.dueDate < today() ? 'overdue' : 'partial';
  if (inv.status === 'draft') return 'draft';
  if (inv.dueDate && inv.dueDate < today()) return 'overdue';
  return 'sent';
}

export function packagePrice(pkg, guests, hours) {
  if (!pkg) return 0;
  let p = Number(pkg.price) || 0;
  if (pkg.pricingType === 'per_person') p *= Number(guests) || 0;
  else if (pkg.pricingType === 'per_hour') p *= Number(hours) || 0;
  return Math.max(p, Number(pkg.minimum) || 0);
}

export function eventHours(ev) {
  if (!ev || !ev.startTime || !ev.endTime) return 0;
  const [sh, sm] = ev.startTime.split(':').map(Number);
  const [eh, em] = ev.endTime.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

// Shift start/end are stored as 'YYYY-MM-DDTHH:MM' local strings.
export function shiftHours(sh, actual = true) {
  const s = actual && sh.clockIn ? new Date(sh.clockIn) : new Date(sh.start);
  const e = actual && sh.clockOut ? new Date(sh.clockOut) : new Date(sh.end);
  const h = (e - s) / 3600000;
  return h > 0 ? h : 0;
}

export function shiftPay(sh) {
  const st = byId('staff', sh.staffId);
  const rate = sh.rate !== undefined && sh.rate !== '' && sh.rate !== null ? Number(sh.rate) : Number(st?.payRate) || 0;
  const payType = sh.payType || st?.payType || 'hourly';
  const base = payType === 'flat' ? rate : rate * shiftHours(sh);
  return { rate, payType, hours: shiftHours(sh), base, tips: Number(sh.tips) || 0, total: base + (Number(sh.tips) || 0) };
}

export function overlaps(aStart, aEnd, bStart, bEnd) { return aStart < bEnd && bStart < aEnd; }

// Returns list of human-readable problems for assigning staff to a time window.
export function staffConflicts(staffId, start, end, ignoreShiftId) {
  const issues = [];
  const st = byId('staff', staffId);
  if (!st) return issues;
  if (st.status === 'inactive') issues.push('Marked inactive');
  const date = start.slice(0, 10);
  if ((st.unavailableDates || []).includes(date)) issues.push(`Unavailable on ${fmtShortDate(date)}`);
  const dow = parseDate(date).getDay();
  if (st.weeklyAvailability && st.weeklyAvailability[dow] === false) issues.push(`Doesn't usually work ${['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][dow]}`);
  for (const sh of list('shifts')) {
    if (sh.staffId !== staffId || sh.id === ignoreShiftId || sh.status === 'declined') continue;
    if (overlaps(start, end, sh.start, sh.end)) {
      const ev = byId('events', sh.eventId);
      issues.push(`Double-booked: ${ev ? ev.title : 'another shift'} ${fmtTime(sh.start.slice(11))}–${fmtTime(sh.end.slice(11))}`);
    }
  }
  for (const c of st.certifications || []) {
    if (c.expires && c.expires < date) issues.push(`${c.name} expires ${fmtShortDate(c.expires)}`);
  }
  return issues;
}

export function eventFinancials(ev) {
  const invs = list('invoices').filter((i) => i.eventId === ev.id && i.kind === 'invoice' && i.status !== 'void');
  const revenue = invs.reduce((a, i) => a + invoiceTotals(i).total - invoiceTotals(i).tax, 0);
  const collected = invs.reduce((a, i) => a + invoiceTotals(i).paid, 0);
  const shifts = list('shifts').filter((s) => s.eventId === ev.id && s.status !== 'declined');
  const labor = shifts.reduce((a, s) => a + shiftPay(s).base, 0);
  const expenses = list('expenses').filter((x) => x.eventId === ev.id).reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const profit = revenue - labor - expenses;
  return { revenue, collected, labor, expenses, profit, margin: revenue ? profit / revenue : 0, invoices: invs };
}

export function staffingStatus(ev) {
  const needed = ev.staffNeeded || {};
  const shifts = list('shifts').filter((s) => s.eventId === ev.id && s.status !== 'declined');
  const totalNeeded = Object.values(needed).reduce((a, n) => a + (Number(n) || 0), 0);
  return { needed: totalNeeded, assigned: shifts.length, confirmed: shifts.filter((s) => s.status === 'confirmed' || s.clockIn).length };
}

// Bar calculator (industry rules of thumb).
export function barCalc({ guests, hours, mix = { liquor: 50, wine: 30, beer: 20 }, drinkers = 100, nonAlc = false }) {
  const s = state.settings;
  const g = (Number(guests) || 0) * ((Number(drinkers) || 0) / 100);
  const h = Number(hours) || 0;
  const firstHour = Number(s.drinksFirstHour) || 2;
  const after = Number(s.drinksPerHourAfter) || 1;
  const totalDrinks = Math.ceil(g * (h > 0 ? firstHour + Math.max(0, h - 1) * after : 0));
  const liquorDrinks = totalDrinks * (mix.liquor / 100);
  const wineDrinks = totalDrinks * (mix.wine / 100);
  const beerDrinks = totalDrinks * (mix.beer / 100);
  const out = {
    totalDrinks,
    liquorBottles750: Math.ceil(liquorDrinks / 16), // 1.5oz pours per 750ml
    liquor175L: Math.ceil(liquorDrinks / 39),
    wineBottles: Math.ceil(wineDrinks / 5),
    beerCans: Math.ceil(beerDrinks),
    beerCases: Math.ceil(beerDrinks / 24),
    iceLbs: Math.ceil((Number(guests) || 0) * (h > 3 ? 2 : 1.5)),
    cups: Math.ceil(totalDrinks * 1.3),
    napkins: Math.ceil(totalDrinks * 1.5),
    mixersLiters: Math.ceil(liquorDrinks * 4 / 33.8),
    bartenders: Math.max(1, Math.ceil((Number(guests) || 0) / (nonAlc ? 100 : 75))),
    barbacks: (Number(guests) || 0) > 150 ? Math.ceil((Number(guests) || 0) / 200) : 0,
  };
  return out;
}

// ------------------------------------------------------------------ UI helpers
export function toast(msg, kind = 'ok') {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = `toast toast-${kind}`;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
}

export function confirmBox(message, okLabel = 'Delete') {
  return new Promise((resolve) => {
    openModal({
      title: 'Are you sure?', body: `<p>${esc(message)}</p>`, submitLabel: okLabel, danger: true,
      onSubmit: () => { resolve(true); }, onCancel: () => resolve(false),
    });
  });
}

/**
 * Field definition: { n: name, l: label, t: type, o: options [[value,label]] | [value], req, full, step, min, ph, help, attrs }
 */
export function fields(defs, v = {}) {
  return defs.map((f) => {
    if (f.t === 'section') return `<h4 class="form-section full">${esc(f.l)}</h4>`;
    if (f.t === 'html') return `<div class="${f.full ? 'full' : ''}">${f.html}</div>`;
    const id = 'f_' + f.n + '_' + Math.random().toString(36).slice(2, 7);
    const val = v[f.n] ?? f.def ?? '';
    const req = f.req ? 'required' : '';
    const attrs = f.attrs || '';
    let input;
    if (f.t === 'select') {
      const opts = (f.o || []).map((o) => {
        const [ov, ol] = Array.isArray(o) ? o : [o, o];
        return `<option value="${esc(ov)}" ${String(ov) === String(val) ? 'selected' : ''}>${esc(ol)}</option>`;
      }).join('');
      input = `<select id="${id}" name="${f.n}" ${req} ${attrs}>${f.blank !== false ? `<option value="">${esc(f.blank || '—')}</option>` : ''}${opts}</select>`;
    } else if (f.t === 'textarea') {
      input = `<textarea id="${id}" name="${f.n}" rows="${f.rows || 3}" ${req} placeholder="${esc(f.ph || '')}" ${attrs}>${esc(val)}</textarea>`;
    } else if (f.t === 'checkbox') {
      return `<label class="check ${f.full ? 'full' : ''}"><input type="checkbox" name="${f.n}" ${val ? 'checked' : ''} ${attrs}> ${esc(f.l)}</label>`;
    } else {
      input = `<input id="${id}" type="${f.t || 'text'}" name="${f.n}" value="${esc(val)}" ${req} ${f.step ? `step="${f.step}"` : ''} ${f.min !== undefined ? `min="${f.min}"` : ''} placeholder="${esc(f.ph || '')}" ${f.t === 'number' ? 'inputmode="decimal"' : ''} ${attrs}>`;
    }
    return `<div class="field ${f.full ? 'full' : ''}"><label for="${id}">${esc(f.l)}${f.req ? ' *' : ''}</label>${input}${f.help ? `<small>${esc(f.help)}</small>` : ''}</div>`;
  }).join('');
}

export function readForm(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'number') out[el.name] = el.value === '' ? '' : Number(el.value);
    else out[el.name] = el.value.trim();
  }
  return out;
}

export function openModal({ title, body, submitLabel = 'Save', onSubmit, onCancel, onMount, wide, danger, hideSubmit, extraButtons = '' }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'modal' + (wide ? ' wide' : '');
  dlg.innerHTML = `
    <form method="dialog" class="modal-form" novalidate>
      <header><h3>${esc(title)}</h3><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
      <div class="modal-body">${body}</div>
      <footer>
        ${extraButtons}
        <span class="spacer"></span>
        <button type="button" class="btn" data-close>Cancel</button>
        ${hideSubmit ? '' : `<button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${esc(submitLabel)}</button>`}
      </footer>
    </form>`;
  document.body.appendChild(dlg);
  const form = dlg.querySelector('form');
  let done = false;
  const close = (cancelled) => {
    if (cancelled && !done && onCancel) onCancel();
    done = true;
    dlg.close();
    dlg.remove();
  };
  dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => close(true)));
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(true); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const btn = form.querySelector('button[type=submit]');
    if (btn) btn.disabled = true;
    try {
      const r = onSubmit ? await onSubmit(readForm(form), form, dlg) : undefined;
      if (r !== false) { done = true; close(false); }
    } catch (err) {
      toast(err.message || 'Something went wrong', 'err');
    } finally { if (btn) btn.disabled = false; }
  });
  dlg.showModal();
  if (onMount) onMount(dlg, form);
  const first = form.querySelector('input:not([type=hidden]):not([type=checkbox]),select,textarea');
  if (first && window.matchMedia('(min-width: 800px)').matches) first.focus();
  return { dlg, form, close: () => close(false) };
}

export function emptyState(icon, text, action = '') {
  return `<div class="empty"><div class="empty-icon">${icon}</div><p>${esc(text)}</p>${action}</div>`;
}

export function downloadFile(name, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function toCSV(rows) {
  return rows.map((r) => r.map((c) => {
    const s = String(c ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}

// iCalendar export for events/shifts.
export function icsFor(items) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const fmt = (s) => s.replace(/[-:]/g, '').slice(0, 13) + '00';
  const escI = (s) => String(s || '').replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BarOps//EN', 'CALSCALE:GREGORIAN'];
  for (const it of items) {
    lines.push('BEGIN:VEVENT', `UID:${it.uid}@barops`, `DTSTAMP:${stamp}`, `DTSTART:${fmt(it.start)}`, `DTEND:${fmt(it.end)}`,
      `SUMMARY:${escI(it.title)}`, `LOCATION:${escI(it.location)}`, `DESCRIPTION:${escI(it.description)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function eventStartEnd(ev) {
  const start = `${ev.date}T${ev.startTime || '18:00'}`;
  let endDate = ev.date;
  if (ev.endTime && ev.startTime && ev.endTime <= ev.startTime) endDate = addDays(ev.date, 1);
  const end = `${endDate}T${ev.endTime || '22:00'}`;
  return { start, end };
}

export function clientName(id) { const c = byId('clients', id); return c ? (c.company ? `${c.name} (${c.company})` : c.name) : '—'; }
export function staffName(id) { return byId('staff', id)?.name || 'Unassigned'; }
export function eventTitle(id) { return byId('events', id)?.title || '—'; }

export function options(col, labelFn, filter) {
  return list(col).filter(filter || (() => true)).map((x) => [x.id, labelFn(x)]);
}

export function mapsLink(addr) {
  return addr ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}" target="_blank" rel="noopener">${esc(addr)} ↗</a>` : '—';
}

export function setTitle(t) { document.title = `${t} · ${state.settings.businessName || 'BarOps'}`; }

export function publicDocUrl(inv) { return `${location.origin}/doc.html#${inv.publicToken}`; }

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); }
  catch { prompt('Copy this:', text); }
}

export function pageHead(title, sub = '', actions = '') {
  return `<div class="page-head"><div><h2>${esc(title)}</h2>${sub ? `<p class="muted">${sub}</p>` : ''}</div><div class="page-actions">${actions}</div></div>`;
}

export function stat(label, value, sub = '', href = '') {
  const inner = `<div class="stat-label">${esc(label)}</div><div class="stat-value">${value}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}`;
  return href ? `<a class="stat" href="${href}">${inner}</a>` : `<div class="stat">${inner}</div>`;
}

// Delegated click handling: elements with data-act="name" call handlers[name](el, event).
export function bindActions(root, handlers) {
  root.onclick = async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    const fn = handlers[el.dataset.act];
    if (!fn) return;
    e.preventDefault();
    try { await fn(el, e); } catch (err) { console.error(err); toast(err.message || 'Error', 'err'); }
  };
}

export function searchFilter(items, q, fn) {
  const s = (q || '').toLowerCase().trim();
  if (!s) return items;
  return items.filter((x) => fn(x).toLowerCase().includes(s));
}
