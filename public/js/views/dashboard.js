import {
  state, list, esc, money, today, addDays, fmtDate, fmtShortDate, fmtTime, badge, invoiceTotals, invoiceStatus,
  staffingStatus, clientName, pageHead, stat, timeAgo, byId, bindActions, patchItem, ui, LEAD_STAGES,
} from '../core.js';

export function render(el) {
  const t = today();
  const in30 = addDays(t, 30);
  const monthStart = t.slice(0, 8) + '01';
  const events = list('events').filter((e) => e.status !== 'cancelled');
  const upcoming = events.filter((e) => e.date >= t).sort((a, b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')));
  const next30 = upcoming.filter((e) => e.date <= in30);
  const invoices = list('invoices').filter((i) => i.kind === 'invoice' && i.status !== 'void');
  const outstanding = invoices.reduce((a, i) => a + invoiceTotals(i).balance, 0);
  const overdue = invoices.filter((i) => invoiceStatus(i) === 'overdue');
  const collectedMonth = invoices.flatMap((i) => i.payments || []).filter((p) => p.date >= monthStart && p.date <= t).reduce((a, p) => a + Number(p.amount || 0), 0);
  const bookedMonth = events.filter((e) => e.date.slice(0, 7) === t.slice(0, 7) && e.status !== 'inquiry')
    .flatMap((e) => invoices.filter((i) => i.eventId === e.id)).reduce((a, i) => a + invoiceTotals(i).total, 0);
  const openLeads = list('leads').filter((l) => !['won', 'lost'].includes(l.stage));
  const newLeads = openLeads.filter((l) => l.stage === 'new');
  const pipelineValue = openLeads.reduce((a, l) => a + (Number(l.budget) || 0), 0);
  const understaffed = next30.filter((e) => { const s = staffingStatus(e); return s.assigned < s.needed; });
  const lowStock = list('inventory').filter((i) => i.minQty !== '' && i.minQty !== undefined && Number(i.qty) <= Number(i.minQty));
  const tasksDue = list('tasks').filter((x) => !x.done && x.due && x.due <= addDays(t, 3)).sort((a, b) => a.due.localeCompare(b.due));
  const expiring = list('staff').flatMap((s) => (s.certifications || []).filter((c) => c.expires && c.expires <= addDays(t, 45)).map((c) => ({ s, c })));
  const pendingQuotes = list('invoices').filter((i) => i.kind === 'quote' && invoiceStatus(i) === 'sent');

  const alerts = [];
  if (overdue.length) alerts.push(`<a href="#/invoices?status=overdue" class="alert alert-err">⚠ ${overdue.length} overdue invoice${overdue.length > 1 ? 's' : ''} · ${money(overdue.reduce((a, i) => a + invoiceTotals(i).balance, 0))}</a>`);
  if (understaffed.length) alerts.push(`<a href="#/schedule" class="alert alert-warn">☷ ${understaffed.length} upcoming event${understaffed.length > 1 ? 's' : ''} need staff</a>`);
  if (newLeads.length) alerts.push(`<a href="#/leads" class="alert alert-info">⇢ ${newLeads.length} new lead${newLeads.length > 1 ? 's' : ''} waiting for a reply</a>`);
  if (lowStock.length) alerts.push(`<a href="#/inventory?low=1" class="alert alert-warn">▤ ${lowStock.length} inventory item${lowStock.length > 1 ? 's' : ''} low</a>`);
  if (expiring.length) alerts.push(`<a href="#/staff" class="alert alert-warn">⚑ ${expiring.length} staff certification${expiring.length > 1 ? 's' : ''} expiring soon</a>`);

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  el.innerHTML = `
    ${pageHead(`${greet}, ${esc(state.user.name.split(' ')[0])}`, fmtDate(t, { weekday: 'long', month: 'long', day: 'numeric' }),
      `<a class="btn" href="#/leads?new=1">+ Lead</a><a class="btn" href="#/invoices?new=quote">+ Quote</a><a class="btn btn-primary" href="#/events?new=1">+ Event</a>`)}
    ${alerts.length ? `<div class="alerts">${alerts.join('')}</div>` : ''}
    <div class="stats">
      ${stat('Upcoming events (30d)', next30.length, `${upcoming.length} total booked ahead`, '#/events')}
      ${stat('Collected this month', money(collectedMonth), `${money(bookedMonth)} booked for events this month`, '#/reports')}
      ${stat('Outstanding A/R', money(outstanding), `${overdue.length} overdue`, '#/invoices')}
      ${stat('Open pipeline', money(pipelineValue), `${openLeads.length} open leads · ${pendingQuotes.length} quotes out`, '#/leads')}
    </div>
    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h3>Next up</h3><a href="#/calendar" class="small">Calendar →</a></div>
        ${upcoming.length ? `<ul class="list">${upcoming.slice(0, 7).map((e) => {
          const s = staffingStatus(e);
          return `<li><a href="#/events/${e.id}" class="list-row">
            <div class="date-chip"><b>${new Date(e.date + 'T00:00').getDate()}</b><small>${new Date(e.date + 'T00:00').toLocaleString(undefined, { month: 'short' })}</small></div>
            <div class="grow"><strong>${esc(e.title)}</strong><div class="muted small">${fmtTime(e.startTime)}–${fmtTime(e.endTime)} · ${esc(e.venue || 'Venue TBD')} · ${e.guestCount || '?'} guests</div></div>
            <div class="right">${badge(e.status)}<div class="small ${s.assigned < s.needed ? 'text-warn' : 'muted'}">Staff ${s.assigned}/${s.needed}</div></div>
          </a></li>`;
        }).join('')}</ul>` : '<p class="muted">No upcoming events. <a href="#/events?new=1">Book one</a>.</p>'}
      </section>
      <section class="card">
        <div class="card-head"><h3>Tasks due</h3><a href="#/tasks" class="small">All tasks →</a></div>
        ${tasksDue.length ? `<ul class="list">${tasksDue.slice(0, 8).map((x) => `
          <li class="list-row"><input type="checkbox" data-act="doneTask" data-id="${x.id}">
            <div class="grow">${esc(x.title)}${x.eventId ? `<div class="muted small">${esc(byId('events', x.eventId)?.title || '')}</div>` : ''}</div>
            <span class="small ${x.due < t ? 'text-err' : 'muted'}">${x.due < t ? 'Overdue' : fmtShortDate(x.due)}</span></li>`).join('')}</ul>` : '<p class="muted">Nothing due in the next 3 days. 🎉</p>'}
      </section>
      <section class="card">
        <div class="card-head"><h3>Lead pipeline</h3><a href="#/leads" class="small">Pipeline →</a></div>
        <div class="funnel">${LEAD_STAGES.filter(([k]) => k !== 'lost').map(([k, label]) => {
          const n = list('leads').filter((l) => l.stage === k).length;
          const max = Math.max(1, ...LEAD_STAGES.map(([kk]) => list('leads').filter((l) => l.stage === kk).length));
          return `<div class="funnel-row"><span>${esc(label)}</span><div class="bar"><i style="width:${(n / max) * 100}%"></i></div><b>${n}</b></div>`;
        }).join('')}</div>
      </section>
      <section class="card">
        <div class="card-head"><h3>Unpaid invoices</h3><a href="#/invoices" class="small">Invoices →</a></div>
        ${(() => {
          const unpaid = invoices.filter((i) => invoiceTotals(i).balance > 0 && invoiceStatus(i) !== 'draft').sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
          return unpaid.length ? `<ul class="list">${unpaid.slice(0, 6).map((i) => `<li><a class="list-row" href="#/invoices/${i.id}">
            <div class="grow"><strong>${esc(i.number)}</strong> <span class="muted">${esc(clientName(i.clientId))}</span><div class="muted small">Due ${fmtShortDate(i.dueDate)}</div></div>
            <div class="right"><b>${money(invoiceTotals(i).balance)}</b><div>${badge(invoiceStatus(i))}</div></div></a></li>`).join('')}</ul>` : '<p class="muted">All caught up.</p>';
        })()}
      </section>
    </div>
    <section class="card">
      <div class="card-head"><h3>Recent activity</h3></div>
      ${(() => {
        const acts = [...list('activities')].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10);
        return acts.length ? `<ul class="activity">${acts.map((a) => `<li><span class="muted small">${timeAgo(a.createdAt)}</span> ${esc(a.text)}</li>`).join('')}</ul>` : '<p class="muted">No activity yet.</p>';
      })()}
    </section>`;

  bindActions(el, {
    doneTask: async (cb) => { await patchItem('tasks', cb.dataset.id, { done: true }); ui.rerender(); },
  });
}
