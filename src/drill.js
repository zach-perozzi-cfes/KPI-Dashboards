'use strict';
// Phone drill-down: the records behind each number on the boards. Every filter here uses
// the same rule helpers as metrics.js, so a drill list always adds up to the number on its card.
// Built on request from the cached sources; never calls Zoho.

const M = require('./metrics');
const { MONTHS, DAYS, md, weekLabel, money, timeFmt } = require('./format');

const { addDays, nyDate, inRange } = M;
const CRM_URL = (process.env.ZOHO_CRM_ORG_URL || '').replace(/\/+$/, '');
const PROJ_URL = (process.env.ZOHO_PROJECTS_URL || '').replace(/\/+$/, '');
const crm = (tab, id) => (CRM_URL && id ? `${CRM_URL}/tab/${tab}/${id}` : '');
const proj = (id) => (PROJ_URL && id ? `${PROJ_URL}#project/${id}` : '');

// { day: "Nov 18", time: "2:30 PM" } (time is blank for date-only fields).
function when(v) {
  if (!v) return { day: '', time: '' };
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return { day: md(v), time: '' };
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? { day: '', time: '' } : { day: md(nyDate(v)), time: timeFmt.format(d) };
}
// A record's date as milliseconds for sorting (0 when missing); date-only values count as noon UTC.
const sortKey = (v) => { const d = v ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00Z` : v) : null; return d && !Number.isNaN(d.getTime()) ? d.getTime() : 0; };
const dash = (s) => (s && String(s).trim()) || '—';
const join = (...a) => a.filter(Boolean).join(' · ');

// ---------- record shapes ----------
const leadRec = (r) => ({ name: dash(r.name), sub: join(r.src, r.owner), t: r.t, href: crm('Leads', r.id) });
function callRec(r) {
  const out = M.isOut(r.type);
  return { name: join(M.callRep(r.subject) || 'Call', out ? 'Outbound' : (r.type || 'Inbound')), sub: join(r.dur && `${r.dur} min`, dash(r.subject)), t: r.t, href: crm('Calls', r.id) };
}
const mtgRec = (r) => ({ name: dash(r.title || 'Meeting'), sub: M.repName(r), t: r.t, href: crm('Events', r.id) });
const dealRec = (r, extra) => ({ name: dash(r.name), sub: join(r.owner, extra), t: r.t || r.date || r.created, amount: r.amount, href: crm('Potentials', r.id) });
const projRec = (r) => ({ name: dash(r.name), sub: M.GROUP_LABELS[r.group] || r.group, t: r.created, href: proj(r.id) });
const ticketRec = (dateField) => (r) => ({ name: join(r.number && `#${r.number}`, dash(r.subject)), sub: join(r.contact, r.owner || 'Unassigned', r.status), t: r[dateField], href: r.href || '' });
const taskRec = (r) => ({ name: dash(r.project), sub: join(r.name, r.owner), t: r.completed, href: proj(r.projectId) });

// ---------- helpers ----------
function countBy(rows, key, withAmt = false) {
  const m = new Map();
  for (const r of rows) {
    const k = key(r);
    if (k == null) continue;
    const g = m.get(k) || { name: k, n: 0, amt: 0 };
    g.n++; g.amt += Number(r.amount) || 0;
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => (withAmt ? b.amt - a.amt : 0) || b.n - a.n || String(a.name).localeCompare(String(b.name)));
}
// Fixed day order (Mon..Fri or Mon..Sun) for "by day" groups, zeros included.
function byDays(rows, start, n, dateOf) {
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(start, i);
    return { name: `${DAYS[i]} ${md(day)}`, n: rows.filter((r) => dateOf(r) === day).length };
  });
}
const weekStarts = (win) => win.weeks.map((w) => ({ w, label: w === win.ws ? `This week (${md(w)})` : `Week of ${md(w)}` }));
function byWeek(rows, win, dateOf) {
  return weekStarts(win).reverse().map(({ w, label }) => ({ name: label, n: rows.filter((r) => inRange(dateOf(r), w, addDays(w, 7))).length }));
}
// Top-8 + "Other" split used by the lead-source and appointments-sat charts.
function topNames(rows, key) {
  const sorted = countBy(rows, key);
  return { top: new Set(sorted.slice(0, 8).map((g) => g.name)), rest: sorted.length - 8 };
}
const OTHER = '__other__';
const pending = (title) => ({ title, explain: '', rule: 'Waiting for Zoho data.', records: [], groups: [], total: '–' });

