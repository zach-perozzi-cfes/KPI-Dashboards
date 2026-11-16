'use strict';
// Formatting helpers shared by the TV boards (render.js) and the phone view (mobile.js).

const { addDays } = require('./metrics');

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

module.exports = { MONTHS, DAYS, esc, sum, md, dnum, weekLabel, money, delta, avg, fmtAvg, timeFmt, dayTimeFmt };
