'use strict';
// Flares: someone taps FLARE on the phone view, picks an emoji, and it floats up across the TV
// for the screen they're on. Kept in memory only (a flare is worth seeing for a few seconds).
// The TVs check for new flares every few seconds; that check never calls Zoho.

// Only these can be sent, so nothing typed by a person ever reaches the TVs.
const EMOJI = ['🔥', '🎉', '👏', '🚀', '💰', '☀️', '⚡', '🏆'];
// Picture "emoji": transparent PNGs in public/flare/. `src` is the picture on the phone's picker.
// One with `parade` doesn't float up on one TV: its characters fly left to right across all
// three TVs in turn, as if the three screens were one wall.
const CUSTOM = {
  clockguy: { src: '/flare/clockguy.png', label: 'Clock guy' },
  crew: { src: '/flare/crew4.png', label: 'The crew', parade: ['/flare/crew1.png', '/flare/crew2.png', '/flare/crew3.png', '/flare/crew4.png'] },
};
// Every picture file the server needs to serve.
const FILES = [...new Set(Object.values(CUSTOM).flatMap((v) => [v.src, ...(v.parade || [])]))];
const PARADE = Object.fromEntries(Object.entries(CUSTOM).filter(([, v]) => v.parade).map(([k, v]) => [k, v.parade]));
// The TVs from left to right on the wall.
const WALL = ['left', 'middle', 'right'];
// Parade timing (ms). A character takes DUR to cross a screen at a steady speed, moving from 40%
// of a screen-width off the left edge to 40% past the right edge, so it reaches the next screen's
// left edge HOP later. The next character follows GAP behind. LEAD gives every TV time to
// pick the flare up (they check every 3 s) before it starts on the left TV.
const PARADE_DUR = 7200, PARADE_GAP = 900, PARADE_HOP = Math.round((PARADE_DUR * 100) / 180), PARADE_LEAD = 4500;
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
  const boards = PARADE[emoji] ? WALL : [board];
  if (boards.some((b) => queue.filter((f) => f.board === b).length >= PER_BOARD_PER_MIN)) return 'That TV is busy, try again in a minute';
  lastByClient.set(client, now);
  // A parade starts on the left TV after LEAD, then each TV to the right starts one HOP later.
  boards.forEach((b, i) => queue.push({ id: ++seq, board: b, emoji, at: now, go: PARADE[emoji] ? now + PARADE_LEAD + i * PARADE_HOP : null, leg: i }));
  return null;
}

// Flares for one board newer than `since` (the last id that TV saw).
function since(board, after) {
  prune(Date.now());
  const now = Date.now();
  // `in` = ms until a parade should start on this TV, measured on the server so the TVs' own
  // clocks don't matter.
  return { last: seq, flares: queue.filter((f) => f.board === board && f.id > after).map((f) => (f.go ? { id: f.id, emoji: f.emoji, in: f.go - now, leg: f.leg } : { id: f.id, emoji: f.emoji })) };
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
#flares img.pa{bottom:auto;left:0}
`;

// Client-side burst: a dozen copies drift up from the bottom with a little sway, then fade.
// Plain ES5 so it runs on older signage browsers.
// Picture emoji are preloaded so they show the moment a flare arrives.
const BURST_JS = `
var FLARE_IMG=${JSON.stringify(IMG_SRC)},FLARE_FALL=${JSON.stringify(FALL)},FLARE_PARADE=${JSON.stringify(PARADE)};
for(var fk in FLARE_IMG){(new Image()).src=FLARE_IMG[fk];}
for(var pk in FLARE_PARADE){FLARE_PARADE[pk].forEach(function(u){(new Image()).src=u;});}
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
}
// Parade: the characters fly in a line from left to right at a steady speed (so they line up
// with the TVs either side), bobbing and wobbling, and growing as they go: leg is this TV's
// place on the wall (0 = left). On the last TV each one stops in the middle, swells until it
// fills the screen, then vanishes.
var PARADE_TOPS=[14,46,24,52],PARADE_SCALE=[1,1.45,1.95,2.45],PARADE_GROW=1300,PARADE_POP=300;
function flareParade(key,leg){
  var layer=document.getElementById('flares'),pics=FLARE_PARADE[key];if(!layer||!layer.animate||!pics)return;
  var last=leg>=${WALL.length - 1},vw=window.innerWidth/100,vh=window.innerHeight/100;
  pics.forEach(function(src,i){
    var s=document.createElement('img');s.src=src;s.alt='';s.className='pa';
    var h=i===0?26:32,top=PARADE_TOPS[i%PARADE_TOPS.length];
    s.style.height=h+'vh';s.style.top=top+'vh';
    layer.appendChild(s);
    var ratio=(s.naturalWidth&&s.naturalHeight)?s.naturalWidth/s.naturalHeight:.8,w=h*ratio*vh/vw; // width in vw
    var s0=PARADE_SCALE[leg],s1=PARADE_SCALE[leg+1],b=3+i%2*2,r=i===0?14:7;
    // x runs from -40vw to 140vw over DUR; on the last TV the walk stops once the character is centred.
    var cx=50-w/2,stopAt=last?(cx+40)/180:1,walk=${PARADE_DUR}*stopAt,total=walk+(last?PARADE_GROW+PARADE_POP:0),k=[],n=8;
    for(var j=0;j<=n;j++){var o=j/n*stopAt;
      k.push({offset:o*${PARADE_DUR}/total,opacity:1,transform:'translateX('+(-40+180*o)+'vw) translateY('+(j%2?-b:b)+'vh) rotate('+(j%2?-r:r)+'deg) scale('+(s0+(s1-s0)*o)+')'});}
    if(last){
      // Swell from the centre until it covers the whole screen, then pop out of sight.
      var dy=50-top-h/2,big=Math.max(115/h,115/w)*1.05,sNow=s0+(s1-s0)*stopAt;
      k.push({offset:(walk+PARADE_GROW)/total,opacity:1,transform:'translateX('+cx+'vw) translateY('+dy+'vh) rotate(0deg) scale('+big+')'});
      k.push({offset:1,opacity:0,transform:'translateX('+cx+'vw) translateY('+dy+'vh) rotate(0deg) scale('+(big*1.15)+')'});
    }
    var a=s.animate(k,{duration:total,delay:i*${PARADE_GAP},easing:'linear',fill:'both'});
    a.onfinish=(function(el){return function(){el.remove();};})(s);
  });
}
// Starts a parade after \`ms\`; skips one this TV only heard about after it had already passed.
function flareParadeIn(key,ms,leg){if(ms<-1500)return;setTimeout(function(){flareParade(key,leg||0);},Math.max(0,ms));}`;

module.exports = { EMOJI, CUSTOM, IMG_SRC, FILES, PARADE, SEASONS, seasonal, add, since, latest, FONT_LINK, CSS, BURST_JS };
