import {
  list, byId, esc, money, today, fmtShortDate, pageHead, fields, openModal, saveItem, removeItem, confirmBox, toast, ui,
  bindActions, LEAD_STAGES, LEAD_SOURCES, EVENT_TYPES, options, timeAgo, logActivity, DEFAULT_CHECKLIST, searchFilter,
  addDays, downloadFile, toCSV,
} from '../core.js';
import { createDocFromEvent } from './invoices.js';

let q = '';
let showLost = false;

export function render(el, route) {
  if (route.query.get('new')) { history.replaceState(null, '', '#/leads'); setTimeout(() => leadModal({}), 0); }
  const leads = searchFilter(list('leads'), q, (l) => `${l.name} ${l.email} ${l.phone} ${l.venue} ${l.eventType} ${l.source}`);
  const stages = LEAD_STAGES.filter(([k]) => showLost || k !== 'lost');
  const won = list('leads').filter((l) => l.stage === 'won').length;
  const closed = won + list('leads').filter((l) => l.stage === 'lost').length;

  el.innerHTML = `
    ${pageHead('Leads Pipeline', `Win rate ${closed ? Math.round((won / closed) * 100) : 0}% · Share your <a href="/book.html" target="_blank">booking inquiry form ↗</a> to capture leads automatically`,
      '<button class="btn" data-act="csv">Export CSV</button><button class="btn btn-primary" data-act="new">+ New lead</button>')}
    <div class="toolbar">
      <input type="search" placeholder="Search leads…" value="${esc(q)}" data-filter="q">
      <label class="check"><input type="checkbox" data-act="lost" ${showLost ? 'checked' : ''}> Show lost</label>
    </div>
    <div class="kanban">${stages.map(([k, label]) => {
      const items = leads.filter((l) => (l.stage || 'new') === k).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      const value = items.reduce((a, l) => a + (Number(l.budget) || 0), 0);
      return `<div class="kcol" data-stage="${k}">
        <div class="kcol-head"><b>${esc(label)}</b><span class="muted small">${items.length}${value ? ' · ' + money(value) : ''}</span></div>
        <div class="kcol-body">${items.map((l) => `
          <div class="kcard" draggable="true" data-id="${l.id}">
            <div class="kcard-top"><b>${esc(l.name)}</b>${l.followUp && l.followUp <= today() && !['won', 'lost'].includes(l.stage) ? '<span class="dot-alert" title="Follow-up due">●</span>' : ''}</div>
            <div class="muted small">${esc(l.eventType || 'Event')} · ${l.eventDate ? fmtShortDate(l.eventDate) : 'date TBD'} · ${l.guestCount || '?'} guests</div>
            ${l.budget ? `<div class="small">${money(l.budget)} budget</div>` : ''}
            <div class="kcard-foot"><span class="tag">${esc(l.source || '—')}</span><span class="muted small">${l.createdAt ? timeAgo(l.createdAt) : ''}</span></div>
            <div class="kcard-actions">
              <button class="btn btn-xs" data-act="open" data-id="${l.id}">Open</button>
              <select class="btn-xs" data-move="${l.id}" aria-label="Move stage">${LEAD_STAGES.map(([sk, sl]) => `<option value="${sk}" ${sk === l.stage ? 'selected' : ''}>${esc(sl)}</option>`).join('')}</select>
            </div>
          </div>`).join('') || '<p class="muted small center">Drop leads here</p>'}</div>
      </div>`;
    }).join('')}</div>`;

  const search = el.querySelector('[data-filter=q]');
  search.addEventListener('input', () => { q = search.value; const p = search.selectionStart; render(el, { query: new URLSearchParams() }); const s = el.querySelector('[data-filter=q]'); s.focus(); s.setSelectionRange(p, p); });

  el.querySelectorAll('[data-move]').forEach((sel) => sel.addEventListener('change', () => moveLead(sel.dataset.move, sel.value)));
  // drag and drop
  el.querySelectorAll('.kcard').forEach((c) => c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('dragging'); }));
  el.querySelectorAll('.kcol').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', (e) => { e.preventDefault(); col.classList.remove('over'); moveLead(e.dataTransfer.getData('text/plain'), col.dataset.stage); });
  });

  bindActions(el, {
    new: () => leadModal({}),
    open: (b) => leadModal(byId('leads', b.dataset.id)),
    lost: (cb) => { showLost = cb.checked; render(el, { query: new URLSearchParams() }); },
    csv: () => {
      const rows = [['Name', 'Email', 'Phone', 'Stage', 'Source', 'Event type', 'Event date', 'Guests', 'Budget', 'Venue', 'Created']];
      for (const l of list('leads')) rows.push([l.name, l.email, l.phone, l.stage, l.source, l.eventType, l.eventDate, l.guestCount, l.budget, l.venue, (l.createdAt || '').slice(0, 10)]);
      downloadFile(`leads-${today()}.csv`, toCSV(rows), 'text/csv');
    },
  });
}

