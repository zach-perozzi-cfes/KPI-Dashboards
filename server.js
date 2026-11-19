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
const { buildDrill } = require('./src/drill');
const { renderMobile, renderDrill, renderSignIn } = require('./src/mobile');
const { makeSession, safeEqual } = require('./src/session');
const { qrSvg } = require('./src/qr');
const flare = require('./src/flare');

const PORT = Number(process.env.PORT || 10000);
const POLL_MS = Math.max(60, Number(process.env.POLL_SECONDS || 300)) * 1000;
const DASH_KEY = process.env.DASH_KEY || '';
const DASH_USER = process.env.DASH_USER || '';
const DASH_PASS = process.env.DASH_PASS || '';
const ALLOWED_IPS = (process.env.ALLOWED_IPS || '').split(',').map((s) => s.trim()).filter(Boolean);
const FIXTURE = process.env.DEMO_FIXTURE || ''; // local testing only
const LOGO = fs.readFileSync(path.join(__dirname, 'public', 'logo.png'));
// Picture flares (public/flare/*.png), read once at startup.
const FLARE_PNGS = Object.fromEntries(flare.FILES.map((f) => [f, fs.readFileSync(path.join(__dirname, 'public', f))]));
// Phone view: signing in = scanning the QR code on a TV board; the session ends at midnight Eastern.
// In fixture mode a throwaway secret is made up so it works locally.
const MOBILE_SECRET = process.env.MOBILE_SECRET || (FIXTURE ? crypto.randomBytes(32).toString('hex') : '');
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const nowFn = () => (FIXTURE && process.env.DEMO_NOW ? new Date(process.env.DEMO_NOW) : new Date());
const session = MOBILE_SECRET ? makeSession(MOBILE_SECRET, nowFn) : null;

let sources = {};
let metrics = null;
let running = false;

// If a pull partly fails, retry a few times instead of waiting hours for the next slot.
const RETRY_MS = Math.max(5, Number(process.env.RETRY_MINUTES || 15)) * 60_000;
const MAX_RETRIES = 4;
let retryTimer = null;
let retriesLeft = MAX_RETRIES;

