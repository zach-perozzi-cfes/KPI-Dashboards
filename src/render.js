'use strict';
// Server-side HTML for the three 1920x1080 monitor boards (CFES brand: green #71a62b, yellow #ffdb05,
// orange #f49c20 on near-black, with a green-to-orange gradient accent; Inter).

const { addDays } = require('./metrics');
const { maxGapHours } = require('./schedule');
const { MONTHS, DAYS, esc, sum, md, dnum, weekLabel, money, delta, avg, fmtAvg, dayTimeFmt } = require('./format');
const flare = require('./flare');

const BOARDS = {
  left: { title: 'Inside Sales', sources: ['leads', 'calls', 'meetings', 'apptSat'], system: 'Zoho CRM' },
  middle: { title: 'Sales Pipeline', sources: ['openDeals', 'wonDeals', 'newDeals'], system: 'Zoho CRM Deals' },
  right: { title: 'Operations', sources: ['projects', 'tasksDesign', 'tasksPermit', 'tasksInstall', 'tickets'], system: 'Zoho Projects + Desk' },
};

// How current a board's data is (shared with the phone view). fetched = the oldest last pull of
// its sources; stale = older than the longest gap between scheduled pulls plus an hour.
function boardFreshness(board, sources) {
  const b = BOARDS[board];
  const fetched = b.sources.map((k) => sources[k] && sources[k].fetchedAt).filter(Boolean).sort()[0];
  const failing = b.sources.filter((k) => sources[k] && sources[k].error);
  const stale = fetched && Date.now() - new Date(fetched).getTime() > (maxGapHours() + 1) * 3600 * 1000;
  return { fetched, failing, stale };
}

// Inter for text; Verdana if Google Fonts can't load.
const FONTS = '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">';

