# 🍸 BarOps — All-in-one business software for mobile bartending & beverage catering

BarOps runs your whole mobile bar business from one web app that works on phones, tablets and desktops:
CRM, quotes and invoices, staff scheduling, calendar, payroll, inventory, expenses and reports.

It has **no third-party dependencies**: just Node.js. Run it on a laptop, a $5 VPS, Render, Railway, Fly.io or Docker.

## Features

| Area | What you get |
|---|---|
| **Dashboard** | Today's greeting, alerts (overdue invoices, understaffed events, new leads, low stock, expiring certs), KPIs, next events, tasks due, pipeline, unpaid invoices, activity feed |
| **Leads (CRM)** | Kanban pipeline (New → Contacted → Quote sent → Follow-up → Booked / Lost) with drag & drop, follow-up reminders, date-availability check, one-click **"Book it"** that creates the client, event and quote |
| **Public inquiry form** | `/book.html`: share or embed on your website/Instagram. Submissions land in Leads automatically (spam honeypot included) |
| **Clients** | Contact records, lifetime value, open balances, event history, and a call/email/text/tasting notes log |
| **Events** | Date/time, venue + map link, guest count, service type, package, who supplies alcohol (full bar / BYO dry hire / non-alcoholic), staff needed per role, dress code, day-of contact, drink menu, staff notes vs. private notes, **event checklist**, **equipment pack list**, tasks, **per-event profit** (revenue − labor − expenses), shopping estimate, printable event sheet, .ics export, duplicate |
| **Quotes & invoices** | Line-item editor with packages, auto-pricing from guest count/hours, travel fee by mileage, discount, service charge/gratuity, sales tax, deposits, payments (card/cash/Zelle/Venmo…), auto-save, status tracking (draft/sent/viewed/accepted/partial/paid/overdue/void), quote → invoice conversion, CSV export |
| **Client portal links** | Each quote/invoice has a secret link (`/doc.html#token`). Clients can view, print/save PDF, **e-sign and accept quotes**, and click **Pay now** (your Square/Stripe/PayPal link). You can see when they viewed it |
| **Staff** | Roster with roles, pay rate (hourly or flat), W-2/1099, colors, **certifications with expiry alerts** (TABC/TIPS/ServSafe), weekly availability + blocked dates, YTD hours & earnings, staff app logins |
| **Scheduling** | Assign staff to events with **conflict detection** (double-booking, unavailable dates, days off, expired certs, inactive), open-needs list, confirmation tracking, weekly roster grid, roster .ics export |
| **Staff portal** | Staff log in on their phones to see their shifts, venue/map, team, menu and notes, **confirm/decline** shifts, **clock in/out**, enter tips, update availability and certifications. They never see financials or client data |
| **Calendar** | Month / week / agenda views of events, shifts, tasks and tentative lead dates; click a day to book; .ics export |
| **Payroll** | Pay-period view of hours (clocked or scheduled), wages, tips per staff member; adjust times; mark paid; summary & detailed CSV export |
| **Inventory** | Equipment, glassware, tools, consumables; low-stock alerts, par levels, restock shopping list, quantities reserved by upcoming events, +/− quick adjust |
| **Bar calculator** | Drinks, liquor/wine/beer bottles, spirit split, mixers, ice, cups, napkins, bartenders and barbacks needed, plus package pricing |
| **Expenses** | Categorised expenses tied to events or overhead, monthly filters, CSV export |
| **Reports** | Cash-basis P&L by month, income vs. costs chart, events per month, A/R aging, sales tax collected, lead-source conversion & revenue, event-type mix, top clients, event profitability |
| **Settings** | Business profile, tax/service charge/deposit defaults, numbering, travel fee, payment link & instructions, terms, packages & pricing, manager/staff logins, password change, JSON backup & restore, sample data |

Roles: **Owner** (everything), **Manager** (everything except creating managers/restoring backups), **Staff** (self-service portal only). Access rules are enforced on the server.

## Quick start

```bash
node server.js          # or: npm start
# open http://localhost:3000
```

On first visit you create the owner account. Tick **"Load sample data"** to explore a realistic demo business.

Requires Node.js 18+ (22 recommended). Data is stored in `./data/db.json`; set `DATA_DIR` to change the location.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `./data` | Where `db.json` is stored. Use a persistent disk in production |
| `SECURE_COOKIES` | unset | Set to `1` when served over HTTPS |

## Deploying online

- **Render**: push this repo and create a Blueprint from `render.yaml`. It includes a persistent disk.
- **Docker**: `docker build -t barops . && docker run -p 3000:3000 -v barops-data:/data barops`
- **Any VPS**: `node server.js` behind Nginx/Caddy with HTTPS, and set `SECURE_COOKIES=1`.

Always serve over HTTPS in production. Back up regularly with **Settings → Data → Download backup**, or copy `db.json`.

## Development

```bash
npm run dev   # auto-restart on changes
npm test      # API integration tests (node:test)
```

Project layout:

```
server.js              Node HTTP server: auth, roles, REST API, JSON persistence, static files
public/index.html      App shell (single-page app, ES modules, no build step)
public/js/core.js      API client, state, formatting, forms/modals, business logic
public/js/views/*.js   One module per screen
public/js/demo.js      Sample data generator
public/book.html       Public inquiry form
public/doc.html        Client-facing quote/invoice page (view, print, e-sign, pay)
test/api.test.js       API tests
```

The JSON-file store suits a single business with thousands of events. To scale beyond that, the `/api/c/:collection` CRUD layer is the one place to swap in Postgres or SQLite.
