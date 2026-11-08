'use strict';
// Turns raw Zoho rows into the numbers each board shows. All dates are America/New_York.

const TZ = 'America/New_York';
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

function nyDate(v) {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : ymd.format(d);
}
function addDays(ds, n) {
  const d = new Date(`${ds}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dow(ds) { return new Date(`${ds}T12:00:00Z`).getUTCDay(); } // 0 = Sunday
function mondayOf(ds) { return addDays(ds, -((dow(ds) + 6) % 7)); }
function inRange(ds, from, toExcl) { return ds && ds >= from && ds < toExcl; }

function windowFor(now = new Date()) {
  const today = nyDate(now.toISOString());
  const ws = mondayOf(today);
  const weeks = [addDays(ws, -21), addDays(ws, -14), addDays(ws, -7), ws];
  const monthStart = `${today.slice(0, 8)}01`;
  const prevMonthStart = `${addDays(monthStart, -1).slice(0, 8)}01`;
  return {
    monthStart,
    prevMonthStart,
    today,
    ws,
    weeks,
    nextWs: addDays(ws, 7),
    fetchFrom: addDays(ws, -22),
    fetchTo: addDays(ws, 13),
    yearStart: `${today.slice(0, 4)}-01-01`,
  };
}

function weekIndex(ds, weeks) {
  for (let i = 0; i < weeks.length; i++) if (inRange(ds, weeks[i], addDays(weeks[i], 7))) return i;
  return -1;
}
function perWeek(dates, weeks) {
  const out = weeks.map(() => 0);
  for (const d of dates) { const i = weekIndex(d, weeks); if (i >= 0) out[i]++; }
  return out;
}

// ---------- Sales ----------
function sales(src, win) {
  if (!src.leads.data || !src.calls.data || !src.meetings.data) return null;
  const leadDates = src.leads.data.map((r) => ({ d: nyDate(r.t), src: r.src }));
  const calls = src.calls.data.map((r) => ({ d: nyDate(r.t), out: /out/i.test(r.type) }));
  const mtgDates = src.meetings.data.map((r) => nyDate(r.t));

  const leadsWk = perWeek(leadDates.map((x) => x.d), win.weeks);
  const callsWk = perWeek(calls.map((x) => x.d), win.weeks);
  const mtgWk = perWeek(mtgDates, win.weeks);

  const callDays = [0, 1, 2, 3, 4].map((i) => {
    const day = addDays(win.ws, i);
    const c = calls.filter((x) => x.d === day);
    return { day, out: c.filter((x) => x.out).length, inb: c.filter((x) => !x.out).length };
  });
  const thisWeekCalls = calls.filter((x) => weekIndex(x.d, [win.ws]) === 0);
  const nextDays = [0, 1, 2, 3, 4].map((i) => {
    const day = addDays(win.nextWs, i);
    return { day, n: mtgDates.filter((d) => d === day).length };
  });

  const counts = new Map();
  for (const l of leadDates) {
    if (!inRange(l.d, win.weeks[0], addDays(win.ws, 7))) continue;
    counts.set(l.src, (counts.get(l.src) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 8).map(([name, n]) => ({ name, n }));
  const rest = sorted.slice(8);
  const other = rest.length ? { name: `Other (${rest.length} source${rest.length > 1 ? 's' : ''})`, n: rest.reduce((s, x) => s + x[1], 0), other: true } : null;

  return {
    leadsWk, callsWk, mtgWk,
    callsOut: thisWeekCalls.filter((x) => x.out).length,
    callsIn: thisWeekCalls.filter((x) => !x.out).length,
    callDays, nextDays,
    nextTotal: nextDays.reduce((s, x) => s + x.n, 0),
    sources: other ? [...top, other] : top,
    sourcesTotal: sorted.reduce((s, x) => s + x[1], 0),
  };
}

// ---------- Pipeline ----------
const STAGE_ORDER = [
  'Pre-Appointment', 'Pending Reschedule', 'Post Appointment Questionnaire Completed', 'Survey Review', 'Design Pending',
  'Proposal Review-20', 'Proposal Review-40', 'Proposal Review-60', 'Proposal Review-80', 'Negotiation',
  'Send to Energy Saver', 'Change Order', 'Nurture',
];
const LAYOUT_SHORT = {
  'CFSS Standard Deal': 'Standard',
  'Service Deal': 'Service',
  'Energy Services': 'Energy',
  'EV Charging Deal': 'EV',
};
const LATE = new Set(['Proposal Review-60', 'Proposal Review-80', 'Negotiation']);
const EARLY = new Set(['Proposal Review-20', 'Proposal Review-40']);

// New deals this month vs the same days of last month (by created date).
function newDeals(src, win) {
  if (!src.newDeals || !src.newDeals.data) return null;
  const rows = src.newDeals.data.map((d) => ({ d: nyDate(d.t), svc: /cfss/i.test(d.pipeline) }));
  const day = Number(win.today.slice(8, 10));
  const prevEnd = addDays(win.monthStart, -1);
  const prevSameEnd = addDays(win.prevMonthStart, day - 1) > prevEnd ? prevEnd : addDays(win.prevMonthStart, day - 1);
  const cur = rows.filter((r) => r.d && r.d >= win.monthStart && r.d <= win.today);
  const prevSame = rows.filter((r) => r.d && r.d >= win.prevMonthStart && r.d <= prevSameEnd).length;
  const prevTotal = rows.filter((r) => r.d && r.d >= win.prevMonthStart && r.d <= prevEnd).length;
  return { n: cur.length, std: cur.filter((r) => !r.svc).length, svc: cur.filter((r) => r.svc).length, prevSame, prevTotal, day };
}

function pipeline(src, win) {
  if (!src.openDeals.data || !src.wonDeals.data) return null;
  const byStage = new Map();
  for (const d of src.openDeals.data) {
    const s = byStage.get(d.stage) || { stage: d.stage, n: 0, amt: 0 };
    s.n++; s.amt += d.amount;
    byStage.set(d.stage, s);
  }
  const stages = [...byStage.values()].sort((a, b) => {
    const ia = STAGE_ORDER.indexOf(a.stage), ib = STAGE_ORDER.indexOf(b.stage);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.stage.localeCompare(b.stage);
  }).map((s) => ({ ...s, kind: LATE.has(s.stage) ? 'late' : EARLY.has(s.stage) ? 'early' : s.stage === 'Nurture' ? 'nurture' : 'other' }));

  // Open deals by stage x layout (CRM layouts = departments), departments ordered by size.
  const layoutN = new Map();
  const cell = new Map();
  for (const d of src.openDeals.data) {
    const l = d.layout || 'No layout';
    layoutN.set(l, (layoutN.get(l) || 0) + 1);
    const k = `${d.stage}\u0000${l}`;
    cell.set(k, (cell.get(k) || 0) + 1);
  }
  const layouts = [...layoutN.entries()].sort((a, b) => b[1] - a[1])
    .map(([name, n]) => ({ name, short: LAYOUT_SHORT[name] || name, n }));
  const matrix = stages.map((s) => ({
    stage: s.stage,
    total: s.n,
    cells: layouts.map((l) => cell.get(`${s.stage}\u0000${l.name}`) || 0),
  }));
  const cellMax = Math.max(1, ...matrix.flatMap((r) => r.cells));

  const year = win.today.slice(0, 4);
  const curMonth = Number(win.today.slice(5, 7));
  const months = Array.from({ length: curMonth }, (_, i) => ({ m: i + 1, std: 0, svc: 0, nStd: 0, nSvc: 0 }));
  for (const d of src.wonDeals.data) {
    if (!d.date || d.date.slice(0, 4) !== year) continue;
    const m = Number(d.date.slice(5, 7));
    if (m < 1 || m > curMonth) continue;
    const row = months[m - 1];
    if (/cfss/i.test(d.pipeline)) { row.svc += d.amount; row.nSvc++; } else { row.std += d.amount; row.nStd++; }
  }
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const cur = months[curMonth - 1];
  const prev = curMonth > 1 ? months[curMonth - 2] : null;
  const late = stages.filter((s) => s.kind === 'late');
  return {
    stages,
    layouts, matrix, cellMax,
    openAmt: sum(stages, (s) => s.amt), openN: sum(stages, (s) => s.n),
    lateAmt: sum(late, (s) => s.amt), lateN: sum(late, (s) => s.n),
    months,
    mtdAmt: cur.std + cur.svc, mtdN: cur.nStd + cur.nSvc, mtdStdN: cur.nStd, mtdSvcN: cur.nSvc,
    prevAmt: prev ? prev.std + prev.svc : null,
    ytdAmt: sum(months, (m) => m.std + m.svc), ytdN: sum(months, (m) => m.nStd + m.nSvc),
    ytdStdAmt: sum(months, (m) => m.std), ytdStdN: sum(months, (m) => m.nStd),
    ytdSvcAmt: sum(months, (m) => m.svc), ytdSvcN: sum(months, (m) => m.nSvc),
    newDeals: newDeals(src, win),
  };
}

// ---------- Operations ----------
const TASK_KINDS = [
  { key: 'design', label: 'Designs complete', src: 'tasksDesign', test: (n) => /design/i.test(n) },
  { key: 'permitApp', label: 'Permit apps submitted', src: 'tasksPermit', test: (n) => /^permit application/i.test(n) },
  { key: 'permitOk', label: 'Permits approved', src: 'tasksPermit', test: (n) => /^notify ho of permit approval/i.test(n) },
  { key: 'module', label: 'Module installs', src: 'tasksInstall', test: (n) => /^module install/i.test(n) },
  { key: 'electrical', label: 'Electrical installs', src: 'tasksInstall', test: (n) => /^electrical install/i.test(n) },
  { key: 'ev', label: 'EV chargers installed', src: 'tasksInstall', test: (n) => /^ev charger install/i.test(n) },
];
const GROUP_LABELS = { EV: 'EV charger', 'Non PV Install': 'Non-PV install', Addition: 'PV addition', 'Commercial Installation': 'Commercial', 'Ungrouped Projects': 'Ungrouped' };

function ops(src, win) {
  const tiles = [];
  let projects = null;
  if (src.projects.data) {
    const rows = src.projects.data.map((p) => ({ d: nyDate(p.created), g: GROUP_LABELS[p.group] || p.group }));
    const wk = perWeek(rows.map((r) => r.d), win.weeks);
    tiles.push({ key: 'projects', label: 'Projects created', wk, group: 'pre' });
    const cumul = (start) => {
      let c = 0;
      return [0, 1, 2, 3, 4, 5, 6].map((i) => { const day = addDays(start, i); c += rows.filter((r) => r.d === day).length; return c; });
    };
    const groups = new Map();
    for (const r of rows) {
      if (!inRange(r.d, win.weeks[0], addDays(win.ws, 7))) continue;
      const g = groups.get(r.g) || { name: r.g, n: 0, now: 0 };
      g.n++; if (weekIndex(r.d, [win.ws]) === 0) g.now++;
      groups.set(r.g, g);
    }
    projects = {
      thisCum: cumul(win.ws), lastCum: cumul(win.weeks[2]),
      todayIdx: Math.min(6, Math.round((new Date(`${win.today}T12:00:00Z`) - new Date(`${win.ws}T12:00:00Z`)) / 864e5)),
      groups: [...groups.values()].sort((a, b) => b.n - a.n),
      total4: wk.reduce((s, x) => s + x, 0),
    };
  } else {
    tiles.push({ key: 'projects', label: 'Projects created', wk: null, group: 'pre' });
  }
  for (const k of TASK_KINDS) {
    const data = src[k.src].data;
    const wk = data ? perWeek(data.filter((t) => k.test(t.name)).map((t) => nyDate(t.completed)), win.weeks) : null;
    tiles.push({ key: k.key, label: k.label, wk, group: ['module', 'electrical', 'ev'].includes(k.key) ? 'install' : 'pre' });
  }
  return { tiles, projects };
}

function computeAll(sources, now = new Date()) {
  const win = windowFor(now);
  return { win, sales: sales(sources, win), pipeline: pipeline(sources, win), ops: ops(sources, win) };
}

module.exports = { computeAll, windowFor, addDays, nyDate };