const CSS = `
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:#101010;overflow:hidden}
body{font-family:Inter,Verdana,sans-serif;color:#fff;-webkit-font-smoothing:antialiased}
/* Plain near-black, with the green-to-orange strip across the top. */
#stage{width:1920px;height:1080px;transform-origin:0 0;position:absolute;left:0;top:0;display:flex;flex-direction:column;
  background:#141414}
#stage::before{content:'';position:absolute;left:0;right:0;top:0;height:4px;background:linear-gradient(90deg,#71a62b,#ffdb05 65%,#f49c20)}
header{height:88px;padding:10px 40px 0;display:flex;align-items:center;gap:32px;flex-shrink:0}
.ht{flex-grow:1;display:flex;flex-direction:column;gap:6px;min-width:0}
h1{margin:0;font-size:52px;font-weight:800;letter-spacing:-.02em;line-height:1.05}
.hr{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
main{flex-grow:1;padding:12px 40px 32px;display:flex;flex-direction:column;gap:24px;min-height:0}
/* Cards: dark gradient, hairline border, green-to-orange top edge. */
.card{position:relative;background:linear-gradient(180deg,#222222,#1a1a1a);border:1px solid #2f2f2f;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
.card::before{content:'';position:absolute;inset:-1px;border-radius:inherit;border-top:2px solid transparent;background:linear-gradient(90deg,#71a62b,#f49c20) border-box;-webkit-mask:linear-gradient(#000 0 0) padding-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;opacity:.9;pointer-events:none}
.lbl{font-size:18px;color:#eaeaea;margin:0;font-weight:700}
h2.lbl{font-size:21px;letter-spacing:-.01em}
.sub{font-size:15px;color:#a1a1a1;margin:0}
.up{color:#71a62b;font-weight:700}.dn{color:#f49c20;font-weight:700}.flat{color:#a1a1a1;font-weight:700}
.warn{color:#f49c20;font-weight:700}
/* Top row on Inside Sales and Pipeline: label + 213px cards, the same as Operations' first
   row, so the card edges line up across neighbouring monitors. */
.sec{display:flex;flex-direction:column;gap:10px;flex-shrink:0}
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px;height:213px;flex-shrink:0}
.kpi{padding:24px 28px;display:flex;flex-direction:column;justify-content:space-between}
.big{font-size:84px;line-height:1;font-weight:800;letter-spacing:-.03em;margin:0}
.green{background:linear-gradient(160deg,rgba(113,166,43,.34),rgba(113,166,43,.06) 70%),#1a1a1a;border-color:rgba(113,166,43,.55)}
.green::before{background:#71a62b border-box;opacity:1}
.green .big{color:#8cc63f}
.gold{background:linear-gradient(160deg,rgba(255,219,5,.26),rgba(244,156,32,.06) 70%),#1a1a1a;border-color:rgba(244,156,32,.55)}
.gold::before{background:linear-gradient(90deg,#ffdb05,#f49c20) border-box;opacity:1}
.gold .big{color:#ffdb05}
.panel{padding:24px 28px;display:flex;flex-direction:column;gap:14px;min-height:0}
.ph{display:flex;align-items:center;gap:24px}
.ph h2{flex-grow:1}
.key{display:flex;align-items:center;gap:8px;font-size:15px;color:#eaeaea}
.sw{width:14px;height:14px;border-radius:3px;display:inline-block}
.mx{position:relative;z-index:0;display:grid;grid-template-columns:minmax(0,1fr) repeat(5,92px) 72px;gap:6px 8px;align-items:center}
.mx .today{position:absolute;z-index:-1;grid-row:1 / -1;inset:-5px -5px;border:2px solid #ffdb05;border-radius:9px;background:rgba(255,219,5,0.07)}
.mh{text-align:center;font-size:15px;color:#eaeaea;font-weight:700;white-space:nowrap;padding:3px 0}
.mr{color:#eaeaea;font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc{display:flex;align-items:center;justify-content:center;border-radius:6px;font-weight:700;font-size:18px}
.mt{text-align:center;font-weight:700;font-size:18px;white-space:nowrap}
.g{background:#71a62b}.y{background:#ffdb05}.o{background:#f49c20}.l{background:#eaeaea}
.vg{background:linear-gradient(180deg,#71a62b,#5a881c)}
.vo{background:linear-gradient(180deg,#ffdb05,#f49c20)}
.cols{flex-grow:1;display:grid;gap:40px;align-items:end;border-bottom:1px solid #333333;padding:0 24px}
.col{display:flex;flex-direction:column;justify-content:flex-end}
.num{font-size:18px;font-weight:700;text-align:center;margin:0 0 6px}
.xl{display:grid;gap:40px;padding:0 24px}
.xl p{margin:0;font-size:15px;color:#a1a1a1;text-align:center}
.hb{display:grid;align-items:center;font-size:16px}
.hb .bar{height:18px;border-radius:3px}
.r{text-align:right;font-weight:700}
table{width:100%;border-collapse:collapse;font-size:18px}
th,td{padding:12px 0;text-align:right}
th:first-child{text-align:left;font-weight:400;color:#eaeaea}
thead th{color:#a1a1a1;font-size:15px;font-weight:400;padding-top:0}
tbody tr{border-top:1px solid #333333}
tr.now{color:#ffdb05;font-weight:700}tr.now th{color:#ffdb05;font-weight:700}
.empty{flex-grow:1;display:flex;align-items:center;justify-content:center;color:#a1a1a1;font-size:22px;text-align:center;padding:24px}
.tiles{display:flex;flex-direction:column;gap:16px;flex:1 1 0;min-height:0}
.trow{display:grid;grid-template-rows:auto minmax(0,1fr);gap:10px 20px;flex:1 1 0;min-height:0}
.grp{font-size:15px;letter-spacing:.22em;text-transform:uppercase;color:#a1a1a1;margin:0;font-weight:600;padding-bottom:2px;display:flex;align-items:center;gap:12px}
.grp i{width:8px;height:8px;border-radius:50%;display:inline-block}
.tile{padding:16px 22px;display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);gap:6px 24px;min-height:0}
.tile .lbl{grid-column:1 / -1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tile .tl{display:flex;flex-direction:column;justify-content:flex-end;gap:8px}
.tile .tr{display:flex;flex-direction:column;gap:5px;min-height:0}
.tile .big{font-size:80px}
.flow{padding:16px 22px;display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);gap:6px 24px;min-height:0}
.flow .lbl{grid-column:1 / -1}
.fl{display:grid;grid-template-columns:auto auto;align-content:center;align-items:center;gap:10px 14px}
.fm{display:contents}
.fl>.sub{grid-column:1 / -1}
.fm .n{font-size:52px;font-weight:700;line-height:1;min-width:1.3em;text-align:center;font-variant-numeric:tabular-nums}
.fm .t{display:flex;flex-direction:column;gap:3px;font-size:14px;color:#a1a1a1;white-space:nowrap}
.fm .t b{font-size:16px}
.fc{min-height:0;position:relative}
.fc svg{position:absolute;inset:0;width:100%;height:100%}
.spark{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:minmax(0,1fr);gap:6px;align-items:end;height:48px;border-bottom:1px solid #333333}
.tile .spark{height:auto;flex:1 1 0;min-height:36px}
.spark div{border-radius:3px 3px 0 0}
.pw{background:#474747}
.wkn{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;font-size:12px;color:#a1a1a1;text-align:center}
.wkn span:last-child{color:#fff;font-weight:700}
/* Tucked inside the bottom-right card's corner, well clear of the screen edge (TVs can crop
   the outer pixels). That card gets extra right padding so nothing sits under the code. */
.qr{position:absolute;right:52px;bottom:44px;line-height:0;padding:8px;border:2px solid #71a62b;border-radius:6px;background:#1a1a1a}
.qr svg{display:block}
.qr::before{content:'SCAN';position:absolute;left:-10px;right:-10px;bottom:100%;margin-bottom:5px;text-align:center;font-size:11px;line-height:1;font-weight:700;letter-spacing:.22em;text-indent:.22em;color:#71a62b}
.hasqr>section:last-child>.card:last-child{padding-right:96px}
`;

function header(board, sources) {
  const { fetched, failing, stale } = boardFreshness(board, sources);
  // Shown only when something is wrong; normally the header is just the board name.
  const status = !fetched ? 'waiting for first sync'
    : (failing.length || stale) ? `<span class="warn">refresh delayed</span> · updated ${dayTimeFmt.format(new Date(fetched))}` : '';
  return `<header><div class="ht"><h1>${esc(BOARDS[board].title)}</h1></div>
${status ? `<div class="hr"><p class="sub">${status}</p></div>` : ''}</header>`;
}

