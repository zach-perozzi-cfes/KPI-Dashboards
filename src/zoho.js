'use strict';
// Read-only Zoho data layer: CRM (COQL) + Projects (REST v3).
// Credentials come only from environment variables (a Zoho Self Client refresh token).

const ACCOUNTS = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com';
const CRM = process.env.ZOHO_CRM_API || 'https://www.zohoapis.com/crm/v7';
const PROJ = process.env.ZOHO_PROJECTS_API || 'https://projectsapi.zoho.com/api/v3';
const PORTAL = process.env.ZOHO_PORTAL_ID || '727368074';

let token = null;
let tokenExp = 0;
let inflight = null; // one shared token request at a time
let lastTokenError = null;
let lastTokenErrorAt = 0;
const TOKEN_COOLDOWN_MS = 10 * 60_000; // after Zoho refuses, wait before asking again

// Zoho rate-limits access-token requests per refresh token, so every caller shares
// one cached token and at most one in-flight request. `stale` is a token that just
// got a 401: only then is a fresh one fetched.
async function accessToken(stale = null) {
  const valid = token && Date.now() < tokenExp - 60_000;
  if (valid && token !== stale) return token;
  if (inflight) return inflight;
  if (lastTokenError && Date.now() - lastTokenErrorAt < TOKEN_COOLDOWN_MS) throw lastTokenError;
  inflight = requestToken()
    .then((t) => { lastTokenError = null; return t; })
    .catch((e) => { lastTokenError = e; lastTokenErrorAt = Date.now(); throw e; })
    .finally(() => { inflight = null; });
  return inflight;
}

async function requestToken() {
  const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN } = process.env;
  if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN) {
    throw new Error('Zoho credentials are not configured (ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN)');
  }
  const body = new URLSearchParams({
    refresh_token: ZOHO_REFRESH_TOKEN,
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    grant_type: 'refresh_token',
  });
  const r = await fetch(`${ACCOUNTS}/oauth/v2/token`, { method: 'POST', body, signal: AbortSignal.timeout(20_000) });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) {
    const detail = [j.error, j.error_description].filter(Boolean).join(': ') || `HTTP ${r.status}`;
    throw new Error(`Zoho token refresh failed (${detail})`);
  }
  token = j.access_token;
  tokenExp = Date.now() + (Number(j.expires_in) || 3600) * 1000;
  return token;
}

async function zfetch(url, init = {}, staleToken = null) {
  const t = await accessToken(staleToken);
  const r = await fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Zoho-oauthtoken ${t}` },
    signal: AbortSignal.timeout(45_000),
  });
  if (r.status === 401 && !staleToken) return zfetch(url, init, t);
  if (r.status === 204) return null;
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} from ${new URL(url).pathname}: ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { throw new Error(`Non-JSON reply from ${new URL(url).pathname}`); }
}

// COQL with offset paging ("limit offset, count"); de-duplicated by id.
async function coqlAll(baseQuery, maxPages = 10) {
  const out = new Map();
  for (let page = 0; page < maxPages; page++) {
    const q = `${baseQuery} order by id asc limit ${page * 2000}, 2000`;
    const j = await zfetch(`${CRM}/coql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ select_query: q }),
    });
    const rows = (j && j.data) || [];
    for (const row of rows) out.set(row.id, row);
    if (!j || !j.info || !j.info.more_records) break;
  }
  return [...out.values()];
}

function projFilter(criteria) {
  return JSON.stringify({ criteria, pattern: criteria.map((_, i) => i + 1).join(' AND ') });
}

async function projectsCreatedSince(dateStr) {
  const out = [];
  const filter = projFilter([{ field_name: 'created_time', criteria_condition: 'greater_than_or_equal', value: [dateStr] }]);
  for (let page = 1; page <= 20; page++) {
    const qs = new URLSearchParams({ filter, per_page: '100', page: String(page) });
    const j = await zfetch(`${PROJ}/portal/${PORTAL}/projects?${qs}`);
    const list = Array.isArray(j) ? j : (j && (j.projects || j.result || j.data)) || [];
    for (const p of list) {
      out.push({ created: p.created_time || null, group: (p.project_group && p.project_group.name) || 'Ungrouped' });
    }
    const more = j && j.page_info ? j.page_info.has_next_page : list.length === 100;
    if (!more) break;
  }
  return out;
}

