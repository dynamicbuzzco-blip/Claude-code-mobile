// Sample data generator so new users can explore a realistic, populated account.
import { list, today, addDays, DEFAULT_CHECKLIST, eventHours, api, loadAll } from './core.js';

// Records are built locally (with client-generated ids so they can reference each
// other) and sent to the server in a single bulk request.
let buffer = null;
function saveItem(col, item) {
  const arr = (buffer[col] = buffer[col] || []);
  if (item.id) { const i = arr.findIndex((x) => x.id === item.id); if (i >= 0) { arr[i] = { ...item }; return arr[i]; } }
  const rec = { ...item, id: item.id || crypto.randomUUID() };
  arr.push(rec);
  return rec;
}
import { itemsForEvent, blankDoc } from './views/invoices.js';
import { defaultShiftWindow } from './views/schedule.js';

export async function seedDemo() {
  buffer = {};
  const t = today();
  const pkg = (name) => list('packages').find((p) => p.name === name)?.id || '';

  const staffDefs = [
    { name: 'Maya Torres', roles: ['lead bartender', 'bartender'], payRate: 30, phone: '(555) 201-4410', color: '#7c6cf0', employmentType: '1099', certifications: [{ name: 'TABC', number: 'TX-88321', expires: addDays(t, 300) }, { name: 'ServSafe Alcohol', expires: addDays(t, 20) }] },
    { name: 'Jordan Blake', roles: ['bartender'], payRate: 25, phone: '(555) 201-7733', color: '#e0679a', employmentType: '1099', certifications: [{ name: 'TABC', expires: addDays(t, 500) }] },
    { name: 'Chris Nguyen', roles: ['bartender', 'barista'], payRate: 25, phone: '(555) 309-1122', color: '#1fa5a0', employmentType: '1099', certifications: [{ name: 'TIPS', expires: addDays(t, 400) }], weeklyAvailability: { 0: true, 1: false, 2: false, 3: true, 4: true, 5: true, 6: true } },
    { name: 'Sam Patel', roles: ['barback', 'driver'], payRate: 18, phone: '(555) 404-8890', color: '#f29b38', employmentType: '1099' },
    { name: 'Alexis Reed', roles: ['bartender', 'server'], payRate: 24, phone: '(555) 777-3021', color: '#4a90e2', employmentType: 'W2', unavailableDates: [addDays(t, 12), addDays(t, 13)] },
    { name: 'Devon Brooks', roles: ['event manager', 'bartender'], payRate: 250, payType: 'flat', phone: '(555) 650-1180', color: '#5bb85d', employmentType: 'W2' },
  ];
  const staff = [];
  for (const s of staffDefs) staff.push(await saveItem('staff', { status: 'active', payType: 'hourly', email: s.name.split(' ')[0].toLowerCase() + '@example.com', ...s }));

  const clientDefs = [
    { name: 'Emily Carter', email: 'emily.carter@example.com', phone: '(555) 123-0001', type: 'Individual', source: 'Instagram', tags: 'wedding' },
    { name: 'Marcus Lee', company: 'Brightline Tech', email: 'marcus@brightline.example', phone: '(555) 123-0002', type: 'Corporate', source: 'Google', tags: 'repeat, vip' },
    { name: 'Priya Shah', email: 'priya.s@example.com', phone: '(555) 123-0003', type: 'Individual', source: 'Referral' },
    { name: 'Hannah Wolfe', company: 'Wolfe & Co Events', email: 'hannah@wolfeevents.example', phone: '(555) 123-0004', type: 'Wedding Planner', source: 'Planner', tags: 'partner' },
    { name: 'The Oak Barn', company: 'The Oak Barn Venue', email: 'events@oakbarn.example', phone: '(555) 123-0005', type: 'Venue', source: 'Venue partner' },
    { name: 'Daniel Kim', email: 'dkim@example.com', phone: '(555) 123-0006', type: 'Individual', source: 'The Knot' },
  ];
  const clients = [];
  for (const c of clientDefs) clients.push(await saveItem('clients', c));

  const evDefs = [
    { title: 'Carter–Hughes Wedding', c: 0, d: 9, eventType: 'Wedding', start: '17:00', end: '22:00', guests: 150, venue: 'The Oak Barn', address: '1200 Ranch Rd, Austin, TX', p: 'Full Open Bar', need: { bartender: 3, barback: 1 }, status: 'confirmed', menu: 'Signature: "Something Blue" (vodka, blue curaçao, lemon, prosecco)\nSignature: Smoked Old Fashioned\nBeer: Shiner, Lone Star\nWine: Sauvignon Blanc, Pinot Noir', paid: 0.5, mileage: 32 },
    { title: 'Brightline Q4 Holiday Party', c: 1, d: 18, eventType: 'Holiday Party', start: '18:30', end: '22:30', guests: 220, venue: 'Brightline HQ Rooftop', address: '500 Congress Ave, Austin, TX', p: 'Full Open Bar', need: { bartender: 4, barback: 1 }, status: 'confirmed', menu: 'Spiked cider, Espresso martini, Holiday mule', paid: 0.5 },
    { title: "Priya's 30th Birthday", c: 2, d: 5, eventType: 'Birthday', start: '19:00', end: '23:00', guests: 60, venue: 'Private residence', address: '88 Lakeview Dr, Austin, TX', p: 'Beer & Wine Bar', need: { bartender: 1 }, status: 'confirmed', paid: 1 },
    { title: 'Wolfe Wedding — Garcia/Nguyen', c: 3, d: 32, eventType: 'Wedding', start: '16:00', end: '21:00', guests: 180, venue: 'Hill Country Chapel', address: '4500 FM 2244, Bee Cave, TX', p: 'Dry Hire (BYO Alcohol)', need: { bartender: 3, barback: 1 }, status: 'tentative', alcoholBy: 'client', paid: 0 },
    { title: 'Oak Barn Open House', c: 4, d: 45, eventType: 'Brand Activation', start: '11:00', end: '15:00', guests: 90, venue: 'The Oak Barn', address: '1200 Ranch Rd, Austin, TX', p: 'Espresso / Coffee Cart', need: { barista: 2 }, status: 'confirmed', serviceType: 'Coffee / Espresso', alcoholBy: 'none', paid: 0 },
    { title: 'Kim Graduation Party', c: 5, d: -12, eventType: 'Graduation', start: '14:00', end: '18:00', guests: 75, venue: 'Zilker Park Pavilion', address: 'Zilker Park, Austin, TX', p: 'Mocktail & Zero-Proof Bar', need: { bartender: 1, server: 1 }, status: 'completed', alcoholBy: 'none', serviceType: 'Mocktail Bar', paid: 1 },
    { title: 'Brightline Client Mixer', c: 1, d: -25, eventType: 'Corporate', start: '17:00', end: '20:00', guests: 80, venue: 'Brightline HQ', address: '500 Congress Ave, Austin, TX', p: 'Beer & Wine Bar', need: { bartender: 2 }, status: 'completed', paid: 1 },
    { title: 'Carter Rehearsal Dinner', c: 0, d: 8, eventType: 'Private Party', start: '18:00', end: '21:00', guests: 40, venue: 'Juniper Restaurant', address: '2400 E Cesar Chavez St, Austin, TX', p: 'Beer & Wine Bar', need: { bartender: 1 }, status: 'confirmed', paid: 0 },
    { title: 'Wolfe Events Styled Shoot', c: 3, d: -40, eventType: 'Other', start: '10:00', end: '13:00', guests: 40, venue: 'Laguna Gloria', address: '3809 W 35th St, Austin, TX', p: 'Beer & Wine Bar', need: { bartender: 1 }, status: 'completed', paid: 0.6 },
  ];

  const events = [];
  for (const e of evDefs) {
    const date = addDays(t, e.d);
    const ev = await saveItem('events', {
      title: e.title, clientId: clients[e.c].id, date, startTime: e.start, endTime: e.end, guestCount: e.guests, venue: e.venue, address: e.address,
      eventType: e.eventType, packageId: pkg(e.p), serviceType: e.serviceType || (e.p === 'Beer & Wine Bar' ? 'Beer & Wine' : e.p.startsWith('Dry') ? 'Dry Hire (BYO)' : 'Full Bar'),
      alcoholBy: e.alcoholBy || 'company', status: e.status, staffNeeded: { bartender: 0, barback: 0, barista: 0, server: 0, ...e.need }, menu: e.menu || '',
      dressCode: 'All black, black apron', contactOnSite: `${clientDefs[e.c].name} ${clientDefs[e.c].phone}`, mileage: e.mileage || 10,
      staffNotes: 'Load in through the side entrance. Park the van in the back lot. Bar must be set 30 minutes before guests arrive.',
      checklist: DEFAULT_CHECKLIST.map((text, i) => ({ text, done: e.d < 0 || i < (e.status === 'confirmed' ? 3 : 1) })),
    });
    events.push({ ev, def: e });

    // Quote + invoice
    const items = itemsForEvent(ev);
    if (e.status === 'tentative') {
      await saveItem('invoices', blankDoc('quote', { clientId: ev.clientId, eventId: ev.id, items, status: 'sent', issueDate: addDays(t, -3) }));
    } else {
      const doc = blankDoc('invoice', { clientId: ev.clientId, eventId: ev.id, items, status: 'sent', issueDate: addDays(date, -45), dueDate: addDays(date, -7) });
      const inv = await saveItem('invoices', doc);
      if (e.paid) {
        const { invoiceTotals } = await import('./core.js');
        const total = invoiceTotals(inv).total;
        const dep = Math.round(total * Math.min(e.paid, 0.5) * 100) / 100;
        const payments = [{ id: crypto.randomUUID(), amount: dep, date: addDays(date, -40), method: 'Card', note: 'Deposit' }];
        if (e.paid > 0.5) payments.push({ id: crypto.randomUUID(), amount: e.paid >= 1 ? Math.round((total - dep) * 100) / 100 : Math.round(total * (e.paid - 0.5) * 100) / 100, date: addDays(date, -7), method: 'Zelle', note: e.paid >= 1 ? 'Final balance' : 'Partial payment' });
        await saveItem('invoices', { ...inv, payments });
      }
    }

    // Shifts
    const win = defaultShiftWindow(ev);
    const roleList = Object.entries(ev.staffNeeded).flatMap(([r, n]) => Array(Number(n) || 0).fill(r));
    const pool = [...staff];
    let assigned = 0;
    for (const role of roleList) {
      if (e.status === 'tentative' || (e.d > 25 && assigned >= 1)) break; // leave some open needs
      const idx = pool.findIndex((s) => (s.roles || []).some((r) => r.includes(role.replace('lead ', ''))) && !(s.unavailableDates || []).includes(date));
      const s = idx >= 0 ? pool.splice(idx, 1)[0] : pool.shift();
      if (!s) break;
      const past = e.d < 0;
      const hrs = eventHours(ev);
      await saveItem('shifts', {
        eventId: ev.id, staffId: s.id, role, start: win.start, end: win.end,
        status: past ? 'completed' : assigned % 3 === 2 ? 'assigned' : 'confirmed',
        tips: past ? Math.round(hrs * 22) : 0, paid: e.d < -20,
        ...(past ? { clockIn: new Date(win.start).toISOString(), clockOut: new Date(win.end).toISOString() } : {}),
      });
      assigned++;
    }
  }

  const leadDefs = [
    { name: 'Olivia Martinez', email: 'olivia.m@example.com', phone: '(555) 222-1001', stage: 'new', source: 'Website form', eventType: 'Wedding', eventDate: addDays(t, 120), guestCount: 140, budget: 5500, venue: 'Vista West Ranch', notes: 'Wants a tequila-forward signature cocktail and a champagne toast.' },
    { name: 'Tyler Jenkins', email: 'tyler@startup.example', phone: '(555) 222-1002', stage: 'new', source: 'Google', eventType: 'Corporate', eventDate: addDays(t, 21), guestCount: 60, budget: 2200, notes: 'Team offsite happy hour.' },
    { name: 'Grace Okafor', email: 'grace.o@example.com', stage: 'contacted', source: 'Instagram', eventType: 'Birthday', eventDate: addDays(t, 35), guestCount: 45, budget: 1400, followUp: t },
    { name: 'Ben Alvarez', email: 'ben.a@example.com', stage: 'quoted', source: 'The Knot', eventType: 'Wedding', eventDate: addDays(t, 200), guestCount: 210, budget: 8000 },
    { name: 'Riverside Rotary Club', email: 'events@rotary.example', stage: 'negotiating', source: 'Referral', eventType: 'Fundraiser', eventDate: addDays(t, 60), guestCount: 300, budget: 9500, followUp: addDays(t, 2) },
    { name: 'Nina Park', email: 'nina@example.com', stage: 'lost', source: 'Thumbtack', eventType: 'Private Party', guestCount: 25, budget: 600, notes: 'Went with a cheaper option.' },
  ];
  for (const l of leadDefs) await saveItem('leads', { packageId: pkg('Full Open Bar'), ...l });
  // mark a booked lead
  await saveItem('leads', { name: 'Emily Carter', email: 'emily.carter@example.com', stage: 'won', source: 'Instagram', eventType: 'Wedding', guestCount: 150, budget: 6000, clientId: clients[0].id, eventId: events[0].ev.id });

  const inv = [
    ['8ft Portable Bar (white)', 'Bar & Equipment', 2, '', 1100, 'Storage unit A'], ['6ft Folding Bar w/ facade', 'Bar & Equipment', 2, '', 450, 'Storage unit A'],
    ['Back bar shelving', 'Bar & Equipment', 2, '', 220, 'Storage unit A'], ['Igloo 150qt cooler', 'Coolers & Ice', 6, 4, 120, 'Van'],
    ['Ice bins (insulated)', 'Coolers & Ice', 4, 2, 85, 'Van'], ['Boston shaker set', 'Tools', 10, 6, 18, 'Bar kit bins'],
    ['Jiggers', 'Tools', 12, 8, 6, 'Bar kit bins'], ['Bar spoons', 'Tools', 10, 6, 4, 'Bar kit bins'], ['Hawthorne strainers', 'Tools', 10, 6, 7, 'Bar kit bins'],
    ['Wine glasses (rack of 25)', 'Glassware', 8, 4, 45, 'Shelf B'], ['Champagne flutes (rack of 36)', 'Glassware', 5, 3, 55, 'Shelf B'],
    ['Rocks glasses (rack of 36)', 'Glassware', 4, 3, 50, 'Shelf B'], ['9oz clear cups (sleeve of 50)', 'Disposables', 14, 20, 6.5, 'Shelf C'],
    ['Cocktail napkins (pack 250)', 'Disposables', 9, 6, 5, 'Shelf C'], ['Black straws (box 500)', 'Disposables', 2, 3, 9, 'Shelf C'],
    ['Simple syrup (1L)', 'Mixers', 6, 6, 4, 'Fridge'], ['Ginger beer (case 24)', 'Mixers', 3, 4, 22, 'Shelf D'],
    ['Menu sign A-frame', 'Decor & Signage', 3, '', 60, 'Storage unit A'], ['LED bar light strip', 'Decor & Signage', 4, 2, 30, 'Bar kit bins'],
    ['Espresso machine (2-group)', 'Coffee', 1, '', 3200, 'Storage unit A'], ['Espresso beans (5lb)', 'Coffee', 2, 3, 65, 'Shelf D'],
  ];
  const invItems = [];
  for (const [name, category, qty, minQty, cost, location] of inv) invItems.push(await saveItem('inventory', { name, category, qty, minQty, cost, location, unit: 'each', parLevel: minQty ? minQty * 2 : '' }));
  // pack list on first wedding
  const wed = events[0].ev;
  const pick = (n) => invItems.find((i) => i.name.startsWith(n))?.id;
  await saveItem('events', { ...wed, equipment: [{ itemId: pick('8ft'), qty: 2 }, { itemId: pick('Back bar'), qty: 1 }, { itemId: pick('Igloo'), qty: 4 }, { itemId: pick('Boston'), qty: 4 }, { itemId: pick('Wine glasses'), qty: 6 }, { itemId: pick('Champagne'), qty: 5 }] });

  const exp = [
    [-41, 'Alcohol', 'Total Wine', 212.55, 8], [-40, 'Ice', 'Reddy Ice', 24, 8], [-26, 'Alcohol', 'Costco', 289.9, 6], [-25, 'Mixers & Garnish', 'H-E-B', 58.2, 6],
    [-13, 'Mixers & Garnish', 'Whole Foods', 96.4, 5], [-12, 'Ice', 'Reddy Ice', 32, 5], [-20, 'Insurance', 'Liquor liability policy', 145, null], [-15, 'Vehicle & Fuel', 'Shell', 72.1, null],
    [-10, 'Marketing', 'Instagram ads', 120, null], [-5, 'Software', 'Website hosting', 29, null], [-60, 'Equipment', 'Amazon — LED lights', 120, null],
  ];
  for (const [d, category, vendor, amount, evIdx] of exp) await saveItem('expenses', { date: addDays(t, d), category, vendor, amount, eventId: evIdx !== null ? events[evIdx].ev.id : '', method: 'Card' });

  const tasks = [
    ['Confirm final guest count with Emily', 0, 2, 'high', null], ['Order 400 lbs of ice for Carter wedding', 0, 6, 'high', 3],
    ['Pick up liquor order — Brightline party', 1, 16, 'normal', 0], ['Send rehearsal dinner menu for approval', 7, 1, 'normal', null],
    ['Follow up on Wolfe quote', 3, -1, 'high', null], ['Renew Maya\'s ServSafe certification', null, 14, 'normal', null], ['Deep clean coolers', null, 3, 'low', 3],
  ];
  for (const [title, evIdx, due, priority, sIdx] of tasks) await saveItem('tasks', { title, eventId: evIdx !== null ? events[evIdx].ev.id : '', due: addDays(t, due), priority, assigneeStaffId: sIdx !== null ? staff[sIdx].id : '', done: false });

  await saveItem('activities', { type: 'system', text: 'Sample data loaded — explore away!' });
  await api('POST', '/bulk', { items: buffer });
  buffer = null;
  await loadAll();
}