// Today's phone sign-in code for this screen, tiny in the bottom-right corner (see src/session.js).
// Changes at midnight; the page's poll picks it up.
function qrBlock(svg) {
  return svg ? `<div class="qr">${svg}</div>` : '';
}

function waiting(msg = 'Waiting for Zoho data…') { return `<div class="card empty">${esc(msg)}</div>`; }

// ---------------- LEFT: Inside Sales ----------------
function salesBoard(s, win) {
  if (!s) return waiting();
  const [, , l2, l3] = s.leadsWk; const [, , c2, c3] = s.callsWk; const [, , m2, m3] = s.mtgWk;
  const kpis = `<div class="sec"><p class="grp"><i style="background:#71a62b"></i>This week</p><section class="kpis">
<div class="card kpi"><p class="lbl">Leads created</p><p class="big">${l3}</p><p class="sub">${delta(l3, l2)} · 4-wk avg ${fmtAvg(avg(s.leadsWk))}</p></div>
<div class="card kpi"><p class="lbl">Calls logged</p><p class="big">${c3}</p><p class="sub">${delta(c3, c2)} · ${s.callsOut} out / ${s.callsIn} in</p></div>
<div class="card kpi"><p class="lbl">Meetings this week</p><p class="big">${m3}</p><p class="sub">${delta(m3, m2)} · 4-wk avg ${fmtAvg(avg(s.mtgWk))}</p></div>
<div class="card kpi green"><p class="lbl">Meetings booked · next week</p><p class="big">${s.nextTotal}</p><p class="sub">On the calendar for ${esc(weekLabel(win.nextWs).replace(/, \d{4}$/, ''))}</p></div>
</section></div>`;

  // Tallest bar + its number label must fit the 340px chart row (header, gaps, day labels): ~170px.
  const plotH = 170;
  const cMax = Math.max(1, ...s.callDays.map((d) => d.out + d.inb));
  const callCols = s.callDays.map((d) => {
    const ho = Math.round((d.out / cMax) * plotH), hi = Math.round((d.inb / cMax) * plotH);
    return `<div class="col"><p class="num">${d.out + d.inb}</p>${hi ? `<div class="y" style="height:${hi}px;border-radius:4px 4px 0 0"></div>` : ''}${ho ? `<div class="vg" style="height:${ho}px;${hi ? '' : 'border-radius:4px 4px 0 0'}"></div>` : ''}</div>`;
  }).join('');
  // This week's meetings as a rep x day grid, cells shaded by count. A yellow band marks
  // today and days already past are faded. Up to six rows; past that, the reps with the
  // fewest meetings fold into "Other".
  const g = s.mtgGrid;
  const MAX_REPS = 6;
  let reps = g.reps.map((r, i) => ({ ...r, idx: [i] }));
  if (reps.length > MAX_REPS) {
    const rest = reps.slice(MAX_REPS - 1);
    reps = [...reps.slice(0, MAX_REPS - 1), { name: `Other (${rest.length})`, n: sum(rest.map((r) => r.n)), idx: rest.flatMap((r) => r.idx), other: true }];
  }
  const repCells = reps.map((r) => g.days.map((d) => sum(r.idx.map((i) => d.byRep[i] || 0))));
  const cMaxM = Math.max(1, ...repCells.flat());
  const dMax = Math.max(1, ...g.days.map((d) => d.n));
  const past = (i) => g.todayIdx >= 0 && i < g.todayIdx;
  const isToday = (i) => i === g.todayIdx;
  const isLight = (d, i) => !past(i) && dMax >= 4 && d.n < dMax / 2;
  const fade = (i) => (past(i) ? ';opacity:.3' : '');
  const cellH = reps.length > 5 ? 28 : 32;
  const mHead = `<span></span>${g.days.map((d, i) => `<span class="mh"${isToday(i) ? ' style="background:#ffdb05;color:#1d1d1d;border-radius:4px"' : past(i) ? ' style="color:#474747"' : ''}>${DAYS[i]} ${dnum(d.day)}</span>`).join('')}<span class="mh" style="color:#a1a1a1">Total</span>`;
  const mBody = reps.map((r, ri) => `<span class="mr"${r.other ? ' style="color:#a1a1a1"' : ''}>${esc(r.name)}</span>${repCells[ri].map((v, i) => (v
    ? `<span class="mc" style="height:${cellH}px;background:rgba(113,166,43,${(0.18 + 0.72 * (v / cMaxM)).toFixed(2)})${fade(i)}">${v}</span>`
    : `<span class="mc" style="height:${cellH}px;color:#474747;font-weight:400${fade(i)}">·</span>`)).join('')}<span class="mt">${r.n}</span>`).join('');
  const mFoot = `<span class="mr" style="color:#a1a1a1">Per day</span>${g.days.map((d, i) => `<span class="mt"${isLight(d, i) ? ' style="color:#f49c20"' : past(i) ? ' style="color:#474747"' : ''}>${d.n}${isLight(d, i) ? ' · light' : ''}</span>`).join('')}<span class="mt">${g.total}</span>`;
  const band = g.todayIdx >= 0 ? `<div class="today" style="grid-column:${g.todayIdx + 2} / span 1"></div>` : '';
  const mtgGrid = reps.length
    ? `<div class="mx" style="grid-template-rows:repeat(${reps.length + 2},auto)">${mHead}${mBody}${mFoot}${band}</div>`
    : `<div class="empty" style="font-size:18px">No meetings booked for ${g.upcoming ? 'next' : 'this'} week yet</div>`;
  const mtgTitle = g.upcoming ? 'Meetings next week · by rep' : 'Meetings this week · by rep';
  const mtgSub = g.upcoming ? `${g.total} booked · week of ${md(g.ws)}` : `${g.total} total · ${g.ahead} still ahead`;
  const dayLbl = (arr) => arr.map((d, i) => `<p>${DAYS[i]} ${dnum(d.day)}</p>`).join('');

  const charts = `<section style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;height:340px;flex-shrink:0">
<div class="card panel"><div class="ph"><h2 class="lbl">Calls per day, this week</h2><span class="key"><span class="sw g"></span>Outbound</span><span class="key"><span class="sw y"></span>Inbound</span></div>
<div class="cols" style="grid-template-columns:repeat(5,minmax(0,1fr))">${callCols}</div><div class="xl" style="grid-template-columns:repeat(5,minmax(0,1fr))">${dayLbl(s.callDays)}</div></div>
<div class="card panel"><div class="ph"><h2 class="lbl">${mtgTitle}</h2><span class="sub">${esc(mtgSub)}</span></div>
${mtgGrid}</div>
</section>`;

  // Name, bar, count; the "Other" row is greyed.
  const barRows = (rows) => {
    const mx = Math.max(1, ...rows.map((x) => x.n));
    return rows.map((x) => `<span style="color:${x.other ? '#a1a1a1' : '#eaeaea'}">${esc(x.name)}</span><div class="bar ${x.other ? 'l' : 'g'}" style="width:${Math.max(1, (x.n / mx) * 100).toFixed(1)}%"></div><span class="r">${x.n}</span>`).join('');
  };
  const srcRows = barRows(s.sources);
  const prevMon = MONTHS[Number(win.prevMonthStart.slice(5, 7)) - 1];
  const sat = s.apptSat;
  const satRows = sat ? barRows(sat.rows) : '';
  const satBody = !sat ? '<span class="sub">waiting for Zoho</span>' : satRows || `<span class="sub">No appointments sat in ${prevMon}</span>`;
  const bottom = `<section style="display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:24px;flex-grow:1;min-height:0">
<div class="card panel" style="gap:10px"><div class="ph"><h2 class="lbl">Lead sources · last 4 weeks</h2><span class="sub">${s.sourcesTotal} leads since ${md(win.weeks[0])}</span></div>
<div class="hb" style="grid-template-columns:240px minmax(0,1fr) 48px;gap:7px 16px">${srcRows || '<span class="sub">No leads yet</span>'}</div></div>
<div class="card panel" style="gap:10px"><div class="ph"><h2 class="lbl">Appointments sat by source · ${prevMon}</h2><span class="sub">${sat ? `${sat.total} sat` : ''}</span></div>
<div class="hb" style="grid-template-columns:220px minmax(0,1fr) 48px;gap:7px 16px">${satBody}</div></div>
</section>`;
  return kpis + charts + bottom;
}

