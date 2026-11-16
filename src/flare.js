'use strict';
// Flares: someone taps FLARE on the phone view, picks an emoji, and it floats up across the TV
// for the screen they're on. Kept in memory only (a flare is worth seeing for a few seconds).
// The TVs check for new flares every few seconds; that check never calls Zoho.

// Only these can be sent, so nothing typed by a person ever reaches the TVs.
const EMOJI = ['🔥', '🎉', '👏', '🚀', '💰', '☀️', '⚡', '🏆'];

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
  if (!EMOJI.includes(emoji)) return 'Unknown emoji';
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
const FONT_LINK = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&text=${encodeURIComponent(EMOJI.join(''))}&display=swap">`;

const CSS = `
#flares{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:50}
#flares span{position:absolute;bottom:-14vh;line-height:1;font-family:'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif;will-change:transform,opacity}
`;

// Client-side burst: a dozen copies drift up from the bottom with a little sway, then fade.
// Plain ES5 so it runs on older signage browsers.
const BURST_JS = `
function flareBurst(emoji){
  var layer=document.getElementById('flares');if(!layer||!layer.animate)return;
  for(var i=0;i<14;i++){
    var s=document.createElement('span');s.textContent=emoji;
    var sw=Math.random()*16-8,d=4200+Math.random()*2800,dl=Math.random()*1600;
    s.style.left=(Math.random()*88+4)+'vw';s.style.fontSize=(5+Math.random()*6)+'vh';
    layer.appendChild(s);
    var a=s.animate([
      {transform:'translate(0,0) rotate(0deg)',opacity:0},
      {opacity:1,offset:.12},
      {transform:'translate('+sw+'vw,-62vh) rotate('+(sw*2)+'deg)',opacity:1,offset:.6},
      {transform:'translate('+(-sw/2)+'vw,-128vh) rotate('+(-sw)+'deg)',opacity:0}
    ],{duration:d,delay:dl,easing:'ease-out',fill:'both'});
    a.onfinish=(function(el){return function(){el.remove();};})(s);
  }
}`;

module.exports = { EMOJI, add, since, latest, FONT_LINK, CSS, BURST_JS };
