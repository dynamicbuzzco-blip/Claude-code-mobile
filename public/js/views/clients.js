import {
  list, byId, esc, money, today, fmtShortDate, fmtDate, badge, pageHead, fields, openModal, saveItem, removeItem,
  confirmBox, toast, ui, bindActions, emptyState, invoiceTotals, invoiceStatus, searchFilter, downloadFile, toCSV,
  timeAgo, setTitle, LEAD_SOURCES,
} from '../core.js';
import { eventModal } from './events.js';
import { newDocModal } from './invoices.js';

const CLIENT_TYPES = ['Individual', 'Corporate', 'Wedding Planner', 'Venue', 'Non-profit', 'Agency'];
let q = '';
let typeFilter = '';

function clientStats(c) {
  const events = list('events').filter((e) => e.clientId === c.id);
  const invs = list('invoices').filter((i) => i.clientId === c.id && i.kind === 'invoice' && i.status !== 'void');
  const lifetime = invs.reduce((a, i) => a + invoiceTotals(i).paid, 0);
  const balance = invs.reduce((a, i) => a + invoiceTotals(i).balance, 0);
  const last = events.map((e) => e.date).sort().pop();
  return { events, invs, lifetime, balance, last };
}

export function render(el, route) {
  if (route.id) return renderDetail(el, route.id);
  let items = list('clients');
  if (typeFilter) items = items.filter((c) => c.type === typeFilter);
  items = searchFilter(items, q, (c) => `${c.name} ${c.company} ${c.email} ${c.phone} ${(c.tags || '')}`).sort((a, b) => a.name.localeCompare(b.name));
  el.innerHTML = `
    ${pageHead('Clients', `${list('clients').length} clients`, '<button class="btn" data-act="csv">Export CSV</button><button class="btn btn-primary" data-act="new">+ New client</button>')}
    <div class="toolbar">
      <input type="search" placeholder="Search name, company, email, phone…" value="${esc(q)}" data-filter="q">
      <select data-filter="type"><option value="">All types</option>${CLIENT_TYPES.map((t) => `<option ${t === typeFilter ? 'selected' : ''}>${t}</option>`).join('')}</select>
    </div>
    ${items.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Contact</th><th>Type</th><th>Events</th><th>Last event</th><th class="num">Lifetime paid</th><th class="num">Balance</th></tr></thead><tbody>
      ${items.map((c) => {
        const s = clientStats(c);
        return `<tr data-href="#/clients/${c.id}"><td data-l="Name"><a href="#/clients/${c.id}"><b>${esc(c.name)}</b></a>${c.company ? `<div class="muted small">${esc(c.company)}</div>` : ''}</td>
          <td data-l="Contact"><div class="small">${esc(c.email || '')}</div><div class="small muted">${esc(c.phone || '')}</div></td>
          <td data-l="Type">${esc(c.type || '—')}</td><td data-l="Events">${s.events.length}</td><td data-l="Last event">${s.last ? fmtShortDate(s.last) : '—'}</td>
          <td data-l="Lifetime" class="num">${money(s.lifetime)}</td><td data-l="Balance" class="num ${s.balance > 0 ? 'text-warn' : ''}">${s.balance > 0 ? money(s.balance) : '—'}</td></tr>`;
      }).join('')}</tbody></table></div>` : emptyState('☺', 'No clients yet.', '<button class="btn btn-primary" data-act="new">Add a client</button>')}`;

  const s = el.querySelector('[data-filter=q]');
  s.addEventListener('input', () => { q = s.value; const p = s.selectionStart; render(el, route); const n = el.querySelector('[data-filter=q]'); n.focus(); n.setSelectionRange(p, p); });
  el.querySelector('[data-filter=type]').addEventListener('change', (e) => { typeFilter = e.target.value; render(el, route); });
  el.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a')) location.hash = tr.dataset.href; }));
  bindActions(el, {
    new: () => clientModal({}),
    csv: () => {
      const rows = [['Name', 'Company', 'Type', 'Email', 'Phone', 'Address', 'Source', 'Events', 'Lifetime paid', 'Balance', 'Tags']];
      for (const c of list('clients')) { const st = clientStats(c); rows.push([c.name, c.company, c.type, c.email, c.phone, c.address, c.source, st.events.length, st.lifetime.toFixed(2), st.balance.toFixed(2), c.tags]); }
      downloadFile(`clients-${today()}.csv`, toCSV(rows), 'text/csv');
    },
  });
}

export function clientModal(c, after) {
  const isNew = !c.id;
  openModal({
    title: isNew ? 'New client' : 'Edit client', wide: true, submitLabel: isNew ? 'Add client' : 'Save',
    body: `<div class="form-grid">${fields([
      { n: 'name', l: 'Full name', req: true }, { n: 'company', l: 'Company / organization' },
      { n: 'email', l: 'Email', t: 'email' }, { n: 'phone', l: 'Phone', t: 'tel' },
      { n: 'type', l: 'Client type', t: 'select', o: CLIENT_TYPES, def: 'Individual', blank: false },
      { n: 'source', l: 'How they found us', t: 'select', o: LEAD_SOURCES },
      { n: 'address', l: 'Billing address', full: true },
      { n: 'birthday', l: 'Anniversary / special date', t: 'date', help: 'Great for re-booking reminders' },
      { n: 'tags', l: 'Tags', ph: 'vip, repeat, venue-partner' },
      { n: 'notes', l: 'Notes', t: 'textarea', full: true, rows: 3 },
    ], c)}</div>`,
    onSubmit: async (f) => {
      const saved = await saveItem('clients', { ...c, ...f });
      toast(isNew ? 'Client added' : 'Client saved');
      if (after) after(saved); else if (isNew) ui.go('#/clients/' + saved.id); else ui.rerender();
    },
  });
}

function renderDetail(el, id) {
  const c = byId('clients', id);
  if (!c) { el.innerHTML = emptyState('?', 'Client not found', '<a class="btn" href="#/clients">Back</a>'); return; }
  setTitle(c.name);
  const s = clientStats(c);
  const docs = list('invoices').filter((i) => i.clientId === c.id).sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));
  const events = [...s.events].sort((a, b) => b.date.localeCompare(a.date));
  const notes = (c.log || []).slice().reverse();
  el.innerHTML = `
    <a href="#/clients" class="back">← Clients</a>
    ${pageHead(c.name, `${esc(c.company || c.type || '')}${(c.tags || '') ? ' · ' + esc(c.tags) : ''}`, `
      ${c.email ? `<a class="btn" href="mailto:${esc(c.email)}">✉ Email</a>` : ''}${c.phone ? `<a class="btn" href="tel:${esc(c.phone)}">✆ Call</a>` : ''}
      <button class="btn" data-act="edit">Edit</button><button class="btn btn-primary" data-act="event">+ Event</button>`)}
    <div class="stats three">
      <div class="stat"><div class="stat-label">Events</div><div class="stat-value">${s.events.length}</div></div>
      <div class="stat"><div class="stat-label">Lifetime paid</div><div class="stat-value">${money(s.lifetime)}</div></div>
      <div class="stat"><div class="stat-label">Open balance</div><div class="stat-value ${s.balance ? 'text-warn' : ''}">${money(s.balance)}</div></div>
    </div>
    <div class="grid-3-1">
      <div class="stack">
        <section class="card"><div class="card-head"><h3>Events</h3></div>
          ${events.length ? `<ul class="list">${events.map((e) => `<li><a class="list-row" href="#/events/${e.id}"><div class="grow"><b>${esc(e.title)}</b><div class="muted small">${fmtDate(e.date)} · ${esc(e.venue || '')}</div></div>${badge(e.status)}</a></li>`).join('')}</ul>` : '<p class="muted">No events yet.</p>'}
        </section>
        <section class="card"><div class="card-head"><h3>Quotes & invoices</h3><button class="btn btn-sm" data-act="doc">+ New</button></div>
          ${docs.length ? `<ul class="list">${docs.map((d) => `<li><a class="list-row" href="#/invoices/${d.id}"><div class="grow"><b>${esc(d.number)}</b> <span class="muted small">${d.kind} · ${fmtShortDate(d.issueDate)}</span></div><div class="right">${money(invoiceTotals(d).total)}<div>${badge(invoiceStatus(d))}</div></div></a></li>`).join('')}</ul>` : '<p class="muted">None yet.</p>'}
        </section>
        <section class="card"><div class="card-head"><h3>Notes & activity log</h3></div>
          <form class="note-form" id="noteForm"><input name="text" placeholder="Log a call, email or note…" required><select name="kind"><option>Note</option><option>Call</option><option>Email</option><option>Text</option><option>Meeting</option><option>Tasting</option></select><button class="btn btn-primary btn-sm">Add</button></form>
          ${notes.length ? `<ul class="activity">${notes.map((n) => `<li><span class="tag">${esc(n.kind)}</span> ${esc(n.text)} <span class="muted small">· ${timeAgo(n.at)}</span></li>`).join('')}</ul>` : '<p class="muted small">No notes yet.</p>'}
        </section>
      </div>
      <div class="stack">
        <section class="card"><div class="card-head"><h3>Contact</h3></div>
          <dl class="dl tight"><dt>Email</dt><dd>${esc(c.email || '—')}</dd><dt>Phone</dt><dd>${esc(c.phone || '—')}</dd><dt>Address</dt><dd>${esc(c.address || '—')}</dd>
          <dt>Type</dt><dd>${esc(c.type || '—')}</dd><dt>Source</dt><dd>${esc(c.source || '—')}</dd>${c.birthday ? `<dt>Special date</dt><dd>${fmtShortDate(c.birthday)}</dd>` : ''}<dt>Client since</dt><dd>${c.createdAt ? fmtShortDate(c.createdAt.slice(0, 10)) : '—'}</dd></dl>
          ${c.notes ? `<p class="pre small">${esc(c.notes)}</p>` : ''}
        </section>
        <button class="btn btn-danger-ghost" data-act="del">Delete client</button>
      </div>
    </div>`;
  el.querySelector('#noteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    await saveItem('clients', { ...c, log: [...(c.log || []), { text: f.text, kind: f.kind, at: new Date().toISOString() }] });
    ui.rerender();
  });
  bindActions(el, {
    edit: () => clientModal(c),
    event: () => eventModal({ clientId: c.id }),
    doc: () => newDocModal('quote', { clientId: c.id }),
    del: async () => {
      if (s.events.length || docs.length) { toast('This client has events or invoices — remove those first.', 'err'); return; }
      if (!(await confirmBox(`Delete ${c.name}?`))) return;
      await removeItem('clients', c.id); toast('Client deleted'); ui.go('#/clients');
    },
  });
}
