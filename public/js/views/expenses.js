import {
  list, byId, esc, money, today, fmtShortDate, pageHead, fields, openModal, saveItem, removeItem, toast, ui,
  bindActions, emptyState, options, EXPENSE_CATEGORIES, PAYMENT_METHODS, downloadFile, toCSV, searchFilter,
} from '../core.js';

let month = '';
let cat = '';
let q = '';

export function render(el) {
  let items = list('expenses');
  if (month) items = items.filter((x) => (x.date || '').slice(0, 7) === month);
  if (cat) items = items.filter((x) => x.category === cat);
  items = searchFilter(items, q, (x) => `${x.vendor} ${x.notes} ${x.category} ${byId('events', x.eventId)?.title || ''}`);
  items = [...items].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const total = items.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const byCat = {};
  for (const x of items) byCat[x.category || 'Other'] = (byCat[x.category || 'Other'] || 0) + (Number(x.amount) || 0);
  const months = [...new Set(list('expenses').map((x) => (x.date || '').slice(0, 7)).filter(Boolean))].sort().reverse();

  el.innerHTML = `
    ${pageHead('Expenses', `${items.length} entries · ${money(total)}`, '<button class="btn" data-act="csv">Export CSV</button><button class="btn btn-primary" data-act="new">+ Expense</button>')}
    <div class="toolbar">
      <select data-f="month"><option value="">All months</option>${months.map((m) => `<option ${m === month ? 'selected' : ''} value="${m}">${new Date(m + '-01T00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</option>`).join('')}</select>
      <select data-f="cat"><option value="">All categories</option>${EXPENSE_CATEGORIES.map((c) => `<option ${c === cat ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <input type="search" data-f="q" placeholder="Search vendor, notes…" value="${esc(q)}">
    </div>
    ${Object.keys(byCat).length ? `<div class="card"><div class="cat-bars">${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<div class="funnel-row"><span>${esc(c)}</span><div class="bar"><i style="width:${(v / total) * 100}%"></i></div><b>${money(v)}</b></div>`).join('')}</div></div>` : ''}
    ${items.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Category</th><th>Vendor</th><th>Event</th><th>Paid with</th><th class="num">Amount</th><th></th></tr></thead><tbody>
      ${items.map((x) => `<tr><td data-l="Date">${fmtShortDate(x.date)}</td><td data-l="Category">${esc(x.category || '—')}</td><td data-l="Vendor">${esc(x.vendor || '—')}${x.notes ? `<div class="muted small">${esc(x.notes)}</div>` : ''}</td>
        <td data-l="Event">${x.eventId ? `<a href="#/events/${x.eventId}">${esc(byId('events', x.eventId)?.title || '—')}</a>` : '<span class="muted">Overhead</span>'}</td><td data-l="Paid with">${esc(x.method || '—')}</td>
        <td data-l="Amount" class="num"><b>${money(x.amount)}</b></td><td><button class="icon-btn sm" data-act="edit" data-id="${x.id}">✎</button></td></tr>`).join('')}
    </tbody></table></div>` : emptyState('−', 'No expenses recorded.', '<button class="btn btn-primary" data-act="new">+ Expense</button>')}`;

  el.querySelectorAll('[data-f]').forEach((i) => i.addEventListener(i.type === 'search' ? 'input' : 'change', () => {
    if (i.dataset.f === 'month') month = i.value; else if (i.dataset.f === 'cat') cat = i.value; else q = i.value;
    const p = i.selectionStart; render(el);
    if (i.type === 'search') { const n = el.querySelector('[data-f=q]'); n.focus(); n.setSelectionRange(p, p); }
  }));
  bindActions(el, {
    new: () => expenseModal({ date: today() }),
    edit: (b) => expenseModal(byId('expenses', b.dataset.id)),
    csv: () => {
      const rows = [['Date', 'Category', 'Vendor', 'Event', 'Method', 'Amount', 'Notes']];
      for (const x of items) rows.push([x.date, x.category, x.vendor, byId('events', x.eventId)?.title || '', x.method, Number(x.amount).toFixed(2), x.notes]);
      downloadFile(`expenses-${today()}.csv`, toCSV(rows), 'text/csv');
    },
  });
}

export function expenseModal(x) {
  const isNew = !x.id;
  openModal({
    title: isNew ? 'Log expense' : 'Edit expense', submitLabel: 'Save',
    extraButtons: isNew ? '' : '<button type="button" class="btn btn-danger-ghost" data-del>Delete</button>',
    body: `<div class="form-grid">${fields([
      { n: 'amount', l: 'Amount ($)', t: 'number', step: '0.01', min: 0, req: true },
      { n: 'date', l: 'Date', t: 'date', req: true },
      { n: 'category', l: 'Category', t: 'select', o: EXPENSE_CATEGORIES, req: true },
      { n: 'vendor', l: 'Vendor', ph: 'Total Wine, Costco, gas station…' },
      { n: 'eventId', l: 'Event (leave blank for overhead)', t: 'select', o: options('events', (e) => `${e.title} · ${e.date}`) },
      { n: 'method', l: 'Paid with', t: 'select', o: PAYMENT_METHODS },
      { n: 'notes', l: 'Notes', t: 'textarea', full: true, rows: 2 },
    ], x)}</div>`,
    onMount: (dlg) => {
      const del = dlg.querySelector('[data-del]');
      if (del) del.onclick = async () => { await removeItem('expenses', x.id); dlg.close(); dlg.remove(); toast('Deleted'); ui.rerender(); };
    },
    onSubmit: async (f) => { await saveItem('expenses', { ...x, ...f }); toast('Expense saved'); ui.rerender(); },
  });
}