async function moveLead(id, stage) {
  const l = byId('leads', id);
  if (!l || l.stage === stage) return;
  if (stage === 'won') return convertModal(l);
  await saveItem('leads', { ...l, stage });
  logActivity('lead', `${l.name} moved to ${LEAD_STAGES.find(([k]) => k === stage)?.[1]}`, id);
  ui.rerender();
}

export function leadModal(lead) {
  const isNew = !lead.id;
  const body = `<div class="form-grid">${fields([
    { n: 'name', l: 'Contact name', req: true },
    { n: 'stage', l: 'Stage', t: 'select', o: LEAD_STAGES, blank: false, def: 'new' },
    { n: 'email', l: 'Email', t: 'email' }, { n: 'phone', l: 'Phone', t: 'tel' },
    { n: 'source', l: 'Lead source', t: 'select', o: LEAD_SOURCES },
    { n: 'eventType', l: 'Event type', t: 'select', o: EVENT_TYPES },
    { n: 'eventDate', l: 'Event date', t: 'date' }, { n: 'guestCount', l: 'Guests', t: 'number', min: 0 },
    { n: 'hours', l: 'Hours of service', t: 'number', min: 0, step: '0.5' }, { n: 'budget', l: 'Budget / est. value ($)', t: 'number', min: 0 },
    { n: 'venue', l: 'Venue / location', full: true },
    { n: 'packageId', l: 'Interested in', t: 'select', o: options('packages', (p) => p.name) },
    { n: 'followUp', l: 'Next follow-up', t: 'date' },
    { n: 'notes', l: 'Notes', t: 'textarea', full: true, rows: 4 },
  ], lead)}</div>
  ${!isNew && lead.eventDate ? dateCheck(lead.eventDate) : ''}
  ${!isNew ? `<div class="row-actions">
    ${lead.email ? `<a class="btn btn-sm" href="mailto:${esc(lead.email)}">✉ Email</a>` : ''}
    ${lead.phone ? `<a class="btn btn-sm" href="tel:${esc(lead.phone)}">✆ Call</a><a class="btn btn-sm" href="sms:${esc(lead.phone)}">💬 Text</a>` : ''}
  </div>` : ''}`;
  openModal({
    title: isNew ? 'New lead' : lead.name, body, wide: true, submitLabel: isNew ? 'Add lead' : 'Save',
    extraButtons: isNew ? '' : '<button type="button" class="btn btn-danger-ghost" data-del>Delete</button><button type="button" class="btn" data-convert>★ Book it</button>',
    onMount: (dlg) => {
      const del = dlg.querySelector('[data-del]');
      if (del) del.onclick = async () => { if (await confirmBox('Delete this lead?')) { await removeItem('leads', lead.id); dlg.remove(); toast('Lead deleted'); ui.rerender(); } };
      const conv = dlg.querySelector('[data-convert]');
      if (conv) conv.onclick = () => { dlg.close(); dlg.remove(); convertModal(byId('leads', lead.id)); };
    },
    onSubmit: async (f) => {
      if (f.stage === 'won' && lead.stage !== 'won' && !lead.clientId) {
        const saved = await saveItem('leads', { ...lead, ...f, stage: lead.stage || 'new' });
        setTimeout(() => convertModal(saved), 0);
        return;
      }
      const saved = await saveItem('leads', { ...lead, ...f, followUp: f.followUp || (isNew ? addDays(today(), 1) : '') });
      if (isNew) logActivity('lead', `New lead: ${saved.name}`, saved.id);
      toast(isNew ? 'Lead added' : 'Lead saved');
      ui.rerender();
    },
  });
}

