import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ---------------------------------------------------------------------------
// daily-digest — morning email for Rocío:
//   • Coverage gaps: teachers with an approved holiday in the next 14 days who
//     have group classes on those weekdays (subs not yet imported → "revisar").
//   • Recent schedule changes (last 24h, from schedule_changes).
//   • Today's classes overview.
// Sends via Resend. Until worldclassbcn.com is verified, runs in TEST mode:
// from onboarding@resend.dev → the Resend account's own address only.
//
// Auth: admin JWT OR body.token === DIGEST_TOKEN (Pi cron).
// Body: { dry_run?: true, to?: "addr" } — dry_run returns the HTML without sending.
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const DIGEST_TOKEN = "wcbcn_digest_8Qm2";
const DIGEST_FROM = Deno.env.get("DIGEST_FROM") || "WorldClass Atlas <onboarding@resend.dev>";
const DIGEST_TO = Deno.env.get("DIGEST_TO") || "danielbaudy@googlemail.com";
const COVERAGE_DAYS = 14;
const cors = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

function getSpainNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const DOW = ["D", "L", "M", "X", "J", "V", "S"]; // getDay(): 0=Sun..6=Sat
const DOW_NAME: Record<string, string> = { L: "lunes", M: "martes", X: "miércoles", J: "jueves", V: "viernes", S: "sábado", D: "domingo" };
// Full-day absence types (a sub would be needed). Hours-based partials excluded.
const FULL_DAY_TYPES = ["Annual", "Personal", "School", "Medical", "PermisoNoRet"];
const esc = (s: any) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey" } });
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    let body: any = {}; try { body = await req.json(); } catch (_e) {}
    let authed = body.token === DIGEST_TOKEN;
    if (!authed) {
      const auth = req.headers.get("Authorization");
      if (auth) {
        const uc = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
        const { data: { user } } = await uc.auth.getUser();
        if (user) { const { data: p } = await db.from("profiles").select("role").eq("id", user.id).single(); authed = !!p && ["admin", "super_admin"].includes(p.role); }
      }
    }
    if (!authed) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: cors });

    const now = getSpainNow();
    const today = ymd(now);
    const horizon = new Date(now); horizon.setDate(now.getDate() + COVERAGE_DAYS);
    const horizonStr = ymd(horizon);
    const todayLetter = DOW[now.getDay()];

    // --- load data ---
    const [{ data: classes }, { data: holsRaw }, { data: profiles }, { data: changes }] = await Promise.all([
      db.from("schedule_classes").select("teacher, level, module, time_start, time_end, room, location, days, student_count"),
      db.from("holiday_requests").select("user_id, type, start_date, end_date").eq("status", "Approved").in("type", FULL_DAY_TYPES).lte("start_date", horizonStr).gte("end_date", today),
      db.from("profiles").select("id, name"),
      db.from("schedule_changes").select("entity, source_key, change_type, detected_at").gte("detected_at", new Date(now.getTime() - 24 * 3600 * 1000).toISOString()).order("detected_at", { ascending: false }),
    ]);

    const profName: Record<string, string> = {};
    (profiles || []).forEach((p: any) => { profName[p.id] = p.name; });
    // index classes by teacher first-name (uppercase)
    const byTeacher: Record<string, any[]> = {};
    (classes || []).forEach((c: any) => {
      const k = String(c.teacher || "").toUpperCase();
      (byTeacher[k] = byTeacher[k] || []).push(c);
    });

    // --- coverage gaps ---
    const gaps: any[] = [];
    for (const h of holsRaw || []) {
      const fullName = profName[h.user_id] || "(desconocido)";
      const first = fullName.trim().split(/\s+/)[0].toUpperCase();
      const teacherClasses = byTeacher[first] || [];
      if (!teacherClasses.length) continue;
      const start = h.start_date > today ? h.start_date : today;
      const end = h.end_date < horizonStr ? h.end_date : horizonStr;
      const cur = new Date(start + "T12:00:00");
      const endD = new Date(end + "T12:00:00");
      while (cur <= endD) {
        const letter = DOW[cur.getDay()];
        const dayClasses = teacherClasses.filter((c: any) => c.days && c.days.includes(letter));
        for (const c of dayClasses) {
          gaps.push({ date: ymd(cur), weekday: letter, teacher: fullName, type: h.type, level: c.level, module: c.module, time: `${(c.time_start || "").slice(0, 5)}-${(c.time_end || "").slice(0, 5)}`, room: c.room, location: c.location, students: c.student_count });
        }
        cur.setDate(cur.getDate() + 1);
      }
    }
    gaps.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

    // --- today's classes ---
    const todays = (classes || []).filter((c: any) => c.days && c.days.includes(todayLetter))
      .map((c: any) => ({ time: `${(c.time_start || "").slice(0, 5)}-${(c.time_end || "").slice(0, 5)}`, teacher: c.teacher, level: c.level, module: c.module, room: c.room, location: c.location, students: c.student_count }))
      .sort((a, b) => (a.location + a.time).localeCompare(b.location + b.time));

    // --- build HTML ---
    const dateLabel = now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    let html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#0f172a">`;
    html += `<h2 style="color:#092b50;margin:0 0 4px">📋 Resumen del día — WorldClass BCN</h2>`;
    html += `<div style="color:#64748b;font-size:13px;margin-bottom:18px">${esc(dateLabel)}</div>`;

    // coverage gaps
    html += `<h3 style="color:#b45309;border-bottom:2px solid #fde68a;padding-bottom:4px">⚠️ Coberturas a vigilar (próximos ${COVERAGE_DAYS} días)</h3>`;
    if (!gaps.length) {
      html += `<p style="color:#16a34a">✓ Sin ausencias con clases por cubrir en los próximos ${COVERAGE_DAYS} días.</p>`;
    } else {
      html += `<p style="color:#64748b;font-size:12px;margin:4px 0">Profes con permiso/vacaciones aprobadas que tienen clase ese día. (Las sustituciones aún no se importan, así que conviene revisar que haya cobertura.)</p>`;
      html += `<table style="border-collapse:collapse;width:100%;font-size:13px"><tr style="background:#fef3c7;text-align:left"><th style="padding:6px;border:1px solid #fde68a">Fecha</th><th style="padding:6px;border:1px solid #fde68a">Profe</th><th style="padding:6px;border:1px solid #fde68a">Clase</th><th style="padding:6px;border:1px solid #fde68a">Sala</th></tr>`;
      for (const g of gaps) {
        const d = new Date(g.date + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
        html += `<tr><td style="padding:6px;border:1px solid #fef3c7">${esc(d)}</td><td style="padding:6px;border:1px solid #fef3c7"><b>${esc(g.teacher.split(" ")[0])}</b> <span style="color:#94a3b8;font-size:11px">(${esc(g.type)})</span></td><td style="padding:6px;border:1px solid #fef3c7">${esc(g.time)} · ${esc(g.level || "")}${g.module ? "/" + esc(g.module) : ""} <span style="color:#94a3b8">(${esc(g.students ?? "?")} al.)</span></td><td style="padding:6px;border:1px solid #fef3c7">${esc(g.room || "")} · ${esc(g.location || "")}</td></tr>`;
      }
      html += `</table>`;
    }

    // changes
    html += `<h3 style="color:#1d4ed8;border-bottom:2px solid #bfdbfe;padding-bottom:4px;margin-top:24px">🔔 Cambios en el horario (últimas 24h)</h3>`;
    if (!changes || !changes.length) {
      html += `<p style="color:#64748b">Sin cambios registrados.</p>`;
    } else {
      const tn: Record<string, string> = { insert: "➕ nuevo", update: "✏️ modificado", remove: "➖ eliminado" };
      html += `<ul style="font-size:13px;padding-left:18px">`;
      for (const c of changes.slice(0, 40)) {
        html += `<li><span style="color:#64748b">${esc(tn[c.change_type] || c.change_type)}</span> · ${esc(c.entity)} · <span style="color:#475569">${esc(c.source_key)}</span></li>`;
      }
      html += `</ul>`;
    }

    // today's classes
    html += `<h3 style="color:#0f766e;border-bottom:2px solid #99f6e4;padding-bottom:4px;margin-top:24px">📅 Clases de hoy (${esc(DOW_NAME[todayLetter] || "")})</h3>`;
    if (!todays.length) {
      html += `<p style="color:#64748b">No hay clases de grupo hoy.</p>`;
    } else {
      html += `<table style="border-collapse:collapse;width:100%;font-size:13px"><tr style="background:#ccfbf1;text-align:left"><th style="padding:6px;border:1px solid #99f6e4">Hora</th><th style="padding:6px;border:1px solid #99f6e4">Profe</th><th style="padding:6px;border:1px solid #99f6e4">Nivel</th><th style="padding:6px;border:1px solid #99f6e4">Sala · Sede</th></tr>`;
      for (const c of todays) {
        html += `<tr><td style="padding:6px;border:1px solid #ccfbf1">${esc(c.time)}</td><td style="padding:6px;border:1px solid #ccfbf1">${esc(c.teacher)}</td><td style="padding:6px;border:1px solid #ccfbf1">${esc(c.level || "")}${c.module ? "/" + esc(c.module) : ""}</td><td style="padding:6px;border:1px solid #ccfbf1">${esc(c.room || "")} · ${esc(c.location || "")}</td></tr>`;
      }
      html += `</table>`;
    }

    html += `<p style="color:#94a3b8;font-size:11px;margin-top:24px;border-top:1px solid #e2e8f0;padding-top:8px">Generado automáticamente desde la hoja de horarios (solo lectura). Las pruebas (trials) se añadirán al resumen más adelante.</p></div>`;

    const subject = `📋 Resumen WorldClass — ${now.toLocaleDateString("es-ES", { day: "numeric", month: "long" })}${gaps.length ? ` · ⚠️ ${gaps.length} cobertura(s)` : ""}`;
    const summary = { gaps: gaps.length, changes: (changes || []).length, today_classes: todays.length };

    if (body.dry_run) {
      return new Response(JSON.stringify({ dry_run: true, summary, subject, html }, null, 2), { headers: cors });
    }
    if (!RESEND_API_KEY) return new Response(JSON.stringify({ error: "RESEND_API_KEY not set", summary }), { status: 500, headers: cors });

    const to = body.to || DIGEST_TO;
    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: DIGEST_FROM, to: [to], subject, html }),
    });
    const sendJson = await send.json();
    if (!send.ok) return new Response(JSON.stringify({ error: "resend", detail: sendJson, summary }), { status: 502, headers: cors });
    return new Response(JSON.stringify({ ok: true, sent_to: to, email_id: sendJson.id, summary }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: "exception", detail: String(e).slice(0, 400) }), { status: 500, headers: cors });
  }
});
