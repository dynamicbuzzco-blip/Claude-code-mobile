// Staff self-service portal (non-manager logins).
import {
  state, list, byId, esc, money, today, addDays, fmtDate, fmtShortDate, fmtTime, badge, pageHead, bindActions, api,
  loadAll, toast, ui, openModal, fields, mapsLink, shiftPay, titleCase, staffName, emptyState, icsFor, downloadFile,
} from '../core.js';
import { availabilityModal } from './staff.js';

const me = () => byId('staff', state.user.staffId) || {};

async function act(shiftId, action, extra = {}) {
  await api('PATCH', `/me/shifts/${shiftId}`, { action, ...extra });
  await loadAll();
  ui.rerender();
}

export function render(el) {
  if (!state.user.staffId) {
    el.innerHTML = emptyState('⌂', 'Your login is not linked to a staff profile yet. Ask your manager to link it.');
    return;
  }
  const t = today();
  const mine = list('shifts').filter((s) => s.staffId === state.user.staffId).sort((a, b) => a.start.localeCompare(b.start));
  const upcoming = mine.filter((s) => s.end.slice(0, 10) >= t && s.status !== 'declined');
  const pending = upcoming.filter((s) => s.status === 'assigned');
  const past = mine.filter((s) => s.end.slice(0, 10) < t && s.status !== 'declined').reverse();
  const monthPast = past.filter((s) => s.start.slice(0, 7) === t.slice(0, 7));
  const earned = monthPast.reduce((a, s) => a + shiftPay(s).total, 0);
  const hours = monthPast.reduce((a, s) => a + shiftPay(s).hours, 0);

  const shiftCard = (s) => {
    const ev = byId('events', s.eventId) || {};
    const isToday = s.start.slice(0, 10) <= t && s.end.slice(0, 10) >= t;
    const team = list('shifts').filter((x) => x.eventId === s.eventId && x.staffId !== state.user.staffId && x.status !== 'declined');
    return `<section class="card shift-card">
      <div class="card-head"><div><h3>${esc(ev.title || 'Event')}</h3><div class="muted small">${fmtDate(s.start.slice(0, 10))}</div></div>${badge(s.status)}</div>
      <div class="shift-time"><b>${fmtTime(s.start.slice(11))} – ${fmtTime(s.end.slice(11))}</b> <span class="muted">· ${esc(titleCase(s.role))} · est. ${money(shiftPay(s).base)}</span></div>
      <dl class="dl tight">
        <dt>Where</dt><dd>${esc(ev.venue || '')}<br>${mapsLink(ev.address)}</dd>
        <dt>Service</dt><dd>${fmtTime(ev.startTime)}–${fmtTime(ev.endTime)} · ${esc(ev.serviceType || '')} · ${ev.guestCount || '?'} guests</dd>
        ${ev.dressCode ? `<dt>Dress</dt><dd>${esc(ev.dressCode)}</dd>` : ''}
        ${ev.contactOnSite ? `<dt>On-site contact</dt><dd>${esc(ev.contactOnSite)}</dd>` : ''}
        ${team.length ? `<dt>Team</dt><dd>${team.map((x) => { const p = byId('staff', x.staffId); return `${esc(staffName(x.staffId))} (${esc(x.role)})${p?.phone ? ` <a href="tel:${esc(p.phone)}">✆</a>` : ''}`; }).join(', ')}</dd>` : ''}
      </dl>
      ${ev.menu ? `<details><summary>Drink menu</summary><p class="pre small">${esc(ev.menu)}</p></details>` : ''}
      ${ev.staffNotes ? `<details open><summary>Notes from manager</summary><p class="pre small">${esc(ev.staffNotes)}</p></details>` : ''}
      ${s.notes ? `<p class="small"><b>Shift note:</b> ${esc(s.notes)}</p>` : ''}
      <div class="row-actions">
        ${s.status === 'assigned' ? `<button class="btn btn-primary" data-act="confirm" data-id="${s.id}">✓ Confirm</button><button class="btn btn-danger-ghost" data-act="decline" data-id="${s.id}">Can't make it</button>` : ''}
        ${isToday && !s.clockIn && s.status !== 'assigned' ? `<button class="btn btn-primary" data-act="clockIn" data-id="${s.id}">⏱ Clock in</button>` : ''}
        ${s.clockIn && !s.clockOut ? `<span class="small">Clocked in ${new Date(s.clockIn).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><button class="btn btn-primary" data-act="clockOut" data-id="${s.id}">⏹ Clock out</button>` : ''}
        ${s.clockOut ? `<span class="small muted">Worked ${shiftPay(s).hours.toFixed(2)} hrs${s.tips ? ` · tips ${money(s.tips)}` : ''}</span>` : ''}
        <button class="btn btn-sm" data-act="ics" data-id="${s.id}">+ Calendar</button>
      </div>
    </section>`;
  };

  el.innerHTML = `
    ${pageHead(`Hi ${esc(state.user.name.split(' ')[0])} 👋`, `${upcoming.length} upcoming shift${upcoming.length === 1 ? '' : 's'}${pending.length ? ` · <b class="text-warn">${pending.length} need your confirmation</b>` : ''}`, '<button class="btn" data-act="avail">My availability</button>')}
    <div class="stats three">
      <div class="stat"><div class="stat-label">Upcoming shifts</div><div class="stat-value">${upcoming.length}</div></div>
      <div class="stat"><div class="stat-label">Hours this month</div><div class="stat-value">${hours.toFixed(1)}</div></div>
      <div class="stat"><div class="stat-label">Earned this month</div><div class="stat-value">${money(earned)}</div></div>
    </div>
    ${upcoming.length ? upcoming.map(shiftCard).join('') : emptyState('⌂', 'No upcoming shifts. Make sure your availability is up to date!')}
    ${past.length ? `<section class="card"><div class="card-head"><h3>Recent shifts</h3></div><div class="table-wrap"><table class="table compact"><thead><tr><th>Date</th><th>Event</th><th class="num">Hours</th><th class="num">Pay</th><th class="num">Tips</th></tr></thead><tbody>
      ${past.slice(0, 15).map((s) => { const p = shiftPay(s); return `<tr><td>${fmtShortDate(s.start.slice(0, 10))}</td><td>${esc(byId('events', s.eventId)?.title || '—')}</td><td class="num">${p.hours.toFixed(1)}</td><td class="num">${money(p.base)}</td><td class="num">${money(p.tips)}</td></tr>`; }).join('')}
    </tbody></table></div></section>` : ''}`;

  bindActions(el, {
    confirm: (b) => act(b.dataset.id, 'confirm').then(() => toast('Shift confirmed — see you there!')),
    decline: (b) => openModal({
      title: "Can't make it?", submitLabel: 'Decline shift', danger: true,
      body: `<p class="small">Your manager will be notified so they can find a replacement.</p><div class="form-grid">${fields([{ n: 'reason', l: 'Reason (optional)', full: true }])}</div>`,
      onSubmit: (f) => act(b.dataset.id, 'decline', { reason: f.reason }).then(() => toast('Shift declined')),
    }),
    clockIn: (b) => act(b.dataset.id, 'clockIn').then(() => toast('Clocked in')),
    clockOut: (b) => openModal({
      title: 'Clock out', submitLabel: 'Clock out',
      body: `<div class="form-grid">${fields([{ n: 'tips', l: 'Tips received ($)', t: 'number', step: '0.01', min: 0, full: true }])}</div>`,
      onSubmit: (f) => act(b.dataset.id, 'clockOut', { tips: f.tips || 0 }).then(() => toast('Clocked out — great work!')),
    }),
    ics: (b) => {
      const s = byId('shifts', b.dataset.id);
      const ev = byId('events', s.eventId) || {};
      downloadFile('shift.ics', icsFor([{ uid: s.id, start: s.start, end: s.end, title: `Shift: ${ev.title || ''}`, location: [ev.venue, ev.address].filter(Boolean).join(', '), description: `${s.role}. ${ev.staffNotes || ''}` }]), 'text/calendar');
    },
    avail: () => availabilityModal(me(), async (patch) => { await api('PATCH', '/me/profile', patch); await loadAll(); toast('Availability saved'); ui.rerender(); }),
  });
}

export function renderProfile(el) {
  const s = me();
  if (!s.id) { el.innerHTML = emptyState('☺', 'No staff profile linked to your login.'); return; }
  const t = today();
  el.innerHTML = `
    ${pageHead('My Profile', esc(s.name))}
    <form class="card" id="profForm"><div class="form-grid">${fields([
      { n: 'phone', l: 'Phone', t: 'tel' }, { n: 'emergencyContact', l: 'Emergency contact' },
    ], s)}</div><button class="btn btn-primary">Save</button></form>
    <section class="card"><div class="card-head"><h3>Availability</h3><button class="btn btn-sm" data-act="avail">Edit</button></div>
      <p class="small muted">Blocked dates: ${(s.unavailableDates || []).filter((d) => d >= t).map(fmtShortDate).join(', ') || 'none'}</p></section>
    <section class="card"><div class="card-head"><h3>My certifications</h3><button class="btn btn-sm" data-act="addCert">+ Add</button></div>
      ${(s.certifications || []).length ? `<ul class="list">${s.certifications.map((c) => `<li class="list-row"><div class="grow"><b>${esc(c.name)}</b><div class="small ${c.expires && c.expires < t ? 'text-err' : c.expires && c.expires <= addDays(t, 45) ? 'text-warn' : 'muted'}">${c.expires ? 'Expires ' + fmtShortDate(c.expires) : ''}</div></div></li>`).join('')}</ul>` : '<p class="muted">None on file — add your TABC/TIPS/ServSafe so you can be scheduled.</p>'}
    </section>
    <section class="card"><div class="card-head"><h3>Change password</h3></div>
      <form id="pwForm" class="form-grid">${fields([{ n: 'current', l: 'Current password', t: 'password', req: true }, { n: 'next', l: 'New password (min 8)', t: 'password', req: true }])}<div><button class="btn">Update password</button></div></form></section>`;
  el.querySelector('#profForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    await api('PATCH', '/me/profile', f); await loadAll(); toast('Profile saved');
  });
  el.querySelector('#pwForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('POST', '/auth/password', Object.fromEntries(new FormData(e.target))); toast('Password updated'); e.target.reset(); } catch (err) { toast(err.message, 'err'); }
  });
  bindActions(el, {
    avail: () => availabilityModal(s, async (patch) => { await api('PATCH', '/me/profile', patch); await loadAll(); toast('Saved'); ui.rerender(); }),
    addCert: () => openModal({
      title: 'Add certification', submitLabel: 'Add',
      body: `<div class="form-grid">${fields([{ n: 'name', l: 'Certification', req: true, full: true }, { n: 'number', l: 'Certificate #' }, { n: 'expires', l: 'Expires', t: 'date' }])}</div>`,
      onSubmit: async (f) => { await api('PATCH', '/me/profile', { certifications: [...(s.certifications || []), f] }); await loadAll(); ui.rerender(); },
    }),
  });
}