function make(title, rule, rows, rec, groups, opts = {}) {
  const records = rows.map(rec).sort((a, b) => (opts.byAmount ? (b.amount || 0) - (a.amount || 0) : 0) || sortKey(b.t) - sortKey(a.t));
  for (const r of records) Object.assign(r, when(r.t));
  const amt = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return { title, explain: opts.explain || '', rule, records, groups: groups.filter((g) => g.rows.length), total: opts.total || `${rows.length} ${opts.unit || 'records'}`, amount: opts.money ? money(amt) : null, byAmount: !!opts.byAmount };
}

// ---------- Inside Sales ----------
function sales(id, src, win) {
  const [kind, a, b] = id.split('~');
  const wkEnd = addDays(win.ws, 7);
  const d = (r) => nyDate(r.t);
  const repCalls = () => src.calls.data.filter((r) => M.isRepCall(r.subject));
  const callGroups = (rows) => [
    { label: 'By rep', rows: countBy(rows, (r) => M.callRep(r.subject)) },
    { label: 'Direction', rows: countBy(rows, (r) => (M.isOut(r.type) ? 'Outbound' : r.type && !/^in/i.test(r.type) ? `${r.type} (counted as inbound)` : 'Inbound')) },
  ];
  if (kind === 'leads') {
    if (!src.leads.data) return pending('Leads created');
    const rows = src.leads.data.filter((r) => inRange(d(r), win.ws, wkEnd));
    return make('Leads created · this week', 'CRM Leads with Created Time this week (Mon–Sun).', rows, leadRec, [
      { label: 'By day', rows: byDays(rows, win.ws, 7, d) },
      { label: 'By source', rows: countBy(rows, (r) => r.src) },
      { label: 'Last 4 weeks', rows: byWeek(src.leads.data, win, d) },
    ], { unit: 'leads', explain: 'A lead is a potential customer who has shown interest (through the website, a referral, an event or an ad) and has been entered into our CRM. This is how many new ones came in this week. More leads means more people the sales team can reach out to and turn into appointments.' });
  }
  if (kind === 'calls' || kind === 'callday') {
    if (!src.calls.data) return pending('Calls logged');
    const day = kind === 'callday' ? addDays(win.ws, Number(a)) : null;
    const rows = repCalls().filter((r) => (day ? d(r) === day : inRange(d(r), win.ws, wkEnd)));
    const title = day ? `Calls · ${DAYS[Number(a)]} ${md(day)}` : 'Calls logged · this week';
    const groups = callGroups(rows);
    if (!day) groups.push({ label: 'By day', rows: byDays(rows, win.ws, 7, d) }, { label: 'Last 4 weeks', rows: byWeek(repCalls(), win, d) });
    return make(title, `Calls on the lines of ${M.CALL_REPS.join(', ')} (rep read from the call Subject). Outbound = Call Type contains "out"; everything else, Missed included, counts as inbound.`, rows, callRec, groups, { unit: 'calls', explain: `How many phone calls our inside sales reps made or took ${day ? 'on this day' : 'this week'}. Outbound calls are reps reaching out to leads and customers; inbound calls are people calling them. It is a quick read on how much sales outreach is happening.` });
  }
  if (kind === 'meetings' || kind === 'nextweek') {
    if (!src.meetings.data) return pending('Meetings');
    const next = kind === 'nextweek';
    const start = next ? win.nextWs : win.ws;
    const rows = src.meetings.data.filter((r) => inRange(d(r), start, addDays(start, next ? 5 : 7)));
    const groups = [{ label: 'By day', rows: byDays(rows, start, next ? 5 : 7, d) }, { label: 'By owner', rows: countBy(rows, M.repName) }];
    if (!next) groups.push({ label: 'Last 4 weeks', rows: byWeek(src.meetings.data, win, d) });
    return make(next ? `Meetings booked · ${weekLabel(start).replace(/, \d{4}$/, '')}` : 'Meetings · this week',
      next ? 'Every CRM Event starting next Monday–Friday, any owner.' : 'Every CRM Event starting this week (Mon–Sun), any owner or kind.', rows, mtgRec, groups, { unit: 'meetings', explain: next ? 'Appointments already on the calendar for next week. Most are sales visits where a rep meets a homeowner to talk about solar, batteries or other work. A full calendar next week means sales activity is lined up ahead of time.' : 'Every appointment on the CRM calendar this week, mostly sales visits with homeowners. These meetings are where interest turns into a proposal, so this shows how busy the sales team is.' });
  }
  if (kind === 'grid') {
    if (!src.meetings.data) return pending('Meetings by rep');
    const gws = M.gridWeekStart(win);
    const rep = a || null;
    const di = b !== undefined && b !== '' ? Number(b) : null;
    const rows = src.meetings.data
      .filter((r) => !M.GRID_EXCLUDE.has(r.ownerId))
      .filter((r) => inRange(d(r), gws, addDays(gws, 5)))
      .filter((r) => !rep || M.repName(r) === rep)
      .filter((r) => di == null || d(r) === addDays(gws, di));
    const title = ['Meetings', rep, di != null ? `${DAYS[di]} ${md(addDays(gws, di))}` : `week of ${md(gws)}`].filter(Boolean).join(' · ');
    const groups = [];
    if (di == null) groups.push({ label: 'By day', rows: byDays(rows, gws, 5, d) });
    if (!rep) groups.push({ label: 'By rep', rows: countBy(rows, M.repName) });
    return make(title, `CRM Events Monday–Friday${gws === win.ws ? ' this week' : ' next week'}, by owner. Quintin Driskell is left out of this grid.`, rows, mtgRec, groups, { unit: 'meetings', explain: 'Appointments on each sales rep\u2019s calendar, day by day, for the work week. It shows who is meeting with customers and when, so it is easy to spot a rep with an open schedule or a day that is packed.' });
  }
  if (kind === 'src') {
    if (!src.leads.data) return pending('Lead sources');
    const all = src.leads.data.filter((r) => inRange(d(r), win.weeks[0], wkEnd));
    const { top } = topNames(all, (r) => r.src);
    const rows = !a ? all : a === OTHER ? all.filter((r) => !top.has(r.src)) : all.filter((r) => r.src === a);
    const title = !a ? 'Leads · last 4 weeks' : a === OTHER ? 'Leads · other sources' : `Leads · ${a}`;
    return make(title, `CRM Leads created since ${md(win.weeks[0])}, by Lead Source (blank = "None").`, rows, leadRec, [
      { label: 'By week', rows: byWeek(rows, win, d) },
      ...(a && a !== OTHER ? [] : [{ label: 'By source', rows: countBy(rows, (r) => r.src) }]),
    ], { unit: 'leads', explain: 'Where our new leads came from over the last four weeks, for example the website, a referral or a marketing campaign. It shows which channels bring in the most potential customers, which helps decide where to spend marketing time and money.' });
  }
  if (kind === 'sat') {
    if (!src.apptSat || !src.apptSat.data) return pending('Appointments sat');
    const all = src.apptSat.data.filter((r) => inRange(d(r), win.prevMonthStart, win.monthStart) && M.isSat(r.q));
    const { top } = topNames(all, (r) => r.src);
    const rows = !a ? all : a === OTHER ? all.filter((r) => !top.has(r.src)) : all.filter((r) => r.src === a);
    const mon = MONTHS[Number(win.prevMonthStart.slice(5, 7)) - 1];
    return make(`Appointments sat · ${a === OTHER ? 'other sources' : a || mon}`,
      `Deals with Appointment Date in ${mon} and an Appointment Quality other than "D". Deals with no quality score are left out.`,
      rows, (r) => ({ ...dealRec(r, join(r.src, r.q)) }), [
        { label: 'Quality', rows: countBy(rows, (r) => r.q) },
        ...(a && a !== OTHER ? [] : [{ label: 'By source', rows: countBy(rows, (r) => r.src) }]),
        { label: 'By owner', rows: countBy(rows, (r) => r.owner || null) },
      ], { unit: 'appointments', explain: `How many sales appointments actually took place in ${mon} with a real, qualified prospect, grouped by where the customer first came from. An appointment only counts here once it happened and was rated a good-quality meeting, so this shows which lead sources produce real sales conversations, not just names.` });
  }
  return null;
}

