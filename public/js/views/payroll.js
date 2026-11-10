import {
  state, list, byId, esc, money, today, addDays, fmtShortDate, fmtTime, pageHead, bindActions, emptyState, shiftPay,
  titleCase, downloadFile, toCSV, saveItem, toast, ui, openModal, fields,
} from '../core.js';

let range = null;

export function render(el) {
  const t = today();
  const period = Number(state.settings.payrollPeriodDays) || 14;
  if (!range) range = { from: addDays(t, -(period - 1)), to: t };
  const shifts = list('shifts').filter((s) => s.status !== 'declined' && s.start.slice(0, 10) >= range.from && s.start.slice(0, 10) <= range.to)
    .sort((a, b) => a.start.localeCompare(b.start));
  const byStaff = {};
  for (const s of shifts) (byStaff[s.staffId] = byStaff[s.staffId] || []).push(s);
  const rows = Object.entries(byStaff).map(([sid, shs]) => {
    const st = byId('staff', sid);
    const tot = shs.reduce((a, s) => { const p = shiftPay(s); a.hours += p.hours; a.base += p.base; a.tips += p.tips; return a; }, { hours: 0, base: 0, tips: 0 });
    const unpaid = shs.filter((s) => !s.paid).length;
    return { sid, st, shs, ...tot, total: tot.base + tot.tips, unpaid };
  }).sort((a, b) => (a.st?.name || '').localeCompare(b.st?.name || ''));
  const grand = rows.reduce((a, r) => ({ hours: a.hours + r.hours, base: a.base + r.base, tips: a.tips + r.tips, total: a.total + r.total }), { hours: 0, base: 0, tips: 0, total: 0 });
  const missingClock = shifts.filter((s) => s.start.slice(0, 10) < t && (!s.clockIn || !s.clockOut) && s.status !== 'completed');

  el.innerHTML = `
    ${pageHead('Payroll', 'Hours, wages and tips by pay period. Uses clock-in/out times when available, otherwise scheduled times.', '<button class="btn" data-act="csv">Export CSV</button><button class="btn" data-act="detail">Detailed CSV</button>')}
    <div class="toolbar">
      <label class="inline">From <input type="date" data-r="from" value="${range.from}"></label>
      <label class="inline">To <input type="date" data-r="to" value="${range.to}"></label>
      <div class="seg"><button data-act="shift" data-d="-${period}">‹ Prev</button><button data-act="current">Current</button><button data-act="shift" data-d="${period}">Next ›</button></div>
    </div>
    <div class="stats">
      <div class="stat"><div class="stat-label">Shifts</div><div class="stat-value">${shifts.length}</div></div>
      <div class="stat"><div class="stat-label">Hours</div><div class="stat-value">${grand.hours.toFixed(1)}</div></div>
      <div class="stat"><div class="stat-label">Wages</div><div class="stat-value">${money(grand.base)}</div></div>
      <div class="stat"><div class="stat-label">Tips</div><div class="stat-value">${money(grand.tips)}</div></div>
    </div>
    ${missingClock.length ? `<div class="alert alert-warn">${missingClock.length} past shift${missingClock.length > 1 ? 's are' : ' is'} missing clock-in/out — scheduled times are used. Review below.</div>` : ''}
    ${rows.length ? rows.map((r) => `<section class="card">
      <div class="card-head"><h3><a href="#/staff/${r.sid}">${esc(r.st?.name || 'Former staff')}</a> <span class="muted small">${r.st?.employmentType || ''} · ${money(r.st?.payRate)}${r.st?.payType === 'flat' ? '/event' : '/hr'}</span></h3>
        <div><b>${money(r.total)}</b> ${r.unpaid ? `<button class="btn btn-sm btn-primary" data-act="markPaid" data-id="${r.sid}">Mark ${r.unpaid} paid</button>` : '<span class="badge badge-paid">Paid</span>'}</div></div>
      <div class="table-wrap"><table class="table compact"><thead><tr><th>Date</th><th>Event</th><th>Role</th><th>Time</th><th class="num">Hours</th><th class="num">Wage</th><th class="num">Tips</th><th class="num">Total</th><th></th></tr></thead><tbody>
        ${r.shs.map((s) => { const p = shiftPay(s); const ev = byId('events', s.eventId); return `<tr><td data-l="Date">${fmtShortDate(s.start.slice(0, 10))}</td><td data-l="Event">${esc(ev?.title || '—')}</td><td data-l="Role">${esc(titleCase(s.role))}</td>
          <td data-l="Time">${s.clockIn ? `${new Date(s.clockIn).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}–${s.clockOut ? new Date(s.clockOut).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '?'} <span class="tag">clocked</span>` : `${fmtTime(s.start.slice(11))}–${fmtTime(s.end.slice(11))}`}</td>
          <td data-l="Hours" class="num">${p.hours.toFixed(2)}</td><td data-l="Wage" class="num">${money(p.base)}</td><td data-l="Tips" class="num">${money(p.tips)}</td><td data-l="Total" class="num"><b>${money(p.total)}</b></td>
          <td><button class="icon-btn sm" data-act="adj" data-id="${s.id}" title="Adjust hours/tips">✎</button>${s.paid ? ' ✓' : ''}</td></tr>`; }).join('')}
        <tr class="total-row"><td colspan="4">Total</td><td class="num">${r.hours.toFixed(2)}</td><td class="num">${money(r.base)}</td><td class="num">${money(r.tips)}</td><td class="num"><b>${money(r.total)}</b></td><td></td></tr>
      </tbody></table></div></section>`).join('') : emptyState('¤', 'No shifts in this period.')}`;

  el.querySelectorAll('[data-r]').forEach((i) => i.addEventListener('change', () => { range[i.dataset.r] = i.value; render(el); }));
  bindActions(el, {
    shift: (b) => { const d = Number(b.dataset.d); range = { from: addDays(range.from, d), to: addDays(range.to, d) }; render(el); },
    current: () => { range = null; render(el); },
    markPaid: async (b) => {
      for (const s of byStaff[b.dataset.id].filter((x) => !x.paid)) await saveItem('shifts', { ...s, paid: true, paidOn: today(), status: s.status === 'assigned' || s.status === 'confirmed' ? 'completed' : s.status });
      toast('Marked paid'); ui.rerender();
    },
    adj: (b) => {
      const s = byId('shifts', b.dataset.id);
      const toLocal = (iso) => { if (!iso) return ''; const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
      openModal({
        title: 'Adjust time & tips', submitLabel: 'Save',
        body: `<div class="form-grid">${fields([
          { n: 'clockIn', l: 'Clock in', t: 'datetime-local' }, { n: 'clockOut', l: 'Clock out', t: 'datetime-local' },
          { n: 'tips', l: 'Tips', t: 'number', step: '0.01', min: 0 }, { n: 'rate', l: 'Rate override', t: 'number', step: '0.01', min: 0 },
          { n: 'paid', l: 'Paid', t: 'checkbox' },
        ], { ...s, clockIn: toLocal(s.clockIn), clockOut: toLocal(s.clockOut) })}</div>`,
        onSubmit: async (f) => {
          await saveItem('shifts', { ...s, clockIn: f.clockIn ? new Date(f.clockIn).toISOString() : '', clockOut: f.clockOut ? new Date(f.clockOut).toISOString() : '', tips: f.tips || 0, rate: f.rate, paid: f.paid });
          toast('Saved'); ui.rerender();
        },
      });
    },
    csv: () => {
      const out = [['Staff', 'Classification', 'Hours', 'Wages', 'Tips', 'Total']];
      for (const r of rows) out.push([r.st?.name || '', r.st?.employmentType || '', r.hours.toFixed(2), r.base.toFixed(2), r.tips.toFixed(2), r.total.toFixed(2)]);
      downloadFile(`payroll-${range.from}-to-${range.to}.csv`, toCSV(out), 'text/csv');
    },
    detail: () => {
      const out = [['Staff', 'Date', 'Event', 'Role', 'Start', 'End', 'Hours', 'Rate', 'Wage', 'Tips', 'Total', 'Paid']];
      for (const s of shifts) { const p = shiftPay(s); out.push([byId('staff', s.staffId)?.name || '', s.start.slice(0, 10), byId('events', s.eventId)?.title || '', s.role, s.clockIn || s.start, s.clockOut || s.end, p.hours.toFixed(2), p.rate, p.base.toFixed(2), p.tips.toFixed(2), p.total.toFixed(2), s.paid ? 'yes' : 'no']); }
      downloadFile(`payroll-detail-${range.from}-to-${range.to}.csv`, toCSV(out), 'text/csv');
    },
  });
}
