// App shell: auth, navigation, routing.
import { state, api, loadAll, esc, isManager, ui, toast, setTitle } from './core.js';
import * as dashboard from './views/dashboard.js';
import * as calendar from './views/calendar.js';
import * as events from './views/events.js';
import * as leads from './views/leads.js';
import * as clients from './views/clients.js';
import * as invoices from './views/invoices.js';
import * as staff from './views/staff.js';
import * as schedule from './views/schedule.js';
import * as payroll from './views/payroll.js';
import * as inventory from './views/inventory.js';
import * as expenses from './views/expenses.js';
import * as tasks from './views/tasks.js';
import * as reports from './views/reports.js';
import * as calculator from './views/calculator.js';
import * as settings from './views/settings.js';
import * as portal from './views/portal.js';

const ICON = {
  dashboard: '◧', calendar: '▦', events: '★', leads: '⇢', clients: '☺', invoices: '$', staff: '☷', schedule: '⏱',
  payroll: '¤', inventory: '▤', expenses: '−', tasks: '✓', reports: '▲', calculator: '∑', settings: '⚙', portal: '⌂', profile: '☺',
};

const MANAGER_NAV = [
  ['Overview', [['dashboard', 'Dashboard'], ['calendar', 'Calendar'], ['tasks', 'Tasks']]],
  ['Sales', [['leads', 'Leads'], ['clients', 'Clients'], ['events', 'Events'], ['invoices', 'Quotes & Invoices']]],
  ['Team', [['staff', 'Staff'], ['schedule', 'Scheduling'], ['payroll', 'Payroll']]],
  ['Operations', [['inventory', 'Inventory'], ['calculator', 'Bar Calculator'], ['expenses', 'Expenses'], ['reports', 'Reports']]],
  ['', [['settings', 'Settings']]],
];
const STAFF_NAV = [['', [['portal', 'My Shifts'], ['calendar', 'Calendar'], ['tasks', 'My Tasks'], ['profile', 'My Profile']]]];

const MANAGER_ROUTES = { dashboard, calendar, events, leads, clients, invoices, staff, schedule, payroll, inventory, expenses, tasks, reports, calculator, settings };
const STAFF_ROUTES = { portal, calendar, tasks, profile: { render: (el) => portal.renderProfile(el) } };

const root = document.getElementById('app');

// ------------------------------------------------------------------ auth screens
function authScreen({ setup, businessName }) {
  root.innerHTML = `
    <div class="auth-wrap">
      <form class="auth-card" id="authForm">
        <div class="brand-mark">🍸</div>
        <h1>${setup ? 'Welcome to BarOps' : esc(businessName || 'BarOps')}</h1>
        <p class="muted">${setup ? 'Create the owner account for your mobile bar business.' : 'Sign in to your business dashboard.'}</p>
        ${setup ? `
          <div class="field"><label>Business name</label><input name="businessName" required placeholder="e.g. Shake & Stir Mobile Bar"></div>
          <div class="field"><label>Your name</label><input name="name" required autocomplete="name"></div>` : ''}
        <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email"></div>
        <div class="field"><label>Password</label><input name="password" type="password" required minlength="${setup ? 8 : 1}" autocomplete="${setup ? 'new-password' : 'current-password'}"></div>
        ${setup ? '<label class="check"><input type="checkbox" name="demo" checked> Load sample data so I can explore</label>' : ''}
        <button class="btn btn-primary btn-block" type="submit">${setup ? 'Create account' : 'Sign in'}</button>
        <p class="error" id="authErr"></p>
        ${setup ? '' : '<p class="muted small">Staff: ask your manager for your login. Clients: <a href="/book.html">request a quote</a>.</p>'}
      </form>
    </div>`;
  const form = document.getElementById('authForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form));
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      if (setup) {
        await api('POST', '/auth/setup', fd);
        if (form.demo.checked) {
          const { seedDemo } = await import('./demo.js');
          await loadAll();
          await seedDemo();
        }
      } else {
        await api('POST', '/auth/login', fd);
      }
      await start();
    } catch (err) {
      document.getElementById('authErr').textContent = err.message;
    } finally { btn.disabled = false; }
  });
}