// ---------- Sales Pipeline ----------
function pipeline(id, src, win) {
  const [kind, a, b] = id.split('~');
  const year = win.today.slice(0, 4);
  const curMonth = Number(win.today.slice(5, 7));
  const svcLabel = (r) => (M.isService(r.pipeline) ? 'Service (CFSS)' : 'Standard');
  const wonYtd = () => src.wonDeals.data.filter((r) => r.date && r.date.slice(0, 4) === year && Number(r.date.slice(5, 7)) >= 1 && Number(r.date.slice(5, 7)) <= curMonth);
  const monthName = (r) => MONTHS[Number(r.date.slice(5, 7)) - 1];
  const wonGroups = (rows, months = true) => [
    { label: 'Standard vs service', rows: countBy(rows, svcLabel, true) },
    ...(months ? [{ label: 'By month', rows: countBy(rows, monthName).sort((x, y) => MONTHS.indexOf(x.name) - MONTHS.indexOf(y.name)).map((g) => ({ ...g, amt: rows.filter((r) => monthName(r) === g.name).reduce((s, r) => s + r.amount, 0) })) }] : []),
    { label: 'By owner', rows: countBy(rows, (r) => r.owner || null, true) },
  ];
  const wonRec = (r) => dealRec(r, svcLabel(r));
  const WON_RULE = 'Deals with Stage = Closed Won, by Closing Date. Service = Pipeline contains "CFSS".';
  if (kind === 'newdeals') {
    if (!src.newDeals || !src.newDeals.data) return pending('New deals');
    const all = src.newDeals.data.map((r) => ({ ...r, d: nyDate(r.t) }));
    const prev = a === 'prev';
    const { prevSameEnd } = M.newDealWindow(win);
    const rows = all.filter((r) => r.d && (prev ? r.d >= win.prevMonthStart && r.d <= prevSameEnd : r.d >= win.monthStart && r.d <= win.today));
    const title = prev ? `New deals · ${md(win.prevMonthStart)}–${Number(prevSameEnd.slice(8, 10))}` : `New deals · ${MONTHS[curMonth - 1]} to date`;
    return make(title, 'Deals by Created Time, any stage, open or closed. Service = Pipeline contains "CFSS".', rows, (r) => dealRec(r, join(svcLabel(r), r.stage)), [
      { label: 'Standard vs service', rows: countBy(rows, svcLabel) },
      { label: 'By stage now', rows: countBy(rows, (r) => r.stage || null) },
      { label: 'By owner', rows: countBy(rows, (r) => r.owner || null) },
    ], { unit: 'deals', explain: `A deal is a specific job we are trying to sell to a customer. This is how many new deals were opened ${prev ? 'during the same days last month, for comparison' : 'so far this month'}, whatever has happened to them since. Service deals are repair and maintenance work; standard deals are new installs like solar and batteries.` });
  }
  if (!src.wonDeals.data && kind !== 'open') return pending('Closed won');
  if (kind === 'avg') {
    const svc = a === 'svc';
    const rows = wonYtd().filter((r) => M.isService(r.pipeline) === svc);
    const amt = rows.reduce((s, r) => s + r.amount, 0);
    return make(`Avg deal size · ${svc ? 'service' : 'standard'} · ${year}`, `${WON_RULE} Average = total Amount ÷ number of deals.`, rows, wonRec, wonGroups(rows), { unit: 'deals', money: true, byAmount: true, total: `${money(rows.length ? amt / rows.length : 0)} avg · ${rows.length} deals`, explain: `The typical dollar value of a ${svc ? 'service (repair and maintenance)' : 'standard (new install, like solar or batteries)'} job we sold this year: the total of every sale divided by the number of sales. If it rises we are selling bigger jobs; if it falls, jobs are getting smaller.` });
  }
  if (kind === 'mtd' || kind === 'ytd' || kind === 'month') {
    const m = kind === 'mtd' ? curMonth : kind === 'month' ? Number(a) : null;
    const rows = wonYtd().filter((r) => m == null || Number(r.date.slice(5, 7)) === m);
    const title = kind === 'ytd' ? `Closed won · ${year}` : `Closed won · ${MONTHS[m - 1]}${m === curMonth ? ' to date' : ''}`;
    return make(title, WON_RULE, rows, wonRec, wonGroups(rows, m == null), { unit: 'deals', money: true, byAmount: true, explain: `Sales we have closed: jobs the customer signed and agreed to buy ${kind === 'ytd' ? 'so far this year' : `in ${MONTHS[m - 1]}${m === curMonth ? ' so far' : ''}`}, and their total dollar value. This is the sales revenue the company has booked, before the work is installed. Standard jobs are new installs; service jobs are repair and maintenance.` });
  }
  if (kind === 'open') {
    if (!src.openDeals.data) return pending('Open deals');
    const stage = a || null;
    const layout = b || null;
    const rows = src.openDeals.data.filter((r) => (!stage || r.stage === stage) && (!layout || r.layout === layout));
    const short = (l) => M.LAYOUT_SHORT[l] || l;
    const title = ['Open deals', stage, layout && short(layout)].filter(Boolean).join(' · ');
    const groups = [];
    if (!stage) groups.push({ label: 'By stage', rows: countBy(rows, (r) => r.stage, false).sort((x, y) => M.stageRank(x.name) - M.stageRank(y.name)) });
    if (!layout) groups.push({ label: 'By department (layout)', rows: countBy(rows, (r) => short(r.layout)) });
    groups.push({ label: 'By owner', rows: countBy(rows, (r) => r.owner || null) });
    const age = (r) => { const c = nyDate(r.created); if (!c) return null; const dd = Math.round((new Date(`${win.today}T12:00:00Z`) - new Date(`${c}T12:00:00Z`)) / 864e5); return dd <= 30 ? '0–30 days' : dd <= 90 ? '31–90 days' : dd <= 365 ? '91–365 days' : 'Over a year'; };
    const ages = countBy(rows, age);
    if (ages.length) groups.push({ label: 'Age (since created)', rows: ['0–30 days', '31–90 days', '91–365 days', 'Over a year'].map((n) => ages.find((g) => g.name === n)).filter(Boolean) });
    return make(title, 'Every Deal not Closed Won/Lost/Deferred/Disqualified/Hold or Appointment Cancelled, any age. Department = the deal\'s CRM Layout.', rows,
      (r) => ({ ...dealRec(r, join(r.stage, short(r.layout))), t: r.created }), groups, { unit: 'deals', money: true, byAmount: true, explain: `Deals still being worked on: customers who have not yet said yes or no${stage ? ` and are currently at the \u201c${stage}\u201d step` : ''}${layout ? `, in the ${short(layout)} department` : ''}. Each deal moves through steps from first appointment, to design, to proposal, to negotiation. The dollar figure is what these jobs would be worth if they all closed, so it shows how much potential business is in the works.` });
  }
  return null;
}

