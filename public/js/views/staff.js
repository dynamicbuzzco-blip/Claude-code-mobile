import {
  state, list, byId, esc, money, today, addDays, fmtShortDate, fmtTime, badge, pageHead, fields, openModal, saveItem,
  removeItem, confirmBox, toast, ui, bindActions, emptyState, STAFF_ROLES, titleCase, shiftPay, api, searchFilter,
  setTitle, isManager,
} from '../core.js';

const COLORS = ['#7c6cf0', '#e0679a', '#1fa5a0', '#f29b38', '#4a90e2', '#5bb85d', '#c0504d', '#8e6c8a'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
let q = '';
let showInactive = false;

export function render(el, route) {
  if (route.id) return renderDetail(el, route.id);
  let items = list('staff').filter((s) => showInactive || s.status !== 'inactive');
  items = searchFilter(items, q, (s) => `${s.name} ${s.email} ${s.phone} ${(s.roles || []).join(' ')}`).sort((a, b) => a.name.localeCompare(b.name));
  const t = today();
  el.innerHTML = `
    ${pageHead('Staff', `${list('staff').filter((s) => s.status !== 'inactive').length} active team members`, '<button class="btn btn-primary" data-act="new">+ Add staff</button>')}
    <div class="toolbar"><input type="search" placeholder="Search staff…" value="${esc(q)}" data-filter="q"><label class="check"><input type="checkbox" data-act="inactive" ${showInactive ? 'checked' : ''}> Show inactive</label></div>
    ${items.length ? `<div class="cards-grid">${items.map((s) => {
      const upcoming = list('shifts').filter((x) => x.staffId === s.id && x.start.slice(0, 10) >= t && x.status !== 'declined').length;
      const expiring = (s.certifications || []).filter((c) => c.expires && c.expires <= addDays(t, 45));
      const login = state.users.find((u) => u.staffId === s.id);
      return `<a class="card person" href="#/staff/${s.id}">
        <div class="avatar lg" style="background:${esc(s.color || '#7c6cf0')}">${esc(s.name[0] || '?')}</div>
        <div class="grow"><b>${esc(s.name)}</b> ${s.status === 'inactive' ? badge('inactive') : ''}
          <div class="muted small">${(s.roles || []).map(titleCase).join(', ') || 'Staff'}</div>
          <div class="small">${s.phone ? esc(s.phone) : ''}</div>
          <div class="small muted">${money(s.payRate)}${s.payType === 'flat' ? '/event' : '/hr'} · ${upcoming} upcoming shift${upcoming === 1 ? '' : 's'}${login ? ' · 🔑 app login' : ''}</div>
          ${expiring.length ? `<div class="small text-warn">⚑ ${expiring.map((c) => `${esc(c.name)} ${c.expires < t ? 'expired' : 'exp. ' + fmtShortDate(c.expires)}`).join(', ')}</div>` : ''}
        </div></a>`;
    }).join('')}</div>` : emptyState('☷', 'No staff yet. Add your bartenders, barbacks and baristas.', '<button class="btn btn-primary" data-act="new">+ Add staff</button>')}`;
  const s = el.querySelector('[data-filter=q]');
  s.addEventListener('input', () => { q = s.value; const p = s.selectionStart; render(el, route); const n = el.querySelector('[data-filter=q]'); n.focus(); n.setSelectionRange(p, p); });
  bindActions(el, {
    new: () => staffModal({}),
    inactive: (cb) => { showInactive = cb.checked; render(el, route); },
  });
}

export function staffModal(s, after) {
  const isNew = !s.id;
  const v = { status: 'active', payType: 'hourly', payRate: 25, color: COLORS[list('staff').length % COLORS.length], ...s };
  openModal({
    title: isNew ? 'Add staff member' : `Edit ${s.name}`, wide: true, submitLabel: isNew ? 'Add' : 'Save',
    body: `<div class="form-grid">${fields([
      { n: 'name', l: 'Full name', req: true }, { n: 'status', l: 'Status', t: 'select', o: [['active', 'Active'], ['inactive', 'Inactive']], blank: false },
      { n: 'email', l: 'Email', t: 'email' }, { n: 'phone', l: 'Phone', t: 'tel' },
      { n: 'payType', l: 'Pay type', t: 'select', o: [['hourly', 'Hourly'], ['flat', 'Flat per event']], blank: false },
      { n: 'payRate', l: 'Pay rate ($)', t: 'number', step: '0.01', min: 0 },
      { n: 'employmentType', l: 'Classification', t: 'select', o: [['1099', '1099 contractor'], ['W2', 'W-2 employee']] },
      { n: 'color', l: 'Calendar color', t: 'color' },
      { t: 'html', full: true, html: `<div class="field"><label>Roles</label><div class="chips-select">${STAFF_ROLES.map((r) => `<label class="chip-check"><input type="checkbox" name="role_${r}" ${(v.roles || []).includes(r) ? 'checked' : ''}> ${titleCase(r)}</label>`).join('')}</div></div>` },
      { n: 'emergencyContact', l: 'Emergency contact', full: true },
      { n: 'notes', l: 'Notes (skills, vehicle, sizes…)', t: 'textarea', full: true, rows: 2 },
    ], v)}</div>`,
    onSubmit: async (f) => {
      const roles = STAFF_ROLES.filter((r) => f['role_' + r]);
      const item = { ...s };
      for (const [k, val] of Object.entries(f)) if (!k.startsWith('role_')) item[k] = val;
      item.roles = roles;
      const saved = await saveItem('staff', item);
      toast(isNew ? 'Staff added' : 'Saved');
      if (after) after(saved); else if (isNew) ui.go('#/staff/' + saved.id); else ui.rerender();
    },
  });
}

function renderDetail(el, id) {
  const s = byId('staff', id);
  if (!s) { el.innerHTML = emptyState('?', 'Staff member not found', '<a class="btn" href="#/staff">Back</a>'); return; }
  setTitle(s.name);
  const t = today();
  const shifts = list('shifts').filter((x) => x.staffId === s.id).sort((a, b) => b.start.localeCompare(a.start));
  const upcoming = shifts.filter((x) => x.start.slice(0, 10) >= t).reverse();
  const past = shifts.filter((x) => x.start.slice(0, 10) < t);
  const ytd = past.filter((x) => x.start.slice(0, 4) === t.slice(0, 4) && x.status !== 'declined');
  const ytdPay = ytd.reduce((a, x) => a + shiftPay(x).total, 0);
  const ytdHours = ytd.reduce((a, x) => a + shiftPay(x).hours, 0);
  const login = state.users.find((u) => u.staffId === s.id);
  const weekly = s.weeklyAvailability || {};
  const unavailable = (s.unavailableDates || []).filter((d) => d >= t).sort();

  el.innerHTML = `
    <a href="#/staff" class="back">← Staff</a>
    ${pageHead(s.name, `${(s.roles || []).map(titleCase).join(', ') || 'Staff'} · ${money(s.payRate)}${s.payType === 'flat' ? '/event' : '/hr'} ${s.status === 'inactive' ? badge('inactive') : ''}`,
      `${s.phone ? `<a class="btn" href="sms:${esc(s.phone)}">💬 Text</a><a class="btn" href="tel:${esc(s.phone)}">✆ Call</a>` : ''}<button class="btn" data-act="edit">Edit</button>`)}
    <div class="stats three">
      <div class="stat"><div class="stat-label">Upcoming shifts</div><div class="stat-value">${upcoming.length}</div></div>
      <div class="stat"><div class="stat-label">Hours YTD</div><div class="stat-value">${ytdHours.toFixed(1)}</div></div>
      <div class="stat"><div class="stat-label">Earned YTD (incl. tips)</div><div class="stat-value">${money(ytdPay)}</div></div>
    </div>
    <div class="grid-3-1">
      <div class="stack">
        <section class="card"><div class="card-head"><h3>Upcoming shifts</h3></div>
          ${upcoming.length ? `<ul class="list">${upcoming.map((x) => { const ev = byId('events', x.eventId); return `<li><a class="list-row" href="#/events/${x.eventId}"><div class="grow"><b>${esc(ev?.title || 'Event')}</b><div class="muted small">${fmtShortDate(x.start.slice(0, 10))} · ${fmtTime(x.start.slice(11))}–${fmtTime(x.end.slice(11))} · ${esc(titleCase(x.role))}</div></div>${badge(x.status)}</a></li>`; }).join('')}</ul>` : '<p class="muted">No upcoming shifts.</p>'}
        </section>
        <section class="card"><div class="card-head"><h3>Availability</h3><button class="btn btn-sm" data-act="avail">Edit</button></div>
          <div class="dow">${DOW.map((d, i) => `<span class="${weekly[i] === false ? 'off' : 'on'}">${d}</span>`).join('')}</div>
          <p class="small muted">Blocked dates: ${unavailable.length ? unavailable.map(fmtShortDate).join(', ') : 'none'}</p>
        </section>
        <section class="card"><div class="card-head"><h3>Shift history</h3></div>
          ${past.length ? `<div class="table-wrap"><table class="table compact"><thead><tr><th>Date</th><th>Event</th><th>Role</th><th class="num">Hours</th><th class="num">Pay</th><th class="num">Tips</th></tr></thead><tbody>
            ${past.slice(0, 30).map((x) => { const p = shiftPay(x); return `<tr><td data-l="Date">${fmtShortDate(x.start.slice(0, 10))}</td><td data-l="Event">${esc(byId('events', x.eventId)?.title || '—')}</td><td data-l="Role">${esc(titleCase(x.role))}</td><td data-l="Hours" class="num">${p.hours.toFixed(1)}</td><td data-l="Pay" class="num">${money(p.base)}</td><td data-l="Tips" class="num">${money(p.tips)}</td></tr>`; }).join('')}
          </tbody></table></div>` : '<p class="muted">No past shifts.</p>'}
        </section>
      </div>
      <div class="stack">
        <section class="card"><div class="card-head"><h3>Certifications</h3><button class="btn btn-sm" data-act="addCert">+ Add</button></div>
          <p class="muted small">Track TABC/RBS/TIPS, ServSafe, food handler & liquor liability.</p>
          ${(s.certifications || []).length ? `<ul class="list">${s.certifications.map((c, i) => `<li class="list-row"><div class="grow"><b>${esc(c.name)}</b><div class="small ${c.expires && c.expires < t ? 'text-err' : c.expires && c.expires <= addDays(t, 45) ? 'text-warn' : 'muted'}">${c.number ? '#' + esc(c.number) + ' · ' : ''}${c.expires ? (c.expires < t ? 'Expired ' : 'Expires ') + fmtShortDate(c.expires) : 'No expiry'}</div></div><button class="icon-btn sm" data-act="rmCert" data-i="${i}">✕</button></li>`).join('')}</ul>` : '<p class="muted">None on file.</p>'}
        </section>
        <section class="card"><div class="card-head"><h3>Contact</h3></div>
          <dl class="dl tight"><dt>Email</dt><dd>${esc(s.email || '—')}</dd><dt>Phone</dt><dd>${esc(s.phone || '—')}</dd><dt>Type</dt><dd>${esc(s.employmentType || '—')}</dd><dt>Emergency</dt><dd>${esc(s.emergencyContact || '—')}</dd></dl>
          ${s.notes ? `<p class="pre small">${esc(s.notes)}</p>` : ''}
        </section>
        <section class="card"><div class="card-head"><h3>Staff app login</h3></div>
          ${login ? `<p class="small">🔑 <b>${esc(login.email)}</b> can sign in to see shifts, confirm/decline, clock in/out and update availability.</p><div class="row-actions"><button class="btn btn-sm" data-act="resetPw">Reset password</button><button class="btn btn-sm btn-danger-ghost" data-act="rmLogin">Remove login</button></div>`
            : `<p class="muted small">Give ${esc(s.name.split(' ')[0])} their own login to the staff portal.</p><button class="btn btn-sm btn-primary" data-act="invite">Create login</button>`}
        </section>
        <button class="btn btn-danger-ghost" data-act="del">Delete staff member</button>
      </div>
    </div>`;

  bindActions(el, {
    edit: () => staffModal(s),
    avail: () => availabilityModal(s, (patch) => saveItem('staff', { ...s, ...patch }).then(() => { toast('Availability saved'); ui.rerender(); })),
    addCert: () => openModal({
      title: 'Add certification', submitLabel: 'Add',
      body: `<div class="form-grid">${fields([
        { n: 'name', l: 'Certification', req: true, full: true, ph: 'e.g. TABC, TIPS, ServSafe Alcohol, Food Handler' },
        { n: 'number', l: 'Certificate #' }, { n: 'expires', l: 'Expires', t: 'date' },
      ])}</div>`,
      onSubmit: async (f) => { await saveItem('staff', { ...s, certifications: [...(s.certifications || []), f] }); ui.rerender(); },
    }),
    rmCert: async (b) => { await saveItem('staff', { ...s, certifications: s.certifications.filter((_, i) => i !== Number(b.dataset.i)) }); ui.rerender(); },
    invite: () => openModal({
      title: `Create login for ${s.name}`, submitLabel: 'Create login',
      body: `<div class="form-grid">${fields([
        { n: 'email', l: 'Login email', t: 'email', req: true, full: true, def: s.email },
        { n: 'password', l: 'Temporary password (min 8)', req: true, full: true, def: Math.random().toString(36).slice(2, 8) + 'Bar!' },
      ])}</div><p class="muted small">Share the email & password with them; they can sign in at ${esc(location.origin)}.</p>`,
      onSubmit: async (f) => {
        const u = await api('POST', '/users', { email: f.email, password: f.password, name: s.name, role: 'staff', staffId: s.id });
        state.users.push(u);
        await saveItem('staff', { ...s, userId: u.id });
        toast('Login created');
        ui.rerender();
      },
    }),
    resetPw: () => openModal({
      title: 'Reset password', submitLabel: 'Set password',
      body: `<div class="form-grid">${fields([{ n: 'password', l: 'New password (min 8)', req: true, full: true }])}</div>`,
      onSubmit: async (f) => { await api('PATCH', '/users/' + login.id, { password: f.password }); toast('Password updated'); },
    }),
    rmLogin: async () => {
      if (!(await confirmBox('Remove this login? They will be signed out.', 'Remove'))) return;
      await api('DELETE', '/users/' + login.id);
      state.users = state.users.filter((u) => u.id !== login.id);
      toast('Login removed'); ui.rerender();
    },
    del: async () => {
      if (!(await confirmBox(`Delete ${s.name} and all their shifts? Consider marking inactive instead.`))) return;
      if (login) await api('DELETE', '/users/' + login.id).catch(() => {});
      await removeItem('staff', s.id); toast('Deleted'); ui.go('#/staff');
    },
  });
}

// Shared by manager view and staff portal.
export function availabilityModal(s, onSave) {
  const weekly = s.weeklyAvailability || {};
  const dates = (s.unavailableDates || []).filter((d) => d >= today()).sort();
  openModal({
    title: 'Availability', submitLabel: 'Save',
    body: `<p class="muted small">Days usually available to work:</p>
      <div class="chips-select">${DOW.map((d, i) => `<label class="chip-check"><input type="checkbox" name="dow_${i}" ${weekly[i] === false ? '' : 'checked'}> ${d}</label>`).join('')}</div>
      <div class="field"><label>Blocked dates (time off / unavailable)</label>
        <div class="date-adder"><input type="date" id="blkDate" min="${today()}"><button type="button" class="btn btn-sm" id="blkAdd">Add date</button></div>
        <div id="blkList" class="chips"></div></div>`,
    onMount: (dlg) => {
      const listEl = dlg.querySelector('#blkList');
      let current = [...dates];
      const draw = () => { listEl.innerHTML = current.map((d) => `<span class="chip">${fmtShortDate(d)} <button type="button" data-d="${d}">✕</button></span>`).join('') || '<span class="muted small">None</span>'; };
      draw();
      dlg.querySelector('#blkAdd').onclick = () => { const v = dlg.querySelector('#blkDate').value; if (v && !current.includes(v)) { current.push(v); current.sort(); draw(); } };
      listEl.onclick = (e) => { const b = e.target.closest('[data-d]'); if (b) { current = current.filter((d) => d !== b.dataset.d); draw(); } };
      dlg._getDates = () => current;
    },
    onSubmit: async (f, form, dlg) => {
      const wk = {};
      for (let i = 0; i < 7; i++) wk[i] = !!f['dow_' + i];
      await onSave({ weeklyAvailability: wk, unavailableDates: dlg._getDates() });
    },
  });
}


