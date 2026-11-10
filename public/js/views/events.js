import {
  state, list, byId, esc, money, today, fmtDate, fmtShortDate, fmtTime, badge, pageHead, fields, openModal, saveItem,
  removeItem, confirmBox, toast, ui, bindActions, emptyState, clientName, options, EVENT_TYPES, SERVICE_TYPES,
  EVENT_STATUSES, DEFAULT_CHECKLIST, staffingStatus, eventFinancials, invoiceTotals, invoiceStatus, mapsLink,
  eventHours, barCalc, icsFor, eventStartEnd, downloadFile, logActivity, shiftPay, staffName, searchFilter, titleCase,
  setTitle,
} from '../core.js';
import { assignStaffModal, defaultShiftWindow } from './schedule.js';
import { createDocFromEvent } from './invoices.js';
import { taskModal } from './tasks.js';

let filter = { when: 'upcoming', status: '', q: '' };

export function render(el, route) {
  if (route.id) return renderDetail(el, route.id);
  if (route.query.get('new')) { history.replaceState(null, '', '#/events'); setTimeout(() => eventModal({ date: route.query.get('date') || '' }), 0); }
  const t = today();
  let items = list('events');
  if (filter.when === 'upcoming') items = items.filter((e) => e.date >= t);
  if (filter.when === 'past') items = items.filter((e) => e.date < t);
  if (filter.status) items = items.filter((e) => e.status === filter.status);
  items = searchFilter(items, filter.q, (e) => `${e.title} ${e.venue} ${clientName(e.clientId)} ${e.eventType}`);
  items.sort((a, b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')));
  if (filter.when === 'past') items.reverse();

  el.innerHTML = `
    ${pageHead('Events', `${items.length} event${items.length === 1 ? '' : 's'}`, `<button class="btn btn-primary" data-act="new">+ New event</button>`)}
    <div class="toolbar">
      <div class="seg">${['upcoming', 'past', 'all'].map((w) => `<button class="${filter.when === w ? 'on' : ''}" data-act="when" data-v="${w}">${titleCase(w)}</button>`).join('')}</div>
      <select data-filter="status"><option value="">All statuses</option>${EVENT_STATUSES.map((s) => `<option ${filter.status === s ? 'selected' : ''} value="${s}">${titleCase(s)}</option>`).join('')}</select>
      <input type="search" placeholder="Search events…" value="${esc(filter.q)}" data-filter="q">
    </div>
    ${items.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Date</th><th>Event</th><th>Client</th><th>Guests</th><th>Service</th><th>Staff</th><th>Balance</th><th>Status</th></tr></thead>
      <tbody>${items.map((e) => {
        const s = staffingStatus(e);
        const bal = list('invoices').filter((i) => i.eventId === e.id && i.kind === 'invoice' && i.status !== 'void').reduce((a, i) => a + invoiceTotals(i).balance, 0);
        return `<tr data-href="#/events/${e.id}">
          <td data-l="Date"><b>${fmtShortDate(e.date)}</b><div class="muted small">${fmtTime(e.startTime)}–${fmtTime(e.endTime)}</div></td>
          <td data-l="Event"><a href="#/events/${e.id}"><b>${esc(e.title)}</b></a><div class="muted small">${esc(e.venue || '')}</div></td>
          <td data-l="Client">${esc(clientName(e.clientId))}</td>
          <td data-l="Guests">${e.guestCount || '—'}</td>
          <td data-l="Service">${esc(e.serviceType || '—')}</td>
          <td data-l="Staff" class="${s.assigned < s.needed ? 'text-warn' : ''}">${s.assigned}/${s.needed}</td>
          <td data-l="Balance">${bal > 0 ? money(bal) : '<span class="muted">—</span>'}</td>
          <td data-l="Status">${badge(e.status)}</td></tr>`;
      }).join('')}</tbody></table></div>` : emptyState('★', 'No events match. Book your first gig!', '<button class="btn btn-primary" data-act="new">+ New event</button>')}`;

  el.querySelectorAll('[data-filter]').forEach((inp) => inp.addEventListener(inp.type === 'search' ? 'input' : 'change', () => {
    filter[inp.dataset.filter] = inp.value;
    const pos = inp.selectionStart;
    render(el, route);
    const again = el.querySelector(`[data-filter="${inp.dataset.filter}"]`);
    if (again && inp.type === 'search') { again.focus(); again.setSelectionRange(pos, pos); }
  }));
  el.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a')) location.hash = tr.dataset.href; }));
  bindActions(el, {
    new: () => eventModal({}),
    when: (b) => { filter.when = b.dataset.v; render(el, route); },
  });
}

export function eventModal(ev = {}, after) {
  const s = state.settings;
  const isNew = !ev.id;
  const v = {
    status: 'confirmed', eventType: 'Wedding', serviceType: 'Full Bar', alcoholBy: 'company', startTime: '18:00', endTime: '22:00',
    arrivalTime: '', ...ev,
    need_bartender: ev.staffNeeded?.bartender ?? 2, need_barback: ev.staffNeeded?.barback ?? 0,
    need_barista: ev.staffNeeded?.barista ?? 0, need_server: ev.staffNeeded?.server ?? 0,
  };
  const body = `<div class="form-grid">${fields([
    { n: 'title', l: 'Event name', req: true, full: true, ph: 'e.g. Smith–Garcia Wedding' },
    { n: 'clientId', l: 'Client', t: 'select', o: options('clients', (c) => c.name + (c.company ? ` (${c.company})` : '')), blank: '— Select or add new below —' },
    { n: 'status', l: 'Status', t: 'select', o: EVENT_STATUSES.map((x) => [x, titleCase(x)]), blank: false },
    ...(isNew ? [{ t: 'html', full: true, html: `<details class="inline-new"><summary>+ New client</summary><div class="form-grid">${fields([
      { n: 'newClientName', l: 'Client name' }, { n: 'newClientEmail', l: 'Email', t: 'email' }, { n: 'newClientPhone', l: 'Phone', t: 'tel' },
    ])}</div></details>` }] : []),
    { n: 'eventType', l: 'Event type', t: 'select', o: EVENT_TYPES, blank: false },
    { n: 'date', l: 'Date', t: 'date', req: true },
    { n: 'startTime', l: 'Service starts', t: 'time', req: true },
    { n: 'endTime', l: 'Service ends', t: 'time', req: true },
    { n: 'arrivalTime', l: 'Staff arrival / setup', t: 'time', help: `Default: ${s.defaultShiftPadMinutes || 60} min before start` },
    { n: 'guestCount', l: 'Guest count', t: 'number', min: 0 },
    { n: 'venue', l: 'Venue name' },
    { n: 'address', l: 'Venue address', full: true },
    { n: 'mileage', l: 'Distance (miles one-way)', t: 'number', min: 0, step: '0.1' },
    { t: 'section', l: 'Service' },
    { n: 'serviceType', l: 'Service type', t: 'select', o: SERVICE_TYPES, blank: false },
    { n: 'packageId', l: 'Package', t: 'select', o: options('packages', (p) => p.name, (p) => p.active !== false) },
    { n: 'alcoholBy', l: 'Alcohol supplied by', t: 'select', o: [['company', 'Us (we purchase)'], ['client', 'Client (BYO / dry hire)'], ['none', 'Non-alcoholic']], blank: false },
    { n: 'barSetup', l: 'Bar setup', ph: 'e.g. 8ft mobile bar + back bar' },
    { t: 'section', l: 'Staff needed' },
    { n: 'need_bartender', l: 'Bartenders', t: 'number', min: 0 },
    { n: 'need_barback', l: 'Barbacks', t: 'number', min: 0 },
    { n: 'need_barista', l: 'Baristas', t: 'number', min: 0 },
    { n: 'need_server', l: 'Servers', t: 'number', min: 0 },
    { n: 'dressCode', l: 'Dress code', ph: 'All black, black tie…' },
    { n: 'contactOnSite', l: 'Day-of contact', ph: 'Name & phone' },
    { t: 'section', l: 'Details' },
    { n: 'menu', l: 'Drink menu / signature cocktails', t: 'textarea', full: true, rows: 3 },
    { n: 'staffNotes', l: 'Notes for staff (visible to team)', t: 'textarea', full: true, rows: 2, ph: 'Load-in instructions, parking, timeline…' },
    { n: 'notes', l: 'Internal notes (managers only)', t: 'textarea', full: true, rows: 2 },
  ], v)}</div>`;
  openModal({
    title: isNew ? 'New event' : 'Edit event', body, wide: true, submitLabel: isNew ? 'Create event' : 'Save',
    onSubmit: async (f) => {
      if (!f.clientId && f.newClientName) {
        const c = await saveItem('clients', { name: f.newClientName, email: f.newClientEmail, phone: f.newClientPhone, type: 'Individual' });
        f.clientId = c.id;
      }
      const item = { ...ev, ...f };
      item.staffNeeded = { bartender: f.need_bartender || 0, barback: f.need_barback || 0, barista: f.need_barista || 0, server: f.need_server || 0 };
      for (const k of ['need_bartender', 'need_barback', 'need_barista', 'need_server', 'newClientName', 'newClientEmail', 'newClientPhone']) delete item[k];
      if (isNew) item.checklist = DEFAULT_CHECKLIST.map((text) => ({ text, done: false }));
      const saved = await saveItem('events', item);
      if (isNew) logActivity('event', `Event created: ${saved.title} on ${saved.date}`, saved.id);
      toast(isNew ? 'Event created' : 'Event saved');
      if (after) after(saved);
      else if (isNew) ui.go('#/events/' + saved.id);
      else ui.rerender();
    },
  });
}

function renderDetail(el, id) {
  const ev = byId('events', id);
  if (!ev) { el.innerHTML = emptyState('?', 'Event not found', '<a class="btn" href="#/events">Back to events</a>'); return; }
  setTitle(ev.title);
  const client = byId('clients', ev.clientId);
  const pkg = byId('packages', ev.packageId);
  const fin = eventFinancials(ev);
  const shifts = list('shifts').filter((s) => s.eventId === ev.id).sort((a, b) => a.start.localeCompare(b.start));
  const ss = staffingStatus(ev);
  const docs = list('invoices').filter((i) => i.eventId === ev.id);
  const tasks = list('tasks').filter((t) => t.eventId === ev.id);
  const checklist = ev.checklist || [];
  const doneCount = checklist.filter((c) => c.done).length;
  const hours = eventHours(ev);
  const calc = barCalc({ guests: ev.guestCount, hours, mix: ev.alcoholBy === 'none' ? { liquor: 0, wine: 0, beer: 0 } : { liquor: 50, wine: 30, beer: 20 } });
  const equipment = ev.equipment || [];
  const needed = ev.staffNeeded || {};

  el.innerHTML = `
    <a href="#/events" class="back">← Events</a>
    ${pageHead(ev.title, `${fmtDate(ev.date)} · ${fmtTime(ev.startTime)}–${fmtTime(ev.endTime)} · ${badge(ev.status)}`, `
      <button class="btn" data-act="edit">Edit</button>
      <button class="btn" data-act="quote">+ Quote</button>
      <button class="btn" data-act="invoice">+ Invoice</button>
      <div class="dropdown"><button class="btn" data-act="more">⋯</button><div class="menu">
        <button data-act="dup">Duplicate event</button>
        <button data-act="ics">Add to calendar (.ics)</button>
        <button data-act="sheet">Print event sheet</button>
        ${ev.status !== 'completed' ? '<button data-act="complete">Mark completed</button>' : ''}
        ${ev.status !== 'cancelled' ? '<button data-act="cancel">Cancel event</button>' : ''}
        <button data-act="del" class="danger">Delete event</button>
      </div></div>`)}
    <div class="grid-3-1">
      <div class="stack">
        <section class="card">
          <div class="card-head"><h3>Details</h3></div>
          <dl class="dl">
            <dt>Client</dt><dd>${client ? `<a href="#/clients/${client.id}">${esc(client.name)}</a>${client.phone ? ` · <a href="tel:${esc(client.phone)}">${esc(client.phone)}</a>` : ''}${client.email ? ` · <a href="mailto:${esc(client.email)}">${esc(client.email)}</a>` : ''}` : '—'}</dd>
            <dt>Type</dt><dd>${esc(ev.eventType || '—')}</dd>
            <dt>Venue</dt><dd>${esc(ev.venue || '—')}<br>${mapsLink(ev.address)}</dd>
            <dt>Guests</dt><dd>${ev.guestCount || '—'}</dd>
            <dt>Staff arrive</dt><dd>${ev.arrivalTime ? fmtTime(ev.arrivalTime) : `${fmtTime(defaultShiftWindow(ev).start.slice(11))} <span class="muted small">(default)</span>`}</dd>
            <dt>Service</dt><dd>${esc(ev.serviceType || '—')}${pkg ? ` · ${esc(pkg.name)}` : ''}</dd>
            <dt>Alcohol</dt><dd>${ev.alcoholBy === 'client' ? 'Client supplies (BYO)' : ev.alcoholBy === 'none' ? 'Non-alcoholic' : 'We supply'}</dd>
            <dt>Bar setup</dt><dd>${esc(ev.barSetup || '—')}</dd>
            <dt>Dress code</dt><dd>${esc(ev.dressCode || '—')}</dd>
            <dt>Day-of contact</dt><dd>${esc(ev.contactOnSite || '—')}</dd>
            ${ev.mileage ? `<dt>Distance</dt><dd>${ev.mileage} mi</dd>` : ''}
          </dl>
          ${ev.menu ? `<h4>Drink menu</h4><p class="pre">${esc(ev.menu)}</p>` : ''}
          ${ev.staffNotes ? `<h4>Staff notes</h4><p class="pre">${esc(ev.staffNotes)}</p>` : ''}
          ${ev.notes ? `<h4>Internal notes</h4><p class="pre">${esc(ev.notes)}</p>` : ''}
        </section>

        <section class="card">
          <div class="card-head"><h3>Staffing <span class="muted small">${ss.assigned}/${ss.needed} assigned · ${ss.confirmed} confirmed</span></h3><button class="btn btn-sm btn-primary" data-act="assign">+ Assign staff</button></div>
          <p class="muted small">Needed: ${Object.entries(needed).filter(([, n]) => n > 0).map(([r, n]) => `${n} ${r}${n > 1 ? 's' : ''}`).join(', ') || 'not set'}</p>
          ${shifts.length ? `<ul class="list">${shifts.map((sh) => `<li class="list-row">
              <div class="avatar" style="background:${esc(byId('staff', sh.staffId)?.color || '#7c6cf0')}">${esc((staffName(sh.staffId) || '?')[0])}</div>
              <div class="grow"><a href="#/staff/${sh.staffId}"><b>${esc(staffName(sh.staffId))}</b></a> <span class="muted">${esc(titleCase(sh.role))}</span>
              <div class="muted small">${fmtTime(sh.start.slice(11))}–${fmtTime(sh.end.slice(11))} · ${money(shiftPay(sh).base)} est.${sh.clockIn ? ` · in ${new Date(sh.clockIn).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}${sh.clockOut ? ` · out ${new Date(sh.clockOut).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</div></div>
              ${badge(sh.status)}
              <button class="icon-btn" data-act="editShift" data-id="${sh.id}" title="Edit shift">✎</button></li>`).join('')}</ul>` : '<p class="muted">No staff assigned yet.</p>'}
        </section>

        <section class="card">
          <div class="card-head"><h3>Event checklist <span class="muted small">${doneCount}/${checklist.length}</span></h3><button class="btn btn-sm" data-act="addCheck">+ Item</button></div>
          <div class="progress"><i style="width:${checklist.length ? (doneCount / checklist.length) * 100 : 0}%"></i></div>
          <ul class="checklist">${checklist.map((c, i) => `<li><label><input type="checkbox" data-act="toggleCheck" data-i="${i}" ${c.done ? 'checked' : ''}> <span>${esc(c.text)}</span></label><button class="icon-btn sm" data-act="rmCheck" data-i="${i}" title="Remove">✕</button></li>`).join('')}</ul>
        </section>

        <section class="card">
          <div class="card-head"><h3>Pack list (equipment)</h3><button class="btn btn-sm" data-act="addEquip">+ Add items</button></div>
          ${equipment.length ? `<ul class="checklist">${equipment.map((it, i) => {
            const inv = byId('inventory', it.itemId);
            return `<li><label><input type="checkbox" data-act="packEquip" data-i="${i}" ${it.packed ? 'checked' : ''}> <span>${it.qty}× ${esc(inv?.name || it.name || 'Item')}</span></label><button class="icon-btn sm" data-act="rmEquip" data-i="${i}">✕</button></li>`;
          }).join('')}</ul>` : '<p class="muted">Add bars, coolers, tools and glassware to pack for this event.</p>'}
        </section>

        <section class="card">
          <div class="card-head"><h3>Tasks</h3><button class="btn btn-sm" data-act="addTask">+ Task</button></div>
          ${tasks.length ? `<ul class="list">${tasks.map((t) => `<li class="list-row"><span>${t.done ? '✅' : '⬜'}</span><div class="grow">${esc(t.title)}</div><span class="muted small">${t.due ? fmtShortDate(t.due) : ''} ${t.assigneeStaffId ? '· ' + esc(staffName(t.assigneeStaffId)) : ''}</span></li>`).join('')}</ul>` : '<p class="muted">No tasks.</p>'}
        </section>
      </div>

      <div class="stack">
        <section class="card">
          <div class="card-head"><h3>Financials</h3></div>
          <dl class="dl tight">
            <dt>Revenue (pre-tax)</dt><dd>${money(fin.revenue)}</dd>
            <dt>Collected</dt><dd>${money(fin.collected)}</dd>
            <dt>Labor (est.)</dt><dd>−${money(fin.labor)}</dd>
            <dt>Expenses</dt><dd>−${money(fin.expenses)}</dd>
            <dt><b>Profit</b></dt><dd><b class="${fin.profit < 0 ? 'text-err' : 'text-ok'}">${money(fin.profit)}</b> <span class="muted small">${(fin.margin * 100).toFixed(0)}%</span></dd>
          </dl>
          <button class="btn btn-sm btn-block" data-act="addExpense">+ Log expense for this event</button>
        </section>
        <section class="card">
          <div class="card-head"><h3>Quotes & invoices</h3></div>
          ${docs.length ? `<ul class="list">${docs.map((d) => `<li><a class="list-row" href="#/invoices/${d.id}"><div class="grow"><b>${esc(d.number)}</b> <span class="muted small">${d.kind}</span></div><div class="right">${money(invoiceTotals(d).total)}<div>${badge(invoiceStatus(d))}</div></div></a></li>`).join('')}</ul>` : '<p class="muted">None yet.</p>'}
        </section>
        <section class="card">
          <div class="card-head"><h3>Shopping estimate</h3><a href="#/calculator?guests=${ev.guestCount || 0}&hours=${hours}" class="small">Calculator →</a></div>
          ${ev.alcoholBy === 'none' ? '<p class="muted small">Non-alcoholic event.</p>' : `
          <p class="muted small">${ev.guestCount || 0} guests × ${hours.toFixed(1)} hrs ≈ ${calc.totalDrinks} drinks${ev.alcoholBy === 'client' ? ' (share with client — they supply alcohol)' : ''}</p>
          <ul class="kv">
            <li><span>Liquor (750ml)</span><b>${calc.liquorBottles750}</b></li>
            <li><span>Wine bottles</span><b>${calc.wineBottles}</b></li>
            <li><span>Beer (cases of 24)</span><b>${calc.beerCases}</b></li>
            <li><span>Mixers (liters)</span><b>${calc.mixersLiters}</b></li>
            <li><span>Ice (lbs)</span><b>${calc.iceLbs}</b></li>
            <li><span>Cups</span><b>${calc.cups}</b></li>
            <li><span>Suggested bartenders</span><b>${calc.bartenders}</b></li>
          </ul>`}
        </section>
      </div>
    </div>`;

  const saveEv = async (patch, msg) => { await saveItem('events', { ...ev, ...patch }); if (msg) toast(msg); ui.rerender(); };

  bindActions(el, {
    edit: () => eventModal(ev),
    more: (b) => b.parentElement.classList.toggle('open'),
    quote: () => createDocFromEvent(ev, 'quote'),
    invoice: () => createDocFromEvent(ev, 'invoice'),
    dup: async () => {
      const copy = { ...ev, id: undefined, title: ev.title + ' (copy)', status: 'tentative', checklist: DEFAULT_CHECKLIST.map((text) => ({ text, done: false })), equipment: (ev.equipment || []).map((e) => ({ ...e, packed: false })) };
      delete copy.createdAt; delete copy.updatedAt;
      const saved = await saveItem('events', copy);
      toast('Event duplicated'); ui.go('#/events/' + saved.id);
    },
    ics: () => {
      const { start, end } = eventStartEnd(ev);
      downloadFile(`${ev.title.replace(/[^\w]+/g, '-')}.ics`, icsFor([{ uid: ev.id, start, end, title: ev.title, location: [ev.venue, ev.address].filter(Boolean).join(', '), description: `${ev.serviceType || ''} · ${ev.guestCount || '?'} guests` }]), 'text/calendar');
    },
    sheet: () => printSheet(ev),
    complete: () => saveEv({ status: 'completed' }, 'Marked completed'),
    cancel: async () => { if (await confirmBox('Cancel this event? Shifts stay on record.', 'Cancel event')) saveEv({ status: 'cancelled' }, 'Event cancelled'); },
    del: async () => {
      if (!(await confirmBox(`Delete "${ev.title}" and its shifts? This cannot be undone.`))) return;
      await removeItem('events', ev.id); toast('Event deleted'); ui.go('#/events');
    },
    assign: () => assignStaffModal(ev),
    editShift: (b) => assignStaffModal(ev, byId('shifts', b.dataset.id)),
    toggleCheck: (cb) => { const cl = [...checklist]; cl[cb.dataset.i] = { ...cl[cb.dataset.i], done: cb.checked }; saveEv({ checklist: cl }); },
    rmCheck: (b) => { const cl = checklist.filter((_, i) => i !== Number(b.dataset.i)); saveEv({ checklist: cl }); },
    addCheck: () => openModal({ title: 'Add checklist item', body: `<div class="form-grid">${fields([{ n: 'text', l: 'Item', req: true, full: true }])}</div>`, submitLabel: 'Add', onSubmit: (f) => saveEv({ checklist: [...checklist, { text: f.text, done: false }] }) }),
    packEquip: (cb) => { const eq = [...equipment]; eq[cb.dataset.i] = { ...eq[cb.dataset.i], packed: cb.checked }; saveEv({ equipment: eq }); },
    rmEquip: (b) => saveEv({ equipment: equipment.filter((_, i) => i !== Number(b.dataset.i)) }),
    addEquip: () => {
      const inv = list('inventory').filter((i) => !['Liquor', 'Beer & Wine', 'Mixers', 'Garnish'].includes(i.category));
      openModal({
        title: 'Add to pack list', wide: true, submitLabel: 'Add',
        body: inv.length ? `<p class="muted small">Enter quantities to pack.</p><div class="pack-grid">${inv.map((i) => `<label><span>${esc(i.name)} <small class="muted">(${i.qty} on hand)</small></span><input type="number" min="0" name="q_${i.id}" value="${equipment.find((e) => e.itemId === i.id)?.qty || ''}"></label>`).join('')}</div>
          <div class="form-grid">${fields([{ n: 'custom', l: 'Other item (not in inventory)' }, { n: 'customQty', l: 'Qty', t: 'number', min: 1 }])}</div>`
          : `<p class="muted">No equipment in inventory yet — add a one-off item, or set up <a href="#/inventory">Inventory</a>.</p><div class="form-grid">${fields([{ n: 'custom', l: 'Item', req: true }, { n: 'customQty', l: 'Qty', t: 'number', min: 1, def: 1 }])}</div>`,
        onSubmit: (f) => {
          const eq = equipment.filter((e) => !e.itemId);
          for (const [k, q] of Object.entries(f)) if (k.startsWith('q_') && Number(q) > 0) eq.push({ itemId: k.slice(2), qty: Number(q), packed: equipment.find((e) => e.itemId === k.slice(2))?.packed || false });
          if (f.custom) eq.push({ name: f.custom, qty: Number(f.customQty) || 1, packed: false });
          return saveEv({ equipment: eq }, 'Pack list updated');
        },
      });
    },
    addTask: () => taskModal({ eventId: ev.id }),
    addExpense: async () => { const { expenseModal } = await import('./expenses.js'); expenseModal({ eventId: ev.id, date: today() }); },
  });
}

function printSheet(ev) {
  const shifts = list('shifts').filter((s) => s.eventId === ev.id && s.status !== 'declined');
  const client = byId('clients', ev.clientId);
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to print', 'err'); return; }
  w.document.write(`<!doctype html><html><head><title>${esc(ev.title)} – Event Sheet</title>
    <style>body{font:14px/1.45 system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#111}h1{margin:0}h2{border-bottom:2px solid #111;padding-bottom:4px;margin-top:24px;font-size:16px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px;text-align:left}.pre{white-space:pre-wrap}</style></head><body>
    <h1>${esc(ev.title)}</h1><p>${fmtDate(ev.date)} · Service ${fmtTime(ev.startTime)}–${fmtTime(ev.endTime)} · Staff arrive ${fmtTime(ev.arrivalTime) || 'TBD'}</p>
    <h2>Location</h2><p>${esc(ev.venue || '')}<br>${esc(ev.address || '')}</p>
    <h2>Contacts</h2><p>Client: ${esc(client?.name || '')} ${esc(client?.phone || '')}<br>Day-of: ${esc(ev.contactOnSite || '')}</p>
    <h2>Service</h2><p>${esc(ev.serviceType || '')} · ${ev.guestCount || '?'} guests · Alcohol by ${esc(ev.alcoholBy || '')} · Dress: ${esc(ev.dressCode || '')}<br>Bar: ${esc(ev.barSetup || '')}</p>
    ${ev.menu ? `<h2>Menu</h2><p class="pre">${esc(ev.menu)}</p>` : ''}
    <h2>Team</h2><table><tr><th>Name</th><th>Role</th><th>Shift</th><th>Phone</th></tr>${shifts.map((s) => `<tr><td>${esc(staffName(s.staffId))}</td><td>${esc(s.role)}</td><td>${fmtTime(s.start.slice(11))}–${fmtTime(s.end.slice(11))}</td><td>${esc(byId('staff', s.staffId)?.phone || '')}</td></tr>`).join('')}</table>
    ${(ev.equipment || []).length ? `<h2>Pack list</h2><table>${ev.equipment.map((it) => `<tr><td>☐</td><td>${it.qty}×</td><td>${esc(byId('inventory', it.itemId)?.name || it.name || '')}</td></tr>`).join('')}</table>` : ''}
    ${ev.staffNotes ? `<h2>Notes</h2><p class="pre">${esc(ev.staffNotes)}</p>` : ''}
    <script>window.print()<\/script></body></html>`);
  w.document.close();
}
