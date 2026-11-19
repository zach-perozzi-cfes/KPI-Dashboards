'use strict';
// Flares: someone taps FLARE on the phone view, picks an emoji, and it floats up across the TV
// for the screen they're on. Kept in memory only (a flare is worth seeing for a few seconds).
// The TVs check for new flares every few seconds; that check never calls Zoho.

// Only these can be sent, so nothing typed by a person ever reaches the TVs.
const EMOJI = ['🔥', '🎉', '👏', '🚀', '💰', '☀️', '⚡', '🏆'];
// Picture "emoji": transparent PNGs in public/flare/, served at /flare/<key>.png.
const CUSTOM = { clockguy: { src: '/flare/clockguy.png', label: 'Clock guy' } };
// Holiday emoji that join the picker on their own for part of the year (Eastern dates, inclusive).
// Thanksgiving for all of November; Christmas from November 1 through December 31.
const SEASONS = [
  { name: 'Thanksgiving', emoji: ['🦃', '🥧', '🍂', '🌽'], from: [11, 1], to: [11, 30] },
  { name: 'Christmas', emoji: ['🎄', '🎅', '❄️', '🎁', '⛄', '🦌'], from: [11, 1], to: [12, 31] },
];
// These drift down like snow instead of floating up.
const FALL = ['❄️'];

const { TZ } = require('./metrics');

const mdFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'numeric', day: 'numeric' });
// Seasonal emoji showing on a given date, as [{ name, emoji }].
function seasonal(now = new Date()) {
  const parts = Object.fromEntries(mdFmt.formatToParts(now).map((x) => [x.type, Number(x.value)]));
  const md = parts.month * 100 + parts.day;
  return SEASONS.filter((s) => md >= s.from[0] * 100 + s.from[1] && md <= s.to[0] * 100 + s.to[1]);
}
const allowedNow = (now) => [...EMOJI, ...Object.keys(CUSTOM), ...seasonal(now).flatMap((s) => s.emoji)];
const IMG_SRC = Object.fromEntries(Object.entries(CUSTOM).map(([k, v]) => [k, v.src]));

const KEEP_MS = 60_000;          // a TV that missed a check still gets flares from the last minute
const PER_CLIENT_MS = 4_000;     // one flare per phone (by IP) every 4 seconds
const PER_BOARD_PER_MIN = 20;    // and at most 20 a minute per TV

let seq = 0;
const queue = [];                // { id, board, emoji, at }
const lastByClient = new Map();  // ip -> time of last flare

function prune(now) {
  while (queue.length && now - queue[0].at > KEEP_MS) queue.shift();
  if (lastByClient.size > 500) for (const [k, t] of lastByClient) if (now - t > PER_CLIENT_MS) lastByClient.delete(k);
}

// Returns null when accepted, or a reason string the phone can show.
function add(board, emoji, client, now = Date.now()) {
  prune(now);
  if (!allowedNow(new Date(now)).includes(emoji)) return 'Unknown emoji';
  const last = lastByClient.get(client);
  if (last && now - last < PER_CLIENT_MS) return 'One flare every few seconds';
  if (queue.filter((f) => f.board === board).length >= PER_BOARD_PER_MIN) return 'That TV is busy, try again in a minute';
  lastByClient.set(client, now);
  queue.push({ id: ++seq, board, emoji, at: now });
  return null;
}

// Flares for one board newer than `since` (the last id that TV saw).
function since(board, after) {
  prune(Date.now());
  return { last: seq, flares: queue.filter((f) => f.board === board && f.id > after).map((f) => ({ id: f.id, emoji: f.emoji })) };
}

const latest = () => seq;

// Google's color emoji font, cut down to just these characters, so TVs without an emoji font
// (some signage players) still draw them.
const FONT_LINK = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&text=${encodeURIComponent([...EMOJI, ...SEASONS.flatMap((x) => x.emoji)].join(''))}&display=swap">`;

const CSS = `
#flares{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:50}
#flares span{position:absolute;bottom:-14vh;line-height:1;font-family:'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif;will-change:transform,opacity}
#flares span.fall{bottom:auto;top:-14vh}
#flares img{position:absolute;bottom:-20vh;width:auto;will-change:transform,opacity}
`;

// Client-side burst: a dozen copies drift up from the bottom with a little sway, then fade.
// Plain ES5 so it runs on older signage browsers.
// Picture emoji are preloaded so they show the moment a flare arrives.
const BURST_JS = `
var FLARE_IMG=${JSON.stringify(IMG_SRC)},FLARE_FALL=${JSON.stringify(FALL)};
for(var fk in FLARE_IMG){(new Image()).src=FLARE_IMG[fk];}
function flareBurst(emoji){
  var layer=document.getElementById('flares');if(!layer||!layer.animate)return;
  var pic=FLARE_IMG[emoji],fall=FLARE_FALL.indexOf(emoji)>=0,dir=fall?1:-1;
  for(var i=0;i<(pic?10:fall?24:14);i++){
    var s;
    if(pic){s=document.createElement('img');s.src=pic;s.alt='';s.style.height=(9+Math.random()*7)+'vh';}
    else{s=document.createElement('span');s.textContent=emoji;s.style.fontSize=(fall?3+Math.random()*5:5+Math.random()*6)+'vh';if(fall)s.className='fall';}
    var sw=Math.random()*16-8,d=4200+Math.random()*2800,dl=Math.random()*1600;
    s.style.left=(Math.random()*(fall?96:84)+2)+'vw';if(fall)d+=2500;
    layer.appendChild(s);
    var a=s.animate([
      {transform:'translate(0,0) rotate(0deg)',opacity:0},
      {opacity:1,offset:.12},
      {transform:'translate('+sw+'vw,'+(dir*62)+'vh) rotate('+(sw*2)+'deg)',opacity:1,offset:.6},
      {transform:'translate('+(-sw/2)+'vw,'+(dir*128)+'vh) rotate('+(-sw)+'deg)',opacity:0}
    ],{duration:d,delay:dl,easing:'ease-out',fill:'both'});
    a.onfinish=(function(el){return function(){el.remove();};})(s);
  }
}`;

module.exports = { EMOJI, CUSTOM, IMG_SRC, SEASONS, seasonal, add, since, latest, FONT_LINK, CSS, BURST_JS };
