'use strict';
// Server-side HTML for the three 1920x1080 monitor boards (CFES brand: green #71a62b, yellow #ffdb05, orange #f49c20, Verdana).

const { addDays } = require('./metrics');
const { nextSlot, maxGapHours, slotLabel } = require('./schedule');

const BOARDS = {
  left: { title: 'Inside Sales', sources: ['leads', 'calls', 'meetings'], system: 'Zoho CRM' },
  middle: { title: 'Sales Pipeline', sources: ['openDeals', 'wonDeals', 'newDeals'], system: 'Zoho CRM Deals' },
  right: { title: 'Operations', sources: ['projects', 'tasksDesign', 'tasksPermit', 'tasksInstall'], system: 'Zoho Projects' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sum = (a) => a.reduce((s, x) => s + x, 0);
const md = (ds) => `${MONTHS[Number(ds.slice(5, 7)) - 1]} ${Number(ds.slice(8, 10))}`;
const dnum = (ds) => Number(ds.slice(8, 10));
function weekLabel(ws) {
  const fri = addDays(ws, 4);
  return ws.slice(5, 7) === fri.slice(5, 7) ? `${md(ws)} – ${dnum(fri)}, ${fri.slice(0, 4)}` : `${md(ws)} – ${md(fri)}, ${fri.slice(0, 4)}`;
}
function money(v) {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e5) return `$${Math.round(v / 1e3)}K`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${Math.round(v)}`;
}
function delta(cur, prev, label = 'vs last week') {
  if (prev == null) return '';
  const d = cur - prev;
  if (d === 0) return `<span class="flat">● no change</span> ${label} (${prev})`;
  return `<span class="${d > 0 ? 'up' : 'dn'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}</span> ${label} (${prev})`;
}
const avg = (a) => (a.length ? sum(a) / a.length : 0);
const fmtAvg = (v) => (Math.round(v * 10) / 10).toString();
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
const dayTimeFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' });

const CSS = `
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:#161617;overflow:hidden}
body{font-family:Verdana,sans-serif;color:#fff}
#stage{width:1920px;height:1080px;transform-origin:0 0;position:absolute;left:0;top:0;display:flex;flex-direction:column;background:#161617}
header{height:104px;padding:0 40px;display:flex;align-items:center;gap:32px;background:#1f1f20;border-bottom:4px solid #71a62b;flex-shrink:0}
header img{height:52px;width:auto}
.vr{width:1px;height:52px;background:#3e3e3f}
h1{margin:0;font-size:38px;flex-grow:1}
.hr{display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.hr .wk{margin:0;font-size:22px;font-weight:700}
main{flex-grow:1;padding:28px 40px 32px;display:flex;flex-direction:column;gap:24px;min-height:0}
.card{background:#262627;border:1px solid #3e3e3f;border-radius:12px}
.lbl{font-size:18px;color:#eaeaea;margin:0;font-weight:700}
h2.lbl{font-size:20px}
.sub{font-size:15px;color:#b8b8b8;margin:0}
.up{color:#71a62b;font-weight:700}.dn{color:#f49c20;font-weight:700}.flat{color:#b8b8b8;font-weight:700}
.warn{color:#f49c20;font-weight:700}
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px;height:196px;flex-shrink:0}
.kpi{padding:24px 28px;display:flex;flex-direction:column;justify-content:space-between}
.big{font-size:84px;line-height:1;font-weight:700;margin:0}
.green{background:linear-gradient(180deg,#71a62b,#5a881c);border-color:#71a62b}
.green .lbl,.green .sub{color:#fff}
.gold{background:linear-gradient(180deg,#ffdb05,#f49c20);border-color:#ffdb05}
.gold .lbl,.gold .sub,.gold .big{color:#3e3e3f}
.panel{padding:24px 28px;display:flex;flex-direction:column;gap:14px;min-height:0}
.ph{display:flex;align-items:center;gap:24px}
.ph h2{flex-grow:1}
.key{display:flex;align-items:center;gap:8px;font-size:15px;color:#eaeaea}
.sw{width:14px;height:14px;border-radius:3px;display:inline-block}
.g{background:#71a62b}.y{background:#ffdb05}.o{background:#f49c20}.l{background:#eaeaea}
.vg{background:linear-gradient(180deg,#71a62b,#5a881c)}
.vo{background:linear-gradient(180deg,#ffdb05,#f49c20)}
.cols{flex-grow:1;display:grid;gap:40px;align-items:end;border-bottom:1px solid #3e3e3f;padding:0 24px}
.col{display:flex;flex-direction:column;justify-content:flex-end}
.num{font-size:18px;font-weight:700;text-align:center;margin:0 0 6px}
.xl{display:grid;gap:40px;padding:0 24px}
.xl p{margin:0;font-size:15px;color:#b8b8b8;text-align:center}
.hb{display:grid;align-items:center;font-size:16px}
.hb .bar{height:18px;border-radius:3px}
.r{text-align:right;font-weight:700}
table{width:100%;border-collapse:collapse;font-size:18px}
th,td{padding:12px 0;text-align:right}
th:first-child{text-align:left;font-weight:400;color:#eaeaea}
thead th{color:#b8b8b8;font-size:15px;font-weight:400;padding-top:0}
tbody tr{border-top:1px solid #3e3e3f}
tr.now{color:#ffdb05;font-weight:700}tr.now th{color:#ffdb05;font-weight:700}
.empty{flex-grow:1;display:flex;align-items:center;justify-content:center;color:#b8b8b8;font-size:22px;text-align:center;padding:24px}
.tiles{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:12px 20px;flex-shrink:0}
.grp{font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:#b8b8b8;margin:0;font-weight:700;padding-bottom:8px}
.tile{padding:20px 22px;display:flex;flex-direction:column;gap:12px}
.tile .big{font-size:72px}
.spark{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;align-items:end;height:48px;border-bottom:1px solid #3e3e3f}
.spark div{border-radius:3px 3px 0 0}
.pw{background:#5f5f61}
.wkn{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;font-size:12px;color:#b8b8b8;text-align:center}
.wkn span:last-child{color:#fff;font-weight:700}
.row{display:flex;align-items:baseline;justify-content:space-between;padding:12px 0;border-top:1px solid #3e3e3f}
.row span:first-child{color:#eaeaea;font-size:16px}.row span:last-child{font-size:26px;font-weight:700}
`;

function header(board, metrics, sources) {
  const b = BOARDS[board];
  const fetched = b.sources.map((k) => sources[k] && sources[k].fetchedAt).filter(Boolean).sort()[0];
  const failing = b.sources.filter((k) => sources[k] && sources[k].error);
  // Pulls run on a fixed schedule, so "late" means older than the longest gap between pulls plus an hour.
  const stale = fetched && Date.now() - new Date(fetched).getTime() > (maxGapHours() + 1) * 3600 * 1000;
  let status = fetched
    ? `${b.system} · updated ${dayTimeFmt.format(new Date(fetched))} · next ${slotLabel(nextSlot())}`
    : `${b.system} · waiting for first sync`;
  if (failing.length || stale) status += ` · <span class="warn">refresh delayed</span>`;
  const right = board === 'middle' ? `${metrics.win.today.slice(0, 4)} year to date` : `Week of ${weekLabel(metrics.win.ws)}`;
  return `<header><h1>${esc(b.title)}</h1>
<div class="hr"><p class="wk">${esc(right)}</p><p class="sub">${status}</p></div></header>`;
}

function waiting(msg = 'Waiting for Zoho data…') { return `<div class="card empty">${esc(msg)}</div>`; }

// ---------------- LEFT: Inside Sales ----------------
function salesBoard(s, win) {
  if (!s) return waiting();
  const [, , l2, l3] = s.leadsWk; const [, , c2, c3] = s.callsWk; const [, , m2, m3] = s.mtgWk;
  const kpis = `<section class="kpis">
<div class="card kpi"><p class="lbl">Leads created</p><p class="big">${l3}</p><p class="sub">${delta(l3, l2)} · 4-wk avg ${fmtAvg(avg(s.leadsWk))}</p></div>
<div class="card kpi"><p class="lbl">Calls logged</p><p class="big">${c3}</p><p class="sub">${delta(c3, c2)} · ${s.callsOut} out / ${s.callsIn} in</p></div>
<div class="card kpi"><p class="lbl">Meetings this week</p><p class="big">${m3}</p><p class="sub">${delta(m3, m2)} · 4-wk avg ${fmtAvg(avg(s.mtgWk))}</p></div>
<div class="card kpi green"><p class="lbl">Meetings booked · next week</p><p class="big">${s.nextTotal}</p><p class="sub">On the calendar for ${esc(weekLabel(win.nextWs).replace(/, \d{4}$/, ''))}</p></div>
</section>`;

  // Tallest bar + its number label must fit the 340px chart row (header, gaps, day labels): ~170px.
  const plotH = 170;
  const cMax = Math.max(1, ...s.callDays.map((d) => d.out + d.inb));
  const callCols = s.callDays.map((d) => {
    const ho = Math.round((d.out / cMax) * plotH), hi = Math.round((d.inb / cMax) * plotH);
    return `<div class="col"><p class="num">${d.out + d.inb}</p>${hi ? `<div class="y" style="height:${hi}px;border-radius:4px 4px 0 0"></div>` : ''}${ho ? `<div class="vg" style="height:${ho}px;${hi ? '' : 'border-radius:4px 4px 0 0'}"></div>` : ''}</div>`;
  }).join('');
  const nMax = Math.max(1, ...s.nextDays.map((d) => d.n));
  const mtgCols = s.nextDays.map((d) => {
    const h = Math.round((d.n / nMax) * plotH);
    const light = nMax >= 4 && d.n < nMax / 2;
    return `<div class="col"><p class="num">${d.n}</p>${h ? `<div class="${light ? 'vo' : 'vg'}" style="height:${h}px;border-radius:4px 4px 0 0"></div>` : ''}</div>`;
  }).join('');
  const dayLbl = (arr) => arr.map((d, i) => `<p>${DAYS[i]} ${dnum(d.day)}</p>`).join('');

  const charts = `<section style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;height:340px;flex-shrink:0">
<div class="card panel"><div class="ph"><h2 class="lbl">Calls per day, this week</h2><span class="key"><span class="sw g"></span>Outbound</span><span class="key"><span class="sw y"></span>Inbound</span></div>
<div class="cols" style="grid-template-columns:repeat(5,minmax(0,1fr))">${callCols}</div><div class="xl" style="grid-template-columns:repeat(5,minmax(0,1fr))">${dayLbl(s.callDays)}</div></div>
<div class="card panel"><div class="ph"><h2 class="lbl">Meetings on the calendar, next week</h2><span class="sub">${s.nextTotal} total · this week ${m3}</span></div>
<div class="cols" style="grid-template-columns:repeat(5,minmax(0,1fr))">${mtgCols}</div><div class="xl" style="grid-template-columns:repeat(5,minmax(0,1fr))">${dayLbl(s.nextDays)}</div></div>
</section>`;

  const sMax = Math.max(1, ...s.sources.map((x) => x.n));
  const srcRows = s.sources.map((x) => `<span style="color:${x.other ? '#b8b8b8' : '#eaeaea'}">${esc(x.name)}</span><div class="bar ${x.other ? 'l' : 'g'}" style="width:${Math.max(1, (x.n / sMax) * 100).toFixed(1)}%"></div><span class="r">${x.n}</span>`).join('');
  const wkRows = win.weeks.map((w, i) => `<tr class="${i === 3 ? 'now' : ''}"><th scope="row">${md(w)}${i === 3 ? ' · this wk' : ''}</th><td>${s.leadsWk[i]}</td><td>${s.callsWk[i]}</td><td>${s.mtgWk[i]}</td></tr>`).join('');
  const bottom = `<section style="display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:24px;flex-grow:1;min-height:0">
<div class="card panel" style="gap:10px"><div class="ph"><h2 class="lbl">Lead sources · last 4 weeks</h2><span class="sub">${s.sourcesTotal} leads since ${md(win.weeks[0])}</span></div>
<div class="hb" style="grid-template-columns:240px minmax(0,1fr) 48px;gap:7px 16px">${srcRows || '<span class="sub">No leads yet</span>'}</div></div>
<div class="card panel"><h2 class="lbl">4-week trend</h2><table><thead><tr><th scope="col" style="color:#b8b8b8">Week of</th><th scope="col">Leads</th><th scope="col">Calls</th><th scope="col">Meetings</th></tr></thead><tbody>${wkRows}</tbody></table></div>
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
  const avgStd = p.ytdStdN ? p.ytdStdAmt / p.ytdStdN : 0;
  const avgSvc = p.ytdSvcN ? p.ytdSvcAmt / p.ytdSvcN : 0;
  const kpis = `<section class="kpis">
${newTile}
<div class="card kpi gold"><p class="lbl">Avg deal size · ${win.today.slice(0, 4)}</p><p class="big" style="font-size:76px">${money(avgStd)}</p><p class="sub">Standard pipeline, ${p.ytdStdN} won · service avg ${money(avgSvc)}</p></div>
<div class="card kpi"><p class="lbl">Closed won · ${MONTHS[curM - 1]} to date</p><p class="big" style="font-size:76px">${money(p.mtdAmt)}</p><p class="sub">${p.mtdN} deals · ${p.mtdStdN} standard, ${p.mtdSvcN} service</p></div>
<div class="card kpi green"><p class="lbl">Closed won · ${win.today.slice(0, 4)}</p><p class="big" style="font-size:76px">${money(p.ytdAmt)}</p><p class="sub">${p.ytdN} deals${p.prevAmt != null ? ` · ${MONTHS[curM - 2]} was ${money(p.prevAmt)}` : ''}</p></div>
</section>`;

  const plotH = 340;
  const maxTot = Math.max(1, ...p.months.map((m) => m.std + m.svc));
  const scaleMax = maxTot * 1.12;
  const step = [50e3, 100e3, 250e3, 500e3, 1e6, 2e6, 5e6].find((s) => scaleMax / s <= 4) || 1e7;
  let grid = '';
  for (let v = step; v < scaleMax; v += step) {
    const y = Math.round((v / scaleMax) * plotH);
    grid += `<div aria-hidden="true" style="position:absolute;left:0;right:0;bottom:${y}px;border-top:1px dashed #3e3e3f"></div><span aria-hidden="true" style="position:absolute;left:0;bottom:${y + 6}px;font-size:13px;color:#b8b8b8">${money(v).replace('.00M', 'M')}</span>`;
  }
  const n = curM;
  // Columns sit edge to edge (spacing comes from padding), so month i's center is at (i + 0.5) / n.
  const colPad = n > 9 ? 9 : 14;
  const cols = p.months.map((m, i) => {
    const hs = Math.round((m.std / scaleMax) * plotH), hv = Math.round((m.svc / scaleMax) * plotH);
    const mtd = i === curM - 1;
    return `<div class="col" style="padding:0 ${colPad}px"><p class="num" style="font-size:14px;position:relative;z-index:1;text-shadow:0 0 4px #262627,0 0 4px #262627${mtd ? ';color:#ffdb05' : ''}">${money(m.std + m.svc)}</p>${hv ? `<div class="y" style="height:${hv}px;border-radius:4px 4px 0 0"></div>` : ''}${hs ? `<div class="vg" style="height:${hs}px;${hv ? '' : 'border-radius:4px 4px 0 0'}"></div>` : ''}</div>`;
  }).join('');

  // Linear trend (least squares) over completed months only; the month-to-date month is left out.
  const done = p.months.slice(0, n - 1).map((m) => m.std + m.svc);
  let trendSvg = '';
  let trendKey = '';
  if (done.length >= 3) {
    const k = done.length;
    const mx = (k - 1) / 2;
    const my = done.reduce((s, v) => s + v, 0) / k;
    let num = 0, den = 0;
    done.forEach((v, i) => { num += (i - mx) * (v - my); den += (i - mx) ** 2; });
    const slope = num / den;
    const at = (i) => my + slope * (i - mx);
    const y = (v) => Math.max(0, Math.min(plotH, plotH - (v / scaleMax) * plotH)).toFixed(1);
    const x = (i) => (((i + 0.5) / n) * 1000).toFixed(1);
    trendSvg = `<svg aria-hidden="true" viewBox="0 0 1000 ${plotH}" preserveAspectRatio="none" style="position:absolute;left:0;bottom:0;width:100%;height:${plotH}px;overflow:visible;pointer-events:none"><line x1="${x(0)}" y1="${y(at(0))}" x2="${x(k - 1)}" y2="${y(at(k - 1))}" stroke="#ffffff" stroke-width="3" stroke-dasharray="10 8" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
    trendKey = `<span class="key"><span style="width:24px;border-top:3px dashed #ffffff;display:inline-block"></span>Trend ${MONTHS[0]}–${MONTHS[k - 1]}: ${slope >= 0 ? '+' : '−'}${money(Math.abs(slope))}/mo</span>`;
  }
  const monthLbls = p.months.map((m, i) => `<p class="sub" style="text-align:center${i === n - 1 ? ';color:#ffdb05' : ''}">${MONTHS[m.m - 1]}${i === n - 1 ? '*' : ''}</p>`).join('');
  const counts = p.months.map((m, i) => `<p style="margin:0;text-align:center;font-weight:700;font-size:16px${i === n - 1 ? ';color:#ffdb05' : ''}">${m.nStd + m.nSvc}</p>`).join('');
  const left = `<div class="card panel"><div class="ph"><h2 class="lbl">Closed-won revenue by month</h2><span class="key"><span class="sw g"></span>Standard pipeline</span><span class="key"><span class="sw y"></span>Service (CFSS)</span>${trendKey}</div>
<div style="position:relative;height:${plotH + 30}px;display:flex;padding-left:72px">${grid}
<div style="position:relative;flex-grow:1;display:grid;grid-template-columns:repeat(${n},minmax(0,1fr));gap:0;align-items:end;border-bottom:1px solid #3e3e3f">${cols}${trendSvg}</div></div>
<div style="display:grid;grid-template-columns:72px repeat(${n},minmax(0,1fr));column-gap:0;row-gap:8px;align-items:center"><span></span>${monthLbls}<span style="font-size:13px;color:#b8b8b8">Deals won</span>${counts}</div>
<p class="sub" style="font-size:13px">* ${MONTHS[n - 1]} is month to date.</p></div>`;

  // Open deals: stage (rows) x CRM layout / department (columns), cells shaded by count.
  const stageName = (s) => s.replace('Post Appointment Questionnaire Completed', 'Post-Appt Questionnaire').replace(/Proposal Review-(\d+)/, 'Proposal Review $1');
  const L = p.layouts;
  const gridCols = `minmax(0,1fr) repeat(${L.length},86px) 60px`;
  const rowH = p.matrix.length > 14 ? 30 : 34;
  const head = `<span></span>${L.map((l) => `<span style="text-align:center;font-size:14px;color:#eaeaea;font-weight:700;line-height:1.25;white-space:nowrap">${esc(l.short)}<br><span style="color:#b8b8b8;font-weight:400">${l.n}</span></span>`).join('')}<span style="text-align:center;font-size:14px;color:#ffdb05;font-weight:700;line-height:1.25">Total<br><span>${p.openN}</span></span>`;
  const body = p.matrix.map((r) => `<span style="color:#eaeaea;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(stageName(r.stage))}</span>${r.cells.map((v) => (v
    ? `<span style="height:${rowH}px;display:flex;align-items:center;justify-content:center;border-radius:6px;font-weight:700;font-size:17px;background:rgba(113,166,43,${(0.18 + 0.72 * (v / p.cellMax)).toFixed(2)})">${v}</span>`
    : `<span style="height:${rowH}px;display:flex;align-items:center;justify-content:center;color:#5f5f61">·</span>`)).join('')}<span style="text-align:center;font-weight:700;font-size:17px">${r.total}</span>`).join('');
  const right = `<div class="card panel"><div class="ph"><h2 class="lbl">Open deals by stage &amp; department</h2><span class="sub">CRM layout · deal count</span></div>
<div style="display:grid;grid-template-columns:${gridCols};gap:5px 8px;align-items:center">${head}${body}</div></div>`;
  return `${kpis}<section style="display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);gap:24px;flex-grow:1;min-height:0">${left}${right}</section>`;
}

