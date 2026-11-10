import {
  state, list, byId, esc, today, addDays, parseDate, isoDate, fmtTime, fmtDate, pageHead, bindActions, isManager,
  staffName, icsFor, eventStartEnd, downloadFile, titleCase,
} from '../core.js';
import { eventModal } from './events.js';

let cursor = null; // YYYY-MM-DD anchor
let mode = window.matchMedia('(max-width: 700px)').matches ? 'agenda' : 'month';
let show = { events: true, shifts: null, tasks: true, leads: true };

function itemsForRange(from, to) {
  const mgr = isManager();
  const items = [];
  if (show.events) for (const e of list('events')) {
    if (e.date < from || e.date > to) continue;
    items.push({ date: e.date, time: e.startTime, kind: 'event', status: e.status, title: e.title, href: '#/events/' + e.id, sub: `${fmtTime(e.startTime)}–${fmtTime(e.endTime)} · ${e.venue || ''}` });
  }
  if (show.shifts) for (const s of list('shifts')) {
    const d = s.start.slice(0, 10);
    if (d < from || d > to || s.status === 'declined') continue;
    if (!mgr && s.staffId !== state.user.staffId) continue;
    const ev = byId('events', s.eventId);
    items.push({ date: d, time: s.start.slice(11), kind: 'shift', status: s.status, color: byId('staff', s.staffId)?.color, title: mgr ? `${staffName(s.staffId)} · ${titleCase(s.role)}` : `My shift: ${ev?.title || ''}`, href: mgr ? '#/events/' + s.eventId : '#/portal', sub: `${fmtTime(s.start.slice(11))}–${fmtTime(s.end.slice(11))} · ${ev?.title || ''}` });
  }
  if (show.tasks) for (const t of list('tasks')) {
    if (!t.due || t.due < from || t.due > to || t.done) continue;
    items.push({ date: t.due, time: '', kind: 'task', title: '✓ ' + t.title, href: '#/tasks', sub: 'Task' });
  }
  if (mgr && show.leads) for (const l of list('leads')) {
    if (!l.eventDate || l.eventDate < from || l.eventDate > to || ['won', 'lost'].includes(l.stage)) continue;
    items.push({ date: l.eventDate, time: '', kind: 'lead', title: '⇢ ' + l.name + ' (lead)', href: '#/leads', sub: `${l.eventType || ''} · ${l.guestCount || '?'} guests` });
  }
  return items.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
}

