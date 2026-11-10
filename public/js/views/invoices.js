import {
  state, list, byId, esc, money, today, addDays, fmtShortDate, fmtDate, badge, pageHead, fields, openModal, saveItem,
  removeItem, confirmBox, toast, ui, bindActions, emptyState, clientName, options, invoiceTotals, invoiceStatus,
  packagePrice, eventHours, PAYMENT_METHODS, publicDocUrl, copyText, logActivity, searchFilter, round2, setTitle,
  downloadFile, toCSV, titleCase,
} from '../core.js';

let filter = { kind: 'all', status: '', q: '' };

export function blankDoc(kind, extra = {}) {
  const s = state.settings;
  const issue = today();
  return {
    kind, issueDate: issue,
    dueDate: kind === 'invoice' ? addDays(issue, Number(s.paymentTermsDays) || 14) : '',
    expiresOn: kind === 'quote' ? addDays(issue, 14) : '',
    items: [], taxRate: Number(s.taxRate) || 0, serviceChargePct: Number(s.serviceChargePct) || 0, depositPct: Number(s.depositPct) || 0,
    discount: 0, payments: [], status: 'draft', notes: '', terms: s.terms || '', ...extra,
  };
}

export function itemsForEvent(ev) {
  const s = state.settings;
  const items = [];
  const hours = eventHours(ev);
  const pkg = byId('packages', ev.packageId);
  if (pkg) {
    const guests = Number(ev.guestCount) || 0;
    if (pkg.pricingType === 'per_person') {
      const total = packagePrice(pkg, guests, hours);
      if (total > (Number(pkg.price) || 0) * guests) items.push({ desc: `${pkg.name} (package minimum)`, qty: 1, rate: total, taxable: true });
      else items.push({ desc: `${pkg.name} — ${guests} guests`, qty: guests, rate: Number(pkg.price) || 0, taxable: true });
    } else if (pkg.pricingType === 'per_hour') {
      const total = packagePrice(pkg, guests, hours);
      if (total > (Number(pkg.price) || 0) * hours) items.push({ desc: `${pkg.name} (minimum)`, qty: 1, rate: total, taxable: true });
      else items.push({ desc: `${pkg.name} — ${hours} hrs`, qty: hours, rate: Number(pkg.price) || 0, taxable: true });
    } else {
      items.push({ desc: pkg.name, qty: 1, rate: Number(pkg.price) || 0, taxable: true });
    }
  } else {
    items.push({ desc: `${ev.serviceType || 'Bar service'} — ${ev.guestCount || 0} guests, ${hours} hrs`, qty: 1, rate: 0, taxable: true });
  }
  const miles = Number(ev.mileage) || 0;
  const free = Number(s.freeTravelMiles) || 0;
  if (miles > free && Number(s.travelFeePerMile)) {
    const billable = round2((miles - free) * 2);
    items.push({ desc: `Travel fee (${billable} round-trip miles beyond ${free} mi)`, qty: billable, rate: Number(s.travelFeePerMile), taxable: false });
  }
  return items;
}

export async function createDocFromEvent(ev, kind) {
  const doc = blankDoc(kind, { clientId: ev.clientId || '', eventId: ev.id, items: itemsForEvent(ev) });
  if (kind === 'invoice' && ev.date) {
    const due = addDays(ev.date, -7);
    doc.dueDate = due > today() ? due : addDays(today(), 3);
  }
  const saved = await saveItem('invoices', doc);
  logActivity('invoice', `${titleCase(kind)} ${saved.number} created for ${ev.title}`, saved.id);
  toast(`${titleCase(kind)} ${saved.number} created`);
  ui.go('#/invoices/' + saved.id);
}

