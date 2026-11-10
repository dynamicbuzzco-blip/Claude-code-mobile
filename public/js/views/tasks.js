import {
  list, byId, esc, today, fmtShortDate, pageHead, fields, openModal, saveItem, removeItem, toast, ui, bindActions,
  emptyState, options, isManager, api, staffName,
} from '../core.js';

let view = 'open';

export function render(el) {
  const t = today();
  const mgr = isManager();
  let items = list('tasks');
  if (view === 'open') items = items.filter((x) => !x.done);
  if (view === 'done') items = items.filter((x) => x.done);
  items = [...items].sort((a, b) => (a.done - b.done) || (a.due || '9999').localeCompare(b.due || '9999') || ({ high: 0, normal: 1, low: 2 }[a.priority || 'normal'] - { high: 0, normal: 1, low: 2 }[b.priority || 'normal']));
  const groups = [
    ['Overdue', items.filter((x) => !x.done && x.due && x.due < t)],
    ['Today', items.filter((x) => !x.done && x.due === t)],
    ['Upcoming', items.filter((x) => !x.done && x.due && x.due > t)],
    ['No due date', items.filter((x) => !x.done && !x.due)],
    ['Completed', items.filter((x) => x.done)],
  ].filter(([, g]) => g.length);

  el.innerHTML = `
    ${pageHead(mgr ? 'Tasks' : 'My Tasks', '', mgr ? '<button class="btn btn-primary" data-act="new">+ New task</button>' : '')}
    <div class="toolbar"><div class="seg">${[['open', 'Open'], ['done', 'Completed'], ['all', 'All']].map(([k, l]) => `<button class="${view === k ? 'on' : ''}" data-act="view" data-v="${k}">${l}</button>`).join('')}</div></div>
    ${groups.length ? groups.map(([label, g]) => `<section class="card"><div class="card-head"><h3>${label} <span class="muted small">${g.length}</span></h3></div>
      <ul class="list">${g.map((x) => `<li class="list-row task ${x.done ? 'done' : ''}">
        <input type="checkbox" data-act="toggle" data-id="${x.id}" ${x.done ? 'checked' : ''} aria-label="Done">
        <div class="grow"><span class="prio prio-${x.priority || 'normal'}"></span>${esc(x.title)}
          <div class="muted small">${x.due ? fmtShortDate(x.due) : ''}${x.eventId ? ` · <a href="#/events/${x.eventId}">${esc(byId('events', x.eventId)?.title || 'event')}</a>` : ''}${x.assigneeStaffId ? ' · ' + esc(staffName(x.assigneeStaffId)) : ''}${x.notes ? ' · ' + esc(x.notes) : ''}</div></div>
        ${mgr ? `<button class="icon-btn sm" data-act="edit" data-id="${x.id}" title="Edit">✎</button>` : ''}</li>`).join('')}</ul></section>`).join('')
    : emptyState('✓', view === 'done' ? 'No completed tasks.' : 'You are all caught up!', mgr ? '<button class="btn btn-primary" data-act="new">+ New task</button>' : '')}`;

  bindActions(el, {
    view: (b) => { view = b.dataset.v; render(el); },
    new: () => taskModal({}),
    edit: (b) => taskModal(byId('tasks', b.dataset.id)),
    toggle: async (cb) => {
      const task = byId('tasks', cb.dataset.id);
      if (mgr) await saveItem('tasks', { ...task, done: cb.checked });
      else { const saved = await api('PATCH', '/me/tasks/' + task.id, { done: cb.checked }); Object.assign(task, saved); }
      ui.rerender();
    },
  });
}

export function taskModal(task) {
  const isNew = !task.id;
  openModal({
    title: isNew ? 'New task' : 'Edit task', submitLabel: isNew ? 'Add task' : 'Save',
    extraButtons: isNew ? '' : '<button type="button" class="btn btn-danger-ghost" data-del>Delete</button>',
    body: `<div class="form-grid">${fields([
      { n: 'title', l: 'Task', req: true, full: true, ph: 'e.g. Pick up ice for Saturday wedding' },
      { n: 'due', l: 'Due date', t: 'date' },
      { n: 'priority', l: 'Priority', t: 'select', o: [['high', 'High'], ['normal', 'Normal'], ['low', 'Low']], blank: false, def: 'normal' },
      { n: 'eventId', l: 'Related event', t: 'select', o: options('events', (e) => `${e.title} · ${e.date}`, (e) => e.date >= today() || e.id === task.eventId) },
      { n: 'assigneeStaffId', l: 'Assign to staff', t: 'select', o: options('staff', (s) => s.name, (s) => s.status !== 'inactive') },
      { n: 'notes', l: 'Notes', t: 'textarea', full: true, rows: 2 },
    ], task)}</div>`,
    onMount: (dlg) => {
      const del = dlg.querySelector('[data-del]');
      if (del) del.onclick = async () => { await removeItem('tasks', task.id); dlg.close(); dlg.remove(); toast('Task deleted'); ui.rerender(); };
    },
    onSubmit: async (f) => { await saveItem('tasks', { done: false, ...task, ...f }); toast(isNew ? 'Task added' : 'Saved'); ui.rerender(); },
  });
}
