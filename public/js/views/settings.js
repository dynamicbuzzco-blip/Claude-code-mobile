import {
  state, list, byId, esc, money, pageHead, fields, openModal, saveItem, removeItem, confirmBox, toast, ui, bindActions,
  api, loadAll, downloadFile, today, titleCase, staffName, copyText,
} from '../core.js';

let tab = 'business';

export function render(el) {
  const s = state.settings;
  const isOwner = state.user.role === 'owner';
  const tabs = [['business', 'Business'], ['billing', 'Invoicing & pricing'], ['packages', 'Packages & services'], ['team', 'Logins & access'], ['data', 'Data & account']];
  let body = '';
  if (tab === 'business') {
    body = `<form class="card" id="setForm"><div class="form-grid">${fields([
      { n: 'businessName', l: 'Business name', req: true }, { n: 'tagline', l: 'Tagline' },
      { n: 'email', l: 'Business email', t: 'email' }, { n: 'phone', l: 'Business phone', t: 'tel' },
      { n: 'website', l: 'Website' }, { n: 'address', l: 'Business address', full: true },
      { t: 'section', l: 'Operations' },
      { n: 'defaultShiftPadMinutes', l: 'Staff arrive before start (minutes)', t: 'number', min: 0 },
      { n: 'payrollPeriodDays', l: 'Payroll period (days)', t: 'number', min: 1 },
      { n: 'drinksFirstHour', l: 'Drinks per guest — first hour', t: 'number', step: '0.1', min: 0 },
      { n: 'drinksPerHourAfter', l: 'Drinks per guest — each hour after', t: 'number', step: '0.1', min: 0 },
    ], s)}</div><button class="btn btn-primary">Save</button></form>
    <section class="card"><div class="card-head"><h3>Client inquiry form</h3></div>
      <p class="small">Put this link on your website, Instagram bio and Google Business profile. Submissions land in <a href="#/leads">Leads</a>.</p>
      <div class="copy-row"><input readonly value="${esc(location.origin)}/book.html"><button class="btn btn-sm" data-act="copyForm">Copy</button><a class="btn btn-sm" href="/book.html" target="_blank">Open</a></div>
      <p class="muted small">Embed on your site: <code>&lt;iframe src="${esc(location.origin)}/book.html" style="width:100%;height:1100px;border:0"&gt;&lt;/iframe&gt;</code></p>
    </section>`;
  } else if (tab === 'billing') {
    body = `<form class="card" id="setForm"><div class="form-grid">${fields([
      { n: 'currency', l: 'Currency', t: 'select', o: ['USD', 'CAD', 'GBP', 'EUR', 'AUD', 'NZD', 'MXN'], blank: false },
      { n: 'taxRate', l: 'Default sales tax %', t: 'number', step: '0.001', min: 0 },
      { n: 'serviceChargePct', l: 'Default service charge / gratuity %', t: 'number', step: '0.01', min: 0 },
      { n: 'depositPct', l: 'Default deposit %', t: 'number', min: 0, max: 100 },
      { n: 'paymentTermsDays', l: 'Invoice due in (days)', t: 'number', min: 0 },
      { n: 'invoicePrefix', l: 'Invoice prefix' }, { n: 'nextInvoiceNumber', l: 'Next invoice number', t: 'number', min: 1 },
      { n: 'quotePrefix', l: 'Quote prefix' }, { n: 'nextQuoteNumber', l: 'Next quote number', t: 'number', min: 1 },
      { n: 'travelFeePerMile', l: 'Travel fee per mile ($)', t: 'number', step: '0.01', min: 0 },
      { n: 'freeTravelMiles', l: 'Free travel radius (miles)', t: 'number', min: 0 },
      { n: 'paymentLinkUrl', l: 'Online payment link (https://…)', full: true, ph: 'Your Square / Stripe / PayPal payment page', help: 'Shows a “Pay now” button on invoices sent to clients' },
      { n: 'paymentInstructions', l: 'Payment instructions (shown on invoices)', t: 'textarea', full: true, rows: 3, ph: 'Venmo @yourbar · Zelle pay@yourbar.com · Card link: …' },
      { n: 'terms', l: 'Default terms & conditions', t: 'textarea', full: true, rows: 6 },
    ], s)}</div><button class="btn btn-primary">Save</button></form>`;
  } else if (tab === 'packages') {
    const pk = list('packages');
    body = `<section class="card"><div class="card-head"><h3>Packages & services</h3><button class="btn btn-primary btn-sm" data-act="newPkg">+ Package</button></div>
      <p class="muted small">Used for quotes, the bar calculator and your public inquiry form.</p>
      <div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Category</th><th>Pricing</th><th class="num">Minimum</th><th>Active</th><th></th></tr></thead><tbody>
      ${pk.map((p) => `<tr><td data-l="Name"><b>${esc(p.name)}</b><div class="muted small">${esc(p.description || '')}</div></td><td data-l="Category">${esc(p.category || '—')}</td>
        <td data-l="Pricing">${money(p.price)} ${p.pricingType === 'per_person' ? '/ guest' : p.pricingType === 'per_hour' ? '/ hour' : 'flat'}</td><td data-l="Minimum" class="num">${p.minimum ? money(p.minimum) : '—'}</td>
        <td data-l="Active">${p.active === false ? 'No' : 'Yes'}</td><td><button class="icon-btn sm" data-act="editPkg" data-id="${p.id}">✎</button></td></tr>`).join('')}
      </tbody></table></div></section>`;
  } else if (tab === 'team') {
    body = `<section class="card"><div class="card-head"><h3>Logins</h3>${isOwner ? '<button class="btn btn-primary btn-sm" data-act="newMgr">+ Manager login</button>' : ''}</div>
      <p class="muted small">Owner & managers see everything. Staff logins (created from a staff profile) only see their own shifts, events and tasks.</p>
      <ul class="list">${state.users.map((u) => `<li class="list-row"><div class="grow"><b>${esc(u.name)}</b> <span class="muted">${esc(u.email)}</span><div class="small muted">${titleCase(u.role)}${u.staffId ? ' · linked to ' + esc(staffName(u.staffId)) : ''}</div></div>
        ${u.role !== 'owner' && u.id !== state.user.id ? `<button class="btn btn-sm" data-act="pw" data-id="${u.id}">Reset password</button><button class="btn btn-sm btn-danger-ghost" data-act="rmUser" data-id="${u.id}">Remove</button>` : ''}</li>`).join('')}</ul></section>`;
  } else if (tab === 'data') {
    body = `<section class="card"><div class="card-head"><h3>Change my password</h3></div>
      <form id="pwForm" class="form-grid">${fields([{ n: 'current', l: 'Current password', t: 'password', req: true }, { n: 'next', l: 'New password (min 8)', t: 'password', req: true }])}<div><button class="btn btn-primary">Update password</button></div></form></section>
      <section class="card"><div class="card-head"><h3>Backup & restore</h3></div>
        <p class="small">Download a full JSON backup of your clients, events, invoices, staff, and settings. Keep regular backups!</p>
        <div class="row-actions"><button class="btn" data-act="backup">⬇ Download backup</button>
        ${isOwner ? '<label class="btn">⬆ Restore from backup<input type="file" accept="application/json" id="restoreFile" hidden></label>' : ''}</div>
        ${isOwner ? '<p class="muted small">Restoring replaces all business data (logins are kept).</p>' : ''}
      </section>
      ${isOwner ? `<section class="card"><div class="card-head"><h3>Sample data</h3></div><p class="small">Load demo clients, events, staff and invoices to explore the app.</p><button class="btn" data-act="demo">Load sample data</button></section>` : ''}`;
  }

  el.innerHTML = `${pageHead('Settings')}
    <div class="tabs">${tabs.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="tab" data-v="${k}">${l}</button>`).join('')}</div>
    ${body}`;

  const form = el.querySelector('#setForm');
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = {};
    for (const inp of form.elements) if (inp.name) f[inp.name] = inp.type === 'number' ? (inp.value === '' ? '' : Number(inp.value)) : inp.value;
    state.settings = await api('PUT', '/settings', f);
    toast('Settings saved');
    document.querySelector('.side-brand strong').textContent = state.settings.businessName;
  });
  const pw = el.querySelector('#pwForm');
  if (pw) pw.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('POST', '/auth/password', Object.fromEntries(new FormData(pw))); toast('Password updated'); pw.reset(); }
    catch (err) { toast(err.message, 'err'); }
  });
  const rf = el.querySelector('#restoreFile');
  if (rf) rf.addEventListener('change', async () => {
    const file = rf.files[0];
    if (!file) return;
    if (!(await confirmBox('Replace ALL business data with this backup?', 'Restore'))) return;
    try {
      const json = JSON.parse(await file.text());
      await api('POST', '/import', json);
      await loadAll();
      toast('Backup restored');
      ui.rerender();
    } catch (err) { toast('Restore failed: ' + err.message, 'err'); }
  });

  bindActions(el, {
    tab: (b) => { tab = b.dataset.v; render(el); },
    copyForm: () => copyText(location.origin + '/book.html'),
    newPkg: () => pkgModal({}),
    editPkg: (b) => pkgModal(byId('packages', b.dataset.id)),
    newMgr: () => openModal({
      title: 'New manager login', submitLabel: 'Create',
      body: `<div class="form-grid">${fields([{ n: 'name', l: 'Name', req: true }, { n: 'email', l: 'Email', t: 'email', req: true }, { n: 'password', l: 'Temporary password (min 8)', req: true, full: true }])}</div>`,
      onSubmit: async (f) => { const u = await api('POST', '/users', { ...f, role: 'manager' }); state.users.push(u); toast('Manager added'); ui.rerender(); },
    }),
    pw: (b) => openModal({
      title: 'Reset password', submitLabel: 'Set password',
      body: `<div class="form-grid">${fields([{ n: 'password', l: 'New password (min 8)', req: true, full: true }])}</div>`,
      onSubmit: async (f) => { await api('PATCH', '/users/' + b.dataset.id, f); toast('Password updated'); },
    }),
    rmUser: async (b) => {
      if (!(await confirmBox('Remove this login?', 'Remove'))) return;
      await api('DELETE', '/users/' + b.dataset.id);
      state.users = state.users.filter((u) => u.id !== b.dataset.id);
      for (const st of list('staff')) if (st.userId === b.dataset.id) st.userId = null;
      ui.rerender();
    },
    backup: async () => {
      const data = await api('GET', '/export');
      downloadFile(`barops-backup-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
    },
    demo: async () => {
      if (!(await confirmBox('Add sample data alongside your existing records?', 'Load samples'))) return;
      const { seedDemo } = await import('../demo.js');
      await seedDemo();
      toast('Sample data loaded');
      ui.go('#/dashboard');
    },
  });
}