export function render(el, route) {
  if (route.id) return renderDoc(el, route.id);
  const nk = route.query.get('new');
  if (nk) { history.replaceState(null, '', '#/invoices'); setTimeout(() => newDocModal(nk === 'quote' ? 'quote' : 'invoice'), 0); }
  if (route.query.get('status')) filter.status = route.query.get('status');

  let items = list('invoices');
  if (filter.kind !== 'all') items = items.filter((i) => i.kind === filter.kind);
  if (filter.status) items = items.filter((i) => invoiceStatus(i) === filter.status);
  items = searchFilter(items, filter.q, (i) => `${i.number} ${clientName(i.clientId)} ${byId('events', i.eventId)?.title || ''}`);
  items = [...items].sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || '') || (b.number || '').localeCompare(a.number || ''));
  const all = list('invoices').filter((i) => i.kind === 'invoice' && i.status !== 'void');
  const outstanding = all.reduce((a, i) => a + invoiceTotals(i).balance, 0);
  const overdue = all.filter((i) => invoiceStatus(i) === 'overdue').reduce((a, i) => a + invoiceTotals(i).balance, 0);
  const quotesOut = list('invoices').filter((i) => i.kind === 'quote' && invoiceStatus(i) === 'sent').reduce((a, i) => a + invoiceTotals(i).total, 0);
  const statuses = ['draft', 'sent', 'accepted', 'partial', 'paid', 'overdue', 'expired', 'void'];

  el.innerHTML = `
    ${pageHead('Quotes & Invoices', '', '<button class="btn" data-act="csv">Export CSV</button><button class="btn" data-act="newQuote">+ Quote</button><button class="btn btn-primary" data-act="newInvoice">+ Invoice</button>')}
    <div class="stats three">
      <div class="stat"><div class="stat-label">Outstanding</div><div class="stat-value">${money(outstanding)}</div></div>
      <div class="stat"><div class="stat-label">Overdue</div><div class="stat-value ${overdue ? 'text-err' : ''}">${money(overdue)}</div></div>
      <div class="stat"><div class="stat-label">Quotes awaiting reply</div><div class="stat-value">${money(quotesOut)}</div></div>
    </div>
    <div class="toolbar">
      <div class="seg">${[['all', 'All'], ['quote', 'Quotes'], ['invoice', 'Invoices']].map(([k, l]) => `<button class="${filter.kind === k ? 'on' : ''}" data-act="kind" data-v="${k}">${l}</button>`).join('')}</div>
      <select data-filter="status"><option value="">Any status</option>${statuses.map((s) => `<option value="${s}" ${filter.status === s ? 'selected' : ''}>${titleCase(s)}</option>`).join('')}</select>
      <input type="search" placeholder="Search number, client, event…" value="${esc(filter.q)}" data-filter="q">
    </div>
    ${items.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Number</th><th>Client</th><th>Event</th><th>Issued</th><th>Due</th><th class="num">Total</th><th class="num">Balance</th><th>Status</th></tr></thead><tbody>
      ${items.map((i) => {
        const t = invoiceTotals(i);
        const ev = byId('events', i.eventId);
        return `<tr data-href="#/invoices/${i.id}"><td data-l="Number"><a href="#/invoices/${i.id}"><b>${esc(i.number)}</b></a><div class="muted small">${i.kind}</div></td>
          <td data-l="Client">${esc(clientName(i.clientId))}</td><td data-l="Event">${ev ? esc(ev.title) : '—'}</td>
          <td data-l="Issued">${fmtShortDate(i.issueDate)}</td><td data-l="Due">${i.kind === 'quote' ? (i.expiresOn ? 'exp. ' + fmtShortDate(i.expiresOn) : '—') : fmtShortDate(i.dueDate)}</td>
          <td data-l="Total" class="num">${money(t.total)}</td><td data-l="Balance" class="num">${i.kind === 'invoice' ? money(t.balance) : '—'}</td><td data-l="Status">${badge(invoiceStatus(i))}</td></tr>`;
      }).join('')}</tbody></table></div>` : emptyState('$', 'No quotes or invoices yet.', '<button class="btn btn-primary" data-act="newQuote">Create a quote</button>')}`;

  el.querySelectorAll('[data-filter]').forEach((inp) => inp.addEventListener(inp.type === 'search' ? 'input' : 'change', () => {
    filter[inp.dataset.filter] = inp.value;
    const pos = inp.selectionStart;
    render(el, { query: new URLSearchParams() });
    const again = el.querySelector(`[data-filter="${inp.dataset.filter}"]`);
    if (again && inp.type === 'search') { again.focus(); again.setSelectionRange(pos, pos); }
  }));
  el.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a')) location.hash = tr.dataset.href; }));
  bindActions(el, {
    kind: (b) => { filter.kind = b.dataset.v; render(el, { query: new URLSearchParams() }); },
    newQuote: () => newDocModal('quote'),
    newInvoice: () => newDocModal('invoice'),
    csv: () => {
      const rows = [['Number', 'Type', 'Client', 'Event', 'Issued', 'Due', 'Subtotal', 'Service', 'Tax', 'Total', 'Paid', 'Balance', 'Status']];
      for (const i of items) { const t = invoiceTotals(i); rows.push([i.number, i.kind, clientName(i.clientId), byId('events', i.eventId)?.title || '', i.issueDate, i.dueDate, t.subtotal.toFixed(2), t.service.toFixed(2), t.tax.toFixed(2), t.total.toFixed(2), t.paid.toFixed(2), t.balance.toFixed(2), invoiceStatus(i)]); }
      downloadFile(`invoices-${today()}.csv`, toCSV(rows), 'text/csv');
    },
  });
}

export function newDocModal(kind, preset = {}) {
  openModal({
    title: kind === 'quote' ? 'New quote' : 'New invoice', submitLabel: 'Create',
    body: `<div class="form-grid">${fields([
      { n: 'clientId', l: 'Client', t: 'select', req: true, full: true, o: options('clients', (c) => c.name + (c.company ? ` (${c.company})` : '')) },
      { n: 'eventId', l: 'Event (optional — pre-fills line items)', t: 'select', full: true, o: options('events', (e) => `${e.title} · ${e.date}`) },
    ], preset)}</div>${list('clients').length ? '' : '<p class="muted small">No clients yet — <a href="#/clients">add one first</a>.</p>'}`,
    onMount: (dlg, form) => {
      form.eventId.addEventListener('change', () => { const ev = byId('events', form.eventId.value); if (ev && ev.clientId && !form.clientId.value) form.clientId.value = ev.clientId; });
    },
    onSubmit: async (f) => {
      const ev = byId('events', f.eventId);
      if (ev) { const evClient = ev.clientId; if (!evClient) await saveItem('events', { ...ev, clientId: f.clientId }); return createDocFromEvent({ ...ev, clientId: f.clientId }, kind); }
      const saved = await saveItem('invoices', blankDoc(kind, { clientId: f.clientId, items: [{ desc: '', qty: 1, rate: 0, taxable: true }] }));
      ui.go('#/invoices/' + saved.id);
    },
  });
}

function renderDoc(el, id) {
  const orig = byId('invoices', id);
  if (!orig) { el.innerHTML = emptyState('?', 'Document not found', '<a class="btn" href="#/invoices">Back</a>'); return; }
  setTitle(orig.number);
  const doc = JSON.parse(JSON.stringify(orig));
  doc.items = doc.items || [];
  const status = invoiceStatus(doc);
  const isQuote = doc.kind === 'quote';
  const client = byId('clients', doc.clientId);
  const locked = status === 'void';

  el.innerHTML = `
    <a href="#/invoices" class="back">← Quotes & Invoices</a>
    ${pageHead(`${isQuote ? 'Quote' : 'Invoice'} ${doc.number}`, `${badge(status)} ${doc.quoteNumber ? `<span class="muted small">from quote ${esc(doc.quoteNumber)}</span>` : ''} ${doc.viewedAt ? `<span class="muted small">· viewed by client ${fmtShortDate(doc.viewedAt.slice(0, 10))}</span>` : ''} ${doc.acceptedBy ? `<span class="muted small">· signed by ${esc(doc.acceptedBy)}</span>` : ''}`, `
      <button class="btn" data-act="share">Share / Send</button>
      <a class="btn" href="${publicDocUrl(doc)}" target="_blank" rel="noopener">Preview / PDF</a>
      ${isQuote ? '<button class="btn btn-primary" data-act="convert">Convert to invoice</button>' : '<button class="btn btn-primary" data-act="pay">Record payment</button>'}
      <div class="dropdown"><button class="btn" data-act="more">⋯</button><div class="menu">
        <button data-act="dup">Duplicate</button>
        ${isQuote ? '<button data-act="markAccepted">Mark accepted</button><button data-act="markDeclined">Mark declined</button>' : ''}
        ${status !== 'void' ? '<button data-act="void">Void</button>' : '<button data-act="unvoid">Restore</button>'}
        <button data-act="del" class="danger">Delete</button>
      </div></div>`)}
    <div class="grid-3-1">
      <form class="card doc-editor" id="docForm" ${locked ? 'inert' : ''}>
        <div class="form-grid">
          ${fields([
            { n: 'clientId', l: 'Client', t: 'select', req: true, o: options('clients', (c) => c.name + (c.company ? ` (${c.company})` : '')) },
            { n: 'eventId', l: 'Event', t: 'select', o: options('events', (e) => `${e.title} · ${e.date}`) },
            { n: 'issueDate', l: 'Issue date', t: 'date' },
            isQuote ? { n: 'expiresOn', l: 'Valid until', t: 'date' } : { n: 'dueDate', l: 'Due date', t: 'date' },
          ], doc)}
        </div>
        <div class="table-wrap"><table class="items">
          <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th><th title="Taxable">Tax</th><th></th></tr></thead>
          <tbody id="itemRows">${doc.items.map((it, i) => itemRow(it, i)).join('')}</tbody>
        </table></div>
        <div class="row-actions">
          <button type="button" class="btn btn-sm" data-act="addItem">+ Line item</button>
          <select class="btn-sm" id="pkgPick"><option value="">+ Add from package…</option>${list('packages').filter((p) => p.active !== false).map((p) => `<option value="${p.id}">${esc(p.name)} (${money(p.price)} ${p.pricingType === 'per_person' ? '/guest' : p.pricingType === 'per_hour' ? '/hr' : 'flat'})</option>`).join('')}</select>
        </div>
        <div class="form-grid four">
          ${fields([
            { n: 'discount', l: 'Discount ($)', t: 'number', step: '0.01', min: 0 },
            { n: 'serviceChargePct', l: 'Service charge %', t: 'number', step: '0.01', min: 0, help: 'Gratuity / admin fee' },
            { n: 'taxRate', l: 'Tax %', t: 'number', step: '0.001', min: 0 },
            { n: 'depositPct', l: 'Deposit %', t: 'number', step: '1', min: 0 },
          ], doc)}
        </div>
        <div class="totals" id="totals"></div>
        <div class="form-grid">
          ${fields([
            { n: 'notes', l: 'Notes to client', t: 'textarea', full: true, rows: 2 },
            { n: 'terms', l: 'Terms & conditions', t: 'textarea', full: true, rows: 3 },
          ], doc)}
        </div>
        <p class="muted small" id="saveState">All changes saved automatically.</p>
      </form>
      <div class="stack">
        <section class="card">
          <div class="card-head"><h3>Bill to</h3></div>
          ${client ? `<p><a href="#/clients/${client.id}"><b>${esc(client.name)}</b></a>${client.company ? `<br>${esc(client.company)}` : ''}<br>${esc(client.email || '')}<br>${esc(client.phone || '')}</p>` : '<p class="muted">No client selected.</p>'}
        </section>
        ${isQuote ? '' : `<section class="card">
          <div class="card-head"><h3>Payments</h3><button class="btn btn-sm" data-act="pay">+ Add</button></div>
          ${(doc.payments || []).length ? `<ul class="list">${doc.payments.map((p) => `<li class="list-row"><div class="grow"><b>${money(p.amount)}</b> <span class="muted">${esc(p.method || '')}</span><div class="muted small">${fmtShortDate(p.date)}${p.note ? ' · ' + esc(p.note) : ''}</div></div><button class="icon-btn sm" data-act="rmPay" data-pid="${p.id}" title="Remove">✕</button></li>`).join('')}</ul>` : '<p class="muted">No payments recorded.</p>'}
        </section>`}
        <section class="card">
          <div class="card-head"><h3>Client link</h3></div>
          <p class="muted small">Share this secure link — your client can view${isQuote ? ', e-sign and accept' : ', print and pay per your instructions'}.</p>
          <div class="copy-row"><input readonly value="${esc(publicDocUrl(doc))}"><button class="btn btn-sm" data-act="copy">Copy</button></div>
        </section>
      </div>
    </div>`;

  const form = el.querySelector('#docForm');
  const totalsBox = el.querySelector('#totals');
  const saveState = el.querySelector('#saveState');

  function readDoc() {
    const f = new FormData(form);
    for (const k of ['clientId', 'eventId', 'issueDate', 'dueDate', 'expiresOn', 'notes', 'terms']) if (f.has(k)) doc[k] = f.get(k);
    for (const k of ['discount', 'serviceChargePct', 'taxRate', 'depositPct']) doc[k] = Number(f.get(k)) || 0;
    doc.items = [...form.querySelectorAll('#itemRows tr')].map((tr) => ({
      desc: tr.querySelector('[data-f=desc]').value, qty: Number(tr.querySelector('[data-f=qty]').value) || 0,
      rate: Number(tr.querySelector('[data-f=rate]').value) || 0, taxable: tr.querySelector('[data-f=taxable]').checked,
    }));
  }
  function showTotals() {
    const t = invoiceTotals(doc);
    form.querySelectorAll('#itemRows tr').forEach((tr, i) => { const it = doc.items[i]; tr.querySelector('.amt').textContent = money((it.qty || 0) * (it.rate || 0)); });
    totalsBox.innerHTML = `
      <div><span>Subtotal</span><b>${money(t.subtotal)}</b></div>
      ${t.discount ? `<div><span>Discount</span><b>−${money(t.discount)}</b></div>` : ''}
      ${t.service ? `<div><span>Service charge (${doc.serviceChargePct}%)</span><b>${money(t.service)}</b></div>` : ''}
      <div><span>Tax (${doc.taxRate}%)</span><b>${money(t.tax)}</b></div>
      <div class="grand"><span>Total</span><b>${money(t.total)}</b></div>
      ${doc.depositPct ? `<div><span>Deposit due (${doc.depositPct}%)</span><b>${money(t.deposit)}</b></div>` : ''}
      ${!isQuote ? `<div><span>Paid</span><b>${money(t.paid)}</b></div><div class="grand"><span>Balance due</span><b>${money(t.balance)}</b></div>` : ''}`;
  }
  let timer;
  async function persist() {
    clearTimeout(timer);
    saveState.textContent = 'Saving…';
    try { await saveItem('invoices', { ...doc }); saveState.textContent = 'All changes saved automatically.'; }
    catch (e) { saveState.textContent = 'Save failed: ' + e.message; }
  }
  form.addEventListener('input', () => { readDoc(); showTotals(); clearTimeout(timer); timer = setTimeout(persist, 800); });
  form.addEventListener('change', () => { readDoc(); showTotals(); persist(); });
  form.addEventListener('submit', (e) => e.preventDefault());
  el.querySelector('#pkgPick').addEventListener('change', (e) => {
    const p = byId('packages', e.target.value);
    e.target.value = '';
    if (!p) return;
    const ev = byId('events', doc.eventId);
    const qty = p.pricingType === 'per_person' ? (Number(ev?.guestCount) || 1) : p.pricingType === 'per_hour' ? (eventHours(ev) || 1) : 1;
    doc.items.push({ desc: p.name, qty, rate: Number(p.price) || 0, taxable: true });
    persist().then(() => ui.rerender());
  });
  showTotals();

  const setStatus = async (patch, msg) => { await persist(); await saveItem('invoices', { ...byId('invoices', id), ...patch }); toast(msg); ui.rerender(); };

  bindActions(el, {
    more: (b) => b.parentElement.classList.toggle('open'),
    addItem: () => { readDoc(); doc.items.push({ desc: '', qty: 1, rate: 0, taxable: true }); persist().then(() => { ui.rerender(); setTimeout(() => { const rows = document.querySelectorAll('#itemRows [data-f=desc]'); rows[rows.length - 1]?.focus(); }, 0); }); },
    rmItem: (b) => { readDoc(); doc.items.splice(Number(b.dataset.i), 1); persist().then(() => ui.rerender()); },
    copy: () => copyText(publicDocUrl(doc)),
    share: () => shareModal(doc),
    pay: () => paymentModal(doc),
    rmPay: async (b) => { if (!(await confirmBox('Remove this payment?', 'Remove'))) return; readDoc(); doc.payments = doc.payments.filter((p) => p.id !== b.dataset.pid); await persist(); ui.rerender(); },
    convert: async () => {
      readDoc();
      const ev = byId('events', doc.eventId);
      const due = ev?.date && addDays(ev.date, -7) > today() ? addDays(ev.date, -7) : addDays(today(), Number(state.settings.paymentTermsDays) || 14);
      const saved = await saveItem('invoices', { ...doc, kind: 'invoice', status: 'sent', dueDate: due, issueDate: today() });
      if (ev && ['inquiry', 'tentative'].includes(ev.status)) await saveItem('events', { ...ev, status: 'confirmed' });
      logActivity('invoice', `Quote converted to invoice ${saved.number}`, saved.id);
      toast(`Converted to invoice ${saved.number}`);
      ui.rerender();
    },
    markAccepted: () => setStatus({ status: 'accepted', acceptedAt: new Date().toISOString(), acceptedBy: doc.acceptedBy || 'Marked by staff' }, 'Marked accepted'),
    markDeclined: () => setStatus({ status: 'declined' }, 'Marked declined'),
    void: async () => { if (await confirmBox('Void this document? It will no longer count toward revenue.', 'Void')) setStatus({ status: 'void' }, 'Voided'); },
    unvoid: () => setStatus({ status: 'draft' }, 'Restored'),
    dup: async () => {
      readDoc();
      const copy = blankDoc(doc.kind, { clientId: doc.clientId, eventId: doc.eventId, items: doc.items, discount: doc.discount, serviceChargePct: doc.serviceChargePct, taxRate: doc.taxRate, depositPct: doc.depositPct, notes: doc.notes, terms: doc.terms });
      const saved = await saveItem('invoices', copy); toast('Duplicated'); ui.go('#/invoices/' + saved.id);
    },
    del: async () => {
      if (!(await confirmBox(`Delete ${doc.number}? This cannot be undone.`))) return;
      clearTimeout(timer);
      await removeItem('invoices', id); toast('Deleted'); ui.go('#/invoices');
    },
  });
}

function itemRow(it, i) {
  return `<tr>
    <td data-l="Description"><input data-f="desc" value="${esc(it.desc)}" placeholder="Description"></td>
    <td data-l="Qty" class="num"><input data-f="qty" type="number" step="any" inputmode="decimal" value="${esc(it.qty)}"></td>
    <td data-l="Rate" class="num"><input data-f="rate" type="number" step="0.01" inputmode="decimal" value="${esc(it.rate)}"></td>
    <td data-l="Amount" class="num amt"></td>
    <td data-l="Taxable"><input data-f="taxable" type="checkbox" ${it.taxable !== false ? 'checked' : ''}></td>
    <td><button type="button" class="icon-btn sm" data-act="rmItem" data-i="${i}" title="Remove line">✕</button></td></tr>`;
}

export function paymentModal(doc) {
  const t = invoiceTotals(doc);
  const suggested = t.paid === 0 && doc.depositPct ? round2(t.deposit) : round2(t.balance);
  openModal({
    title: `Record payment — ${doc.number}`, submitLabel: 'Record payment',
    body: `<p class="muted small">Balance ${money(t.balance)}${doc.depositPct && t.paid === 0 ? ` · deposit ${money(t.deposit)}` : ''}</p><div class="form-grid">${fields([
      { n: 'amount', l: 'Amount', t: 'number', step: '0.01', min: 0.01, req: true },
      { n: 'date', l: 'Date', t: 'date', req: true },
      { n: 'method', l: 'Method', t: 'select', o: PAYMENT_METHODS, blank: false },
      { n: 'note', l: 'Reference / note', ph: 'Check #, transaction id…' },
    ], { amount: suggested, date: today(), method: 'Card' })}</div>`,
    onSubmit: async (f) => {
      const fresh = byId('invoices', doc.id);
      const payments = [...(fresh.payments || []), { id: crypto.randomUUID(), amount: Number(f.amount), date: f.date, method: f.method, note: f.note }];
      const saved = await saveItem('invoices', { ...fresh, payments, status: fresh.status === 'draft' ? 'sent' : fresh.status });
      logActivity('payment', `Payment ${money(f.amount)} received on ${saved.number}`, saved.id);
      toast('Payment recorded');
      ui.rerender();
    },
  });
}

function shareModal(doc) {
  const client = byId('clients', doc.clientId);
  const url = publicDocUrl(doc);
  const s = state.settings;
  const t = invoiceTotals(doc);
  const isQuote = doc.kind === 'quote';
  const ev = byId('events', doc.eventId);
  const subject = `${isQuote ? 'Your quote' : 'Invoice'} ${doc.number} from ${s.businessName}`;
  const bodyText = `Hi ${client?.name?.split(' ')[0] || 'there'},\n\n${isQuote
    ? `Thanks for considering ${s.businessName}${ev ? ` for ${ev.title}` : ''}! Here's your custom quote (${money(t.total)}). You can review and accept it online:`
    : `Here's your invoice ${doc.number}${ev ? ` for ${ev.title}` : ''}. Balance due: ${money(t.balance)}${doc.dueDate ? ` by ${fmtDate(doc.dueDate)}` : ''}.`}\n\n${url}\n\n${s.paymentInstructions || ''}\n\nCheers,\n${state.user.name}\n${s.businessName}${s.phone ? '\n' + s.phone : ''}`;
  openModal({
    title: 'Share with client', submitLabel: 'Mark as sent',
    body: `<div class="form-grid">${fields([
      { n: 'to', l: 'To', t: 'email', def: client?.email || '', full: true },
      { n: 'subject', l: 'Subject', def: subject, full: true },
      { n: 'message', l: 'Message', t: 'textarea', rows: 9, def: bodyText, full: true },
    ])}</div>
    <div class="row-actions"><button type="button" class="btn" data-mail>Open in email app</button><button type="button" class="btn" data-sms>Text message</button><button type="button" class="btn" data-copylink>Copy link</button></div>`,
    onMount: (dlg, form) => {
      dlg.querySelector('[data-mail]').onclick = () => { location.href = `mailto:${encodeURIComponent(form.to.value)}?subject=${encodeURIComponent(form.subject.value)}&body=${encodeURIComponent(form.message.value)}`; };
      dlg.querySelector('[data-sms]').onclick = () => { location.href = `sms:${encodeURIComponent(client?.phone || '')}?&body=${encodeURIComponent(`${subject}: ${url}`)}`; };
      dlg.querySelector('[data-copylink]').onclick = () => copyText(url);
    },
    onSubmit: async () => {
      const fresh = byId('invoices', doc.id);
      if (fresh.status === 'draft') await saveItem('invoices', { ...fresh, status: 'sent', sentAt: new Date().toISOString() });
      if (isQuote) { const lead = list('leads').find((l) => l.clientId === doc.clientId && ['new', 'contacted'].includes(l.stage)); if (lead) await saveItem('leads', { ...lead, stage: 'quoted' }); }
      logActivity('invoice', `${doc.number} sent to ${client?.name || 'client'}`, doc.id);
      toast('Marked as sent'); ui.rerender();
    },
  });
}
