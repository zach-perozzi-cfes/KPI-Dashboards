'use strict';
// CFES office monitors: three live KPI boards for Yodeck players, fed by Zoho CRM + Projects.
// Zero dependencies (Node 20+).

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadAll } = require('./src/zoho');
const { computeAll, windowFor, nyDate } = require('./src/metrics');
const { BOARDS, renderPage, renderBoard } = require('./src/render');
const { SLOTS, nowHM, slotLabel } = require('./src/schedule');

const PORT = Number(process.env.PORT || 10000);
const POLL_MS = Math.max(60, Number(process.env.POLL_SECONDS || 300)) * 1000;
const DASH_KEY = process.env.DASH_KEY || '';
const DASH_USER = process.env.DASH_USER || '';
const DASH_PASS = process.env.DASH_PASS || '';
const ALLOWED_IPS = (process.env.ALLOWED_IPS || '').split(',').map((s) => s.trim()).filter(Boolean);
const FIXTURE = process.env.DEMO_FIXTURE || ''; // local testing only
const LOGO = fs.readFileSync(path.join(__dirname, 'public', 'logo.png'));

let sources = {};
let metrics = null;

async function refresh() {
  try {
    if (FIXTURE) {
      sources = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
      const now = process.env.DEMO_NOW ? new Date(process.env.DEMO_NOW) : new Date();
      metrics = computeAll(sources, now);
      return;
    }
    sources = await loadAll(windowFor(new Date()), sources);
    metrics = computeAll(sources, new Date());
    const failed = Object.entries(sources).filter(([, v]) => v.error).map(([k]) => k);
    console.log(`[refresh] ${new Date().toISOString()} ok${failed.length ? `, failed: ${failed.join(', ')}` : ''}`);
  } catch (e) {
    console.error('[refresh] error:', e.message || e);
  }
}

function safeEqual(a, b) {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? String(fwd).split(',')[0] : req.socket.remoteAddress || '').trim();
}

// Fail closed: with no key and no basic-auth pair configured, nothing is served (except /healthz).
function authorized(req, url) {
  if (ALLOWED_IPS.length && !ALLOWED_IPS.includes(clientIp(req))) return false;
  if (FIXTURE && !DASH_KEY && !DASH_USER) return true;
  const key = url.searchParams.get('key');
  if (DASH_KEY && key && safeEqual(key, DASH_KEY)) return true;
  const h = req.headers.authorization || '';
  if (DASH_USER && DASH_PASS && h.startsWith('Basic ')) {
    const [u, ...rest] = Buffer.from(h.slice(6), 'base64').toString('utf8').split(':');
    if (safeEqual(u, DASH_USER) && safeEqual(rest.join(':'), DASH_PASS)) return true;
  }
  return false;
}

const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://local');
  const send = (code, type, body, extra = {}) => { res.writeHead(code, { ...BASE_HEADERS, 'Content-Type': type, ...extra }); res.end(body); };

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain', 'Method not allowed');
  if (url.pathname === '/healthz') return send(200, 'text/plain', 'ok');
  if (url.pathname === '/logo.png') return send(200, 'image/png', LOGO, { 'Cache-Control': 'public, max-age=86400' });
  if (url.pathname === '/favicon.ico') return send(204, 'text/plain', '');

  if (!authorized(req, url)) {
    const extra = DASH_USER ? { 'WWW-Authenticate': 'Basic realm="CFES monitors"' } : {};
    return send(401, 'text/plain', 'Unauthorized', extra);
  }

  const board = url.pathname.replace(/^\/+|\/+$/g, '') || 'index';
  if (BOARDS[board]) {
    if (url.searchParams.get('fragment') === '1') return send(200, 'text/html; charset=utf-8', renderBoard(board, metrics, sources));
    return send(200, 'text/html; charset=utf-8', renderPage(board, metrics, sources, POLL_MS));
  }
  if (board === 'status') {
    const status = Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, { fetchedAt: v.fetchedAt, rows: v.data ? v.data.length : null, error: v.error }]));
    return send(200, 'application/json', JSON.stringify({ now: new Date().toISOString(), status }, null, 2));
  }
  if (board === 'index') {
    const q = url.search ? url.search : '';
    return send(200, 'text/html; charset=utf-8', `<!doctype html><meta charset="utf-8"><title>CFES monitors</title><body style="font-family:Verdana;background:#161617;color:#fff;padding:40px"><h1>CFES office monitors</h1><ul>${Object.entries(BOARDS).map(([k, b]) => `<li><a style="color:#71a62b" href="/${k}${q}">${b.title}</a></li>`).join('')}</ul></body>`);
  }
  return send(404, 'text/plain', 'Not found');
});

// Zoho is pulled once at startup, then only at the scheduled times (default 7:00, 12:00, 16:00 ET).
// The boards poll this server's cache, which never calls Zoho.
let lastSlotKey = null;
function tick() {
  const d = new Date();
  const hm = nowHM(d);
  const key = `${nyDate(d.toISOString())} ${hm}`;
  if (SLOTS.includes(hm) && key !== lastSlotKey) {
    lastSlotKey = key;
    refresh();
  }
}

server.listen(PORT, () => {
  console.log(`[cfes-monitors] listening on :${PORT}${FIXTURE ? ' (fixture mode)' : ''}; Zoho pulls at ${SLOTS.map(slotLabel).join(', ')} ET`);
  if (!FIXTURE && !DASH_KEY && !(DASH_USER && DASH_PASS)) console.warn('[cfes-monitors] no DASH_KEY or DASH_USER/DASH_PASS set: every board request will be refused');
  refresh();
  if (FIXTURE) setInterval(refresh, 60_000);
  else setInterval(tick, 20_000);
});