function pkgModal(p) {
  const isNew = !p.id;
  openModal({
    title: isNew ? 'New package' : 'Edit package', submitLabel: 'Save',
    extraButtons: isNew ? '' : '<button type="button" class="btn btn-danger-ghost" data-del>Delete</button>',
    body: `<div class="form-grid">${fields([
      { n: 'name', l: 'Package name', req: true, full: true },
      { n: 'category', l: 'Category', t: 'select', o: ['Bar service', 'Beverage', 'Add-on', 'Staffing', 'Rental', 'Other'] },
      { n: 'pricingType', l: 'Pricing', t: 'select', o: [['per_person', 'Per guest'], ['per_hour', 'Per hour'], ['flat', 'Flat rate']], blank: false },
      { n: 'price', l: 'Price ($)', t: 'number', step: '0.01', min: 0, req: true },
      { n: 'minimum', l: 'Minimum charge ($)', t: 'number', step: '0.01', min: 0 },
      { n: 'description', l: 'Description (shown to clients)', t: 'textarea', full: true, rows: 3 },
      { n: 'active', l: 'Active (available for new quotes)', t: 'checkbox', def: true },
    ], { active: true, ...p })}</div>`,
    onMount: (dlg) => {
      const del = dlg.querySelector('[data-del]');
      if (del) del.onclick = async () => { await removeItem('packages', p.id); dlg.close(); dlg.remove(); toast('Deleted'); ui.rerender(); };
    },
    onSubmit: async (f) => { await saveItem('packages', { ...p, ...f }); toast('Saved'); ui.rerender(); },
  });
}