// ---------- Operations ----------
// Plain-language meaning of each operations milestone, for someone outside the department.
const OPS_EXPLAIN = {
  design: 'Before anything is built, our designers lay out the system for each home: where the panels go and how it is wired. A finished design is what lets a job move on to permitting.',
  permitApp: 'Every install needs approval from the local government (the county or city) before work starts. This step is our team sending in that application.',
  permitOk: 'A permit is the local government\u2019s approval to do the work. Once it comes back approved we tell the homeowner and the job can be scheduled for install.',
  module: 'Module installs are the crew putting the solar panels up on the roof or a ground mount, the most visible step of an install.',
  electrical: 'Electrical installs are the electricians wiring the system into the home and its electrical panel so it can produce power.',
  ev: 'EV charger installs are electric-vehicle chargers our electricians put in at customers\u2019 homes or businesses.',
};
function ops(id, src, win) {
  const [kind, a] = id.split('~');
  const wkEnd = addDays(win.ws, 7);
  if (kind === 'tile' || kind === 'tile4') {
    const four = kind === 'tile4';
    const from = four ? win.weeks[0] : win.ws;
    if (a === 'projects') {
      if (!src.projects.data) return pending('Projects created');
      const d = (r) => nyDate(r.created);
      const rows = src.projects.data.filter((r) => inRange(d(r), from, wkEnd));
      return make(`Projects created · ${four ? 'last 4 weeks' : 'this week'}`, 'Zoho Projects by created date.', rows, projRec, [
        four ? { label: 'By week', rows: byWeek(rows, win, d) } : { label: 'By day', rows: byDays(rows, win.ws, 7, d) },
        { label: 'By type', rows: countBy(rows, (r) => M.GROUP_LABELS[r.group] || r.group) },
      ], { unit: 'projects', explain: `Once a customer signs, their job becomes a project that the operations team manages from design through installation. This is how many new projects were opened ${four ? 'over the last four weeks' : 'this week'}, which shows how much new work is coming into operations.` });
    }
    const tk = M.TICKET_KINDS.find((t) => t.key === a);
    if (tk) {
      if (!src.tickets || !src.tickets.data) return pending(tk.label);
      const d = (r) => nyDate(r[tk.field]);
      const rows = src.tickets.data.filter((r) => inRange(d(r), from, wkEnd));
      const incoming = tk.key === 'ticketsIn';
      return make(`${tk.label} · ${four ? 'last 4 weeks' : 'this week'}`, `Zoho Desk tickets by ${incoming ? 'created' : 'closed'} date. Spam is left out.${incoming ? ' Counts every new ticket, whatever its status now.' : ''}`, rows, ticketRec(tk.field), [
        four ? { label: 'By week', rows: byWeek(rows, win, d) } : { label: 'By day', rows: byDays(rows, win.ws, 7, d) },
        { label: 'Assigned to', rows: countBy(rows, (r) => r.owner || 'Unassigned') },
        { label: 'Came in by', rows: countBy(rows, (r) => r.channel || 'Unknown') },
      ], { unit: 'tickets', explain: incoming
        ? `When a customer with a system we installed or service has a problem or question (a system not producing, a monitoring app offline, a roof leak, a warranty question), the service team opens a ticket in Zoho Desk. This is how many new tickets came in ${four ? 'over the last four weeks' : 'this week'}, which shows how much service work is arriving.`
        : `A ticket is closed when the service team has resolved the customer’s issue. This is how many tickets were closed ${four ? 'over the last four weeks' : 'this week'}. Compared with incoming tickets, it shows whether the service team is keeping up.` });
    }
    const k = M.TASK_KINDS.find((t) => t.key === a);
    if (!k) return null;
    if (!src[k.src].data) return pending(k.label);
    const d = (r) => nyDate(r.completed);
    const rows = src[k.src].data.filter((t) => k.test(t.name)).filter((t) => inRange(d(t), from, wkEnd));
    const rule = {
      design: 'name contains "design"', permitApp: 'name starts with "Permit Application"', permitOk: 'name starts with "Notify HO of Permit Approval"',
      module: 'name starts with "Module Install"', electrical: 'name starts with "Electrical Install"', ev: 'name starts with "EV Charger Install"',
    }[k.key];
    return make(`${k.label} · ${four ? 'last 4 weeks' : 'this week'}`, `Closed Zoho Projects tasks whose ${rule}, by completed date. Counts tasks, not projects.`, rows, taskRec, [
      four ? { label: 'By week', rows: byWeek(rows, win, d) } : { label: 'By day', rows: byDays(rows, win.ws, 7, d) },
      { label: 'Task name', rows: countBy(rows, (t) => t.name) },
    ], { unit: 'tasks', explain: `${OPS_EXPLAIN[k.key]} This is how many were finished ${four ? 'over the last four weeks' : 'this week'}.` });
  }
  if (kind === 'group') {
    if (!src.projects.data) return pending('New projects by type');
    const d = (r) => nyDate(r.created);
    const lbl = (r) => M.GROUP_LABELS[r.group] || r.group;
    const rows = src.projects.data.filter((r) => inRange(d(r), win.weeks[0], wkEnd)).filter((r) => !a || lbl(r) === a);
    return make(a ? `New projects · ${a}` : 'New projects · last 4 weeks', 'Zoho Projects created in the last 4 weeks, by project group.', rows, projRec, [
      { label: 'By week', rows: byWeek(rows, win, d) },
      ...(a ? [] : [{ label: 'By type', rows: countBy(rows, lbl) }]),
    ], { unit: 'projects', explain: `New projects opened in the last four weeks${a ? ` of the \u201c${a}\u201d type` : ''}, grouped by kind of job, such as a solar install, an EV charger or adding panels to an existing system. It shows the mix of work heading to the install crews.` });
  }
  return null;
}

// id looks like "left:leads", "middle:open~Negotiation~Service Deal", "right:tile~design".
function buildDrill(fullId, sources, win) {
  const i = fullId.indexOf(':');
  if (i < 0) return null;
  const board = fullId.slice(0, i), id = fullId.slice(i + 1);
  try {
    if (board === 'left') return sales(id, sources, win);
    if (board === 'middle') return pipeline(id, sources, win);
    if (board === 'right') return ops(id, sources, win);
  } catch (e) {
    console.error('[drill]', fullId, e.message);
  }
  return null;
}

module.exports = { buildDrill, OTHER, sortKey };
