'use strict';
// Minimal QR code encoder (byte mode, versions 1-10, error correction L or M) that draws an SVG.
// Written here to keep the server dependency-free. Follows ISO/IEC 18004, after the
// structure of Project Nayuki's public QR Code generator (MIT).

const ECL = { L: { ord: 0, fmt: 1 }, M: { ord: 1, fmt: 0 } };
// Index = version (1-10). Row 0 = L, row 1 = M.
const ECC_PER_BLOCK = [[-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18], [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26]];
const NUM_BLOCKS = [[-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4], [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5]];

function rawModules(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}
const dataCodewords = (ver, ord) => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ord][ver] * NUM_BLOCKS[ord][ver];

function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z & 0xff;
}
function rsDivisor(degree) {
  const r = new Array(degree).fill(0);
  r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
    root = gfMul(root, 0x02);
  }
  return r;
}
function rsRemainder(data, div) {
  const r = div.map(() => 0);
  for (const b of data) {
    const f = b ^ r.shift();
    r.push(0);
    div.forEach((c, i) => { r[i] ^= gfMul(c, f); });
  }
  return r;
}
const bit = (x, i) => ((x >>> i) & 1) !== 0;

// Alphanumeric mode (digits, A-Z, space and $%*+-./:) packs 5.5 bits a character instead of 8,
// so an upper-case URL makes a noticeably smaller code.
const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

function encode(text, level = 'M') {
  const e = ECL[level];
  const str = String(text);
  const alnum = [...str].every((c) => ALNUM.includes(c));
  const data = alnum ? [...str].map((c) => ALNUM.indexOf(c)) : [...Buffer.from(str, 'utf8')];
  const countBits = (ver) => (alnum ? (ver < 10 ? 9 : 11) : (ver < 10 ? 8 : 16));
  const dataBits = alnum ? Math.floor(data.length / 2) * 11 + (data.length % 2) * 6 : data.length * 8;
  let ver = 1;
  for (; ver <= 10; ver++) if (4 + countBits(ver) + dataBits <= dataCodewords(ver, e.ord) * 8) break;
  if (ver > 10) throw new Error('QR text too long');
  const cap = dataCodewords(ver, e.ord) * 8;

  const bb = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bb.push((v >>> i) & 1); };
  if (alnum) {
    put(2, 4); put(data.length, countBits(ver));
    for (let i = 0; i + 1 < data.length; i += 2) put(data[i] * 45 + data[i + 1], 11);
    if (data.length % 2) put(data[data.length - 1], 6);
  } else {
    put(4, 4); put(data.length, countBits(ver)); for (const b of data) put(b, 8);
  }
  put(0, Math.min(4, cap - bb.length)); put(0, (8 - (bb.length % 8)) % 8);
  for (let pad = 0xec; bb.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const bytes = [];
  for (let i = 0; i < bb.length; i += 8) bytes.push(bb.slice(i, i + 8).reduce((a, x) => (a << 1) | x, 0));

  // Split into blocks, add error correction, interleave.
  const nb = NUM_BLOCKS[e.ord][ver], eccLen = ECC_PER_BLOCK[e.ord][ver];
  const raw = Math.floor(rawModules(ver) / 8);
  const nShort = nb - (raw % nb), shortLen = Math.floor(raw / nb);
  const div = rsDivisor(eccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = bytes.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < nShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const words = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= nShort) words.push(b[i]); });

  // Matrix.
  const size = ver * 4 + 17;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const setF = (x, y, v) => { mod[y][x] = v; fn[y][x] = true; };

  for (let i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) setF(x, y, d !== 2 && d !== 4);
    }
  }
  const align = [];
  if (ver > 1) {
    const n = Math.floor(ver / 7) + 2;
    const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
    align.push(6);
    for (let p = size - 7; align.length < n; p -= step) align.splice(1, 0, p);
  }
  align.forEach((ax, i) => align.forEach((ay, j) => {
    const n = align.length;
    if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setF(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const drawFormat = (mask) => {
    const d = (e.fmt << 3) | mask;
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412;
    for (let i = 0; i <= 5; i++) setF(8, i, bit(b, i));
    setF(8, 7, bit(b, 6)); setF(8, 8, bit(b, 7)); setF(7, 8, bit(b, 8));
    for (let i = 9; i < 15; i++) setF(14 - i, 8, bit(b, i));
    for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(b, i));
    for (let i = 8; i < 15; i++) setF(8, size - 15 + i, bit(b, i));
    setF(8, size - 8, true);
  };
  drawFormat(0);
  if (ver >= 7) {
    let r = ver;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (ver << 12) | r;
    for (let i = 0; i < 18; i++) { const a = size - 11 + (i % 3), c = Math.floor(i / 3); setF(a, c, bit(b, i)); setF(c, a, bit(b, i)); }
  }

  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v;
      if (!fn[y][x] && i < words.length * 8) { mod[y][x] = bit(words[i >>> 3], 7 - (i & 7)); i++; }
    }
  }

  const MASKS = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const applyMask = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x]; };
  let best = 0, bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m); drawFormat(m);
    const s = penalty(mod, size);
    if (s < bestScore) { best = m; bestScore = s; }
    applyMask(m);
  }
  applyMask(best); drawFormat(best);
  return mod;
}

// Standard mask penalty (runs, 2x2 blocks, finder-like patterns, dark balance).
function penalty(mod, size) {
  let p = 0;
  const lines = [];
  for (let y = 0; y < size; y++) lines.push(mod[y]);
  for (let x = 0; x < size; x++) lines.push(mod.map((row) => row[x]));
  const pat = [true, false, true, true, true, false, true];
  for (const ln of lines) {
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && ln[i] === ln[i - 1]) run++;
      else { if (run >= 5) p += 3 + run - 5; run = 1; }
    }
    for (let i = 0; i + 7 <= size; i++) {
      if (!pat.every((v, k) => ln[i + k] === v)) continue;
      const before = i >= 4 && [1, 2, 3, 4].every((k) => !ln[i - k]);
      const after = i + 11 <= size && [7, 8, 9, 10].every((k) => !ln[i + k]);
      if (before || after) p += 40;
    }
  }
  let dark = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (mod[y][x]) dark++;
    if (x < size - 1 && y < size - 1 && mod[y][x] === mod[y][x + 1] && mod[y][x] === mod[y + 1][x] && mod[y][x] === mod[y + 1][x + 1]) p += 3;
  }
  p += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return p;
}

// Dark modules on a light square. `scale` = screen pixels per module (whole numbers keep it
// crisp); `quiet` = light border in modules (4 is the standard, 2 still scans on a dark page).
// `dark` is the module color and `light` the background; keep at least ~3:1 contrast between them.
// A lighter module color on a darker background makes an inverted code, which most phone cameras read.
function qrSvg(text, { px = 0, scale = 0, quiet = 4, level = 'M', label = 'QR code', dark = '#000', light = '#fff' } = {}) {
  const m = encode(text, level);
  const n = m.length, q = quiet, w = n + q * 2;
  if (!px) px = w * (scale || 4);
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) d += `M${x + q} ${y + q}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${w}" width="${px}" height="${px}" role="img" aria-label="${label}" shape-rendering="crispEdges"><rect width="${w}" height="${w}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}

module.exports = { encode, qrSvg };
