'use strict';
// Phone sign-in: scan the QR code on an office monitor, stay signed in until midnight Eastern.
// Stateless: the QR token and the session cookie are both HMACs of today's New York date,
// so they change on their own every day and survive server restarts.

const crypto = require('crypto');
const { nyDate, addDays } = require('./metrics');

const COOKIE = 'cfes_m';

function makeSession(secret, nowFn = () => new Date()) {
  const mac = (msg, len) => crypto.createHmac('sha256', secret).update(msg).digest('base64url').slice(0, len);
  const eq = (a, b) => { const A = Buffer.from(String(a)), B = Buffer.from(String(b)); return A.length === B.length && crypto.timingSafeEqual(A, B); };
  const today = () => nyDate(nowFn().toISOString());
  const qrHex = () => crypto.createHmac('sha256', secret).update(`qr:${today()}`).digest('hex').slice(0, 16).toUpperCase();

  // Midnight Eastern at the end of `ds`, as a Date (handles EST/EDT).
  function endOfDay(ds) {
    const next = addDays(ds, 1);
    for (const off of ['-05:00', '-04:00']) {
      const t = new Date(`${next}T00:00:00${off}`);
      if (nyDate(t.toISOString()) === next && nyDate(new Date(t - 1).toISOString()) === ds) return t;
    }
    return new Date(`${next}T05:00:00Z`);
  }

  return {
    // The token in today's QR codes: 16 upper-case hex characters (64 bits, new every day), so the
    // whole link fits the QR alphanumeric mode and the TV code stays small.
    qrToken: () => qrHex(),
    tokenOk: (t) => Boolean(t) && eq(String(t).toUpperCase(), qrHex()),
    // Set-Cookie value for a session that ends at midnight Eastern tonight.
    cookie(secure) {
      const d = today();
      return `${COOKIE}=${d}.${mac(`session:${d}`, 32)}; Path=/m; HttpOnly; SameSite=Lax; Expires=${endOfDay(d).toUTCString()}${secure ? '; Secure' : ''}`;
    },
    clearCookie: () => `${COOKIE}=; Path=/m; HttpOnly; SameSite=Lax; Max-Age=0`,
    // A cookie only counts on the day it was issued, even if the browser keeps it longer.
    signedIn(req) {
      const raw = String(req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
      if (!raw) return false;
      const [d, sig] = raw.slice(COOKIE.length + 1).split('.');
      return d === today() && Boolean(sig) && eq(sig, mac(`session:${d}`, 32));
    },
    endOfDay: () => endOfDay(today()),
  };
}

module.exports = { makeSession };