// ---------------- MIDDLE: Sales Pipeline ----------------
function pipelineBoard(p, win) {
  if (!p) return waiting();
  const curM = p.months.length;
  const nd = p.newDeals;
  const prevMonth = MONTHS[Number(win.prevMonthStart.slice(5, 7)) - 1];
  const newTile = nd
    ? `<div class="card kpi"><p class="lbl">New deals · ${MONTHS[curM - 1]} to date</p><p class="big">${nd.n}</p><p class="sub">${delta(nd.n, nd.prevSame, `vs ${prevMonth} 1–${nd.day}`)} · ${nd.std} standard, ${nd.svc} service</p></div>`
    : `<div class="card kpi"><p class="lbl">New deals · ${MONTHS[curM - 1]} to date</p><p class="big">–</p><p class="sub">waiting for Zoho</p></div>`;
  const kpis = `<div class="sec"><p class="grp"><i style="background:#71a62b"></i>Month &amp; year to date</p><section class="kpis">
${newTile}
<div class="card kpi gold"><p class="lbl">Avg deal size · ${win.today.slice(0, 4)}</p><p class="big" style="font-size:76px">${money(p.avgStd)}</p><p class="sub">Standard pipeline, ${p.ytdStdN} won · service avg ${money(p.avgSvc)}</p></div>
<div class="card kpi"><p class="lbl">Closed won · ${MONTHS[curM - 1]} to date</p><p class="big" style="font-size:76px">${money(p.mtdAmt)}</p><p class="sub">${p.mtdN} deals · ${p.mtdStdN} standard, ${p.mtdSvcN} service</p></div>
<div class="card kpi green"><p class="lbl">Closed won · ${win.today.slice(0, 4)}</p><p class="big" style="font-size:76px">${money(p.ytdAmt)}</p><p class="sub">${p.ytdN} deals${p.prevAmt != null ? ` · ${MONTHS[curM - 2]} was ${money(p.prevAmt)}` : ''}</p></div>
</section></div>`;

  const plotH = 340;
  const maxTot = Math.max(1, ...p.months.map((m) => m.std + m.svc));
  const scaleMax = maxTot * 1.12;
  const step = [50e3, 100e3, 250e3, 500e3, 1e6, 2e6, 5e6].find((s) => scaleMax / s <= 4) || 1e7;
  let grid = '';
  for (let v = step; v < scaleMax; v += step) {
    const y = Math.round((v / scaleMax) * plotH);
    grid += `<div aria-hidden="true" style="position:absolute;left:0;right:0;bottom:${y}px;border-top:1px dashed #333333"></div><span aria-hidden="true" style="position:absolute;left:0;bottom:${y + 6}px;font-size:13px;color:#a1a1a1">${money(v).replace('.00M', 'M')}</span>`;
  }
  const n = curM;
  // Columns sit edge to edge (spacing comes from padding), so month i's center is at (i + 0.5) / n.
  const colPad = n > 9 ? 9 : 14;
  const cols = p.months.map((m, i) => {
    const hs = Math.round((m.std / scaleMax) * plotH), hv = Math.round((m.svc / scaleMax) * plotH);
    const mtd = i === curM - 1;
    return `<div class="col" style="padding:0 ${colPad}px"><p class="num" style="font-size:14px;position:relative;z-index:1;text-shadow:0 0 4px #1d1d1d,0 0 4px #1d1d1d${mtd ? ';color:#ffdb05' : ''}">${money(m.std + m.svc)}</p>${hv ? `<div class="y" style="height:${hv}px;border-radius:4px 4px 0 0"></div>` : ''}${hs ? `<div class="vg" style="height:${hs}px;${hv ? '' : 'border-radius:4px 4px 0 0'}"></div>` : ''}</div>`;
  }).join('');

  // Linear trend over completed months only (metrics.js monthTrend).
  let trendSvg = '';
  let trendKey = '';
  if (p.trend) {
    const { months: k, slope, at } = p.trend;
    const y = (v) => Math.max(0, Math.min(plotH, plotH - (v / scaleMax) * plotH)).toFixed(1);
    const x = (i) => (((i + 0.5) / n) * 1000).toFixed(1);
    trendSvg = `<svg aria-hidden="true" viewBox="0 0 1000 ${plotH}" preserveAspectRatio="none" style="position:absolute;left:0;bottom:0;width:100%;height:${plotH}px;overflow:visible;pointer-events:none"><line x1="${x(0)}" y1="${y(at(0))}" x2="${x(k - 1)}" y2="${y(at(k - 1))}" stroke="#ffffff" stroke-width="3" stroke-dasharray="10 8" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
    trendKey = `<span class="key"><span style="width:24px;border-top:3px dashed #ffffff;display:inline-block"></span>Trend ${MONTHS[0]}–${MONTHS[k - 1]}: ${slope >= 0 ? '+' : '−'}${money(Math.abs(slope))}/mo</span>`;
  }
  const monthLbls = p.months.map((m, i) => `<p class="sub" style="text-align:center${i === n - 1 ? ';color:#ffdb05' : ''}">${MONTHS[m.m - 1]}${i === n - 1 ? '*' : ''}</p>`).join('');
  const counts = p.months.map((m, i) => `<p style="margin:0;text-align:center;font-weight:700;font-size:16px${i === n - 1 ? ';color:#ffdb05' : ''}">${m.nStd + m.nSvc}</p>`).join('');
  const left = `<div class="card panel"><div class="ph"><h2 class="lbl">Closed-won revenue by month</h2><span class="key"><span class="sw g"></span>Standard pipeline</span><span class="key"><span class="sw y"></span>Service (CFSS)</span>${trendKey}</div>
<div style="position:relative;height:${plotH + 30}px;display:flex;padding-left:72px">${grid}
<div style="position:relative;flex-grow:1;display:grid;grid-template-columns:repeat(${n},minmax(0,1fr));gap:0;align-items:end;border-bottom:1px solid #333333">${cols}${trendSvg}</div></div>
<div style="display:grid;grid-template-columns:72px repeat(${n},minmax(0,1fr));column-gap:0;row-gap:8px;align-items:center"><span></span>${monthLbls}<span style="font-size:13px;color:#a1a1a1">Deals won</span>${counts}</div>
<p class="sub" style="font-size:13px">* ${MONTHS[n - 1]} is month to date.</p></div>`;

  // Open deals: stage (rows) x CRM layout / department (columns), cells shaded by count.
  const stageName = (s) => s.replace('Post Appointment Questionnaire Completed', 'Post-Appt Questionnaire').replace(/Proposal Review-(\d+)/, 'Proposal Review $1');
  const L = p.layouts;
  const gridCols = `minmax(0,1fr) repeat(${L.length},86px) 60px`;
  const rowH = p.matrix.length > 14 ? 30 : 34;
  const head = `<span></span>${L.map((l) => `<span style="text-align:center;font-size:14px;color:#eaeaea;font-weight:700;line-height:1.25;white-space:nowrap">${esc(l.short)}<br><span style="color:#a1a1a1;font-weight:400">${l.n}</span></span>`).join('')}<span style="text-align:center;font-size:14px;color:#ffdb05;font-weight:700;line-height:1.25">Total<br><span>${p.openN}</span></span>`;
  const body = p.matrix.map((r) => `<span style="color:#eaeaea;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(stageName(r.stage))}</span>${r.cells.map((v) => (v
    ? `<span style="height:${rowH}px;display:flex;align-items:center;justify-content:center;border-radius:6px;font-weight:700;font-size:17px;background:rgba(113,166,43,${(0.18 + 0.72 * (v / p.cellMax)).toFixed(2)})">${v}</span>`
    : `<span style="height:${rowH}px;display:flex;align-items:center;justify-content:center;color:#474747">·</span>`)).join('')}<span style="text-align:center;font-weight:700;font-size:17px">${r.total}</span>`).join('');
  const right = `<div class="card panel"><div class="ph"><h2 class="lbl">Open deals by stage &amp; department</h2><span class="sub">CRM layout · deal count</span></div>