async function refresh({ scheduled = true } = {}) {
  if (running) return;
  running = true;
  if (scheduled) { retriesLeft = MAX_RETRIES; clearTimeout(retryTimer); retryTimer = null; }
  try {
    if (FIXTURE) {
      sources = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
      metrics = computeAll(sources, nowFn());
      return;
    }
    sources = await loadAll(windowFor(new Date()), sources);
    metrics = computeAll(sources, new Date());
    const failed = Object.entries(sources).filter(([, v]) => v.error).map(([k]) => k);
    if (!failed.length) {
      console.log(`[refresh] ${new Date().toISOString()} ok, all sources pulled`);
    } else if (retriesLeft > 0) {
      retriesLeft--;
      retryTimer = setTimeout(() => refresh({ scheduled: false }), RETRY_MS);
      console.log(`[refresh] ${new Date().toISOString()} failed: ${failed.join(', ')}; retrying in ${RETRY_MS / 60_000} min (${retriesLeft} retries left)`);
    } else {
      console.log(`[refresh] ${new Date().toISOString()} failed: ${failed.join(', ')}; no retries left, waiting for the next scheduled pull`);
    }
  } catch (e) {
    console.error('[refresh] error:', e.message || e);
  } finally {
    running = false;
  }
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

function baseUrl(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'http';
  return `${proto}://${req.headers.host}`;
}

// Each board's QR opens the phone view on that board's screen: /M/I/<L|M|R><today's token>.
// All upper case so the QR can use its compact alphanumeric mode (the host is case-insensitive
// and /m/i/ links are matched case-insensitively), error correction L, 1.6 screen pixels per module.
const QR_SCREEN = { l: 'left', m: 'middle', r: 'right' };
const signInUrl = (req, board) => `${baseUrl(req)}/M/I/${board[0]}${session.qrToken()}`.toUpperCase();
const qrCache = new Map(); // url -> svg; the url changes at midnight
function boardQr(req, board) {
  if (!session) return '';
  const url = signInUrl(req, board);
  if (!qrCache.has(url)) {
    if (qrCache.size > 30) qrCache.clear();
    // Inverted code: CFES orange modules on the card's near-black (about 8:1 contrast). The border
    // matches the card, so only the ~46px pattern shows, inside a green border. iPhone Camera and Google Lens read inverted codes.
    qrCache.set(url, qrSvg(url, { level: 'L', scale: 3, quiet: 4, dark: '#ffffff', light: '#1a1a1a', label: 'Scan to open this screen on your phone' }));
  }
  return qrCache.get(url);
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

  if (req.method === 'POST' && url.pathname === '/m/flare') return postFlare(req, res, send);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain', 'Method not allowed');
  if (url.pathname === '/healthz') return send(200, 'text/plain', 'ok');
  if (url.pathname === '/logo.png') return send(200, 'image/png', LOGO, { 'Cache-Control': 'public, max-age=86400' });
  if (url.pathname === '/favicon.ico') return send(204, 'text/plain', '');
  if (FLARE_PNGS[url.pathname]) return send(200, 'image/png', FLARE_PNGS[url.pathname], { 'Cache-Control': 'public, max-age=86400' });

  // ---- Phone view (/m...). Its own sign-in: the TV key and ALLOWED_IPS don't apply. ----
  const lowerPath = url.pathname.toLowerCase();
  if (lowerPath === '/m' || lowerPath.startsWith('/m/i/') || url.pathname.startsWith('/m/')) return mobile(req, res, url, send);

  if (!authorized(req, url)) {
    const extra = DASH_USER ? { 'WWW-Authenticate': 'Basic realm="CFES monitors"' } : {};
    return send(401, 'text/plain', 'Unauthorized', extra);
  }

  const board = url.pathname.replace(/^\/+|\/+$/g, '') || 'index';
  if (BOARDS[board]) {
    // The TV page checks for new phone flares every few seconds (JSON, never calls Zoho).
    if (url.searchParams.has('flares')) return send(200, 'application/json', JSON.stringify(flare.since(board, Number(url.searchParams.get('flares')) || 0)));
    const opts = { qr: boardQr(req, board), flareSince: session ? flare.latest() : null };
    if (url.searchParams.get('fragment') === '1') return send(200, 'text/html; charset=utf-8', renderBoard(board, metrics, sources, opts));
    return send(200, 'text/html; charset=utf-8', renderPage(board, metrics, sources, POLL_MS, opts));
  }
  if (board === 'status') {
    const status = Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, { fetchedAt: v.fetchedAt, rows: v.data ? v.data.length : null, error: v.error }]));
    return send(200, 'application/json', JSON.stringify({ now: new Date().toISOString(), status }, null, 2));
  }
  if (board === 'index') {
    const q = url.search ? url.search : '';
    return send(200, 'text/html; charset=utf-8', `<!doctype html><meta charset="utf-8"><title>CFES monitors</title><body style="font-family:Verdana;background:#141414;color:#fff;padding:40px"><h1>CFES office monitors</h1><ul>${Object.entries(BOARDS).map(([k, b]) => `<li><a style="color:#71a62b" href="/${k}${q}">${b.title}</a></li>`).join('')}</ul></body>`);
  }
  return send(404, 'text/plain', 'Not found');
});

// Phone sends a flare: {"board":"left","emoji":"🔥"}. Signed-in phones only; the session cookie is
// SameSite=Lax, so another site can't post one on someone's behalf.
function postFlare(req, res, send) {
  const json = (code, obj) => send(code, 'application/json', JSON.stringify(obj));
  if (!session || !session.signedIn(req)) return json(401, { error: 'Signed out' });
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (c) => { body += c; if (body.length > 512) req.destroy(); });
  req.on('end', () => {
    let msg;
    try { msg = JSON.parse(body); } catch { return json(400, { error: 'Bad request' }); }
    if (!msg || !BOARDS[msg.board]) return json(400, { error: 'Unknown screen' });
    const err = flare.add(msg.board, String(msg.emoji || ''), clientIp(req));
    if (err) return json(err === 'Unknown emoji' ? 400 : 429, { error: err });
    return json(200, { ok: true });
  });
}

