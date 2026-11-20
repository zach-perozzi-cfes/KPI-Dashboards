'use strict';
// Phone view (/m): the three boards as swipeable screens. Each screen scrolls vertically;
// swipe left/right (or tap a tab) to change screens. Tap any number to see the records
// behind it (src/drill.js), loaded on demand into a sheet that slides up.

const { BOARDS, FONTS, flowChart, FLOW_IN, FLOW_OUT } = require('./render');
const { addDays } = require('./metrics');
const { MONTHS, DAYS, esc, sum, md, dnum, weekLabel, money, delta } = require('./format');
const { OTHER, sortKey } = require('./drill');
const flare = require('./flare');

const TABS = [['left', 'Inside Sales'], ['middle', 'Pipeline'], ['right', 'Operations']];

const CSS = `
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;height:100%;color:#fff;font-family:Inter,Verdana,sans-serif;-webkit-font-smoothing:antialiased;overflow:hidden}
html{background:#141414}
body{background:transparent;display:flex;flex-direction:column;height:100dvh}
button{font:inherit;color:inherit;background:none;border:0;padding:0;margin:0;text-align:inherit;cursor:pointer}
.top{flex-shrink:0;position:relative;border-bottom:1px solid #2a2a2a;padding:calc(env(safe-area-inset-top) + 12px) 16px 0}
.top::before{content:'';position:absolute;left:0;right:0;top:0;height:2px;background:linear-gradient(90deg,rgba(113,166,43,.6),rgba(244,156,32,.45));opacity:.8}
.brand{display:flex;align-items:center;gap:10px}
.brand img{height:28px;width:auto}
.brand p{margin:0 0 0 auto;font-size:11px;color:#a1a1a1;text-align:right;line-height:1.35}
/* Screen switcher: a pill-shaped segmented control; the green pill slides with the swipe. */
.tabs{display:grid;grid-template-columns:repeat(3,1fr);margin:12px 0;position:relative;padding:4px;background:#1c1c1c;border:1px solid #3a3a3a;border-radius:999px}
.tabs button{position:relative;z-index:1;padding:9px 0;text-align:center;font-size:14px;font-weight:700;color:#cfcfcf;border-radius:999px}
.tabs button[aria-selected=true]{color:#101010}
.ind{position:absolute;top:4px;bottom:4px;left:4px;width:calc((100% - 8px) / 3);background:#8cc63f;border-radius:999px;transition:transform .08s linear}
#strip{flex-grow:1;display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;overscroll-behavior-x:contain;scrollbar-width:none}
#strip::-webkit-scrollbar{display:none}
.pane{flex:0 0 100%;width:100%;scroll-snap-align:start;scroll-snap-stop:always;overflow-y:auto;overflow-x:hidden;overscroll-behavior-y:contain;padding:16px 16px calc(env(safe-area-inset-bottom) + 88px);display:flex;flex-direction:column;gap:14px}
.card{position:relative;background:linear-gradient(180deg,#222222,#1a1a1a);border:1px solid #2f2f2f;border-radius:14px;padding:14px 16px;display:block;width:100%}
.card::before{content:'';position:absolute;inset:-1px;border-radius:inherit;border-top:2px solid transparent;background:linear-gradient(90deg,#71a62b,#f49c20) border-box;-webkit-mask:linear-gradient(#000 0 0) padding-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;opacity:.35;pointer-events:none}
.tap{display:block;width:100%;border-radius:8px}
.tap:active{background:rgba(255,255,255,.06)}
.card.tap:active{background:#262626}
.kpis{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.lbl{margin:0;font-size:13px;font-weight:700;color:#eaeaea}
.big{margin:6px 0 4px;font-size:38px;line-height:1;font-weight:800;letter-spacing:-.03em}
.sub{margin:0;font-size:11.5px;color:#a1a1a1;line-height:1.4}
.up{color:#71a62b;font-weight:700}.dn{color:#f49c20;font-weight:700}.flat{color:#a1a1a1;font-weight:700}.warn{color:#f49c20;font-weight:700}
.green{background:linear-gradient(160deg,rgba(113,166,43,.16),rgba(113,166,43,.03) 70%),#1a1a1a;border-color:rgba(113,166,43,.35)}.green::before{background:#71a62b border-box;opacity:.6}.green .big{color:#8cc63f}
.gold{background:linear-gradient(160deg,rgba(244,156,32,.12),rgba(244,156,32,.03) 70%),#1a1a1a;border-color:rgba(244,156,32,.35)}.gold::before{background:#e0a33a border-box;opacity:.6}.gold .big{color:#ffdb05}
.ph{display:flex;align-items:baseline;gap:10px;margin-bottom:10px}
.ph h2{margin:0;font-size:15px;flex-grow:1}
.ph .sub{white-space:nowrap}
.more{font-size:12px;color:#71a62b;font-weight:700;white-space:nowrap}
/* "Details" button in a card header: opens the records behind the card. */
.dtl{font-size:13px;color:#101010;font-weight:800;white-space:nowrap;padding:7px 14px;border-radius:999px;background:#8cc63f}
.dtl:active{background:#71a62b}
.key{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#eaeaea;margin-right:10px}
.sw{width:10px;height:10px;border-radius:2px;display:inline-block}
.g{background:#71a62b}.y{background:#ffdb05}.l{background:#eaeaea}.pw{background:#474747}
.hb{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr) auto;gap:4px 10px;align-items:center;padding:7px 4px;font-size:13px}
.hb .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#eaeaea}
.hb .bar{height:12px;border-radius:3px;display:flex;overflow:hidden}
.hb .v{font-weight:700;text-align:right;min-width:28px}
.hb .v small{font-weight:400;color:#a1a1a1;font-size:11px;margin-left:4px}
.mx{position:relative;z-index:0;display:grid;gap:4px;align-items:center;font-size:12px}
.mx .h{text-align:center;color:#a1a1a1;font-weight:700;font-size:10.5px;padding:4px 0;line-height:1.25;border-radius:5px;overflow-wrap:anywhere}
.mx .h.now{background:#ffdb05;color:#1d1d1d}
.mx .r{overflow:hidden;text-overflow:ellipsis;color:#eaeaea;padding:4px 2px;text-align:left;font-size:11.5px;line-height:1.2;overflow-wrap:anywhere}
.mx .c{height:30px;display:flex;align-items:center;justify-content:center;border-radius:5px;font-weight:700}
.mx .c.z{color:#474747;font-weight:400}
.mx .t{text-align:center;font-weight:700}
/* Totals stand out like the TV grid: a green band down the Tot column, an outline round the
   Per day row, bigger numbers, and the grand total in green. */
.mx .totband,.mx .dayband{position:absolute;z-index:-1;inset:-3px;border-radius:7px;pointer-events:none}
.mx .totband{grid-column:7 / span 1;grid-row:1 / -1;border:2px solid rgba(140,198,63,.6);background:rgba(113,166,43,.16)}
.mx .dayband{grid-column:2 / -1;border:2px solid rgba(234,234,234,.45);background:rgba(255,255,255,.04)}
.mx .h.tot{color:#8cc63f}
.mx .t.tot{font-size:15px;font-weight:800;color:#fff}
.mx .t.tot.all{font-size:16px;color:#8cc63f}
.mx .t.day{padding:6px 0}
.past{opacity:.35}
.tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.flow{grid-column:1/-1}
.fms{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:2px 0 4px}
.fmr{display:flex;align-items:center;gap:10px;padding:6px 4px}
.fmr .n{font-size:34px;font-weight:800;line-height:1;letter-spacing:-.03em}
.fmr .t{display:flex;flex-direction:column;gap:2px;font-size:11px;color:#a1a1a1;white-space:nowrap}
.fmr .t b{font-size:13px}
.flow svg{display:block;width:100%;height:auto}
.grp{grid-column:1/-1;margin:8px 0 2px;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#a1a1a1;font-weight:600;display:flex;align-items:center;gap:8px}
.grp i{width:6px;height:6px;border-radius:50%;display:inline-block}
.spark{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;align-items:end;height:26px;border-bottom:1px solid #333333;margin-top:8px}
.spark div{border-radius:2px 2px 0 0}
.wkn{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;font-size:10px;color:#a1a1a1;text-align:center;margin-top:3px}
.wkn span:last-child{color:#fff;font-weight:700}
/* 4-week totals: the label sits on its own in muted text; the number is a tappable green chip
   with an arrow, so it reads as the thing to press. */
.row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-top:1px solid #2c2c2c;font-size:14px;color:#a8a8a8;font-weight:500}
.row b{display:inline-flex;align-items:center;justify-content:flex-end;gap:8px;min-width:76px;padding:5px 10px 5px 14px;border-radius:999px;background:rgba(113,166,43,.16);border:1px solid rgba(140,198,63,.45);font-size:17px;font-weight:800;color:#fff;font-variant-numeric:tabular-nums}
.row b i{font-style:normal;color:#8cc63f;font-size:15px}
.row:active b{background:rgba(113,166,43,.32)}
.hint{text-align:center;font-size:11px;color:#474747;margin:4px 0 0}
.empty{color:#a1a1a1;font-size:13px;padding:16px 0;text-align:center}
#sheet{position:fixed;inset:0;background:#141414;z-index:10;display:flex;flex-direction:column;transform:translateY(100%);transition:transform .22s ease;visibility:hidden}
#sheet.open{transform:none;visibility:visible}
.shh{flex-shrink:0;position:relative;display:flex;align-items:center;gap:10px;padding:calc(env(safe-area-inset-top) + 14px) 12px 12px;border-bottom:1px solid #2a2a2a}
.shh::before{content:'';position:absolute;left:0;right:0;top:0;height:2px;background:linear-gradient(90deg,rgba(113,166,43,.6),rgba(244,156,32,.45));opacity:.8}
.shh h2{margin:0;font-size:16px;flex-grow:1;line-height:1.3}
.shh button{font-size:15px;font-weight:800;color:#141414;background:#ffdb05;padding:8px 16px 8px 12px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.35)}
.shh button:active{background:#f4c400}
#shb{flex-grow:1;overflow-y:auto;padding:16px 16px calc(env(safe-area-inset-bottom) + 32px);display:flex;flex-direction:column;gap:14px}
.sum{display:flex;align-items:baseline;gap:12px}.sum b{font-size:28px}.sum span{color:#ffdb05;font-weight:700;font-size:18px}
.exp{border-left:3px solid #ffdb05}
.exp h3{margin:0 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#ffdb05;font-weight:700}
.exp p{margin:0;font-size:14px;line-height:1.5;color:#eaeaea}
.gr h3{margin:0 0 6px;font-size:13px;color:#a1a1a1;font-weight:700}
.sort{display:flex;gap:8px;margin-bottom:6px}
.sort button{font-size:12px;padding:6px 10px;border:1px solid #333333;border-radius:14px;color:#a1a1a1}
.sort button[aria-pressed=true]{border-color:#71a62b;color:#fff;background:rgba(113,166,43,.18)}
.recs{list-style:none;margin:0;padding:0}
.recs li{border-top:1px solid #333333}
.recs a,.recs .rc{display:flex;gap:12px;align-items:center;padding:11px 2px;color:inherit;text-decoration:none}
.recs .tx{flex-grow:1;min-width:0}
.recs .nm{font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.recs .sb{font-size:11.5px;color:#a1a1a1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.recs .rt{text-align:right;flex-shrink:0;font-size:12px;color:#a1a1a1}
.recs .rt b{display:block;color:#fff;font-size:14px}
.chev{color:#474747;font-size:16px}
/* FLARE: floating button, emoji picker, confirmation toast */
.fab{position:fixed;right:16px;bottom:calc(env(safe-area-inset-bottom) + 16px);z-index:6;background:#e0a33a;color:#1d1d1d;font-weight:700;font-size:14px;letter-spacing:.08em;padding:13px 20px;border-radius:26px;box-shadow:0 4px 16px rgba(0,0,0,.55)}
.fab:active{transform:scale(.96)}
.picker{position:fixed;right:16px;bottom:calc(env(safe-area-inset-bottom) + 74px);z-index:7;width:252px;max-height:calc(100vh - 160px);overflow-y:auto;background:#1d1d1d;border:1px solid #363636;border-radius:14px;padding:12px;box-shadow:0 8px 24px rgba(0,0,0,.6);display:none}
.picker.open{display:block}
.picker p{margin:0 0 8px;font-size:12px;color:#a1a1a1;line-height:1.4}
.emo{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.picker h3{margin:10px 0 6px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#ff8a1f}
.emo button{font-size:30px;line-height:1;padding:9px 0;text-align:center;border-radius:10px;font-family:'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif}
.emo button:active{background:#333333}
.emo img{height:34px;width:auto;display:block;margin:-2px auto}
.toast{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 80px);transform:translate(-50%,8px);z-index:8;display:flex;align-items:center;gap:10px;background:#181818;border:1px solid #333333;padding:9px 16px;border-radius:18px;font-size:13px;white-space:nowrap;opacity:0;transition:opacity .2s,transform .2s;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.55)}
.toast.show{opacity:1;transform:translate(-50%,0)}
.toast i{font-style:normal;font-size:24px;line-height:1;font-family:'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif}
.toast img{height:26px;width:auto;display:block}
.toast b{display:block;color:#fff;font-size:13px}
.toast small{display:block;color:#a1a1a1;font-size:12px}
.login{margin:auto;max-width:340px;padding:32px 24px;text-align:center}
.login img{height:44px;margin-bottom:24px}
.login h1{font-size:20px;margin:0 0 12px}
.login p{color:#a1a1a1;font-size:14px;line-height:1.5;margin:0 0 10px}
`;

