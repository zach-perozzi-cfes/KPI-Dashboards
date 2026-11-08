# CFES office monitors

Three live KPI boards for the office TVs (Yodeck players), fed directly by Zoho CRM and Zoho Projects.

| Path | Monitor | Data |
| --- | --- | --- |
| `/left` | Inside Sales | Leads, calls, meetings (Zoho CRM) |
| `/middle` | Sales Pipeline | Open deals by stage, closed-won by month (Zoho CRM Deals) |
| `/right` | Operations | Projects created, designs, permits, installs (Zoho Projects tasks) |

Each board is a fixed 1920×1080 layout that scales to fit any screen.

**Data schedule:** the server pulls Zoho once when it starts, then only at the times in `REFRESH_TIMES` (Eastern time, default `07:00,12:00,16:00`), so three pulls a day. Each board header shows when it was last updated and when the next pull is due. The pages check this server's cached copy every `POLL_SECONDS` (default 300) and swap in new numbers without a full reload, because Yodeck does not reload a lone web page on its own. Those checks never call Zoho.

No dependencies: Node 20+, `node server.js`.

## Security model

- **Read-only Zoho access.** A Zoho Self Client refresh token with only these scopes:
  `ZohoCRM.coql.READ,ZohoCRM.modules.leads.READ,ZohoCRM.modules.calls.READ,ZohoCRM.modules.events.READ,ZohoCRM.modules.deals.READ,ZohoProjects.projects.READ,ZohoProjects.tasks.READ`
- **Secrets live only in Render environment variables**, never in the repo or on the players.
- **Fail closed.** With no `DASH_KEY` (or `DASH_USER` + `DASH_PASS`) set, every board request returns 401. Only `/healthz` and `/logo.png` are public.
- **Access options:** `?key=<DASH_KEY>` in the Yodeck URL, or HTTP Basic Auth (`https://user:pass@host/left`). Comparisons are constant-time.
- **Network:** restrict the service to the office's public IP with Render's inbound IP rules (Settings → Networking), or set `ALLOWED_IPS` (comma-separated).
- Responses send `no-store`, `noindex`, `nosniff` and `no-referrer` (so the key never leaks in a Referer header).
- One failed Zoho source never blanks the others: it keeps its last good data and the board shows "refresh delayed". The same flag appears if data is older than the longest gap between scheduled pulls plus an hour.

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` | yes | From a Zoho Self Client (api-console.zoho.com) |
| `DASH_KEY` | yes* | Long random string, used as `?key=` |
| `DASH_USER`, `DASH_PASS` | yes* | Alternative to `DASH_KEY` (Basic Auth) |
| `ALLOWED_IPS` | no | Comma-separated client IPs allowed |
| `ZOHO_PORTAL_ID` | no | Defaults to the CFES Projects portal |
| `REFRESH_TIMES` | no | Zoho pull times, Eastern, comma-separated `HH:MM`. Default `07:00,12:00,16:00` |
| `POLL_SECONDS` | no | How often the page checks the server's cache. Default 300 (no Zoho calls) |
| `ZOHO_ACCOUNTS_URL`, `ZOHO_CRM_API`, `ZOHO_PROJECTS_API` | no | Defaults to the US (.com) data center |

\* At least one of `DASH_KEY` or the `DASH_USER`/`DASH_PASS` pair.

`/status?key=…` shows each source's last fetch time, row count and any error.

## Yodeck setup

For each TV: **Add Media → Web Page**, URL `https://<service>.onrender.com/left?key=<DASH_KEY>` (or `/middle`, `/right`), then put it in that screen's playlist or show. No refresh setting is needed: the page updates itself.

## Local test

```
DEMO_FIXTURE=fixture.json DEMO_NOW=2026-11-08T22:00:00Z PORT=10777 node server.js
```
Fixture files are git-ignored. Never commit real Zoho data.