function mobile(req, res, url, send) {
  const html = 'text/html; charset=utf-8';
  const p = url.pathname.replace(/\/+$/, '') || '/m';
  // Printable copy of today's code, for the TV-key holder only.
  if (p === '/m/qr') {
    if (!authorized(req, url)) return send(401, 'text/plain', 'Unauthorized', DASH_USER ? { 'WWW-Authenticate': 'Basic realm="CFES monitors"' } : {});
    if (!session) return send(503, 'text/plain', 'Phone view is not set up (MOBILE_SECRET)');
    const codes = Object.keys(BOARDS).map((b) => `<figure style="display:inline-block;margin:16px">${qrSvg(signInUrl(req, b), { px: 240 })}<figcaption>${BOARDS[b].title}</figcaption></figure>`).join('');
    return send(200, html, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CFES phone view QR</title><body style="font-family:Verdana;text-align:center;padding:40px"><h1>CFES phone view</h1>${codes}<p>Each code opens that screen. Good until midnight tonight (Eastern); a new set is made every day.</p></body>`);
  }
  if (!session) return send(503, 'text/plain', 'Phone view is not set up (MOBILE_SECRET)');
  // Scanned a board's QR: sign in (or refresh the sign-in) and open that board's screen.
  if (p.toLowerCase().startsWith('/m/i/')) {
    const code = p.slice(5), screen = QR_SCREEN[code[0].toLowerCase()];
    if (!screen || !session.tokenOk(code.slice(1))) return send(403, html, renderSignIn('That QR code has expired. Scan the code on an office monitor again.'));
    const secure = baseUrl(req).startsWith('https:');
    return send(303, 'text/plain', 'Signed in', { Location: `/m#${screen}`, 'Set-Cookie': session.cookie(secure) });
  }
  if (!session.signedIn(req)) {
    if (p === '/m' && url.searchParams.get('fragment') !== '1') return send(200, html, renderSignIn());
    return send(401, 'text/plain', 'Signed out');
  }
  if (p === '/m') {
    const fragment = url.searchParams.get('fragment') === '1';
    return send(200, html, renderMobile(metrics, sources, POLL_MS, { fragment }));
  }
  if (p === '/m/d') {
    const id = String(url.searchParams.get('id') || '').slice(0, 300);
    return send(200, html, renderDrill(metrics ? buildDrill(id, sources, metrics.win) : null));
  }
  return send(404, 'text/plain', 'Not found');
}

// Zoho is pulled once at startup, then only at the scheduled times (default 7:00, 12:00, 16:00 ET).
// The boards poll this server's cache, which never calls Zoho.
let lastSlotKey = null;
function tick() {
  const d = new Date();
  const hm = nowHM(d);
  const today = nyDate(d.toISOString());
  const key = `${today} ${hm}`;
  if (SLOTS.includes(hm) && key !== lastSlotKey) {
    lastSlotKey = key;
    refresh();
    return;
  }
  // Past midnight, re-run the numbers on the cached data so "today" (and the week) moves
  // without waiting for the morning pull.
  if (metrics && metrics.win && metrics.win.today !== today && !running) metrics = computeAll(sources, d);
}

server.listen(PORT, () => {
  console.log(`[cfes-monitors] listening on :${PORT}${FIXTURE ? ' (fixture mode)' : ''}; Zoho pulls at ${SLOTS.map(slotLabel).join(', ')} ET`);
  if (!FIXTURE && !DASH_KEY && !(DASH_USER && DASH_PASS)) console.warn('[cfes-monitors] no DASH_KEY or DASH_USER/DASH_PASS set: every board request will be refused');
  refresh();
  if (FIXTURE) setInterval(refresh, 60_000);
  else setInterval(tick, 20_000);
});