// Phone-width labels for the stage grid and the meetings grid.
const shortRep = (n) => { const w = String(n).trim().split(/\s+/); return w.length > 1 ? `${w[0]} ${w[w.length - 1][0]}.` : n; };

// "▼ 23 vs last wk", without last week's count in brackets.
const short = (d) => d.replace(/ \(\d+\)$/, '');
const btn = (id, cls, inner) => `<button type="button" class="${cls}" data-d="${esc(id)}">${inner}</button>`;
const pct = (v, mx) => `${Math.max(1, (v / Math.max(1, mx)) * 100).toFixed(1)}%`;
const waiting = '<div class="card empty">Waiting for Zoho data…</div>';

// Horizontal bar rows; each row opens its drill.
function bars(rows, idOf, mx, colorOf = () => 'g') {
  return rows.map((x) => btn(idOf(x), 'tap hb', `<span class="nm"${x.other ? ' style="color:#a1a1a1"' : ''}>${esc(x.name)}</span><span class="bar"><span class="${x.other ? 'l' : colorOf(x)}" style="width:${pct(x.n, mx)}"></span></span><span class="v">${x.n}</span>`)).join('');
}

// ---------- Inside Sales ----------
function salesPane(s, win) {
  if (!s) return waiting;
  const [, , l2, l3] = s.leadsWk; const [, , c2, c3] = s.callsWk; const [, , m2, m3] = s.mtgWk;
  const kpis = `<div class="kpis">
${btn('left:leads', 'card tap', `<p class="lbl">Leads created</p><p class="big">${l3}</p><p class="sub">${short(delta(l3, l2, 'vs last wk'))}</p>`)}
${btn('left:calls', 'card tap', `<p class="lbl">Calls logged</p><p class="big">${c3}</p><p class="sub">${short(delta(c3, c2, 'vs last wk'))}</p>`)}
${btn('left:meetings', 'card tap', `<p class="lbl">Meetings this week</p><p class="big">${m3}</p><p class="sub">${short(delta(m3, m2, 'vs last wk'))}</p>`)}
${btn('left:nextweek', 'card tap green', `<p class="lbl">Booked next week</p><p class="big">${s.nextTotal}</p><p class="sub">${esc(weekLabel(win.nextWs).replace(/, \d{4}$/, ''))}</p>`)}
</div>`;

  const cMax = Math.max(1, ...s.callDays.map((d) => d.out + d.inb));
  const callRows = s.callDays.map((d, i) => btn(`left:callday~${i}`, 'tap hb', `<span class="nm">${DAYS[i]} ${dnum(d.day)}</span><span class="bar"><span class="g" style="width:${(d.out / cMax) * 100}%"></span><span class="y" style="width:${(d.inb / cMax) * 100}%"></span></span><span class="v">${d.out + d.inb}</span>`)).join('');
  const calls = `<div class="card"><div class="ph"><h2>Calls per day</h2>${btn('left:calls', 'dtl', 'Details ›')}</div>
<div><span class="key"><span class="sw g"></span>Outbound</span><span class="key"><span class="sw y"></span>Inbound</span></div>${callRows}</div>`;

  const g = s.mtgGrid;
  const cells = g.reps.map((_, ri) => g.days.map((d) => d.byRep[ri] || 0));
  const cMaxM = Math.max(1, ...cells.flat());
  const past = (i) => g.todayIdx >= 0 && i < g.todayIdx;
  const cols = 'grid-template-columns:minmax(0,1fr) repeat(5,minmax(30px,40px)) 34px';
  const head = `<span></span>${g.days.map((d, i) => btn(`left:grid~~${i}`, `h${i === g.todayIdx ? ' now' : ''}${past(i) ? ' past' : ''}`, `${DAYS[i]}<br>${dnum(d.day)}`)).join('')}<span class="h tot">Tot</span>`;
  const cell = (r, v, i) => (v
    ? `<button type="button" class="c${past(i) ? ' past' : ''}" style="background:rgba(113,166,43,${(0.12 + 0.5 * (v / cMaxM)).toFixed(2)})" data-d="${esc(`left:grid~${r.name}~${i}`)}">${v}</button>`
    : `<span class="c z${past(i) ? ' past' : ''}">·</span>`);
  const body = g.reps.map((r, ri) => `${btn(`left:grid~${r.name}`, 'r', esc(shortRep(r.name)))}${cells[ri].map((v, i) => cell(r, v, i)).join('')}${btn(`left:grid~${r.name}`, 't tot', r.n)}`).join('');
  const foot = `<span class="r" style="color:#a1a1a1">Per day</span>${g.days.map((d, i) => `<span class="t day${past(i) ? ' past' : ''}">${d.n}</span>`).join('')}<span class="t day tot all">${g.total}</span>`
    + `<span class="totband"></span><span class="dayband" style="grid-row:${g.reps.length + 2} / span 1"></span>`;
  const grid = `<div class="card"><div class="ph"><h2>${g.upcoming ? 'Meetings next week' : 'Meetings by RPD'}</h2><span class="sub">${g.upcoming ? `${g.total} booked` : `${g.total} total · ${g.ahead} ahead`}</span></div>
${g.reps.length ? `<div class="mx" style="${cols};grid-template-rows:repeat(${g.reps.length + 2},auto)">${head}${body}${foot}</div>` : `<p class="empty">No meetings booked for ${g.upcoming ? 'next' : 'this'} week yet</p>`}</div>`;

  const sMax = Math.max(1, ...s.sources.map((x) => x.n));
  const srcId = (x) => `left:src~${x.other ? OTHER : x.name}`;
  const sources = `<div class="card"><div class="ph"><h2>Lead sources · 4 wks</h2>${btn('left:src', 'dtl', 'Details ›')}</div>
${s.sources.length ? bars(s.sources, srcId, sMax) : '<p class="empty">No leads yet</p>'}</div>`;

  const prevMon = MONTHS[Number(win.prevMonthStart.slice(5, 7)) - 1];
  const sat = s.apptSat;
  const satCard = `<div class="card"><div class="ph"><h2>Appointments sat · ${prevMon}</h2>${sat ? btn('left:sat', 'dtl', 'Details ›') : ''}</div>
${!sat ? '<p class="empty">Waiting for Zoho</p>' : sat.rows.length ? bars(sat.rows, (x) => `left:sat~${x.other ? OTHER : x.name}`, Math.max(1, ...sat.rows.map((x) => x.n))) : `<p class="empty">No appointments sat in ${prevMon}</p>`}</div>`;
  return kpis + calls + grid + sources + satCard;
}