// ------------------------------------------------------------------ shell
function navHtml() {
  const nav = isManager() ? MANAGER_NAV : STAFF_NAV;
  return nav.map(([group, items]) => `
    ${group ? `<div class="nav-group">${esc(group)}</div>` : '<div class="nav-sep"></div>'}
    ${items.map(([key, label]) => `<a href="#/${key}" data-nav="${key}"><span class="nav-ico">${ICON[key]}</span>${esc(label)}</a>`).join('')}
  `).join('');
}

function shell() {
  const u = state.user;
  root.innerHTML = `
    <div class="layout">
      <aside class="sidebar" id="sidebar">
        <div class="side-brand"><span class="brand-mark sm">🍸</span><div><strong>${esc(state.settings.businessName || 'BarOps')}</strong><small>BarOps</small></div></div>
        <nav>${navHtml()}</nav>
        <div class="side-user">
          <div><strong>${esc(u.name)}</strong><small>${esc(u.role)}</small></div>
          <button class="btn btn-sm" id="logoutBtn">Sign out</button>
        </div>
      </aside>
      <div class="scrim" id="scrim"></div>
      <div class="main-col">
        <header class="topbar">
          <button class="icon-btn menu-btn" id="menuBtn" aria-label="Menu">☰</button>
          <div class="topbar-title" id="topTitle"></div>
          <div class="topbar-actions" id="topActions"></div>
        </header>
        <main id="main" class="main"></main>
      </div>
    </div>`;
  const sb = document.getElementById('sidebar');
  const scrim = document.getElementById('scrim');
  const toggle = (open) => { sb.classList.toggle('open', open); scrim.classList.toggle('show', open); };
  document.getElementById('menuBtn').onclick = () => toggle(!sb.classList.contains('open'));
  scrim.onclick = () => toggle(false);
  sb.addEventListener('click', (e) => { if (e.target.closest('a')) toggle(false); });
  document.getElementById('logoutBtn').onclick = async () => { await api('POST', '/auth/logout'); location.hash = ''; location.reload(); };
}

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  return { view: parts[0], id: parts[1], sub: parts[2], query: new URLSearchParams(query || '') };
}

function render() {
  const routes = isManager() ? MANAGER_ROUTES : STAFF_ROUTES;
  const r = parseHash();
  if (!r.view || !routes[r.view]) {
    location.replace('#/' + (isManager() ? 'dashboard' : 'portal'));
    return;
  }
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === r.view));
  const main = document.getElementById('main');
  const label = (isManager() ? MANAGER_NAV : STAFF_NAV).flatMap((g) => g[1]).find(([k]) => k === r.view)?.[1] || '';
  document.getElementById('topTitle').textContent = label;
  document.getElementById('topActions').innerHTML = '';
  setTitle(label);
  try {
    routes[r.view].render(main, r);
  } catch (err) {
    console.error(err);
    main.innerHTML = `<div class="card"><h3>Something went wrong</h3><pre>${esc(err.stack || err.message)}</pre></div>`;
  }
}

async function start() {
  const st = await api('GET', '/auth/status');
  if (!st.user) return authScreen({ setup: st.needsSetup, businessName: st.businessName });
  try {
    await loadAll();
  } catch (err) {
    toast(err.message, 'err');
    return authScreen({ setup: false, businessName: st.businessName });
  }
  shell();
  ui.rerender = render;
  ui.go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };
  window.onhashchange = () => { window.scrollTo(0, 0); render(); };
  render();
}

document.addEventListener('click', (e) => {
  const inside = e.target.closest('.dropdown');
  document.querySelectorAll('.dropdown.open').forEach((d) => { if (d !== inside || e.target.closest('.menu button')) d.classList.remove('open'); });
});

start().catch((e) => { root.innerHTML = `<div class="auth-wrap"><div class="auth-card"><h2>Can't reach the server</h2><p>${esc(e.message)}</p></div></div>`; });

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
