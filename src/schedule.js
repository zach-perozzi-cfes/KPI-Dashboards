'use strict';
// Fixed daily pull times (America/New_York), e.g. REFRESH_TIMES="07:00,12:00,16:00".

const TZ = 'America/New_York';
const hmFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function parseSlots(raw) {
  const slots = String(raw || '07:00,12:00,16:00')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d{1,2}:\d{2}$/.test(s))
    .map((s) => s.padStart(5, '0'))
    .filter((s) => Number(s.slice(0, 2)) < 24 && Number(s.slice(3)) < 60);
  return [...new Set(slots)].sort();
}

const SLOTS = parseSlots(process.env.REFRESH_TIMES);

function nowHM(d = new Date()) { return hmFmt.format(d); } // "07:00"

function nextSlot(d = new Date(), slots = SLOTS) {
  const n = nowHM(d);
  return slots.find((s) => s > n) || slots[0];
}

const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));

// Longest gap between consecutive pulls (wrapping overnight), in hours.
function maxGapHours(slots = SLOTS) {
  if (slots.length < 2) return 24;
  let gap = 0;
  for (let i = 0; i < slots.length; i++) {
    const a = toMin(slots[i]);
    const b = i + 1 < slots.length ? toMin(slots[i + 1]) : toMin(slots[0]) + 1440;
    gap = Math.max(gap, b - a);
  }
  return gap / 60;
}

function slotLabel(s) {
  const h = Number(s.slice(0, 2)), m = s.slice(3);
  return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

module.exports = { SLOTS, parseSlots, nowHM, nextSlot, maxGapHours, slotLabel };