export function render(el) {
  const t = today();
  if (show.shifts === null) show.shifts = !isManager();
  if (!cursor) cursor = t;
  const anchor = parseDate(cursor);
  let from; let to; let label;
  if (mode === 'month') {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = new Date(first); start.setDate(1 - first.getDay());
    from = isoDate(start); to = addDays(from, 41);
    label = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  } else if (mode === 'week') {
    const start = new Date(anchor); start.setDate(anchor.getDate() - anchor.getDay());
    from = isoDate(start); to = addDays(from, 6);
    label = `Week of ${fmtDate(from, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  } else {
    from = cursor; to = addDays(cursor, 60);
    label = `Next 60 days from ${fmtDate(from, { month: 'short', day: 'numeric' })}`;
  }
  const items = itemsForRange(from, to);
  const byDate = {};
  for (const it of items) (byDate[it.date] = byDate[it.date] || []).push(it);
  const mgr = isManager();

  let body = '';
  if (mode === 'agenda') {
    const dates = Object.keys(byDate).sort();
    body = dates.length ? `<div class="agenda">${dates.map((d) => `<div class="agenda-day ${d === t ? 'today' : ''}"><div class="agenda-date"><b>${parseDate(d).getDate()}</b><small>${parseDate(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short' })}</small></div>
      <div class="grow">${byDate[d].map((it) => `<a class="cal-item k-${it.kind} st-${it.status || ''}" href="${it.href}" ${it.color ? `style="--c:${esc(it.color)}"` : ''}><b>${esc(it.title)}</b><small>${esc(it.sub)}</small></a>`).join('')}</div></div>`).join('')}</div>`
      : '<p class="muted card">Nothing scheduled in this range.</p>';
  } else {
    const days = []; for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
    const month = anchor.getMonth();
    body = `<div class="cal ${mode}"><div class="cal-head">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<div>${d}</div>`).join('')}</div>
      <div class="cal-grid">${days.map((d) => {
        const its = byDate[d] || [];
        const max = mode === 'month' ? 3 : 12;
        return `<div class="cal-cell ${d === t ? 'today' : ''} ${mode === 'month' && parseDate(d).getMonth() !== month ? 'other' : ''}" ${mgr ? `data-act="newOn" data-date="${d}"` : ''}>
          <div class="cal-num">${parseDate(d).getDate()}</div>
          ${its.slice(0, max).map((it) => `<a class="cal-item k-${it.kind} st-${it.status || ''}" href="${it.href}" title="${esc(it.title + ' — ' + it.sub)}" ${it.color ? `style="--c:${esc(it.color)}"` : ''}>${it.time ? `<span class="t">${fmtTime(it.time)}</span> ` : ''}${esc(it.title)}</a>`).join('')}
          ${its.length > max ? `<button class="more" data-act="day" data-date="${d}">+${its.length - max} more</button>` : ''}
        </div>`;
      }).join('')}</div></div>`;
  }

  el.innerHTML = `
    ${pageHead('Calendar', label, `${mgr ? '<button class="btn btn-primary" data-act="new">+ Event</button>' : ''}<button class="btn" data-act="ics">Export .ics</button>`)}
    <div class="toolbar">
      <div class="seg"><button data-act="nav" data-d="-1">‹</button><button data-act="today">Today</button><button data-act="nav" data-d="1">›</button></div>
      <div class="seg">${['month', 'week', 'agenda'].map((m) => `<button class="${mode === m ? 'on' : ''}" data-act="mode" data-v="${m}">${titleCase(m)}</button>`).join('')}</div>
      <div class="legend">${[['events', 'Events'], ['shifts', 'Shifts'], ['tasks', 'Tasks'], ...(mgr ? [['leads', 'Leads']] : [])].map(([k, l]) => `<label class="check k-${k.slice(0, -1)}"><input type="checkbox" data-show="${k}" ${show[k] ? 'checked' : ''}> ${l}</label>`).join('')}</div>
    </div>
    ${body}`;

  el.querySelectorAll('[data-show]').forEach((cb) => cb.addEventListener('change', () => { show[cb.dataset.show] = cb.checked; render(el); }));
  bindActions(el, {
    nav: (b) => {
      const d = Number(b.dataset.d);
      if (mode === 'month') { const a = parseDate(cursor); a.setDate(1); a.setMonth(a.getMonth() + d); cursor = isoDate(a); }
      else cursor = addDays(cursor, d * (mode === 'week' ? 7 : 60));
      render(el);
    },
    today: () => { cursor = today(); render(el); },
    mode: (b) => { mode = b.dataset.v; render(el); },
    new: () => eventModal({}),
    newOn: (cell, e) => { if (e.target.closest('a,button')) return; eventModal({ date: cell.dataset.date }); },
    day: (b) => { cursor = b.dataset.date; mode = 'agenda'; render(el); },
    ics: () => {
      const evs = (mgr ? list('events') : list('events')).filter((e) => e.status !== 'cancelled' && e.date >= addDays(today(), -30)).map((e) => {
        const { start, end } = eventStartEnd(e);
        return { uid: e.id, start, end, title: e.title, location: [e.venue, e.address].filter(Boolean).join(', '), description: `${e.serviceType || ''} · ${e.guestCount || '?'} guests` };
      });
      const shs = mgr ? [] : list('shifts').filter((s) => s.staffId === state.user.staffId && s.status !== 'declined').map((s) => ({ uid: s.id, start: s.start, end: s.end, title: `Shift: ${byId('events', s.eventId)?.title || ''}`, location: byId('events', s.eventId)?.address || '', description: s.role }));
      downloadFile('barops-calendar.ics', icsFor(mgr ? evs : shs), 'text/calendar');
    },
  });
}
