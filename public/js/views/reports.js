import {
  list, byId, esc, money, today, pageHead, invoiceTotals, eventFinancials, shiftPay, LEAD_STAGES, fmtShortDate,
  downloadFile, toCSV, bindActions, clientName,
} from '../core.js';

let year = null;

function barChart(series, fmt = money) {
  const max = Math.max(1, ...series.map((s) => Math.max(s.a || 0, s.b || 0)));
  return `<div class="chart">${series.map((s) => `
    <div class="chart-col" title="${esc(s.label)}: ${esc(fmt(s.a))}${s.b !== undefined ? ' / ' + esc(fmt(s.b)) : ''}">
      <div class="chart-bars"><i class="a" style="height:${((s.a || 0) / max) * 100}%"></i>${s.b !== undefined ? `<i class="b" style="height:${((s.b || 0) / max) * 100}%"></i>` : ''}</div>
      <small>${esc(s.label)}</small></div>`).join('')}</div>`;
}

export function render(el) {
  const t = today();
  if (!year) year = Number(t.slice(0, 4));
  const ys = String(year);
  const invoices = list('invoices').filter((i) => i.kind === 'invoice' && i.status !== 'void');
  const payments = invoices.flatMap((i) => (i.payments || []).map((p) => ({ ...p, inv: i })));
  const expenses = list('expenses');
  const shifts = list('shifts').filter((s) => s.status !== 'declined');
  const months = Array.from({ length: 12 }, (_, m) => `${ys}-${String(m + 1).padStart(2, '0')}`);

  const monthly = months.map((m) => {
    const income = payments.filter((p) => (p.date || '').startsWith(m)).reduce((a, p) => a + Number(p.amount || 0), 0);
    const exp = expenses.filter((x) => (x.date || '').startsWith(m)).reduce((a, x) => a + Number(x.amount || 0), 0);
    const labor = shifts.filter((s) => s.start.startsWith(m)).reduce((a, s) => a + shiftPay(s).base, 0);
    const booked = list('events').filter((e) => e.date.startsWith(m) && !['cancelled', 'inquiry'].includes(e.status)).length;
    return { m, label: new Date(m + '-01T00:00').toLocaleDateString(undefined, { month: 'short' }), income, exp, labor, booked };
  });
  const yIncome = monthly.reduce((a, x) => a + x.income, 0);
  const yExp = monthly.reduce((a, x) => a + x.exp, 0);
  const yLabor = monthly.reduce((a, x) => a + x.labor, 0);
  const yNet = yIncome - yExp - yLabor;
  const yEvents = list('events').filter((e) => e.date.startsWith(ys) && e.status !== 'cancelled');
  const avgEvent = yEvents.length ? yEvents.reduce((a, e) => a + eventFinancials(e).revenue, 0) / yEvents.length : 0;

  // lead source performance
  const sources = {};
  for (const l of list('leads').filter((x) => (x.createdAt || '').startsWith(ys))) {
    const s = l.source || 'Unknown';
    sources[s] = sources[s] || { leads: 0, won: 0, value: 0 };
    sources[s].leads++;
    if (l.stage === 'won') { sources[s].won++; const ev = byId('events', l.eventId); if (ev) sources[s].value += eventFinancials(ev).revenue; }
  }
  // event type mix
  const types = {};
  for (const e of yEvents) { const k = e.eventType || 'Other'; types[k] = types[k] || { n: 0, rev: 0 }; types[k].n++; types[k].rev += eventFinancials(e).revenue; }
  // top clients
  const clientRev = {};
  for (const p of payments.filter((x) => (x.date || '').startsWith(ys))) clientRev[p.inv.clientId] = (clientRev[p.inv.clientId] || 0) + Number(p.amount || 0);
  const topClients = Object.entries(clientRev).sort((a, b) => b[1] - a[1]).slice(0, 8);
  // event profitability
  const evProfit = yEvents.filter((e) => e.date <= t).map((e) => ({ e, f: eventFinancials(e) })).sort((a, b) => b.f.profit - a.f.profit);
  // AR aging
  const aging = { current: 0, '1-30': 0, '31-60': 0, '61+': 0 };
  for (const i of invoices) {
    const bal = invoiceTotals(i).balance;
    if (bal <= 0) continue;
    const days = i.dueDate ? Math.floor((new Date(t) - new Date(i.dueDate)) / 86400000) : 0;
    if (days <= 0) aging.current += bal; else if (days <= 30) aging['1-30'] += bal; else if (days <= 60) aging['31-60'] += bal; else aging['61+'] += bal;
  }
  // tax collected
  const taxCollected = invoices.filter((i) => (i.issueDate || '').startsWith(ys)).reduce((a, i) => { const tt = invoiceTotals(i); return a + (tt.total ? tt.tax * (tt.paid / tt.total) : 0); }, 0);

  el.innerHTML = `
    ${pageHead('Reports', 'Cash-basis view: income = payments received.', `
      <div class="seg"><button data-act="yr" data-d="-1">‹</button><button disabled>${year}</button><button data-act="yr" data-d="1">›</button></div>
      <button class="btn" data-act="csv">Export P&L CSV</button>`)}
    <div class="stats">
      <div class="stat"><div class="stat-label">Income received</div><div class="stat-value">${money(yIncome)}</div></div>
      <div class="stat"><div class="stat-label">Expenses + labor</div><div class="stat-value">${money(yExp + yLabor)}</div><div class="stat-sub">${money(yExp)} expenses · ${money(yLabor)} labor</div></div>
      <div class="stat"><div class="stat-label">Net profit</div><div class="stat-value ${yNet < 0 ? 'text-err' : 'text-ok'}">${money(yNet)}</div><div class="stat-sub">${yIncome ? Math.round((yNet / yIncome) * 100) : 0}% margin</div></div>
      <div class="stat"><div class="stat-label">Events</div><div class="stat-value">${yEvents.length}</div><div class="stat-sub">avg ${money(avgEvent)} / event</div></div>
    </div>
    <section class="card"><div class="card-head"><h3>Income vs. costs by month</h3><div class="legend small"><span class="key a"></span> Income <span class="key b"></span> Expenses + labor</div></div>
      ${barChart(monthly.map((x) => ({ label: x.label, a: x.income, b: x.exp + x.labor })))}
    </section>
    <div class="grid-2">
      <section class="card"><div class="card-head"><h3>Events booked per month</h3></div>${barChart(monthly.map((x) => ({ label: x.label, a: x.booked })), (n) => String(n))}</section>
      <section class="card"><div class="card-head"><h3>Accounts receivable aging</h3></div>
        <ul class="kv">${Object.entries(aging).map(([k, v]) => `<li><span>${k === 'current' ? 'Not yet due' : k + ' days overdue'}</span><b class="${k !== 'current' && v ? 'text-warn' : ''}">${money(v)}</b></li>`).join('')}</ul>
        <p class="muted small">Sales tax collected (${year}, est. on payments): <b>${money(taxCollected)}</b></p>
      </section>
      <section class="card"><div class="card-head"><h3>Lead sources (${year})</h3></div>
        ${Object.keys(sources).length ? `<div class="table-wrap"><table class="table compact"><thead><tr><th>Source</th><th class="num">Leads</th><th class="num">Booked</th><th class="num">Conv.</th><th class="num">Revenue</th></tr></thead><tbody>
          ${Object.entries(sources).sort((a, b) => b[1].leads - a[1].leads).map(([s, v]) => `<tr><td>${esc(s)}</td><td class="num">${v.leads}</td><td class="num">${v.won}</td><td class="num">${Math.round((v.won / v.leads) * 100)}%</td><td class="num">${money(v.value)}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">No leads this year.</p>'}
        <p class="muted small">Pipeline now: ${LEAD_STAGES.map(([k, l]) => `${l} ${list('leads').filter((x) => x.stage === k).length}`).join(' · ')}</p>
      </section>
      <section class="card"><div class="card-head"><h3>Event types (${year})</h3></div>
        ${Object.keys(types).length ? `<ul class="kv">${Object.entries(types).sort((a, b) => b[1].rev - a[1].rev).map(([k, v]) => `<li><span>${esc(k)} <small class="muted">×${v.n}</small></span><b>${money(v.rev)}</b></li>`).join('')}</ul>` : '<p class="muted">No events.</p>'}
      </section>
      <section class="card"><div class="card-head"><h3>Top clients (${year})</h3></div>
        ${topClients.length ? `<ul class="kv">${topClients.map(([id, v]) => `<li><span><a href="#/clients/${id}">${esc(clientName(id))}</a></span><b>${money(v)}</b></li>`).join('')}</ul>` : '<p class="muted">No payments yet.</p>'}
      </section>
      <section class="card"><div class="card-head"><h3>Event profitability</h3></div>
        ${evProfit.length ? `<div class="table-wrap"><table class="table compact"><thead><tr><th>Event</th><th class="num">Revenue</th><th class="num">Labor</th><th class="num">Exp.</th><th class="num">Profit</th></tr></thead><tbody>
          ${evProfit.slice(0, 12).map(({ e, f }) => `<tr><td><a href="#/events/${e.id}">${esc(e.title)}</a><div class="muted small">${fmtShortDate(e.date)}</div></td><td class="num">${money(f.revenue)}</td><td class="num">${money(f.labor)}</td><td class="num">${money(f.expenses)}</td><td class="num ${f.profit < 0 ? 'text-err' : 'text-ok'}"><b>${money(f.profit)}</b></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">No completed events this year.</p>'}
      </section>
    </div>`;

  bindActions(el, {
    yr: (b) => { year += Number(b.dataset.d); render(el); },
    csv: () => {
      const rows = [['Month', 'Income', 'Expenses', 'Labor', 'Net', 'Events booked']];
      for (const x of monthly) rows.push([x.m, x.income.toFixed(2), x.exp.toFixed(2), x.labor.toFixed(2), (x.income - x.exp - x.labor).toFixed(2), x.booked]);
      rows.push(['Total', yIncome.toFixed(2), yExp.toFixed(2), yLabor.toFixed(2), yNet.toFixed(2), yEvents.length]);
      downloadFile(`profit-loss-${year}.csv`, toCSV(rows), 'text/csv');
    },
  });
}