// ---------- Sales Pipeline ----------
function pipelinePane(p, win) {
  if (!p) return waiting;
  const curM = p.months.length;
  const nd = p.newDeals;
  const prevMonth = MONTHS[Number(win.prevMonthStart.slice(5, 7)) - 1];
  const { avgStd, avgSvc } = p;
  const yr = win.today.slice(0, 4);
  const kpis = `<div class="kpis">
${nd ? btn('middle:newdeals', 'card tap', `<p class="lbl">New deals · ${MONTHS[curM - 1]}</p><p class="big">${nd.n}</p><p class="sub">${delta(nd.n, nd.prevSame, `vs ${prevMonth} 1–${nd.day}`)}<br>${nd.std} std, ${nd.svc} service</p>`)
    : '<div class="card"><p class="lbl">New deals</p><p class="big">–</p><p class="sub">waiting for Zoho</p></div>'}
${btn('middle:avg~std', 'card tap gold', `<p class="lbl">Avg deal size · ${yr}</p><p class="big" style="font-size:30px">${money(avgStd)}</p><p class="sub">Standard, ${p.ytdStdN} won<br>Service avg ${money(avgSvc)}</p>`)}
${btn('middle:mtd', 'card tap', `<p class="lbl">Won · ${MONTHS[curM - 1]} to date</p><p class="big" style="font-size:30px">${money(p.mtdAmt)}</p><p class="sub">${p.mtdN} deals<br>${p.mtdStdN} std, ${p.mtdSvcN} service</p>`)}
${btn('middle:ytd', 'card tap green', `<p class="lbl">Closed won · ${yr}</p><p class="big" style="font-size:30px">${money(p.ytdAmt)}</p><p class="sub">${p.ytdN} deals${p.prevAmt != null ? `<br>${MONTHS[curM - 2]} was ${money(p.prevAmt)}` : ''}</p>`)}
</div>
${btn('middle:avg~svc', 'card tap', `<div class="ph" style="margin:0"><h2>Service avg deal size</h2><span class="more">${money(avgSvc)} · ${p.ytdSvcN} won ›</span></div>`)}`;

  const mMax = Math.max(1, ...p.months.map((m) => m.std + m.svc));
  const tr = p.trend;
  const trend = tr ? `<p class="sub" style="margin-top:8px">Trend ${MONTHS[0]}–${MONTHS[tr.months - 1]}: <b style="color:#fff">${tr.slope >= 0 ? '+' : '−'}${money(Math.abs(tr.slope))}/mo</b> (completed months)</p>` : '';
  const monthRows = [...p.months].reverse().map((m) => {
    const tot = m.std + m.svc, mtd = m.m === curM;
    return btn(`middle:month~${m.m}`, 'tap hb', `<span class="nm"${mtd ? ' style="color:#ffdb05"' : ''}>${MONTHS[m.m - 1]}${mtd ? '*' : ''}</span><span class="bar"><span class="g" style="width:${(m.std / mMax) * 100}%"></span><span class="y" style="width:${(m.svc / mMax) * 100}%"></span></span><span class="v">${money(tot)}<small>${m.nStd + m.nSvc}</small></span>`);
  }).join('');
  const months = `<div class="card"><div class="ph"><h2>Closed-won by month</h2>${btn('middle:ytd', 'dtl', 'Details ›')}</div>
<div><span class="key"><span class="sw g"></span>Standard</span><span class="key"><span class="sw y"></span>Service (CFSS)</span></div>${monthRows}
<p class="sub" style="margin-top:6px">* month to date · small number = deals won</p>${trend}</div>`;

  return kpis + months;
}