function dateCheck(date) {
  const clash = list('events').filter((e) => e.date === date && e.status !== 'cancelled');
  return clash.length
    ? `<div class="alert alert-warn">Heads up: ${clash.length} event${clash.length > 1 ? 's' : ''} already booked on ${fmtShortDate(date)} (${clash.map((e) => esc(e.title)).join(', ')}). Check staff capacity.</div>`
    : `<div class="alert alert-ok">✓ ${fmtShortDate(date)} is open on your calendar.</div>`;
}

// Convert a lead into a client + event (+ optional quote).
export function convertModal(lead) {
  const existing = list('clients').find((c) => (lead.email && c.email && c.email.toLowerCase() === lead.email.toLowerCase()));
  openModal({
    title: `Book ${lead.name}`, submitLabel: 'Create booking', wide: true,
    body: `<p class="muted">Creates ${existing ? 'an event for existing client <b>' + esc(existing.name) + '</b>' : 'a client record and an event'} from this lead.</p>
      <div class="form-grid">${fields([
        { n: 'title', l: 'Event name', req: true, def: `${lead.name.split(' ').slice(-1)[0]} ${lead.eventType || 'Event'}`, full: true },
        { n: 'date', l: 'Event date', t: 'date', req: true, def: lead.eventDate },
        { n: 'startTime', l: 'Start', t: 'time', req: true, def: '18:00' },
        { n: 'endTime', l: 'End', t: 'time', req: true, def: lead.hours ? `${String(18 + Math.min(5, Math.round(lead.hours))).padStart(2, '0')}:00` : '22:00' },
        { n: 'status', l: 'Event status', t: 'select', o: [['tentative', 'Tentative (pending deposit)'], ['confirmed', 'Confirmed']], blank: false },
        { n: 'makeQuote', l: 'Also create a quote', t: 'checkbox', def: true },
      ])}</div>`,
    onSubmit: async (f) => {
      const client = existing || await saveItem('clients', { name: lead.name, email: lead.email, phone: lead.phone, type: 'Individual', source: lead.source, notes: lead.notes });
      const ev = await saveItem('events', {
        title: f.title, date: f.date, startTime: f.startTime, endTime: f.endTime, status: f.status, clientId: client.id,
        eventType: lead.eventType || 'Other', guestCount: lead.guestCount, venue: lead.venue, packageId: lead.packageId,
        serviceType: 'Full Bar', alcoholBy: 'company', staffNeeded: { bartender: Math.max(1, Math.ceil((Number(lead.guestCount) || 50) / 75)), barback: 0, barista: 0, server: 0 },
        checklist: DEFAULT_CHECKLIST.map((text) => ({ text, done: false })), notes: lead.notes, leadId: lead.id,
      });
      await saveItem('leads', { ...lead, stage: 'won', clientId: client.id, eventId: ev.id });
      logActivity('lead', `Lead ${lead.name} booked → ${ev.title}`, ev.id);
      toast('Booked! 🎉');
      if (f.makeQuote) await createDocFromEvent(ev, 'quote');
      else ui.go('#/events/' + ev.id);
    },
  });
}