async function closedTasksSince(nameContains, dateStr) {
  const out = [];
  const filter = projFilter([
    { field_name: 'name', criteria_condition: 'contains', value: [nameContains] },
    { field_name: 'status', criteria_condition: 'is', value: ['${ALL_CLOSED}'] },
    { field_name: 'last_updated_time', criteria_condition: 'greater_than_or_equal', value: [dateStr] },
  ]);
  for (let page = 1; page <= 20; page++) {
    const qs = new URLSearchParams({ filter, per_page: '200', page: String(page) });
    const j = await zfetch(`${PROJ}/portal/${PORTAL}/tasks?${qs}`);
    const list = (j && j.tasks) || [];
    for (const t of list) out.push({ name: t.name || '', completed: t.completed_on || null });
    if (!(j && j.page_info && j.page_info.has_next_page)) break;
  }
  return out;
}

// Each source is fetched independently so one failure never blanks the others.
function sourceDefs(win) {
  const since = `${win.fetchFrom}T00:00:00-05:00`;
  const until = `${win.fetchTo}T23:59:59-05:00`;
  return {
    leads: () => coqlAll(`select Created_Time, Lead_Source from Leads where Created_Time >= '${since}'`)
      .then((rows) => rows.map((r) => ({ t: r.Created_Time, src: r.Lead_Source || 'None' }))),
    calls: () => coqlAll(`select Call_Start_Time, Call_Type from Calls where Call_Start_Time >= '${since}'`)
      .then((rows) => rows.map((r) => ({ t: r.Call_Start_Time, type: r.Call_Type || '' }))),
    meetings: () => coqlAll(`select Start_DateTime, Owner from Events where Start_DateTime between '${since}' and '${until}'`)
      .then((rows) => rows.map((r) => ({ t: r.Start_DateTime, owner: (r.Owner && r.Owner.name) || 'Unassigned' }))),
    // Closed Deferred is treated like Closed Lost (not open, not won).
    openDeals: () => coqlAll(`select Stage, Amount, Layout from Deals where Stage not in ('Closed Won', 'Closed Lost', 'Closed Deferred', 'Closed Disqualified', 'Closed Hold', 'Appointment Cancelled')`)
      .then((rows) => rows.map((r) => ({ stage: r.Stage || 'Unknown', amount: Number(r.Amount) || 0, layout: (r.Layout && r.Layout.name) || 'No layout' }))),
    newDeals: () => coqlAll(`select Created_Time, Pipeline from Deals where Created_Time >= '${win.prevMonthStart}T00:00:00-05:00'`)
      .then((rows) => rows.map((r) => ({ t: r.Created_Time, pipeline: r.Pipeline || '' }))),
    wonDeals: () => coqlAll(`select Closing_Date, Amount, Pipeline from Deals where Stage = 'Closed Won' and Closing_Date >= '${win.yearStart}'`)
      .then((rows) => rows.map((r) => ({ date: r.Closing_Date, amount: Number(r.Amount) || 0, pipeline: r.Pipeline || '' }))),
    projects: () => projectsCreatedSince(win.fetchFrom),
    tasksDesign: () => closedTasksSince('Design', win.fetchFrom),
    tasksPermit: () => closedTasksSince('Permit', win.fetchFrom),
    tasksInstall: () => closedTasksSince('Install', win.fetchFrom),
  };
}

// prev: the previous sources object, so a failed source keeps its last good data.
// Sources run one after another: gentler on Zoho's API limits, and a pull only
// happens a few times a day, so the extra seconds don't matter.
async function loadAll(win, prev = {}) {
  const defs = sourceDefs(win);
  const next = {};
  for (const [key, fn] of Object.entries(defs)) {
    try {
      next[key] = { data: await fn(), fetchedAt: new Date().toISOString(), error: null };
    } catch (e) {
      const old = prev[key];
      next[key] = { data: old ? old.data : null, fetchedAt: old ? old.fetchedAt : null, error: String(e.message || e) };
      console.error(`[zoho] ${key} failed: ${next[key].error}`);
    }
  }
  return next;
}

module.exports = { loadAll };