// ---------- Operations ----------
function tile(t) {
  if (!t.wk) return `<div class="card"><p class="lbl">${esc(t.label)}</p><p class="big">–</p><p class="sub">waiting for Zoho</p></div>`;
  const cur = t.wk[3], prev = t.wk[2], mx = Math.max(1, ...t.wk);
  const sp = t.wk.map((v, i) => `<div class="${i === 3 ? 'g' : 'pw'}" style="height:${Math.max(2, Math.round((v / mx) * 26))}px"></div>`).join('');
  return btn(`right:tile~${t.key}`, 'card tap', `<p class="lbl">${esc(t.label)}</p><p class="big">${cur}</p><p class="sub">${short(delta(cur, prev, 'vs last wk'))}</p><div class="spark">${sp}</div><div class="wkn">${t.wk.map((v) => `<span>${v}</span>`).join('')}</div>`);
}

function lineChart(pr) {
  const W = 320, H = 150, x0 = 26, x1 = W - 10, y0 = 14, y1 = H - 22;
  const xs = DAYS.map((_, i) => x0 + ((x1 - x0) * i) / 6);
  const top = Math.ceil(Math.max(5, ...pr.lastCum, ...pr.thisCum) / 5) * 5;
  const y = (v) => (y1 - (v / top) * (y1 - y0)).toFixed(1);
  let grid = '';
  for (let v = 0; v <= top; v += top / 2) grid += `<line x1="${x0}" x2="${x1}" y1="${y(v)}" y2="${y(v)}" stroke="#333333"${v ? ' stroke-dasharray="3 4"' : ''}/><text x="${x0 - 6}" y="${Number(y(v)) + 4}" fill="#a1a1a1" font-size="10" text-anchor="end">${Math.round(v)}</text>`;
  const pts = (arr) => arr.map((v, i) => `${xs[i].toFixed(1)},${y(v)}`).join(' ');
  const upto = pr.thisCum.slice(0, pr.todayIdx + 1);
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block" font-family="Inter,Verdana,sans-serif" role="img" aria-label="Projects created this week versus last week">${grid}
<polyline points="${pts(pr.lastCum)}" fill="none" stroke="#eaeaea" stroke-width="1.5" stroke-dasharray="5 4"/>
<polyline points="${pts(upto)}" fill="none" stroke="#71a62b" stroke-width="3" stroke-linejoin="round"/>
${upto.map((v, i) => `<circle cx="${xs[i].toFixed(1)}" cy="${y(v)}" r="4" fill="#71a62b"/>`).join('')}
${upto.length ? `<text x="${xs[upto.length - 1].toFixed(1)}" y="${Number(y(upto[upto.length - 1])) - 9}" fill="#fff" font-size="12" font-weight="700" text-anchor="middle">${upto[upto.length - 1]}</text>` : ''}
${DAYS.map((d, i) => `<text x="${xs[i].toFixed(1)}" y="${H - 4}" fill="#a1a1a1" font-size="10" text-anchor="middle">${d}</text>`).join('')}</svg>`;
}

// Permits and tickets as one card each, like the TV: this week's in/out counts (tap for the
// records) and the same 4-week running-total chart.
function flowCard(title, a, b, win) {
  if (!a.wk || !b.wk) return `<div class="card flow"><p class="lbl">${esc(title)}</p><p class="big">–</p><p class="sub">waiting for Zoho</p></div>`;
  const m = (t, color) => btn(`right:tile~${t.key}`, 'tap fmr', `<span class="n" style="color:${color}">${t.wk[3]}</span><span class="t"><b style="color:${color}">${esc(t.short)}</b><span>${short(delta(t.wk[3], t.wk[2], 'vs last wk'))}</span></span>`);
  return `<div class="card flow"><div class="ph"><h2>${esc(title)}</h2></div>
<div class="fms">${m(a, FLOW_IN)}${m(b, FLOW_OUT)}</div>${flowChart(a, b, win, 340)}</div>`;
}

function opsPane(o, win) {
  const by = (k) => o.tiles.find((t) => t.key === k);
  const pre = ['projects', 'design'].map(by), inst = o.tiles.filter((t) => t.group === 'install');
  const permits = flowCard('Permits', { ...by('permitApp'), short: 'Submitted' }, { ...by('permitOk'), short: 'Received' }, win);
  const tickets = flowCard('Tickets', { ...by('ticketsIn'), short: 'Incoming' }, { ...by('ticketsClosed'), short: 'Closed' }, win);
  const tiles = `<div class="tiles"><p class="grp"><i style="background:#71a62b"></i>Pre-construction</p>${pre.map(tile).join('')}${permits}
<p class="grp"><i style="background:#ffdb05"></i>Installs completed</p>${inst.map(tile).join('')}
<p class="grp"><i style="background:#f49c20"></i>Service tickets</p>${tickets}</div>`;
  const pr = o.projects;
  const line = pr ? btn('right:tile~projects', 'card tap', `<div class="ph"><h2>Projects created · running total</h2></div>
<div><span class="key"><span class="sw g"></span>This week</span><span class="key"><span style="width:14px;border-top:2px dashed #eaeaea;display:inline-block"></span>Last week (${pr.lastCum[6]})</span></div>${lineChart(pr)}`) : '';
  const gMax = pr ? Math.max(1, ...pr.groups.map((g) => g.n)) : 1;
  const types = pr ? `<div class="card"><div class="ph"><h2>New projects by type</h2>${btn('right:group', 'dtl', 'Details ›')}</div>
${pr.groups.length ? pr.groups.slice(0, 8).map((g) => btn(`right:group~${g.name}`, 'tap hb', `<span class="nm">${esc(g.name)}</span><span class="bar"><span class="g" style="width:${pct(g.n, gMax)}"></span></span><span class="v">${g.n}</span>`)).join('') : '<p class="empty">No projects yet</p>'}</div>` : waiting;
  const totals = `<div class="card"><div class="ph"><h2>4-week totals</h2><span class="sub">${md(win.weeks[0])} – ${md(addDays(win.ws, 6))}</span></div>
${o.tiles.map((t) => btn(`right:tile4~${t.key}`, 'tap row', `<span>${esc(t.label)}</span><b>${t.wk ? sum(t.wk) : '–'}<i>›</i></b>`)).join('')}</div>`;
  return tiles + line + types + totals;
}

function panes(metrics) {
  if (!metrics) return TABS.map(([k]) => `<section class="pane" id="p-${k}">${waiting}</section>`).join('');
  const body = { left: salesPane(metrics.sales, metrics.win), middle: pipelinePane(metrics.pipeline, metrics.win), right: opsPane(metrics.ops, metrics.win) };
  return TABS.map(([k]) => `<section class="pane" id="p-${k}" aria-label="${esc(BOARDS[k].title)}">${body[k]}<p class="hint">Tap any number for the records behind it</p></section>`).join('');
}

const CLIENT_JS = `
(function(){
  var strip=document.getElementById('strip'),tabs=[].slice.call(document.querySelectorAll('.tabs button')),ind=document.querySelector('.ind');
  var names=['left','middle','right'],cur=-1,loadedAt=Date.now();
  var sheet=document.getElementById('sheet'),shb=document.getElementById('shb'),sht=document.getElementById('sht');
  function idx(){return Math.round(strip.scrollLeft/Math.max(1,strip.clientWidth));}
  function onScroll(){
    var f=strip.scrollLeft/Math.max(1,strip.clientWidth);
    ind.style.transform='translateX('+(f*100)+'%)';
    var i=Math.max(0,Math.min(2,Math.round(f)));
    if(i!==cur){cur=i;tabs.forEach(function(t,j){t.setAttribute('aria-selected',j===i?'true':'false');});
      if(!sheet.classList.contains('open'))history.replaceState(null,'','#'+names[i]);
      document.getElementById('st').innerHTML=document.getElementById('st-'+names[i]).innerHTML;}
  }
  function go(i,smooth){strip.scrollTo({left:i*strip.clientWidth,behavior:smooth?'smooth':'auto'});}
  strip.addEventListener('scroll',onScroll,{passive:true});
  tabs.forEach(function(t,i){t.addEventListener('click',function(){go(i,true);});});
  addEventListener('resize',function(){go(cur<0?0:cur,false);});
  var start=names.indexOf(location.hash.replace('#','').split('/')[0]);go(start<0?0:start,false);onScroll();

  function openDrill(id){
    sht.textContent='Loading…';shb.innerHTML='';
    sheet.classList.add('open');sheet.setAttribute('aria-hidden','false');
    if(!history.state||!history.state.sheet)history.pushState({sheet:id},'',location.hash.split('/')[0]+'/detail');
    fetch('/m/d?id='+encodeURIComponent(id),{cache:'no-store',credentials:'same-origin'}).then(function(r){
      if(r.status===401){location.href='/m';throw 0;}if(!r.ok)throw new Error(r.status);return r.text();
    }).then(function(html){shb.innerHTML=html;var h=shb.querySelector('[data-title]');sht.textContent=h?h.getAttribute('data-title'):'';shb.scrollTop=0;})
      .catch(function(e){if(e!==0){sht.textContent='Couldn\\u2019t load';shb.innerHTML='<p class="empty">Check your connection and try again.</p>';}});
  }
  function closeDrill(){sheet.classList.remove('open');sheet.setAttribute('aria-hidden','true');}
  // FLARE: pick an emoji, it plays on all three TVs. The phone only shows a "sent" notice; the
  // flare itself plays on the TVs.
  var fab=document.getElementById('fab'),pk=document.getElementById('picker'),toastEl=document.getElementById('toast'),titles=TITLES;
  function toast(t,sub,emoji){
    toastEl.textContent='';
    if(emoji){var ic;if(FLARE_PICS[emoji]){ic=document.createElement('img');ic.src=FLARE_PICS[emoji];ic.alt='';}else{ic=document.createElement('i');ic.textContent=emoji;}toastEl.appendChild(ic);}
    var tx=document.createElement('span'),b=document.createElement('b');b.textContent=t;tx.appendChild(b);
    if(sub){var sm=document.createElement('small');sm.textContent=sub;tx.appendChild(sm);}
    toastEl.appendChild(tx);toastEl.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(function(){toastEl.classList.remove('show');},emoji?3000:2400);
  }
  function setPicker(open){
    pk.classList.toggle('open',open);fab.setAttribute('aria-expanded',open?'true':'false');
    if(open)document.getElementById('pk-to').textContent='Send it to all three TVs';
  }
  fab.addEventListener('click',function(e){e.stopPropagation();setPicker(!pk.classList.contains('open'));});
  function sendFlare(emoji){
    var i=Math.max(0,cur);setPicker(false);
    fetch('/m/flare',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({board:names[i],emoji:emoji})})
      .then(function(r){
        if(r.status===401){location.reload();return;}
        return r.json().then(function(j){
          if(r.ok)toast('Flare sent','across all three TVs',emoji);
          else toast(j&&j.error?j.error:'Couldn’t send');
        });
      }).catch(function(){toast('Couldn’t send. Check your connection.');});
  }
  document.addEventListener('click',function(e){
    var fl=e.target.closest('[data-flare]');if(fl){sendFlare(fl.getAttribute('data-flare'));return;}
    if(pk.classList.contains('open')&&!e.target.closest('#picker')){setPicker(false);return;}
    var b=e.target.closest('[data-d]');if(b){e.preventDefault();openDrill(b.getAttribute('data-d'));return;}
    var s=e.target.closest('[data-sort]');if(s){sortRecs(s.getAttribute('data-sort'));}
  });
  document.getElementById('close').addEventListener('click',function(){if(history.state&&history.state.sheet)history.back();else closeDrill();});
  addEventListener('popstate',function(){if(!(history.state&&history.state.sheet))closeDrill();});
  function sortRecs(k){
    var ul=shb.querySelector('.recs');if(!ul)return;
    var li=[].slice.call(ul.children);li.sort(function(a,b){return Number(b.getAttribute('data-'+k))-Number(a.getAttribute('data-'+k));});
    li.forEach(function(x){ul.appendChild(x);});
    [].forEach.call(shb.querySelectorAll('[data-sort]'),function(x){x.setAttribute('aria-pressed',x.getAttribute('data-sort')===k?'true':'false');});
  }
  // Coming back to the page later: swap in fresh numbers, keeping each screen's scroll position.
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState!=='visible'||Date.now()-loadedAt<POLL_MS)return;
    fetch('/m?fragment=1',{cache:'no-store',credentials:'same-origin'}).then(function(r){if(r.status===401){location.reload();throw 0;}if(!r.ok)throw 0;return r.text();})
      .then(function(html){
        var tops=[].map.call(strip.children,function(p){return p.scrollTop;}),left=strip.scrollLeft;
        var t=document.createElement('div');t.innerHTML=html;
        strip.innerHTML=t.querySelector('#strip-in').innerHTML;document.getElementById('stats').innerHTML=t.querySelector('#stats-in').innerHTML;
        [].forEach.call(strip.children,function(p,i){p.scrollTop=tops[i]||0;});strip.scrollLeft=left;cur=-1;onScroll();loadedAt=Date.now();
      }).catch(function(){});
  });
})();`;

function stats() {
  // The header corner is left empty: no update time or delay notice on the phone.
  return TABS.map(([k]) => `<template id="st-${k}"></template>`).join('');
}

const emoBtn = (e) => `<button type="button" role="menuitem" data-flare="${e}" aria-label="Send ${e}">${e}</button>`;

function renderMobile(metrics, sources, pollMs, { fragment = false } = {}) {
  if (fragment) return `<div id="strip-in">${panes(metrics)}</div><div id="stats-in">${stats()}</div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#141414"><title>CFES KPIs</title>${FONTS}${flare.FONT_LINK}<style>${CSS}</style></head><body>