// ---------------- RIGHT: Operations ----------------
function tile(t) {
  if (!t.wk) return `<div class="card tile"><p class="lbl">${esc(t.label)}</p><p class="big">–</p><p class="sub">waiting for Zoho</p></div>`;
  const cur = t.wk[3], prev = t.wk[2];
  const mx = Math.max(1, ...t.wk);
  const bars = t.wk.map((v, i) => `<div class="${i === 3 ? 'vg' : 'pw'}" style="height:${Math.max(2, Math.round((v / mx) * 48))}px"></div>`).join('');
  return `<div class="card tile"><p class="lbl">${esc(t.label)}</p><p class="big">${cur}</p><p class="sub">${delta(cur, prev, 'vs last wk')}</p>
<div class="spark">${bars}</div><div class="wkn">${t.wk.map((v) => `<span>${v}</span>`).join('')}</div></div>`;
}

function lineChart(pr) {
  const xs = [70, 182, 294, 406, 518, 630, 742];
  const top = Math.max(5, ...pr.lastCum, ...pr.thisCum);
  const niceTop = Math.ceil(top / 5) * 5;
  const y = (v) => Math.round(380 - (v / niceTop) * 340);
  let grid = '';
  for (let v = 0; v <= niceTop; v += niceTop / 4) {
    grid += `<line x1="52" y1="${y(v)}" x2="752" y2="${y(v)}" stroke="#3e3e3f" ${v ? 'stroke-dasharray="4 6"' : ''}/><text x="40" y="${y(v) + 5}" fill="#b8b8b8" font-size="14" text-anchor="end">${Math.round(v)}</text>`;
  }
  const last = pr.lastCum.map((v, i) => `${xs[i]},${y(v)}`).join(' ');
  const upto = pr.thisCum.slice(0, pr.todayIdx + 1);
  const cur = upto.map((v, i) => `${xs[i]},${y(v)}`).join(' ');
  const dots = upto.map((v, i) => `<circle cx="${xs[i]}" cy="${y(v)}" r="8" fill="#71a62b" stroke="#262627" stroke-width="3"/><text x="${xs[i]}" y="${y(v) - 16}" fill="#fff" font-size="18" font-weight="700" text-anchor="middle">${v}</text>`).join('');
  const lastEnd = `<text x="${xs[6]}" y="${y(pr.lastCum[6]) - 14}" fill="#b8b8b8" font-size="15" text-anchor="middle">${pr.lastCum[6]}</text>`;
  const days = DAYS.map((d, i) => `<text x="${xs[i]}" y="412" fill="#b8b8b8" font-size="15" text-anchor="middle">${d}</text>`).join('');
  return `<svg viewBox="0 0 770 420" role="img" aria-label="Running total of projects created this week versus last week" style="width:100%;flex-grow:1;min-height:0" font-family="Verdana,sans-serif">${grid}
<polyline points="${last}" fill="none" stroke="#eaeaea" stroke-width="2" stroke-dasharray="7 6"/>${lastEnd}
<polyline points="${cur}" fill="none" stroke="#71a62b" stroke-width="5" stroke-linejoin="round"/>${dots}${days}</svg>`;
}

