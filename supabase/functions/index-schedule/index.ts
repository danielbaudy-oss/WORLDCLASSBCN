import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ---------------------------------------------------------------------------
// index-schedule — reads the school schedule sheet (only the mapped tabs),
// parses it into clean tables, diffs against the DB (auto-registers changes),
// and logs the run. See scripts/schedule-map.json for the structure map and
// CHATBOT-SCHEDULE-DESIGN.md for the per-tab analysis.
//
// Auth: an admin JWT (manual "sync now") OR body.token === SYNC_TOKEN (Pi cron).
//   NOTE: SYNC_TOKEN is a placeholder — move to an env secret before prod cron.
// Modes: { dry_run:true } parses + returns a summary WITHOUT touching the DB.
// Credentials: row 2 of the Salas tabs holds room passwords — never read/stored.
// ---------------------------------------------------------------------------

const GOOGLE_SERVICE_ACCOUNT = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT") || "{}");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SYNC_TOKEN = "wcbcn_sched_sync_3Vx9";
const DEFAULT_SHEET_ID = "14IJWB6FZ79TnVF1jnkREJN9yJNFCot0AWRlNlvOqZNU";

const cors = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

// --- Google auth (same JWT flow as index-materials) ---
async function getGoogleAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: GOOGLE_SERVICE_ACCOUNT.client_email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly", aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now };
  const enc = new TextEncoder();
  const b64u = (s: string) => btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64u(JSON.stringify(payload));
  const pem = GOOGLE_SERVICE_ACCOUNT.private_key.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\n/g, "");
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(`${head}.${body}`));
  const sigB64 = b64u(String.fromCharCode(...new Uint8Array(sig)));
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${head}.${body}.${sigB64}` });
  const j = await res.json();
  if (!j.access_token) throw new Error("google token: " + JSON.stringify(j));
  return j.access_token;
}

async function driveModifiedTime(token: string, sheetId: string): Promise<string | null> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${sheetId}?fields=modifiedTime`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return (await res.json()).modifiedTime || null;
}

