import {
  state, list, byId, esc, today, addDays, parseDate, isoDate, fmtShortDate, fmtTime, badge, pageHead, fields, openModal,
  saveItem, removeItem, confirmBox, toast, ui, bindActions, emptyState, staffingStatus, staffConflicts, STAFF_ROLES,
  titleCase, staffName, shiftPay, money, pad, logActivity, icsFor, downloadFile,
} from '../core.js';

let weekStart = null;

function minutesToTime(m) { m = ((m % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; }
function timeToMinutes(t) { const [h, m] = (t || '00:00').split(':').map(Number); return h * 60 + m; }

export function defaultShiftWindow(ev) {
  const pad0 = Number(state.settings.defaultShiftPadMinutes) || 60;
  const startT = ev.arrivalTime || minutesToTime(timeToMinutes(ev.startTime || '18:00') - pad0);
  const endM = timeToMinutes(ev.endTime || '22:00') + 45; // breakdown
  const endT = minutesToTime(endM);
  let startDate = ev.date;
  if (timeToMinutes(startT) > timeToMinutes(ev.startTime || '18:00')) startDate = addDays(ev.date, -1);
  let endDate = ev.date;
  if (timeToMinutes(endT) <= timeToMinutes(ev.startTime || '18:00') || endM >= 1440) endDate = addDays(ev.date, 1);
  return { start: `${startDate}T${startT}`, end: `${endDate}T${endT}` };
}

export function assignStaffModal(ev, shift) {
  const isNew = !shift;
  const win = shift ? { start: shift.start, end: shift.end } : defaultShiftWindow(ev);
  const assignedIds = new Set(list('shifts').filter((s) => s.eventId === ev.id && s.id !== shift?.id).map((s) => s.staffId));
  const needed = ev.staffNeeded || {};
  const assignedRoles = list('shifts').filter((s) => s.eventId === ev.id && s.status !== 'declined' && s.id !== shift?.id).reduce((a, s) => { a[s.role] = (a[s.role] || 0) + 1; return a; }, {});
  const openRole = Object.entries(needed).find(([r, n]) => (assignedRoles[r] || 0) < n)?.[0] || 'bartender';
  const active = list('staff').filter((s) => s.status !== 'inactive');
  const ranked = active.map((s) => ({ s, issues: staffConflicts(s.id, win.start, win.end, shift?.id) }))
    .sort((a, b) => a.issues.length - b.issues.length || a.s.name.localeCompare(b.s.name));
  const v = {
    staffId: shift?.staffId || '', role: shift?.role || openRole, startDate: win.start.slice(0, 10), startTime: win.start.slice(11, 16),
    endDate: win.end.slice(0, 10), endTime: win.end.slice(11, 16), status: shift?.status || 'assigned', rate: shift?.rate ?? '',
    notes: shift?.notes || '', tips: shift?.tips ?? '',
  };
  const body = `
    <p class="muted small">${esc(ev.title)} · ${fmtShortDate(ev.date)} · service ${fmtTime(ev.startTime)}–${fmtTime(ev.endTime)}</p>
    <div class="form-grid">${fields([
      { n: 'staffId', l: 'Staff member', t: 'select', req: true, full: true, o: ranked.map(({ s, issues }) => [s.id, `${s.name} — ${(s.roles || []).join(', ') || 'staff'}${assignedIds.has(s.id) ? ' (already on this event)' : ''}${issues.length ? ' ⚠ ' + issues[0] : ' ✓ available'}`]) },
      { t: 'html', full: true, html: '<div id="conflictBox"></div>' },
      { n: 'role', l: 'Role', t: 'select', o: STAFF_ROLES.map((r) => [r, titleCase(r)]), blank: false },
      { n: 'status', l: 'Status', t: 'select', o: [['assigned', 'Assigned (awaiting confirmation)'], ['confirmed', 'Confirmed'], ['declined', 'Declined'], ['completed', 'Completed']], blank: false },
      { n: 'startDate', l: 'Shift start date', t: 'date', req: true }, { n: 'startTime', l: 'Start time', t: 'time', req: true },
      { n: 'endDate', l: 'Shift end date', t: 'date', req: true }, { n: 'endTime', l: 'End time', t: 'time', req: true },
      { n: 'rate', l: 'Pay rate override', t: 'number', step: '0.01', min: 0, help: 'Leave blank to use staff default' },
      { n: 'tips', l: 'Tips earned', t: 'number', step: '0.01', min: 0 },
      { n: 'notes', l: 'Shift notes', t: 'textarea', full: true, rows: 2 },
    ], v)}</div>`;
  openModal({
    title: isNew ? 'Assign staff' : 'Edit shift', body, wide: true, submitLabel: isNew ? 'Assign' : 'Save',
    extraButtons: isNew ? '' : '<button type="button" class="btn btn-danger-ghost" data-rm>Remove shift</button>',
    onMount: (dlg, form) => {
      const box = dlg.querySelector('#conflictBox');
      const check = () => {
        const f = Object.fromEntries(new FormData(form));
        if (!f.staffId) { box.innerHTML = ''; return; }
        const issues = staffConflicts(f.staffId, `${f.startDate}T${f.startTime}`, `${f.endDate}T${f.endTime}`, shift?.id);
        box.innerHTML = issues.length ? `<div class="alert alert-warn">${issues.map(esc).join('<br>')}</div>` : '<div class="alert alert-ok">✓ No conflicts</div>';
      };
      form.addEventListener('change', check);
      check();
      const rm = dlg.querySelector('[data-rm]');
      if (rm) rm.onclick = async () => {
        if (!(await confirmBox('Remove this shift?', 'Remove'))) return;
        await removeItem('shifts', shift.id); dlg.close(); dlg.remove(); toast('Shift removed'); ui.rerender();
      };
    },
    onSubmit: async (f) => {
      const start = `${f.startDate}T${f.startTime}`;
      const end = `${f.endDate}T${f.endTime}`;
      if (end <= start) { toast('Shift must end after it starts', 'err'); return false; }
      const item = { ...(shift || {}), eventId: ev.id, staffId: f.staffId, role: f.role, start, end, status: f.status, rate: f.rate, notes: f.notes, tips: f.tips === '' ? 0 : f.tips };
      await saveItem('shifts', item);
      if (isNew) logActivity('shift', `${staffName(f.staffId)} assigned to ${ev.title}`, ev.id);
      toast(isNew ? 'Staff assigned' : 'Shift saved');
      ui.rerender();
    },
  });
}

export function render(el) {
  const t = today();
  if (!weekStart) { const d = parseDate(t); d.setDate(d.getDate() - d.getDay()); weekStart = isoDate(d); }
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const upcoming = list('events').filter((e) => e.date >= t && !['cancelled', 'completed'].includes(e.status)).sort((a, b) => a.date.localeCompare(b.date));
  const needs = upcoming.map((e) => ({ e, s: staffingStatus(e) })).filter(({ s }) => s.assigned < s.needed);
  const pending = list('shifts').filter((s) => s.status === 'assigned' && s.start.slice(0, 10) >= t).sort((a, b) => a.start.localeCompare(b.start));
  const declined = list('shifts').filter((s) => s.status === 'declined' && s.start.slice(0, 10) >= t);
  const staff = list('staff').filter((s) => s.status !== 'inactive').sort((a, b) => a.name.localeCompare(b.name));
  const weekShifts = list('shifts').filter((s) => s.start.slice(0, 10) >= days[0] && s.start.slice(0, 10) <= days[6]);
  const weekHours = (sid) => weekShifts.filter((s) => s.staffId === sid && s.status !== 'declined').reduce((a, s) => a + shiftPay(s).hours, 0);

  el.innerHTML = `
    ${pageHead('Staff Scheduling', 'Assign bartenders & crew, track confirmations and avoid double-booking.', '<button class="btn" data-act="exportWeek">Export week (.ics)</button>')}
    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h3>Open staffing needs</h3></div>
        ${needs.length ? `<ul class="list">${needs.map(({ e, s }) => `<li class="list-row">
          <div class="grow"><a href="#/events/${e.id}"><b>${esc(e.title)}</b></a><div class="muted small">${fmtShortDate(e.date)} · ${fmtTime(e.startTime)} · ${e.guestCount || '?'} guests</div></div>
          <span class="text-warn small">${s.needed - s.assigned} open</span>
          <button class="btn btn-sm btn-primary" data-act="assign" data-id="${e.id}">Assign</button></li>`).join('')}</ul>` : '<p class="muted">All upcoming events are fully staffed. 👏</p>'}
      </section>
      <section class="card">
        <div class="card-head"><h3>Awaiting confirmation</h3></div>
        ${pending.length || declined.length ? `<ul class="list">${[...declined, ...pending].map((sh) => {
          const ev = byId('events', sh.eventId);
          return `<li class="list-row"><div class="grow"><b>${esc(staffName(sh.staffId))}</b> · ${esc(ev?.title || '')}<div class="muted small">${fmtShortDate(sh.start.slice(0, 10))} ${fmtTime(sh.start.slice(11))}${sh.declineReason ? ' · “' + esc(sh.declineReason) + '”' : ''}</div></div>${badge(sh.status)}
            ${ev ? `<button class="icon-btn" data-act="edit" data-id="${sh.id}" title="Edit">✎</button>` : ''}</li>`;
        }).join('')}</ul>` : '<p class="muted">No pending confirmations.</p>'}
      </section>
    </div>
    <section class="card">
      <div class="card-head">
        <h3>Weekly roster</h3>
        <div class="seg"><button data-act="week" data-d="-7">‹</button><button data-act="thisWeek">This week</button><button data-act="week" data-d="7">›</button></div>
      </div>
      <p class="muted small">${fmtShortDate(days[0])} – ${fmtShortDate(days[6])}. Grey = unavailable. Click a shift to edit.</p>
      ${staff.length ? `<div class="table-wrap roster-wrap"><table class="roster">
        <thead><tr><th>Staff</th>${days.map((d) => `<th class="${d === t ? 'today' : ''}">${parseDate(d).toLocaleDateString(undefined, { weekday: 'short' })}<br><small>${parseDate(d).getDate()}</small></th>`).join('')}<th>Hrs</th></tr></thead>
        <tbody>${staff.map((s) => `<tr><th><a href="#/staff/${s.id}">${esc(s.name)}</a><br><small class="muted">${esc((s.roles || [])[0] || '')}</small></th>
          ${days.map((d) => {
            const dow = parseDate(d).getDay();
            const unavailable = (s.unavailableDates || []).includes(d) || (s.weeklyAvailability && s.weeklyAvailability[dow] === false);
            const shs = weekShifts.filter((x) => x.staffId === s.id && x.start.slice(0, 10) === d);
            return `<td class="${unavailable ? 'unavail' : ''} ${d === t ? 'today' : ''}">${shs.map((x) => {
              const ev = byId('events', x.eventId);
              return `<button class="shift-pill st-${x.status}" data-act="edit" data-id="${x.id}" title="${esc(ev?.title || '')}">${fmtTime(x.start.slice(11))}<br><small>${esc((ev?.title || '').slice(0, 18))}</small></button>`;
            }).join('')}</td>`;
          }).join('')}<td><b>${weekHours(s.id).toFixed(1)}</b></td></tr>`).join('')}</tbody></table></div>` : emptyState('☷', 'Add staff members first.', '<a class="btn btn-primary" href="#/staff">Go to Staff</a>')}
    </section>
    <section class="card">
      <div class="card-head"><h3>Upcoming events — staffing overview</h3></div>
      ${upcoming.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Event</th><th>Team</th><th>Status</th><th></th></tr></thead><tbody>
        ${upcoming.slice(0, 25).map((e) => {
          const s = staffingStatus(e);
          const team = list('shifts').filter((x) => x.eventId === e.id && x.status !== 'declined');
          return `<tr><td data-l="Date">${fmtShortDate(e.date)}</td><td data-l="Event"><a href="#/events/${e.id}">${esc(e.title)}</a></td>
            <td data-l="Team">${team.map((x) => `<span class="chip st-${x.status}">${esc(staffName(x.staffId).split(' ')[0])}</span>`).join(' ') || '<span class="muted">—</span>'}</td>
            <td data-l="Status" class="${s.assigned < s.needed ? 'text-warn' : 'text-ok'}">${s.assigned}/${s.needed} (${s.confirmed} conf.)</td>
            <td><button class="btn btn-sm" data-act="assign" data-id="${e.id}">+ Assign</button></td></tr>`;
        }).join('')}</tbody></table></div>` : '<p class="muted">No upcoming events.</p>'}
    </section>`;

  bindActions(el, {
    assign: (b) => assignStaffModal(byId('events', b.dataset.id)),
    edit: (b) => { const sh = byId('shifts', b.dataset.id); const ev = byId('events', sh?.eventId); if (ev) assignStaffModal(ev, sh); },
    week: (b) => { weekStart = addDays(weekStart, Number(b.dataset.d)); render(el); },
    thisWeek: () => { weekStart = null; render(el); },
    exportWeek: () => {
      const items = weekShifts.filter((s) => s.status !== 'declined').map((s) => ({ uid: s.id, start: s.start, end: s.end, title: `${staffName(s.staffId)} – ${byId('events', s.eventId)?.title || 'Shift'}`, location: byId('events', s.eventId)?.address || '', description: s.role }));
      downloadFile(`roster-${days[0]}.ics`, icsFor(items), 'text/calendar');
    },
  });
}

