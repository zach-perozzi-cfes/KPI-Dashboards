# CFES office monitors

Three live KPI boards for the office TVs (Yodeck players), fed directly by Zoho CRM, Zoho Projects and Zoho Desk.

| Path | Monitor | Data |
| --- | --- | --- |
| `/left` | Inside Sales | Leads, calls, meetings (Zoho CRM) |
| `/middle` | Sales Pipeline | Open deals by stage, closed-won by month (Zoho CRM Deals) |
| `/right` | Operations | Projects created, designs, permits, installs (Zoho Projects tasks); incoming and closed service tickets (Zoho Desk) |

Each board is a fixed 1920×1080 layout that scales to fit any screen. The look: near-black with a soft green glow, a green-to-orange gradient strip across the top and on each card, Inter for text and JetBrains Mono for the live clock (both from Google Fonts; Verdana if they can't load).

**Phone view (`/m`):** the same three boards as swipeable screens (swipe left/right or tap a tab; each screen scrolls up and down). Tap any number, bar, row or grid cell to see the records behind it: name, owner, date, amount, and a link to the record in Zoho. Each list uses the same rule as the number on the board, so it always adds up. See [Phone view](#phone-view).

**Data schedule:** the server pulls Zoho once when it starts, then only at the times in `REFRESH_TIMES` (Eastern time, default `07:00,12:00,16:00`), so three pulls a day. The board headers show only a clock; `/status?key=…` shows when each source was last pulled. The pages check this server's cached copy every `POLL_SECONDS` (default 300) and swap in new numbers without a full reload, because Yodeck does not reload a lone web page on its own. Those checks never call Zoho.

No dependencies: Node 20+, `node server.js`.

## Security model

- **Read-only Zoho access.** A Zoho Self Client refresh token with only these scopes:
  `ZohoCRM.coql.READ,ZohoCRM.modules.leads.READ,ZohoCRM.modules.calls.READ,ZohoCRM.modules.events.READ,ZohoCRM.modules.deals.READ,ZohoProjects.projects.READ,ZohoProjects.tasks.READ,Desk.tickets.READ,Desk.search.READ`
- **Secrets live only in Render environment variables**, never in the repo or on the players.
- **Fail closed.** With no `DASH_KEY` (or `DASH_USER` + `DASH_PASS`) set, every board request returns 401. Only `/healthz`, `/logo.png` and the phone view's sign-in page are reachable without a key; the phone view's data needs a sign-in from today's QR code, and with no `MOBILE_SECRET` the phone view is off.
- **Access options:** `?key=<DASH_KEY>` in the Yodeck URL, or HTTP Basic Auth (`https://user:pass@host/left`). Comparisons are constant-time.
- **Network:** restrict the service to the office's public IP with Render's inbound IP rules (Settings → Networking), or set `ALLOWED_IPS` (comma-separated).
- Responses send `no-store`, `noindex`, `nosniff` and `no-referrer` (so the key never leaks in a Referer header).
- **Phone view sign-in:** see [Phone view](#phone-view). The TV key can't open `/m`, and `/m` doesn't use the TV key or `ALLOWED_IPS`.
- One failed Zoho source never blanks the others: it keeps its last good data and the board shows "refresh delayed". The same flag appears if data is older than the longest gap between scheduled pulls plus an hour.

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` | yes | From a Zoho Self Client (api-console.zoho.com) |
| `DASH_KEY` | yes* | Long random string, used as `?key=` |
| `DASH_USER`, `DASH_PASS` | yes* | Alternative to `DASH_KEY` (Basic Auth) |
| `ALLOWED_IPS` | no | Comma-separated client IPs allowed |
| `ZOHO_PORTAL_ID` | no | Defaults to the CFES Projects portal |
| `ZOHO_DESK_ORG_ID` | for tickets | The Zoho Desk org id (Desk → Setup → Developer Space → API). Without it the two ticket tiles show "waiting for Zoho" and `/status` shows the error. |
| `REFRESH_TIMES` | no | Zoho pull times, Eastern, comma-separated `HH:MM`. Default `07:00,12:00,16:00` |
| `POLL_SECONDS` | no | How often the page checks the server's cache. Default 300 (no Zoho calls) |
| `ZOHO_ACCOUNTS_URL`, `ZOHO_CRM_API`, `ZOHO_PROJECTS_API`, `ZOHO_DESK_API` | no | Defaults to the US (.com) data center |
| `MOBILE_SECRET` | for `/m` | Long random string that signs the daily QR code and phone sessions. Without it the phone view is off and no QR shows on the boards. Changing it signs everyone out. |
| `PUBLIC_URL` | no | e.g. `https://<service>.onrender.com`. The address the QR code points to. Defaults to the address the TV used to load the board. |
| `ZOHO_CRM_ORG_URL` | no | e.g. `https://crm.zoho.com/crm/org123456789`. Turns phone records into links to the CRM record. |
| `ZOHO_PROJECTS_URL` | no | e.g. `https://projects.zoho.com/portal/<portal name>`. Turns project and task records into links to the project. |

\* At least one of `DASH_KEY` or the `DASH_USER`/`DASH_PASS` pair.

`/status?key=…` shows each source's last fetch time, row count and any error.

## Phone view

1. **Sign in:** scan the small QR code in the bottom-right corner of any office monitor. Each monitor has its own code, and it opens the phone view on that monitor's screen (Inside Sales, Pipeline or Operations); swipe from there to the others. The phone stays signed in until **midnight Eastern**, then shows "Sign in with the office QR code" until a code is scanned again.
2. **How it works:** the QR holds a short all-caps link (`/M/I/<L|M|R><token>`, matched case-insensitively) with a token made from `MOBILE_SECRET` and today's date. The letter picks the screen. All caps lets the QR use its compact alphanumeric mode. The token changes every day on its own, so yesterday's code (or a photo of it) stops working at midnight. Scanning sets a cookie that's only accepted on the day it was made. Nothing is stored on the server, so a restart doesn't sign anyone out.
3. **Off-site:** after scanning, the phone works anywhere. `ALLOWED_IPS` doesn't apply to `/m`, but Render's own inbound IP rules (Settings → Networking) apply to everything, so if those are on, phones only work on office Wi-Fi.
4. **Look and size:** CFES orange squares on the cards' near-black (an inverted code, about 8:1 contrast; iPhone Camera and Google Lens read these, some older scanner apps don't). 1.6 screen pixels per module, so the visible pattern is about 46 px on a 1080p screen, about 1.5 in square on a 70" TV, inside a thin CFES-green border; scan it from close up. It sits inside the bottom-right card's corner, 52 px in from the right edge and 44 px up from the bottom, so a TV that crops its edges doesn't cut it off. That card gets extra right padding so nothing sits under it. A longer `PUBLIC_URL` makes the code a little bigger.
5. **Printable codes:** `/m/qr?key=<DASH_KEY>` shows today's three codes large. They're only good until midnight.
6. **FLARE:** the orange FLARE button on the phone opens a grid of emoji (🔥 🎉 👏 🚀 💰 ☀️ ⚡ 🏆, plus the "clock guy" picture). Pick one and it floats up across the TV for the screen the phone is showing, and on the phone too. Only those nine can be sent, so no typed text reaches the TVs. Picture flares are transparent PNGs in `public/flare/`, listed in `CUSTOM` in `src/flare.js` and served publicly at `/flare/<name>.png` (like the logo). Limits: one flare per phone every 4 seconds and 20 a minute per TV. The TVs check for flares every 3 seconds (that check never calls Zoho), and flares live only in the server's memory for a minute. The emoji are drawn with Google's Noto Color Emoji font so TVs without an emoji font still show them.
7. **Home screen:** use a browser bookmark, not "Add to Home Screen". On iPhone a home-screen app keeps its own cookies, so it can't see the sign-in from scanning.
8. The phone view reads the same cached data as the boards and never calls Zoho.

## Yodeck setup

For each TV: **Add Media → Web Page**, URL `https://<service>.onrender.com/left?key=<DASH_KEY>` (or `/middle`, `/right`), then put it in that screen's playlist or show. No refresh setting is needed: the page updates itself.

## Local test

```
DEMO_FIXTURE=fixture.json DEMO_NOW=2026-11-08T22:00:00Z PORT=10777 node server.js
```
In fixture mode the phone view works without `MOBILE_SECRET` (a throwaway one is made up, and the QR on the boards signs you in). Fixture files are git-ignored. Never commit real Zoho data.