<header class="top"><div class="brand"><img src="/logo.png" alt="CFES"><p id="st"></p></div>
<nav class="tabs" role="tablist">${TABS.map(([k, t]) => `<button type="button" role="tab" aria-controls="p-${k}" aria-selected="false">${t}</button>`).join('')}<span class="ind"></span></nav></header>
<main id="strip">${panes(metrics)}</main><div id="stats" hidden>${stats()}</div>
<div id="sheet" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="sht"><div class="shh"><button type="button" id="close" aria-label="Back">‹&nbsp;Back</button><h2 id="sht"></h2></div><div id="shb"></div></div>
<button type="button" class="fab" id="fab" aria-haspopup="true" aria-expanded="false" aria-controls="picker">FLARE</button>
<div class="picker" id="picker" role="menu"><p id="pk-to"></p><div class="emo">${flare.EMOJI.map(emoBtn).join('')}${Object.entries(flare.CUSTOM).map(([k, v]) => `<button type="button" role="menuitem" data-flare="${k}" aria-label="Send ${esc(v.label)}"><img src="${v.src}" alt=""></button>`).join('')}</div>${flare.seasonal().map((x) => `<h3>${esc(x.name)}</h3><div class="emo">${x.emoji.map(emoBtn).join('')}</div>`).join('')}</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>var FLARE_PICS=${JSON.stringify(flare.IMG_SRC)};${CLIENT_JS.replace('POLL_MS', String(pollMs)).replace('TITLES', JSON.stringify(TABS.map(([k]) => BOARDS[k].title)))}</script></body></html>`;
}

const MAX_RECS = 500;
function renderDrill(d) {
  if (!d) return '<div data-title="Not found"><p class="empty">That breakdown isn’t available.</p></div>';
  const hasAmt = d.records.some((r) => r.amount);
  const groups = d.groups.map((g) => {
    const mx = Math.max(1, ...g.rows.map((r) => r.n));
    return `<div class="card gr"><h3>${esc(g.label)}</h3>${g.rows.map((r) => `<div class="hb" style="padding:5px 0"><span class="nm">${esc(r.name)}</span><span class="bar"><span class="g" style="width:${pct(r.n, mx)}"></span></span><span class="v">${r.n}${hasAmt && r.amt ? `<small>${money(r.amt)}</small>` : ''}</span></div>`).join('')}</div>`;
  }).join('');
  const shown = d.records.slice(0, MAX_RECS);
  const recs = shown.map((r, i) => {
    const inner = `<span class="tx"><div class="nm">${esc(r.name)}</div><div class="sb">${esc(r.sub || '')}</div></span><span class="rt">${r.amount ? `<b>${money(r.amount)}</b>${esc(r.day || '')}` : `<b>${esc(r.day || '')}</b>${esc(r.time || '')}`}</span>${r.href ? '<span class="chev">›</span>' : ''}`;
    return `<li data-date="${sortKey(r.t)}" data-amount="${Number(r.amount) || 0}" data-i="${shown.length - i}">${r.href ? `<a href="${esc(r.href)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : `<div class="rc">${inner}</div>`}</li>`;
  }).join('');
  const sort = hasAmt ? `<div class="sort"><button type="button" data-sort="amount" aria-pressed="${d.byAmount}">Largest</button><button type="button" data-sort="date" aria-pressed="${!d.byAmount}">Newest</button></div>` : '';
  return `<div data-title="${esc(d.title)}" hidden></div>
<div class="sum"><b>${esc(d.total)}</b>${d.amount ? `<span>${esc(d.amount)}</span>` : ''}</div>
${d.explain ? `<div class="card exp"><h3>What this shows</h3><p>${esc(d.explain)}</p></div>` : ''}
${groups}
<div class="card"><div class="ph"><h2>Records</h2><span class="sub">${d.records.length > MAX_RECS ? `first ${MAX_RECS} of ${d.records.length}` : ''}</span></div>${sort}
${shown.length ? `<ul class="recs">${recs}</ul>` : '<p class="empty">Nothing in this group</p>'}</div>`;
}

function renderSignIn(message = 'Scan the QR code on any office monitor to open the phone view.') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#141414"><title>CFES KPIs</title>${FONTS}<style>${CSS}</style></head><body>
<div class="login"><img src="/logo.png" alt="CFES"><h1>Sign in with the office QR code</h1><p>${esc(message)}</p><p>Sign-ins end at midnight, so scan again each day.</p></div></body></html>`;
}

module.exports = { renderMobile, renderDrill, renderSignIn };