async function batchGet(token: string, sheetId: string, ranges: string[]): Promise<Record<string, any[][]>> {
  const qs = ranges.map(r => `ranges=${encodeURIComponent(r)}`).join("&");
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet?${qs}&majorDimension=ROWS`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error("sheets batchGet: " + JSON.stringify(data).slice(0, 200));
  const out: Record<string, any[][]> = {};
  (data.valueRanges || []).forEach((vr: any, i: number) => { out[ranges[i]] = vr.values || []; });
  return out;
}

// --- parsing helpers (ported from scripts/parse-schedule.js) ---
const ZW = /[\u200B-\u200F\u2060\uFEFF\uFE0F]/g;
const clean = (s: any) => (s == null ? "" : String(s)).replace(ZW, "").trim();
const norm = (s: any) => clean(s).toLowerCase().replace(/\s+/g, " ");
const DAY_ORDER = ["L", "M", "X", "J", "V", "S", "D"];
const STATUS: Record<string, string> = { "⚽": "active", "💐": "starting", "⚠": "warning", "⛔": "blocked" };

function normalizeTime(tok: string): string | null {
  const m = clean(tok).match(/^(\d{1,2})(?:[.:](\d{2}))?$/);
  if (!m) return null;
  return `${String(parseInt(m[1], 10)).padStart(2, "0")}:${m[2] || "00"}`;
}
function parseDays(tok: string): string[] | null {
  const t = clean(tok).toUpperCase().replace(/\s+/g, "");
  if (!t) return null;
  if (/^[LMXJVSD]-[LMXJVSD]$/.test(t)) { const a = DAY_ORDER.indexOf(t[0]), b = DAY_ORDER.indexOf(t[2]); if (a >= 0 && b >= a) return DAY_ORDER.slice(a, b + 1); }
  const days = t.split(/[,&]/).filter(p => DAY_ORDER.includes(p));
  return days.length ? days : null;
}
function parseCell(raw: string): any | null {
  const text = clean(raw);
  if (!text || text.length < 2) return null;
  const lines = text.split(/\n+/).map(clean).filter(Boolean);
  if (!lines.length) return null;
  const o: any = { teacher: null, level: null, module: null, hours_per_week: null, days: null, time_start: null, time_end: null, course_end: null, start_date: null, student_count: null, status: "active", rotation: false, notes: null };
  const l1 = lines[0];
  const st: string[] = [];
  for (const [e, s] of Object.entries(STATUS)) if (l1.includes(e)) st.push(s);
  o.status = st.includes("blocked") ? "blocked" : st.includes("warning") ? "warning" : st.includes("starting") ? "starting" : "active";
  const toks = l1.replace(/[^\x00-\x7F]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (toks.length) o.teacher = toks[0].replace(/^["'.,]+|["'.,]+$/g, "");
  const rest = toks.slice(1).join(" ");
  if (/\bROT\b/i.test(rest)) o.rotation = true;
  const lvl = rest.match(/([A-C][0-2](?:\.\d)?)(?:\s*\/\s*(M\d+))?/i);
  if (lvl) { o.level = lvl[1].toUpperCase(); if (lvl[2]) o.module = lvl[2].toUpperCase(); }
  for (let i = 1; i < lines.length; i++) {
    const ln = lines[i]; let used = false;
    const hrs = ln.match(/(\d+(?:\.\d+)?)\s*h\b/i); if (hrs) { o.hours_per_week = parseFloat(hrs[1]); used = true; }
    const d = ln.match(/\b([LMXJVSD](?:-[LMXJVSD]|(?:[,&][LMXJVSD])+)?)\b/); if (d) { const dd = parseDays(d[1]); if (dd) { o.days = dd; used = true; } }
    const tr = ln.match(/(\d{1,2}(?:[.:]\d{2})?)\s*-\s*(\d{1,2}(?:[.:]\d{2})?)/);
    if (tr) { const a = normalizeTime(tr[1]), b = normalizeTime(tr[2]); if (a && b) { o.time_start = a; o.time_end = b; used = true; } }
    const c = ln.match(/(\d+)\s*p\b/i); if (c) { o.student_count = parseInt(c[1], 10); used = true; }
    const s = ln.match(/start\s*:?\s*([0-9]{1,2}[\/.][0-9]{1,2}(?:[\/.][0-9]{2,4})?)/i); if (s) { o.start_date = s[1]; used = true; }
    const ed = ln.match(/^[A-C][0-2](?:\.\d)?\s*:?\s*([0-9]{1,2}[.\/][0-9]{1,2}(?:[\/.][0-9]{2,4})?)/i); if (ed) { o.course_end = ed[1]; used = true; }
    if (!used) o.notes = (o.notes ? o.notes + " | " : "") + ln;
  }
  return o;
}

function detectTimeCol(values: any[][]): number {
  const counts: Record<number, number> = {};
  for (let r = 0; r < Math.min(values.length, 15); r++) {
    const row = values[r] || [];
    for (let c = 0; c < Math.min(row.length, 3); c++) {
      if (/^\s*\d{1,2}([.:]\d{2})?\s*-\s*\d{1,2}([.:]\d{2})?/.test(clean(row[c]))) counts[c] = (counts[c] || 0) + 1;
    }
  }
  let best = 1, bestN = -1;
  for (const [c, n] of Object.entries(counts)) if (n > bestN) { bestN = n; best = parseInt(c); }
  return bestN > 0 ? best : 1;
}

function parseSalasGrid(values: any[][], location: string, skipRows: number[]): { rows: any[]; warnings: string[] } {
  const warnings: string[] = [];
  const rows: any[] = [];
  if (!values.length) return { rows, warnings };
  const roomRow = values[0] || [];
  const timeCol = detectTimeCol(values);
  // map columns -> room name (forward-fill across blank paired columns, for Glories)
  const colRoom: Record<number, string> = {};
  let lastRoom = "";
  for (let c = timeCol + 1; c < roomRow.length; c++) {
    const name = clean(roomRow[c]);
    if (name) { lastRoom = name; colRoom[c] = name; }
    else if (lastRoom) colRoom[c] = lastRoom; // paired day-group column for the same room
  }
  const skip = new Set(skipRows);
  const seen = new Set<string>();
  for (let r = 1; r < values.length; r++) {
    if (skip.has(r)) continue;
    const row = values[r] || [];
    for (let c = timeCol + 1; c < row.length; c++) {
      const room = colRoom[c];
      if (!room) continue;
      const p = parseCell(row[c]);
      if (!p || !p.teacher || !p.level) continue;
      const source_key = `${location}|${room}|${p.teacher}|${p.level}|${p.module}|${p.time_start}`;
      if (seen.has(source_key)) continue;
      seen.add(source_key);
      rows.push({ ...p, room, location, source_key, source_tab: `Salas ${location}` });
    }
  }
  return { rows, warnings };
}

// header-mapped tabular parse: returns rows keyed by mapped field names
function headerIndex(headerRow: any[], wanted: Record<string, string>): Record<string, number> {
  const idx: Record<string, number> = {};
  const H = headerRow.map(norm);
  for (const [field, headerText] of Object.entries(wanted)) {
    const target = norm(headerText);
    let found = -1;
    for (let i = 0; i < H.length; i++) { if (H[i] && (H[i] === target || H[i].includes(target) || target.includes(H[i]))) { found = i; break; } }
    idx[field] = found;
  }
  return idx;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey" } });
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    let body: any = {}; try { body = await req.json(); } catch (_e) {}
    // auth: cron token OR admin JWT
    let authed = body.token === SYNC_TOKEN;
    if (!authed) {
      const auth = req.headers.get("Authorization");
      if (auth) {
        const uc = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
        const { data: { user } } = await uc.auth.getUser();
        if (user) { const { data: p } = await db.from("profiles").select("role").eq("id", user.id).single(); authed = !!p && ["admin", "super_admin"].includes(p.role); }
      }
    }
    if (!authed) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: cors });

    const dryRun = !!body.dry_run;
    const sheetId = body.spreadsheet_id || DEFAULT_SHEET_ID;
    const token = await getGoogleAccessToken();
    const modifiedTime = await driveModifiedTime(token, sheetId);

    // change-guard: skip if unchanged since last successful sync (unless forced/dry-run)
    if (!dryRun && !body.force && modifiedTime) {
      const { data: last } = await db.from("schedule_sync").select("source_modified_time").eq("ok", true).order("started_at", { ascending: false }).limit(1);
      if (last?.length && last[0].source_modified_time && new Date(last[0].source_modified_time) >= new Date(modifiedTime)) {
        return new Response(JSON.stringify({ skipped: true, reason: "unchanged", modifiedTime }), { headers: cors });
      }
    }

    const RANGES = { raval: "Salas Raval", glories: "Salas Glories", trials: "Pruebas", privates: "Priv", tutorias: "tutorías!A1:F40" };
    const data = await batchGet(token, sheetId, Object.values(RANGES));
    const warnings: string[] = [];

    // --- group classes ---
    const ravalG = parseSalasGrid(data[RANGES.raval] || [], "Raval", [1]);
    const gloriesG = parseSalasGrid(data[RANGES.glories] || [], "Glories", [1, 2]);
    const classes = [...ravalG.rows, ...gloriesG.rows];
    warnings.push(...ravalG.warnings, ...gloriesG.warnings);

    // --- trials (Pruebas) ---
    const trialsRaw = data[RANGES.trials] || [];
    const trials: any[] = [];
    if (trialsRaw.length > 1) {
      const idx = headerIndex(trialsRaw[0], { period_label: "Day", teacher: "Profe", level: "Nivel", new_or_old: "N/O", hours: "Horas", class_time: "Time", location: "R/G", student_name: "Estudiante", status: "Status", email: "Email", signed_up_by: "signed", attended: "Did they come", signed_up: "Signed up", comments: "After trial comments" });
      if (idx.teacher < 0 || idx.student_name < 0) warnings.push("trials: missing key headers (Profe/Estudiante) — structure drift?");
      for (let r = 1; r < trialsRaw.length; r++) {
        const row = trialsRaw[r] || [];
        const g = (f: string) => idx[f] >= 0 ? clean(row[idx[f]]) : "";
        const student = g("student_name"), teacher = g("teacher"), period = g("period_label");
        if (!student && !teacher) continue;
        trials.push({ source_key: `${period}|${teacher}|${student}|${r}`, period_label: period, teacher, level: g("level"), new_or_old: g("new_or_old"), hours: g("hours"), class_time: g("class_time"), location: g("location"), student_name: student, status: g("status"), email: g("email"), signed_up_by: g("signed_up_by"), attended: g("attended"), signed_up: g("signed_up"), comments: g("comments") });
      }
    }

    // --- privates (Priv) ---
    const privRaw = data[RANGES.privates] || [];
    const privates: any[] = [];
    if (privRaw.length > 1) {
      const idx = headerIndex(privRaw[0], { active: "Activo", student_name: "Nombre estudiante", level: "Nivel", availability: "Días disponibles", schedule_text: "Horario", location: "Raval", teacher: "queda", comments: "Comentarios" });
      if (idx.student_name < 0) warnings.push("privates: missing 'Nombre estudiante' header — structure drift?");
      for (let r = 1; r < privRaw.length; r++) {
        const row = privRaw[r] || [];
        const g = (f: string) => idx[f] >= 0 ? clean(row[idx[f]]) : "";
        const student = g("student_name");
        if (!student) continue;
        const act = norm(g("active"));
        privates.push({ source_key: `${student}|${g("teacher")}|${r}`, active: ["si", "sí", "yes", "x", "true"].includes(act), student_name: student, level: g("level"), availability: g("availability"), schedule_text: g("schedule_text"), location: g("location"), teacher: g("teacher"), comments: g("comments") });
      }
    }

    // --- tutorías (weekday grid) ---
    const tutRaw = data[RANGES.tutorias] || [];
    const tutorias: any[] = [];
    if (tutRaw.length) {
      const hdr = (tutRaw[0] || []).map(norm);
      const dayMap: Record<string, string> = { lunes: "L", martes: "M", "miércoles": "X", miercoles: "X", jueves: "J", viernes: "V" };
      const dayCols: Record<number, string> = {};
      for (let c = 1; c < hdr.length; c++) { const dd = dayMap[hdr[c]]; if (dd && !Object.values(dayCols).includes(dd)) dayCols[c] = dd; }
      for (let r = 1; r < tutRaw.length; r++) {
        const row = tutRaw[r] || [];
        const slot = clean(row[0]);
        if (!/\d/.test(slot)) continue;
        for (const cStr of Object.keys(dayCols)) {
          const c = parseInt(cStr); const val = clean(row[c]);
          if (!val) continue;
          const m = val.match(/^(.+?)\s*\(([A-Za-z])\)/);
          const teacher = m ? m[1].trim() : val;
          const loc = m ? ({ G: "Glories", R: "Raval", M: "Monumental" } as any)[m[2].toUpperCase()] || m[2] : null;
          tutorias.push({ source_key: `${dayCols[c]}|${slot}|${teacher}`, teacher, location: loc, day: dayCols[c], time_slot: slot });
        }
      }
    }

    const parsed = { classes: classes.length, trials: trials.length, privates: privates.length, tutorias: tutorias.length };

    if (dryRun) {
      return new Response(JSON.stringify({ dry_run: true, modifiedTime, parsed, warnings, samples: { classes: classes.slice(0, 4), trials: trials.slice(0, 3), privates: privates.slice(0, 3), tutorias: tutorias.slice(0, 4) } }, null, 2), { headers: cors });
    }

    // --- write path: diff + upsert + change log + sync log ---
    const { data: syncRow } = await db.from("schedule_sync").insert({ spreadsheet_id: sheetId, source_modified_time: modifiedTime, changed: true }).select("id").single();
    const syncId = syncRow?.id;
    const stats: any = {};

    async function syncEntity(table: string, entity: string, rows: any[], fields: string[]) {
      const { data: existing } = await db.from(table).select("*");
      const oldByKey: Record<string, any> = {}; (existing || []).forEach((e: any) => { oldByKey[e.source_key] = e; });
      const newByKey: Record<string, any> = {}; rows.forEach(r => { newByKey[r.source_key] = r; });
      const hash = (o: any) => fields.map(f => JSON.stringify(o[f] ?? null)).join("|");
      // Initial load (table was empty): don't flood schedule_changes with thousands of
      // "insert" rows — only record real day-to-day changes from the 2nd sync onward.
      const initialLoad = Object.keys(oldByKey).length === 0;
      let ins = 0, upd = 0, rem = 0;
      const changes: any[] = [];
      for (const k of Object.keys(newByKey)) {
        if (!oldByKey[k]) { ins++; if (!initialLoad) changes.push({ sync_id: syncId, entity, source_key: k, change_type: "insert" }); }
        else if (hash(newByKey[k]) !== hash(oldByKey[k])) { upd++; changes.push({ sync_id: syncId, entity, source_key: k, change_type: "update" }); }
      }
      for (const k of Object.keys(oldByKey)) if (!newByKey[k]) { rem++; changes.push({ sync_id: syncId, entity, source_key: k, change_type: "remove" }); }
      // apply: remove gone, upsert current
      const removeKeys = Object.keys(oldByKey).filter(k => !newByKey[k]);
      if (removeKeys.length) await db.from(table).delete().in("source_key", removeKeys);
      if (rows.length) {
        const payload = rows.map(r => ({ ...r, synced_at: new Date().toISOString() }));
        await db.from(table).upsert(payload, { onConflict: "source_key" });
      }
      if (changes.length) await db.from("schedule_changes").insert(changes);
      stats[entity] = { inserted: ins, updated: upd, removed: rem };
    }

    await syncEntity("schedule_classes", "classes", classes, ["teacher", "level", "module", "hours_per_week", "days", "time_start", "time_end", "room", "location", "student_count", "course_end", "start_date", "status", "rotation", "notes"]);
    await syncEntity("schedule_trials", "trials", trials, ["period_label", "teacher", "level", "hours", "class_time", "location", "student_name", "status", "attended", "signed_up", "comments"]);
    await syncEntity("schedule_privates", "privates", privates, ["active", "student_name", "level", "availability", "schedule_text", "location", "teacher", "comments"]);
    await syncEntity("schedule_tutorias", "tutorias", tutorias, ["teacher", "location", "day", "time_slot"]);

    await db.from("schedule_sync").update({ finished_at: new Date().toISOString(), stats, warnings, ok: true }).eq("id", syncId);
    return new Response(JSON.stringify({ ok: true, modifiedTime, parsed, stats, warnings }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: "exception", detail: String(e).slice(0, 400) }), { status: 500, headers: cors });
  }
});
