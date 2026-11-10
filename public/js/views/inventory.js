import {
  list, byId, esc, money, today, fmtShortDate, pageHead, fields, openModal, saveItem, removeItem, toast, ui,
  bindActions, emptyState, INVENTORY_CATEGORIES, searchFilter, downloadFile, toCSV,
} from '../core.js';

let cat = '';
let q = '';
let lowOnly = false;

const isLow = (i) => i.minQty !== '' && i.minQty !== undefined && i.minQty !== null && Number(i.qty) <= Number(i.minQty);

export function render(el, route) {
  if (route.query.get('low')) { lowOnly = true; history.replaceState(null, '', '#/inventory'); }
  let items = list('inventory');
  if (cat) items = items.filter((i) => i.category === cat);
  if (lowOnly) items = items.filter(isLow);
  items = searchFilter(items, q, (i) => `${i.name} ${i.category} ${i.location} ${i.notes}`).sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
  const value = list('inventory').reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.cost) || 0), 0);
  const low = list('inventory').filter(isLow);
  // reservations for upcoming events (equipment pack lists)
  const t = today();
  const reserved = {};
  for (const ev of list('events').filter((e) => e.date >= t && e.status !== 'cancelled')) {
    for (const it of ev.equipment || []) if (it.itemId) (reserved[it.itemId] = reserved[it.itemId] || []).push({ ev, qty: it.qty });
  }

  el.innerHTML = `
    ${pageHead('Inventory & Equipment', `${list('inventory').length} items · stock value ${money(value)} · ${low.length} low`, '<button class="btn" data-act="csv">Export CSV</button><button class="btn" data-act="shop">Shopping list</button><button class="btn btn-primary" data-act="new">+ Item</button>')}
    <div class="toolbar">
      <select data-f="cat"><option value="">All categories</option>${INVENTORY_CATEGORIES.map((c) => `<option ${c === cat ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <input type="search" data-f="q" placeholder="Search items…" value="${esc(q)}">
      <label class="check"><input type="checkbox" data-act="low" ${lowOnly ? 'checked' : ''}> Low stock only</label>
    </div>
    ${items.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Item</th><th>Category</th><th class="num">On hand</th><th class="num">Min</th><th class="num">Unit cost</th><th>Upcoming use</th><th>Adjust</th></tr></thead><tbody>
      ${items.map((i) => {
        const res = reserved[i.id] || [];
        const resQty = res.reduce((a, r) => a + Number(r.qty || 0), 0);
        return `<tr class="${isLow(i) ? 'row-warn' : ''}"><td data-l="Item"><a href="#" data-act="edit" data-id="${i.id}"><b>${esc(i.name)}</b></a>${i.location ? `<div class="muted small">${esc(i.location)}</div>` : ''}</td>
        <td data-l="Category">${esc(i.category || '—')}</td>
        <td data-l="On hand" class="num"><b>${esc(i.qty)}</b> <span class="muted small">${esc(i.unit || '')}</span>${isLow(i) ? ' <span class="text-warn small">low</span>' : ''}</td>
        <td data-l="Min" class="num">${i.minQty === '' || i.minQty === undefined ? '—' : esc(i.minQty)}</td>
        <td data-l="Unit cost" class="num">${i.cost ? money(i.cost) : '—'}</td>
        <td data-l="Upcoming">${res.length ? `<span class="small ${resQty > Number(i.qty) ? 'text-err' : ''}" title="${esc(res.map((r) => `${r.qty} for ${r.ev.title} (${r.ev.date})`).join('\n'))}">${resQty} reserved · ${res.length} event${res.length > 1 ? 's' : ''}</span>` : '<span class="muted small">—</span>'}</td>
        <td data-l="Adjust"><div class="stepper"><button class="btn btn-xs" data-act="dec" data-id="${i.id}">−</button><button class="btn btn-xs" data-act="inc" data-id="${i.id}">+</button></div></td></tr>`;
      }).join('')}</tbody></table></div>` : emptyState('▤', lowOnly ? 'Nothing is low on stock. 👍' : 'Track your bars, coolers, glassware, tools and consumables.', '<button class="btn btn-primary" data-act="new">+ Add item</button>')}`;

  el.querySelectorAll('[data-f]').forEach((i) => i.addEventListener(i.type === 'search' ? 'input' : 'change', () => {
    if (i.dataset.f === 'cat') cat = i.value; else q = i.value;
    const p = i.selectionStart; render(el, route);
    if (i.type === 'search') { const n = el.querySelector('[data-f=q]'); n.focus(); n.setSelectionRange(p, p); }
  }));
  const adjust = async (id, d) => { const i = byId('inventory', id); await saveItem('inventory', { ...i, qty: Math.max(0, (Number(i.qty) || 0) + d) }); ui.rerender(); };
  bindActions(el, {
    new: () => itemModal({}),
    edit: (b) => itemModal(byId('inventory', b.dataset.id)),
    inc: (b) => adjust(b.dataset.id, 1),
    dec: (b) => adjust(b.dataset.id, -1),
    low: (cb) => { lowOnly = cb.checked; render(el, route); },
    csv: () => {
      const rows = [['Item', 'Category', 'Qty', 'Unit', 'Min', 'Unit cost', 'Value', 'Location', 'Notes']];
      for (const i of list('inventory')) rows.push([i.name, i.category, i.qty, i.unit, i.minQty, i.cost, ((Number(i.qty) || 0) * (Number(i.cost) || 0)).toFixed(2), i.location, i.notes]);
      downloadFile(`inventory-${today()}.csv`, toCSV(rows), 'text/csv');
    },
    shop: () => {
      const lowItems = list('inventory').filter(isLow);
      openModal({
        title: 'Restock shopping list', hideSubmit: true,
        body: lowItems.length ? `<ul class="checklist">${lowItems.map((i) => {
          const need = Math.max(1, (Number(i.parLevel) || Number(i.minQty) * 2 || 1) - Number(i.qty));
          return `<li><label><input type="checkbox"> <span><b>${need}</b> ${esc(i.unit || '')} × ${esc(i.name)} ${i.cost ? `<span class="muted small">(~${money(need * i.cost)})</span>` : ''}</span></label></li>`;
        }).join('')}</ul><p class="muted small">Quantities bring stock back to par level (or 2× minimum).</p>` : '<p class="muted">Nothing below minimum stock right now.</p>',
      });
    },
  });
}

function itemModal(i) {
  const isNew = !i.id;
  openModal({
    title: isNew ? 'New inventory item' : 'Edit item', submitLabel: 'Save',
    extraButtons: isNew ? '' : '<button type="button" class="btn btn-danger-ghost" data-del>Delete</button>',
    body: `<div class="form-grid">${fields([
      { n: 'name', l: 'Item name', req: true, full: true, ph: 'e.g. 6ft portable bar, Boston shaker set, 9oz clear cups' },
      { n: 'category', l: 'Category', t: 'select', o: INVENTORY_CATEGORIES, req: true },
      { n: 'unit', l: 'Unit', ph: 'each, case, bottle, sleeve' },
      { n: 'qty', l: 'Quantity on hand', t: 'number', min: 0, step: 'any', req: true, def: 0 },
      { n: 'minQty', l: 'Reorder at (min)', t: 'number', min: 0, step: 'any' },
      { n: 'parLevel', l: 'Par level (restock to)', t: 'number', min: 0, step: 'any' },
      { n: 'cost', l: 'Unit cost ($)', t: 'number', min: 0, step: '0.01' },
      { n: 'location', l: 'Storage location', ph: 'Van, storage unit shelf B…' },
      { n: 'condition', l: 'Condition', t: 'select', o: ['Good', 'Needs repair', 'Retired'] },
      { n: 'notes', l: 'Notes', t: 'textarea', full: true, rows: 2 },
    ], i)}</div>${!isNew && i.updatedAt ? `<p class="muted small">Last updated ${fmtShortDate(i.updatedAt.slice(0, 10))}</p>` : ''}`,
    onMount: (dlg) => {
      const del = dlg.querySelector('[data-del]');
      if (del) del.onclick = async () => { await removeItem('inventory', i.id); dlg.close(); dlg.remove(); toast('Deleted'); ui.rerender(); };
    },
    onSubmit: async (f) => { await saveItem('inventory', { ...i, ...f }); toast('Saved'); ui.rerender(); },
  });
}