function opsBoard(o, win) {
  const tiles = `<section class="tiles"><p class="grp" style="grid-column:span 4;border-bottom:2px solid #71a62b">Pre-construction</p><p class="grp" style="grid-column:span 3;border-bottom:2px solid #ffdb05">Installs completed</p>
${o.tiles.map(tile).join('')}
<p class="sub" style="grid-column:span 7;font-size:13px">Mini bars: weeks of ${win.weeks.map(md).join(', ')} (green = this week). Counts are Zoho Projects tasks completed that week.</p></section>`;
  const pr = o.projects;
  const line = pr ? `<div class="card panel" style="gap:10px"><div class="ph"><h2 class="lbl">Projects created · running total</h2><span class="key"><span style="width:18px;height:4px;background:#71a62b;display:inline-block"></span>This week</span><span class="key"><span style="width:18px;border-top:2px dashed #eaeaea;display:inline-block"></span>Last week</span></div>${lineChart(pr)}</div>` : waiting();
  const gMax = pr ? Math.max(1, ...pr.groups.map((g) => g.n)) : 1;
  const types = pr ? `<div class="card panel"><div class="ph"><h2 class="lbl">New projects by type</h2><span class="sub">last 4 weeks · ${pr.total4}</span></div>
<div class="hb" style="grid-template-columns:170px minmax(0,1fr) 40px 64px;gap:16px 14px"><span style="font-size:13px;color:#b8b8b8">Type</span><span></span><span style="font-size:13px;color:#b8b8b8;text-align:right">4 wk</span><span style="font-size:13px;color:#b8b8b8;text-align:right">this wk</span>
${pr.groups.slice(0, 8).map((g) => `<span style="color:#eaeaea">${esc(g.name)}</span><div class="bar g" style="width:${Math.max(1, (g.n / gMax) * 100).toFixed(1)}%"></div><span class="r">${g.n}</span><span style="text-align:right;font-weight:700;color:${g.now ? '#ffdb05' : '#b8b8b8'}">${g.now}</span>`).join('')}</div></div>` : waiting();
  const totals = `<div class="card panel"><h2 class="lbl">4-week totals</h2><p class="sub">${md(win.weeks[0])} – ${md(addDays(win.ws, 6))}</p><div>
${o.tiles.map((t) => `<div class="row"><span>${esc(t.label)}</span><span${t.key === 'permitOk' ? ' style="color:#f49c20"' : ''}>${t.wk ? sum(t.wk) : '–'}</span></div>`).join('')}</div></div>`;
  return `${tiles}<section style="display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr) minmax(0,0.8fr);gap:24px;flex-grow:1;min-height:0">${line}${types}${totals}</section>`;
}

function renderBoard(board, metrics, sources) {
  if (!metrics) return `<header><h1>${esc(BOARDS[board].title)}</h1></header><main>${waiting('Connecting to Zoho…')}</main>`;
  const body = board === 'left' ? salesBoard(metrics.sales, metrics.win)
    : board === 'middle' ? pipelineBoard(metrics.pipeline, metrics.win)
      : opsBoard(metrics.ops, metrics.win);
  return `${header(board, metrics, sources)}<main>${body}</main>`;
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

function renderPage(board, metrics, sources, pollMs) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>CFES · ${esc(BOARDS[board].title)}</title><style>${CSS}</style></head>
<body><div id="stage">${renderBoard(board, metrics, sources)}</div><script>${CLIENT_JS.replace('POLL_MS', String(pollMs))}</script></body></html>`;
}

module.exports = { BOARDS, renderPage, renderBoard };