<div style="display:grid;grid-template-columns:${gridCols};gap:5px 8px;align-items:center">${head}${body}</div></div>`;
  return `${kpis}<section style="display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);gap:24px;flex-grow:1;min-height:0">${left}${right}</section>`;
}

// ---------------- RIGHT: Operations ----------------
function tile(t) {
  if (!t.wk) return `<div class="card tile"><p class="lbl">${esc(t.label)}</p><div class="tl"><p class="big">–</p><p class="sub">waiting for Zoho</p></div></div>`;
  const cur = t.wk[3], prev = t.wk[2];
  const mx = Math.max(1, ...t.wk);
  const bars = t.wk.map((v, i) => `<div class="${i === 3 ? 'vg' : 'pw'}" style="height:${v ? `${Math.max(4, Math.round((v / mx) * 100))}%` : '2px'}"></div>`).join('');
  return `<div class="card tile"><p class="lbl">${esc(t.label)}</p><div class="tl"><p class="big">${cur}</p><p class="sub">${delta(cur, prev, 'vs last wk')}</p></div>
<div class="tr"><div class="spark">${bars}</div><div class="wkn">${t.wk.map((v) => `<span>${v}</span>`).join('')}</div></div></div>`;
}

// Cumulative flow for a pair of tiles (permits submitted vs received, tickets in vs closed):
// running totals by day over the last 4 weeks, with the gap between them shaded.
// The gap is how much the queue grew in these 4 weeks, not the all-time backlog.
const FLOW_IN = '#f49c20', FLOW_OUT = '#71a62b';
const FLOW_COL = 800, FLOW_W = 540; // card width on the board; chart viewBox width inside it
function flowChart(a, b, win, W) {
  const H = 132, x0 = 8, x1 = W - 60, y0 = 10, y1 = H - 20; // the right 60 holds the gap label
  const start = win.weeks[0];
  const n = Math.max(1, Math.min(28, Math.round((new Date(`${win.today}T12:00:00Z`) - new Date(`${start}T12:00:00Z`)) / 864e5) + 1));
  const cum = (dates) => {
    const out = []; let c = 0;
    for (let i = 0; i < n; i++) { const d = addDays(start, i); c += dates.filter((x) => x === d).length; out.push(c); }
    return out;
  };
  const A = cum(a.dates), B = cum(b.dates);
  const top = Math.max(4, A[n - 1], B[n - 1]);
  // The axis ends at today, so the lines run the full width.
  const x = (i) => (x0 + ((x1 - x0) * i) / Math.max(1, n - 1)).toFixed(1);
  const y = (v) => (y1 - (v / top) * (y1 - y0)).toFixed(1);
  const line = (arr) => arr.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const area = (arr) => `${x(0)},${y1} ${line(arr)} ${x(n - 1)},${y1}`;
  const gap = A[n - 1] - B[n - 1];
  const ya = Number(y(A[n - 1])), yb = Number(y(B[n - 1])), xe = Number(x(n - 1));
  const mid = (ya + yb) / 2;
  const bracket = Math.abs(yb - ya) >= 14
    ? `<path d="M${xe + 8},${Math.min(ya, yb) + 2} q6,0 6,6 v${Math.abs(yb - ya) / 2 - 10} l5,4 l-5,4 v${Math.abs(yb - ya) / 2 - 10} q0,6 -6,6" fill="none" stroke="#fff" stroke-width="1.5"/>` : '';
  const ticks = win.weeks.filter((w, i) => i * 7 <= n - 1).map((w, i) => `<line x1="${x(i * 7)}" x2="${x(i * 7)}" y1="${y1}" y2="${y1 + 4}" stroke="#474747"/><text x="${x(i * 7)}" y="${H - 4}" fill="#a1a1a1" font-size="12" text-anchor="${i ? 'middle' : 'start'}">${md(w)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Running totals over the last 4 weeks: ${esc(a.label)} ${A[n - 1]}, ${esc(b.label)} ${B[n - 1]}" font-family="Inter,Verdana,sans-serif">
<defs><linearGradient id="fg-${a.key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${FLOW_IN}" stop-opacity=".55"/><stop offset="1" stop-color="${FLOW_IN}" stop-opacity=".15"/></linearGradient></defs>
<line x1="${x0}" x2="${x1}" y1="${y1}" y2="${y1}" stroke="#333333"/>
<polygon points="${area(A)}" fill="url(#fg-${a.key})"/><polygon points="${area(B)}" fill="#354d1d"/>
<polyline points="${line(A)}" fill="none" stroke="${FLOW_IN}" stroke-width="3.5" stroke-linejoin="round"/>
<polyline points="${line(B)}" fill="none" stroke="${FLOW_OUT}" stroke-width="3.5" stroke-linejoin="round"/>
${bracket}<text x="${xe + (bracket ? 24 : 10)}" y="${mid + 6}" fill="#fff" font-size="17" font-weight="700">${gap > 0 ? '+' : ''}${gap}</text>
<text x="${xe + (bracket ? 24 : 10)}" y="${mid + 21}" fill="#a1a1a1" font-size="11">queue</text>${ticks}</svg>`;
}
function flowMetric(t, color) {
  const cur = t.wk[3], prev = t.wk[2];
  return `<div class="fm"><span class="n" style="color:${color}">${cur}</span><span class="t"><b style="color:${color}">${esc(t.short)}</b><span>${delta(cur, prev, 'vs last wk')}</span></span></div>`;
}
// One card for a pair: this week's two counts on the left, the 4-week flow chart on the right.
function flowCard(title, a, b, win, W) {
  if (!a.wk || !b.wk) return `<div class="card flow"><p class="lbl">${esc(title)}</p><div class="fl"><p class="sub">waiting for Zoho</p></div></div>`;
  return `<div class="card flow"><p class="lbl">${esc(title)} <span class="sub" style="font-weight:400">· this week, and running total over 4 weeks</span></p>
<div class="fl">${flowMetric(a, FLOW_IN)}${flowMetric(b, FLOW_OUT)}</div><div class="fc">${flowChart(a, b, win, W)}</div></div>`;
}

function lineChart(pr) {
  const xs = [70, 182, 294, 406, 518, 630, 742];
  const top = Math.max(5, ...pr.lastCum, ...pr.thisCum);
  const niceTop = Math.ceil(top / 5) * 5;
  const y = (v) => Math.round(380 - (v / niceTop) * 340);
  let grid = '';
  for (let v = 0; v <= niceTop; v += niceTop / 4) {
    grid += `<line x1="52" y1="${y(v)}" x2="752" y2="${y(v)}" stroke="#333333" ${v ? 'stroke-dasharray="4 6"' : ''}/><text x="40" y="${y(v) + 5}" fill="#a1a1a1" font-size="14" text-anchor="end">${Math.round(v)}</text>`;
  }
  const last = pr.lastCum.map((v, i) => `${xs[i]},${y(v)}`).join(' ');
  const upto = pr.thisCum.slice(0, pr.todayIdx + 1);
  const cur = upto.map((v, i) => `${xs[i]},${y(v)}`).join(' ');
  const dots = upto.map((v, i) => `<circle cx="${xs[i]}" cy="${y(v)}" r="8" fill="#71a62b" stroke="#1d1d1d" stroke-width="3"/><text x="${xs[i]}" y="${y(v) - 16}" fill="#fff" font-size="18" font-weight="700" text-anchor="middle">${v}</text>`).join('');
  const lastEnd = `<text x="${xs[6]}" y="${y(pr.lastCum[6]) - 14}" fill="#a1a1a1" font-size="15" text-anchor="middle">${pr.lastCum[6]}</text>`;
  const days = DAYS.map((d, i) => `<text x="${xs[i]}" y="412" fill="#a1a1a1" font-size="15" text-anchor="middle">${d}</text>`).join('');
  return `<svg viewBox="0 0 770 420" role="img" aria-label="Running total of projects created this week versus last week" style="width:100%;flex-grow:1;min-height:0" font-family="Inter,Verdana,sans-serif">${grid}
<polyline points="${last}" fill="none" stroke="#eaeaea" stroke-width="2" stroke-dasharray="7 6"/>${lastEnd}
<polyline points="${cur}" fill="none" stroke="#71a62b" stroke-width="5" stroke-linejoin="round"/>${dots}${days}</svg>`;
}

function opsBoard(o, win) {
  // Two rows: pre-construction on top; installs and service tickets underneath.
  // Permits and tickets are pairs (in vs out), shown as one flow card each.
  const by = (k) => o.tiles.find((t) => t.key === k);
  const pair = (ka, sa, kb, sb) => [{ ...by(ka), short: sa }, { ...by(kb), short: sb }];
  const [pA, pB] = pair('permitApp', 'Submitted', 'permitOk', 'Received');
  const [tA, tB] = pair('ticketsIn', 'Incoming', 'ticketsClosed', 'Closed');
  const pre = ['projects', 'design'].map(by), inst = o.tiles.filter((t) => t.group === 'install');
  const head = (label, n, color) => `<p class="grp" style="grid-column:span ${n}"><i style="background:${color}"></i>${label}</p>`;
  // Both flow cards sit in the same fixed-width right column so their edges line up.
  const cols = (n) => `grid-template-columns:repeat(${n},minmax(0,1fr)) ${FLOW_COL}px`;
  const tiles = `<section class="tiles"><div class="trow" style="${cols(pre.length)}">${head('Pre-construction', pre.length + 1, '#71a62b')}${pre.map(tile).join('')}${flowCard('Permits', pA, pB, win, FLOW_W)}</div>
<div class="trow" style="${cols(inst.length)}">${head('Installs completed', inst.length, '#ffdb05')}${head('Service tickets', 1, '#f49c20')}${inst.map(tile).join('')}${flowCard('Tickets', tA, tB, win, FLOW_W)}</div></section>`;
  const pr = o.projects;
  const line = pr ? `<div class="card panel" style="gap:10px"><div class="ph"><h2 class="lbl">Projects created · running total</h2><span class="key"><span style="width:18px;height:4px;background:#71a62b;display:inline-block"></span>This week</span><span class="key"><span style="width:18px;border-top:2px dashed #eaeaea;display:inline-block"></span>Last week</span></div>${lineChart(pr)}</div>` : waiting();
  const gMax = pr ? Math.max(1, ...pr.groups.map((g) => g.n)) : 1;
  const types = pr ? `<div class="card panel"><div class="ph"><h2 class="lbl">New projects by type</h2><span class="sub">last 4 weeks · ${pr.total4}</span></div>
<div class="hb" style="grid-template-columns:170px minmax(0,1fr) 40px 64px;gap:16px 14px"><span style="font-size:13px;color:#a1a1a1">Type</span><span></span><span style="font-size:13px;color:#a1a1a1;text-align:right">4 wk</span><span style="font-size:13px;color:#a1a1a1;text-align:right">this wk</span>
${pr.groups.slice(0, 8).map((g) => `<span style="color:#eaeaea">${esc(g.name)}</span><div class="bar g" style="width:${Math.max(1, (g.n / gMax) * 100).toFixed(1)}%"></div><span class="r">${g.n}</span><span style="text-align:right;font-weight:700;color:${g.now ? '#ffdb05' : '#a1a1a1'}">${g.now}</span>`).join('')}</div></div>` : waiting();
  // Same columns and gap as the tile rows, so the two bottom cards split where the Tickets card starts.
  return `${tiles}<section style="display:grid;grid-template-columns:minmax(0,1fr) ${FLOW_COL}px;gap:20px;flex:0 0 420px;min-height:0">${line}${types}</section>`;
}

// opts.qr: inline SVG of today's phone sign-in code for this board, shown bottom-right.
function renderBoard(board, metrics, sources, opts = {}) {
  if (!metrics) return `<header><h1>${esc(BOARDS[board].title)}</h1></header><main>${waiting('Connecting to Zoho…')}</main>${qrBlock(opts.qr)}`;
  const body = board === 'left' ? salesBoard(metrics.sales, metrics.win)
    : board === 'middle' ? pipelineBoard(metrics.pipeline, metrics.win)
      : opsBoard(metrics.ops, metrics.win);
  // With a QR, the bottom-right card gets extra right padding so nothing sits under the code.
  return `${header(board, sources)}<main${opts.qr ? ' class="hasqr"' : ''}>${body}</main>${qrBlock(opts.qr)}`;
}

const CLIENT_JS = `
(function(){
  var stage=document.getElementById('stage');
  function fit(){var s=Math.min(innerWidth/1920,innerHeight/1080);stage.style.transform='scale('+s+')';stage.style.left=((innerWidth-1920*s)/2)+'px';stage.style.top=((innerHeight-1080*s)/2)+'px';}
  addEventListener('resize',fit);fit();
  var fails=0,loadedAt=Date.now();
  function poll(){
    var u=location.pathname+(location.search?location.search+'&':'?')+'fragment=1';
    fetch(u,{cache:'no-store',credentials:'same-origin'}).then(function(r){if(!r.ok)throw new Error(r.status);return r.text();})
      .then(function(html){stage.innerHTML=html;fails=0;})
      .catch(function(){fails++;if(fails>=6)location.reload();});
    if(Date.now()-loadedAt>6*3600*1000)location.reload();
  }
  setInterval(poll,POLL_MS);
})();`;

// Phone flares: check every few seconds and float any new ones across this TV.
// opts.flareSince = the newest flare id when the page was made (so old ones don't replay).
const FLARE_JS = `
(function(){
  var since=FLARE_SINCE;
  function check(){
    var u=location.pathname+(location.search?location.search+'&':'?')+'flares='+since;
    fetch(u,{cache:'no-store',credentials:'same-origin'}).then(function(r){return r.ok?r.json():null;}).then(function(j){
      if(!j)return;
      if(j.last<since)since=0; // server restarted
      j.flares.forEach(function(f,i){setTimeout(function(){flareBurst(f.emoji);},i*900);});
      since=Math.max(since,j.last);
    }).catch(function(){});
  }
  setInterval(check,3000);
})();`;

function renderPage(board, metrics, sources, pollMs, opts = {}) {
  const flares = opts.flareSince != null;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>CFES · ${esc(BOARDS[board].title)}</title>${FONTS}${flares ? flare.FONT_LINK : ''}<style>${CSS}${flares ? flare.CSS : ''}</style></head>
<body><div id="stage">${renderBoard(board, metrics, sources, opts)}</div>${flares ? '<div id="flares" aria-hidden="true"></div>' : ''}<script>${CLIENT_JS.replace('POLL_MS', String(pollMs))}${flares ? flare.BURST_JS + FLARE_JS.replace('FLARE_SINCE', String(opts.flareSince)) : ''}</script></body></html>`;
}

module.exports = { BOARDS, boardFreshness, renderPage, renderBoard, FONTS, flowChart, FLOW_IN, FLOW_OUT };
