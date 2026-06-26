import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_MODEL = "gemini-2.5-flash";
const EMBEDDING_MODEL = "gemini-embedding-001";
const DAILY_LIMIT = 20;
const DEFAULT_MAX_PAST_DAYS = 180;

function getSpainNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
}

function getWeekDates() {
  const now = getSpainNow();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;
  const dayOfWeek = now.getDay();
  const daysES = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  const todayName = daysES[dayOfWeek];
  const currentTime = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const thisMonday = new Date(now); thisMonday.setDate(now.getDate() + mondayOffset);
  const thisFriday = new Date(thisMonday); thisFriday.setDate(thisMonday.getDate() + 4);
  const lastMonday = new Date(thisMonday); lastMonday.setDate(thisMonday.getDate() - 7);
  const lastFriday = new Date(lastMonday); lastFriday.setDate(lastMonday.getDate() + 4);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return { today, todayName, currentTime, year, thisMonday: fmt(thisMonday), thisFriday: fmt(thisFriday), lastMonday: fmt(lastMonday), lastFriday: fmt(lastFriday) };
}

const TOPIC_KEYWORDS: Record<string, string[]> = {
  evaluacion: ["examen", "evalua", "nota", "aprueba", "suspende", "certificado", "rúbrica", "tarea evaluable", "calificaci"],
  sustitucion: ["susti", "cubrir", "sustitu", "reemplaz"],
  materiales: ["material", "libro", "cuadernillo", "campus", "drive", "programa", "bolsa", "fotocopia", "infograf"],
  horario: ["horario", "clase", "grupo", "sesión", "extensivo", "intensivo", "semi"],
  vacaciones: ["vacacion", "permiso", "días libre", "asuntos propios", "baja", "festivo"],
  fichaje: ["ficha", "punch", "hora trabajada", "entrada", "salida", "registro"],
  onboarding: ["nuevo profe", "primer día", "email escuela", "acceso", "drive", "classroom"]
};

function categorize(question: string): string {
  const q = question.toLowerCase();
  for (const [topic, kws] of Object.entries(TOPIC_KEYWORDS)) {
    if (kws.some(kw => q.includes(kw))) return topic;
  }
  return "otro";
}

function isRealDriveId(id: string): boolean {
  return /^1[a-zA-Z0-9_-]{10,}$/.test(id);
}

// --- Punch SOP gate ---------------------------------------------------------
// Detects a punch ACTION request ("ficha junio", "fichame como la primera semana", "registra
// mis horas") - NOT a how-to question ("como ficho?"). When true, the punch flow runs with
// forced tool-calling (Gemini mode=ANY) so Atlas MUST call get_work_hours/add_punches instead
// of free-texting a confirmation. Makes the preview->buttons step deterministic.
function isPunchActionIntent(message: string): boolean {
  const m = (message || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Procedural / how-to questions are NOT actions - let them go to search_materials.
  if (/\b(como|que es|para que|puedo|se puede|cual|cuand|cuant)\b/.test(m)) return false;
  return /\bficha(r|me|s)?\b/.test(m)               // ficha / fichar / fichame / fichas
      || /\bfichaj/.test(m)                          // fichaje(s)
      || /registra.*(hora|jornada)/.test(m)          // "registra mis horas"
      || /anad(e|ir|ime).*(fichaj|hora)/.test(m)     // "anade un fichaje"
      || /pon(er|me|)?\s+(mis\s+)?(hora|fichaj)/.test(m); // "ponme las horas"
}

// Retry Gemini calls on transient rate-limit / overload responses with exponential backoff.
async function fetchWithRetry(url: string, options: any, maxRetries = 2): Promise<Response> {
  let res = await fetch(url, options);
  let attempt = 0;
  while ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
    const wait = 800 * Math.pow(2, attempt); // 800ms, then 1600ms
    await new Promise(r => setTimeout(r, wait));
    res = await fetch(url, options);
    attempt++;
  }
  return res;
}

// Generate dates between start and end, filtered by allowed days of week and excluding holidays
function generateDatesForRange(startDate: string, endDate: string, allowedDays: number[], holidayDates: Set<string>): string[] {
  const dates: string[] = [];
  const current = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');
  while (current <= end) {
    const dow = current.getDay();
    const y = current.getFullYear();
    const m = String(current.getMonth()+1).padStart(2,'0');
    const d = String(current.getDate()).padStart(2,'0');
    const dateStr = `${y}-${m}-${d}`;
    if (allowedDays.includes(dow) && !holidayDates.has(dateStr)) {
      dates.push(dateStr);
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

const tools = [{ function_declarations: [
  { name: "get_holidays", description: "Consultar saldo de vacaciones y permisos.", parameters: { type: "object", properties: { user_id: { type: "string" } } } },
  { name: "get_work_hours", description: "Consultar horas trabajadas. Por defecto mes actual. Devuelve el total Y el detalle por día con las horas de entrada/salida (sesiones), para poder replicar un horario existente.", parameters: { type: "object", properties: { user_id: { type: "string" }, start_date: { type: "string" }, end_date: { type: "string" } } } },
  { name: "get_schedule", description: "Consultar el HORARIO de clases (grupos), tutorías y privados de un profesor desde la hoja de la escuela. Por defecto el profe actual y el día de hoy. Úsalo para '¿qué clases tengo hoy?', 'mi horario', 'qué doy el martes', etc.", parameters: { type: "object", properties: { teacher: { type: "string", description: "Nombre del profe (solo admins pueden consultar a otros; los profes ven el suyo)" }, day: { type: "string", description: "Día de la semana: L, M, X, J, V, S o D. Por defecto hoy." }, all_week: { type: "boolean", description: "true para ver toda la semana en vez de un solo día" } } } },
  { name: "search_materials", description: "Buscar en la base de conocimiento de la escuela: procedimientos, normas, materiales, convenio, programas, evaluaciones y cualquier información sobre cómo funciona WorldClass BCN. USA ESTA HERRAMIENTA para CUALQUIER pregunta sobre procedimientos o 'cómo se hace X'.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "request_holiday", description: "Solicitar vacaciones o permiso. Tipos: Annual, Personal, School, Medical, MedAppt (horas), Permiso (Permiso Retribuido — REQUIERE permiso_motive a-j y hours), PermisoNoRet (Permiso No Retribuido — por días).", parameters: { type: "object", properties: { type: { type: "string" }, start_date: { type: "string" }, end_date: { type: "string" }, days: { type: "number" }, reason: { type: "string" }, hours: { type: "number", description: "Horas de ausencia para Permiso Retribuido (cuentan como trabajadas)" }, permiso_motive: { type: "string", description: "Motivo del Permiso Retribuido (Art. 28): una letra a-j" }, confirmed: { type: "boolean" } }, required: ["type"] } },
  { name: "add_punches", description: "Añadir fichajes. Para horario uniforme usa start_date+end_date+in_time+out_time+days_of_week. Para horario que VARÍA según el día de la semana usa start_date+end_date+schedule. El sistema excluye festivos y días ya fichados automáticamente. Siempre confirmed=false primero.", parameters: { type: "object", properties: { start_date: { type: "string", description: "Fecha inicio YYYY-MM-DD" }, end_date: { type: "string", description: "Fecha fin YYYY-MM-DD" }, in_time: { type: "string", description: "Hora entrada HH:MM (horario uniforme)" }, out_time: { type: "string", description: "Hora salida HH:MM (horario uniforme)" }, days_of_week: { type: "string", description: "Días a incluir: 'workdays' (lun-vie, por defecto), 'mon,tue,wed,thu,fri,sat,sun', o 'all'" }, schedule: { type: "string", description: "Horario semanal en JSON cuando las horas cambian según el día. Claves: mon,tue,wed,thu,fri,sat,sun; cada una con in y out (HH:MM). Ej: {mon:{in:'09:30',out:'14:30'},tue:{in:'17:00',out:'21:00'}}. Úsalo con start_date+end_date." }, punches: { type: "string", description: "JSON para días sueltos no consecutivos: [{date:'YYYY-MM-DD',in_time:'HH:MM',out_time:'HH:MM'}]" }, confirmed: { type: "boolean" } } } },
]}];

async function executeTool(name: string, args: any, ctx: any, db: any) {
  if (name === "get_holidays") {
    const uid = ctx.role === "teacher" ? ctx.userId : (args.user_id || ctx.userId);
    const { data: p } = await db.from("profiles").select("annual_days, personal_days, school_days, med_appt_hours, unpaid_days").eq("id", uid).single();
    const { data: h } = await db.from("holiday_requests").select("type, days, hours").eq("user_id", uid).eq("status", "Approved");
    if (!p) return { error: "Perfil no encontrado" };
    const u: any = { Annual: 0, Personal: 0, School: 0, Medical: 0, MedAppt: 0, Permiso: 0, PermisoNoRet: 0 };
    // hours-based types (MedAppt, Permiso) store hours in the `days` column, same as day-based store days
    for (const x of h || []) { u[x.type] = (u[x.type] || 0) + (x.days || 0); }
    const unpaidCap = p.unpaid_days != null ? p.unpaid_days : 10;
    return { Vacaciones: `${p.annual_days - u.Annual}/${p.annual_days} días`, "D.R. Empleado": `${p.personal_days - u.Personal}/${p.personal_days}`, "D.R. Empresa": `${p.school_days - u.School}/${p.school_days}`, "Visita Médica": `${p.med_appt_hours - u.MedAppt}/${p.med_appt_hours}h`, "Baja Médica": `${u.Medical} (sin límite)`, "Permiso Retribuido": `${Math.round(u.Permiso*10)/10}h usadas (cuentan como trabajadas; sin límite de horas)`, "Permiso No Retribuido": `${unpaidCap - u.PermisoNoRet}/${unpaidCap} días` };
  }
  if (name === "get_work_hours") {
    const uid = ctx.role === "teacher" ? ctx.userId : (args.user_id || ctx.userId);
    const spainNow = getSpainNow();
    const s = args.start_date || `${spainNow.getFullYear()}-${String(spainNow.getMonth()+1).padStart(2,"0")}-01`;
    const e = args.end_date || `${spainNow.getFullYear()}-${String(spainNow.getMonth()+1).padStart(2,"0")}-${String(spainNow.getDate()).padStart(2,"0")}`;
    const { data: punches } = await db.from("time_punches").select("date, time, punch_type").eq("user_id", uid).gte("date", s).lte("date", e).order("date").order("time");
    const byD: any = {};
    for (const p of punches || []) { if (!byD[p.date]) byD[p.date] = []; byD[p.date].push(p); }
    let tot = 0;
    const detalle: any[] = [];
    for (const date of Object.keys(byD).sort()) {
      const d = byD[date].slice().sort((a:any,b:any) => a.time.localeCompare(b.time));
      const ins = d.filter((x:any) => x.punch_type==="IN");
      const outs = d.filter((x:any) => x.punch_type==="OUT");
      const sesiones: any[] = []; let dayH = 0;
      for (let i=0;i<Math.min(ins.length,outs.length);i++) {
        const entrada = ins[i].time.slice(0,5); const salida = outs[i].time.slice(0,5);
        sesiones.push({ entrada, salida });
        dayH += (new Date(`2000-01-01T${outs[i].time}`).getTime()-new Date(`2000-01-01T${ins[i].time}`).getTime())/3600000;
      }
      tot += dayH;
      detalle.push({ fecha: date, sesiones, horas: Math.round(dayH*100)/100 });
    }
    return { periodo: `${s} a ${e}`, horas_totales: Math.round(tot*100)/100, dias_trabajados: Object.keys(byD).length, detalle };
  }
  if (name === "get_schedule") {
    // Teachers see their own schedule; admins may pass a teacher name.
    let teacherName = args.teacher;
    if (ctx.role === "teacher" || !teacherName) teacherName = String(ctx.name || "").trim().split(/\s+/)[0];
    if (!teacherName) return { error: "No pude identificar al profe." };
    const spainNow = getSpainNow();
    const dow = ["D", "L", "M", "X", "J", "V", "S"][spainNow.getDay()];
    const day = String(args.day || dow).toUpperCase();
    const allWeek = !!args.all_week;
    const dayNames: any = { L: "lunes", M: "martes", X: "miércoles", J: "jueves", V: "viernes", S: "sábado", D: "domingo" };

    // Accent-insensitive + nickname matching between profile names and sheet teacher names.
    const tnorm = (s: any) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
    const ALIASES: Record<string, string[]> = { BEATRIZ: ["BEA"], CLAUDIA: ["CLAU"], NICOLAS: ["NICO"], VERONICA: ["VERO"], FRANCISCO: ["PACO"] };
    const baseKey = tnorm(teacherName);
    const cand = new Set([baseKey, ...(ALIASES[baseKey] || [])]);
    const matchT = (t: any) => cand.has(tnorm(t));
    const [clsRes, tutRes, privRes] = await Promise.all([
      db.from("schedule_classes").select("teacher, level, module, time_start, time_end, room, location, days, student_count, status"),
      db.from("schedule_tutorias").select("teacher, location, day, time_slot"),
      db.from("schedule_privates").select("student_name, level, schedule_text, location, teacher, active"),
    ]);
    const classes = (clsRes.data || []).filter((c: any) => matchT(c.teacher));
    const tut = (tutRes.data || []).filter((t: any) => matchT(t.teacher));
    const privs = (privRes.data || []).filter((p: any) => matchT(p.teacher));

    const clases = (classes || []).filter((c: any) => allWeek || (c.days && c.days.includes(day)))
      .map((c: any) => ({ nivel: c.level, modulo: c.module, horario: `${(c.time_start || "").slice(0, 5)}-${(c.time_end || "").slice(0, 5)}`, sala: c.room, sede: c.location, dias: (c.days || []).join(""), alumnos: c.student_count, estado: c.status }))
      .sort((a: any, b: any) => (a.horario || "").localeCompare(b.horario || ""));
    const tutorias = (tut || []).filter((t: any) => allWeek || t.day === day)
      .map((t: any) => ({ dia: t.day, hora: t.time_slot, sede: t.location }));
    const privados = (privs || []).filter((p: any) => p.active)
      .map((p: any) => ({ alumno: p.student_name, nivel: p.level, horario: p.schedule_text, sede: p.location }));

    if (!clases.length && !tutorias.length && !privados.length) {
      return { mensaje: `No encontré clases para ${teacherName}${allWeek ? "" : ` el ${dayNames[day] || day}`}. El horario se sincroniza desde la hoja de la escuela; si crees que falta algo, puede que aún no esté en el sistema.` };
    }
    return { profe: teacherName, dia: allWeek ? "toda la semana" : (dayNames[day] || day), clases, tutorias, privados, nota: "Horario de solo lectura, sincronizado desde la hoja de la escuela." };
  }
  if (name === "search_materials") {
    const r = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: `models/${EMBEDDING_MODEL}`, content: { parts: [{ text: args.query }] } }) });
    if (!r.ok) return { message: "Error en búsqueda" };
    const emb = await r.json();
    const { data } = await db.rpc("search_materials", { query_embedding: `[${emb.embedding.values.join(",")}]`, match_threshold: 0.45, match_count: 5 });
    if (!data?.length) return { message: "No encontré información sobre esto. Pregunta a Rocío directamente." };
    return { resultados: data.map((x:any) => {
      const result: any = { nombre: x.file_name, extracto: x.chunk_text?.substring(0, 300) };
      if (isRealDriveId(x.drive_file_id)) {
        result.enlace = `https://drive.google.com/file/d/${x.drive_file_id}/view`;
      }
      return result;
    }) };
  }
  if (name === "request_holiday") {
    const tn: any = { Annual: "Vacaciones", Personal: "D.R. Empleado", School: "D.R. Empresa", Medical: "Baja Médica", MedAppt: "Visita Médica", Permiso: "Permiso Retribuido", PermisoNoRet: "Permiso No Retribuido" };
    const PERMISO_MOTIVES: any = { a: { label: "Matrimonio", limit: 15 }, b: { label: "Hospitalización/enfermedad grave de familiar", limit: 5 }, c: { label: "Fallecimiento de familiar", limit: 3 }, d: { label: "Traslado de domicilio", limit: 1 }, e: { label: "Boda de hijo/a, hermano/a o familiar 1er grado", limit: 1 }, f: { label: "Deber público (votar, etc.)", limit: null }, h: { label: "Funciones sindicales", limit: null }, i: { label: "Exámenes prenatales / adopción", limit: null }, j: { label: "Imposibilidad de acceder al centro", limit: 4 } };

    // --- Permiso Retribuido (Art. 28): hours-based, motive + date + hours, credited as worked ---
    if (args.type === "Permiso") {
      const motive = (args.permiso_motive || "").toLowerCase().trim();
      const md = PERMISO_MOTIVES[motive];
      if (!md) return { error: "Falta el motivo del permiso retribuido. Pregunta al usuario el motivo (a-j) y envíalo en permiso_motive." };
      const hrs = Math.round((args.hours || 0) * 10) / 10;
      if (!hrs || hrs <= 0) return { error: "Falta el número de horas de ausencia (hours)." };
      const date = args.start_date;
      if (!date) return { error: "Falta la fecha del permiso." };
      // Contingent: distinct dates per motive this year (approved + pending)
      let contingentMsg = "sin límite fijo";
      if (md.limit != null) {
        const year = date.slice(0, 4);
        const { data: existing } = await db.from("holiday_requests").select("start_date").eq("user_id", ctx.userId).eq("type", "Permiso").eq("permiso_motive", motive).neq("status", "Rejected");
        const usedDates = new Set((existing || []).map((r: any) => r.start_date).filter((d: string) => (d || "").slice(0, 4) === year));
        const left = Math.max(0, md.limit - usedDates.size);
        contingentMsg = `${left}/${md.limit} días`;
        if (!usedDates.has(date) && usedDates.size >= md.limit) {
          return { error: `Has agotado el contingente de "${md.label}" (${md.limit} días/año).` };
        }
      }
      if (!args.confirmed) {
        return { status: "needs_confirmation", resumen: { tipo: "Permiso Retribuido", motivo: md.label, fecha: date, horas: hrs, contingente: contingentMsg }, mensaje: "Confirma para enviar." };
      }
      const { error } = await db.from("holiday_requests").insert({ user_id: ctx.userId, type: "Permiso", start_date: date, end_date: date, days: hrs, permiso_motive: motive, reason: md.label + (args.reason ? " • " + args.reason : ""), status: "Pending" });
      if (error) return { error: error.message };
      return { mensaje: `✅ Permiso retribuido enviado (${md.label}, ${hrs}h). Pendiente de aprobación.` };
    }

    // --- Permiso No Retribuido (Art. 29): day-based, with annual contingent ---
    if (args.type === "PermisoNoRet") {
      if (!args.start_date || !args.end_date) return { error: "Faltan las fechas (inicio y fin)." };
      if (!args.reason || !args.reason.trim()) return { error: "El motivo es obligatorio para el permiso no retribuido." };
      const reqDays = args.days || 0;
      const { data: prof } = await db.from("profiles").select("unpaid_days").eq("id", ctx.userId).single();
      const cap = prof?.unpaid_days != null ? prof.unpaid_days : 10;
      const { data: existing } = await db.from("holiday_requests").select("days").eq("user_id", ctx.userId).eq("type", "PermisoNoRet").neq("status", "Rejected");
      const used = (existing || []).reduce((s: number, r: any) => s + (r.days || 0), 0);
      if (used + reqDays > cap) {
        return { error: `Supera el contingente de permiso no retribuido (${cap} días/año, te quedan ${Math.max(0, cap - used)}).` };
      }
      if (!args.confirmed) {
        return { status: "needs_confirmation", resumen: { tipo: "Permiso No Retribuido", inicio: args.start_date, fin: args.end_date, dias: reqDays, restante_tras_solicitud: Math.max(0, cap - used - reqDays), motivo: args.reason }, mensaje: "Confirma para enviar." };
      }
      const { error } = await db.from("holiday_requests").insert({ user_id: ctx.userId, type: "PermisoNoRet", start_date: args.start_date, end_date: args.end_date, days: reqDays, reason: args.reason, status: "Pending" });
      if (error) return { error: error.message };
      return { mensaje: "✅ Permiso no retribuido enviado. Pendiente de aprobación." };
    }

    // --- All other day-based types (Annual, Personal, School, Medical, MedAppt) ---
    if (!args.confirmed) {
      return { status: "needs_confirmation", resumen: { tipo: tn[args.type] || args.type, inicio: args.start_date, fin: args.end_date, dias: args.days, horas: args.hours || null, motivo: args.reason || null }, mensaje: "Confirma para enviar." };
    }
    const d: any = { user_id: ctx.userId, type: args.type, start_date: args.start_date, end_date: args.end_date, days: args.days, status: "Pending" };
    if (args.reason) d.reason = args.reason; if (args.hours) d.hours = args.hours;
    const { error } = await db.from("holiday_requests").insert(d);
    if (error) return { error: error.message };
    return { mensaje: "✅ Solicitud enviada. Pendiente de aprobación." };
  }
  if (name === "add_punches") {
    // Build punch list
    let punchList: Array<{date: string, in_time: string, out_time: string}>;
    if (args.start_date && args.end_date && args.schedule) {
      // Weekly-schedule mode: different hours per weekday over a date range
      let sched: any;
      try { sched = typeof args.schedule === 'string' ? JSON.parse(args.schedule) : args.schedule; }
      catch(_e) { return { error: "El horario (schedule) debe ser un JSON tipo {mon:{in:'09:30',out:'14:30'},...}." }; }
      const dayNames = ['sun','mon','tue','wed','thu','fri','sat'];
      const holidayDates = new Set<string>();
      const { data: schoolHolidays } = await db.from('school_holidays').select('start_date, end_date');
      for (const h of schoolHolidays || []) {
        const cur = new Date(h.start_date + 'T12:00:00'); const end = new Date(h.end_date + 'T12:00:00');
        while (cur <= end) { holidayDates.add(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`); cur.setDate(cur.getDate() + 1); }
      }
      const { data: userHolidays } = await db.from('holiday_requests').select('start_date, end_date').eq('user_id', ctx.userId).eq('status', 'Approved');
      for (const h of userHolidays || []) {
        const cur = new Date(h.start_date + 'T12:00:00'); const end = new Date(h.end_date + 'T12:00:00');
        while (cur <= end) { holidayDates.add(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`); cur.setDate(cur.getDate() + 1); }
      }
      punchList = [];
      const cur = new Date(args.start_date + 'T12:00:00');
      const end = new Date(args.end_date + 'T12:00:00');
      while (cur <= end) {
        const wd = dayNames[cur.getDay()];
        const ds = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
        const slot = sched[wd];
        const inT = slot && (slot.in || slot.in_time);
        const outT = slot && (slot.out || slot.out_time);
        if (inT && outT && !holidayDates.has(ds)) {
          punchList.push({ date: ds, in_time: inT, out_time: outT });
        }
        cur.setDate(cur.getDate() + 1);
      }
    } else if (args.start_date && args.end_date && args.in_time && args.out_time) {
      // Range mode — parse days_of_week
      const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
      let allowedDays: number[];
      const dowArg = (args.days_of_week || 'workdays').toLowerCase().trim();
      if (dowArg === 'workdays' || dowArg === 'laborables') {
        allowedDays = [1, 2, 3, 4, 5]; // Mon-Fri
      } else if (dowArg === 'all' || dowArg === 'todos') {
        allowedDays = [0, 1, 2, 3, 4, 5, 6];
      } else {
        // Parse comma-separated day names
        allowedDays = dowArg.split(',').map((d: string) => dayMap[d.trim()] ?? -1).filter((d: number) => d >= 0);
        if (!allowedDays.length) allowedDays = [1, 2, 3, 4, 5]; // fallback to workdays
      }
      // Load school holidays to exclude
      const { data: schoolHolidays } = await db.from('school_holidays').select('start_date, end_date');
      const holidayDates = new Set<string>();
      for (const h of schoolHolidays || []) {
        const cur = new Date(h.start_date + 'T12:00:00');
        const end = new Date(h.end_date + 'T12:00:00');
        while (cur <= end) {
          holidayDates.add(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`);
          cur.setDate(cur.getDate() + 1);
        }
      }
      // Also exclude user's approved holiday dates
      const { data: userHolidays } = await db.from('holiday_requests').select('start_date, end_date').eq('user_id', ctx.userId).eq('status', 'Approved');
      for (const h of userHolidays || []) {
        const cur = new Date(h.start_date + 'T12:00:00');
        const end = new Date(h.end_date + 'T12:00:00');
        while (cur <= end) {
          holidayDates.add(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`);
          cur.setDate(cur.getDate() + 1);
        }
      }
      const workdays = generateDatesForRange(args.start_date, args.end_date, allowedDays, holidayDates);
      punchList = workdays.map(d => ({ date: d, in_time: args.in_time, out_time: args.out_time }));
    } else if (args.punches) {
      try {
        const parsed = typeof args.punches === 'string' ? JSON.parse(args.punches) : args.punches;
        if (!Array.isArray(parsed)) throw new Error('not array');
        punchList = parsed;
      } catch(_e) { return { error: "Para un rango de fechas usa start_date + end_date + in_time + out_time (y opcionalmente days_of_week). Para días sueltos usa punches con JSON válido." }; }
    } else {
      return { error: "Necesito start_date + end_date + in_time + out_time para un rango, o un JSON de fichajes en punches." };
    }
    const { data: configRows } = await db.from("app_config").select("key, value").in("key", ["FreezeDate", "AllowPastPunches", "MaxPastDays"]);
    const config: any = {}; for (const r of configRows || []) config[r.key] = r.value;
    const freezeDate = config.FreezeDate || null;
    const allowPast = config.AllowPastPunches !== "false";
    const maxPastDays = parseInt(config.MaxPastDays || String(DEFAULT_MAX_PAST_DAYS));
    const spainNow = getSpainNow();
    const today = `${spainNow.getFullYear()}-${String(spainNow.getMonth()+1).padStart(2,'0')}-${String(spainNow.getDate()).padStart(2,'0')}`;
    const currentTime = `${String(spainNow.getHours()).padStart(2,"0")}:${String(spainNow.getMinutes()).padStart(2,"0")}`;
    const todayDate = new Date(today);
    // Check already punched days (batch query, max 200 at a time)
    const allDates = punchList.map(p => p.date);
    const alreadyPunched = new Set<string>();
    for (let i = 0; i < allDates.length; i += 200) {
      const batch = allDates.slice(i, i + 200);
      const { data: existing } = await db.from("time_punches").select("date").eq("user_id", ctx.userId).in("date", batch);
      for (const p of existing || []) alreadyPunched.add(p.date);
    }
    const valid: typeof punchList = []; const rejected: string[] = [];
    for (const p of punchList) {
      if (alreadyPunched.has(p.date)) { rejected.push(`${p.date}: Ya fichado.`); continue; }
      if (p.date > today) { rejected.push(`${p.date}: Fecha futura.`); continue; }
      if (freezeDate && p.date <= freezeDate) { rejected.push(`${p.date}: Congelada.`); continue; }
      if (!allowPast && p.date < today) { rejected.push(`${p.date}: Pasado no permitido.`); continue; }
      const diff = Math.floor((todayDate.getTime() - new Date(p.date).getTime()) / 86400000);
      if (diff > maxPastDays) { rejected.push(`${p.date}: >${maxPastDays} días (año equivocado?).`); continue; }
      if (!p.in_time?.match(/^\d{2}:\d{2}$/) || !p.out_time?.match(/^\d{2}:\d{2}$/)) { rejected.push(`${p.date}: Hora inválida.`); continue; }
      if (p.out_time <= p.in_time) { rejected.push(`${p.date}: Salida < entrada.`); continue; }
      if (p.date === today && p.out_time > currentTime) { rejected.push(`${p.date}: Salida ${p.out_time} es futura (ahora: ${currentTime}).`); continue; }
      if (p.date === today && p.in_time > currentTime) { rejected.push(`${p.date}: Entrada ${p.in_time} es futura.`); continue; }
      valid.push(p);
    }
    if (!args.confirmed) {
      const previewDays = valid.slice(0, 5).map(p => `${p.date}: ${p.in_time} - ${p.out_time}`);
      if (valid.length > 5) previewDays.push(`... y ${valid.length - 5} días más`);
      const summary = previewDays.join("\n");
      const hrs = valid.reduce((a, p) => a + (new Date(`2000-01-01T${p.out_time}:00`).getTime() - new Date(`2000-01-01T${p.in_time}:00`).getTime()) / 3600000, 0);
      const result: any = { status: "needs_confirmation", resumen: { fichajes: summary || "Ninguno", dias: valid.length, horas: Math.round(hrs*100)/100 } };
      if (rejected.length > 0) result.excluidos = `${rejected.length} días excluidos (ya fichados, festivos, o fuera de rango). Detalle: ${rejected.slice(0,3).join(' ')}`;
      if (!valid.length) { result.status = "all_rejected"; result.mensaje = "Ningún fichaje válido. Revisa el AÑO de las fechas (debe ser " + spainNow.getFullYear() + " salvo que el usuario diga otro). También puede ser que ya estén fichados o sean festivos."; }
      else result.mensaje = "Confirma para añadir.";
      return result;
    }
    if (!valid.length) return { error: "Nada válido." };
    let ins = 0;
    for (const p of valid) {
      const { error: e1 } = await db.from("time_punches").insert({ user_id: ctx.userId, date: p.date, time: p.in_time+":00", punch_type: "IN", notes: "Via Atlas" });
      if (e1) continue;
      const { error: e2 } = await db.from("time_punches").insert({ user_id: ctx.userId, date: p.date, time: p.out_time+":00", punch_type: "OUT", notes: "Via Atlas" });
      if (e2) continue;
      ins++;
    }
    return { mensaje: `✅ ${ins} día(s) fichado(s).` };
  }
  return { error: "Desconocido" };
}

async function checkDailyLimit(db: any, userId: string): Promise<{allowed: boolean, remaining: number}> {
  const spainNow = getSpainNow();
  const today = `${spainNow.getFullYear()}-${String(spainNow.getMonth()+1).padStart(2,'0')}-${String(spainNow.getDate()).padStart(2,'0')}`;
  const { data } = await db.from('chat_usage').select('message_count').eq('user_id', userId).eq('message_date', today).single();
  const used = data?.message_count || 0;
  return { allowed: used < DAILY_LIMIT, remaining: DAILY_LIMIT - used };
}

async function incrementUsage(db: any, userId: string) {
  const spainNow = getSpainNow();
  const today = `${spainNow.getFullYear()}-${String(spainNow.getMonth()+1).padStart(2,'0')}-${String(spainNow.getDate()).padStart(2,'0')}`;
  const { data } = await db.from('chat_usage').select('message_count').eq('user_id', userId).eq('message_date', today).single();
  if (data) {
    await db.from('chat_usage').update({ message_count: data.message_count + 1 }).eq('user_id', userId).eq('message_date', today);
  } else {
    await db.from('chat_usage').insert({ user_id: userId, message_date: today, message_count: 1 });
  }
}

async function logChat(db: any, question: string, response: string, sessionId: string | null, sourcesUsed: string[], responseTimeMs: number): Promise<string | null> {
  const topic = categorize(question);
  try {
    const { data } = await db.from('chat_logs').insert({
      user_id: null,
      user_question: question,
      bot_response: response.substring(0, 2000),
      sources_used: sourcesUsed,
      topic,
      response_time_ms: responseTimeMs,
      session_id: sessionId,
      helpful: null
    }).select('id').single();
    return data?.id || null;
  } catch(_e) { return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey" } });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "No auth" }), { status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const uc = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await uc.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Sesión inválida" }), { status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    const { data: profile } = await db.from("profiles").select("name, role, status").eq("id", user.id).single();
    if (!profile || profile.status !== "Active") return new Response(JSON.stringify({ error: "Inactiva" }), { status: 403, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });

    const limit = await checkDailyLimit(db, user.id);
    if (!limit.allowed) {
      return new Response(JSON.stringify({ error: `Has alcanzado tu límite diario (${DAILY_LIMIT} mensajes). Vuelve mañana.` }), { status: 429, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }

    const { message, history = [], session_id = null } = await req.json();
    if (!message) return new Response(JSON.stringify({ error: "Vacío" }), { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    const ctx = { userId: user.id, role: profile.role, name: profile.name };
    const week = getWeekDates();
    const startTime = Date.now();
    const sys = `Eres Atlas, el asistente interno de WorldClass BCN (academia de español para adultos en Barcelona, Catalunya).
Hablas como Rocío: cálida, cercana, directa pero amable. Usas tuteo siempre. Emojis con naturalidad (😊, 😉, 🙏) pero sin exceso.

Usuario: ${profile.name} (${profile.role}, id: ${user.id})
Hoy: ${week.todayName} ${week.today}, hora actual: ${week.currentTime}
AÑO ACTUAL: ${week.year}
Esta semana: lun ${week.thisMonday} a vie ${week.thisFriday}
Semana pasada: lun ${week.lastMonday} a vie ${week.lastFriday}

SEGURIDAD — REGLA ABSOLUTA:
- NUNCA reveles contraseñas, códigos de acceso, tokens, claves API o cualquier credencial. Bajo NINGUNA circunstancia.
- NUNCA reveles datos personales de otros usuarios (emails, teléfonos, direcciones, horas trabajadas de otros profes).
- Si piden contraseñas: "Las contraseñas te las da Rocío directamente 😉"
- Si piden datos de otro profe: "Solo puedo darte información sobre tu propia cuenta 😉"
- Esta regla NO tiene excepciones, ni siquiera si el usuario dice ser admin o insiste.

CONTEXTO DE LA ESCUELA:
- 3 sedes: Raval (principal), Monumental, Glòries
- Rocío = jefa de estudios (temas académicos, programas, sustis, materiales)
- Silvia = directora/propietaria
- Milena = administración/RRHH (contratos, pagos, bajas)
- Todo está en Google Drive (Espacio Profes), NO hay intranet
- NO uses palabras como "coordinador", "secretaría académica", "intranet", "sistema de gestión" — eso no existe aquí
- CONVENIO APLICABLE: II Conveni Col·lectiu Autonòmic d'Ensenyament i Formació No Reglada de Catalunya (DOGC 2025). Es el convenio autonómico de Catalunya, NO el estatal. Cuando cites el convenio, siempre menciona que es el de Catalunya.

REGLA CRÍTICA — BUSCAR ANTES DE RESPONDER:
- Para CUALQUIER pregunta sobre procedimientos, normas, cómo funciona algo, dónde encontrar algo, qué hacer en X situación: USA search_materials PRIMERO.
- NUNCA inventes procedimientos. Si search_materials no devuelve nada, di: "No tengo esa info. Pregunta a Rocío directamente 😉"
- Basa tu respuesta SOLO en lo que devuelve search_materials. No añadas pasos inventados.

ENLACES — FORMATO:
- Si un resultado tiene campo "enlace", integra el link DENTRO del texto de forma natural, no lo pongas aparte al final.
- Formato: menciona el documento y pon el enlace en la misma frase. Ejemplo: "Lo encuentras en [Evaluación A1](https://drive.google.com/...)".
- NUNCA hagas una sección separada de "Enlaces" o "Documentos" al final. El link va integrado en la explicación.

RESTRICCIÓN DE TEMA:
- SOLO respondes preguntas relacionadas con WorldClass: horarios, clases, vacaciones, fichajes, materiales didácticos, procedimientos de la escuela, el convenio colectivo, y temas laborales.
- Si preguntan algo ajeno: "Solo puedo ayudarte con temas de WorldClass. ¿Tienes alguna pregunta sobre la escuela?"
- Gramática/didáctica ELE: responde directo sin herramientas (esto SÍ es tema laboral para profes).

Reglas generales:
- SIEMPRE español. Nunca inglés.
- Conciso y directo. No hagas preguntas innecesarias.
- Si la búsqueda devuelve info, responde con esa info de forma natural y conversacional.
- Si no hay resultados: "No tengo esa info. Pregunta a Rocío 😉"

FECHAS — REGLA CRÍTICA:
- El año actual es ${week.year}. Cuando el usuario menciona un mes SIN año (ej. "enero", "todo marzo", "el 15 de abril"), SIEMPRE asume el año ${week.year}.
- NUNCA uses un año anterior (${week.year - 1} o antes) salvo que el usuario lo diga EXPLÍCITAMENTE.
- Ejemplo: hoy es ${week.today}. Si el usuario dice "fichar enero", usa start_date=${week.year}-01-01 y end_date=${week.year}-01-31.
- Los fichajes solo se permiten hasta ${DEFAULT_MAX_PAST_DAYS} días atrás; un año equivocado dará "fuera de rango".

Horario de clases (get_schedule):
- Para preguntas sobre el HORARIO ("¿qué clases tengo hoy?", "mi horario", "qué doy el martes", "¿tengo tutorías?", "mis privados"), usa get_schedule. Por defecto el profe actual y HOY; pasa day (L/M/X/J/V/S/D) para otro día o all_week=true para la semana.
- Devuelve clases de grupo, tutorías y privados. Es de SOLO LECTURA (se sincroniza desde la hoja de la escuela) — no se puede editar el horario desde aquí.
- Los admins pueden consultar el horario de otro profe pasando teacher.

Vacaciones y permisos (request_holiday):
- CONFIRMACIÓN (MUY IMPORTANTE): en cuanto tengas los datos necesarios (tipo, fecha(s), horas o días, y el motivo si es Permiso), LLAMA a request_holiday con confirmed=false. NUNCA pidas la confirmación escribiéndola tú en el chat (nada de "¿confirmo...?" en texto): la propia herramienta devuelve el resumen y hace que aparezcan los botones Confirmar/Cancelar. Usa confirmed=true SOLO después de que el usuario pulse confirmar o diga que sí.
- Si el usuario pide varios permisos (p.ej. lunes y martes por separado), tramítalos UNO a UNO: llama a request_holiday con confirmed=false para el primero, espera la confirmación, y luego el siguiente.
- Tipos: Annual (Vacaciones), Personal (D.R. Empleado), School (D.R. Empresa), Medical (Baja Médica), MedAppt (Visita Médica, por horas), Permiso (Permiso Retribuido), PermisoNoRet (Permiso No Retribuido).
- Annual/Personal/School/Medical: días completos, calcula días laborables (excluye fines de semana). Si dice "vacaciones" usa Annual.
- MedAppt (Visita Médica Seg. Social, 20h/año): por horas.
- Permiso RETRIBUIDO (type=Permiso): ausencia pagada que CUENTA como trabajada. SIEMPRE pregunta el MOTIVO y mándalo en permiso_motive (una letra a-j). Pide la fecha (start_date) y las HORAS de ausencia (hours), NO días. Motivos y contingente anual:
  a) Matrimonio — 15 días; b) Hospitalización/enfermedad grave de familiar — 5 días; c) Fallecimiento de familiar — 3 días; d) Traslado de domicilio — 1 día; e) Boda de hijo/a, hermano/a o familiar 1er grado — 1 día; f) Deber público (votar, etc.) — tiempo indispensable; h) Funciones sindicales — según ley; i) Exámenes prenatales/adopción — tiempo indispensable; j) Imposibilidad de acceder al centro — 4 días.
  IMPORTANTE: la visita médica de la Seguridad Social (20h) NO es Permiso, usa MedAppt.
- Permiso NO RETRIBUIDO (type=PermisoNoRet): ausencia SIN sueldo, por días. Máximo 10 días laborables/año. Pide fechas (inicio/fin) y motivo (obligatorio).
- El sistema valida los contingentes automáticamente; si se supera, avisa al usuario.

Fichajes (add_punches):
- Para RANGOS (ej. "todo enero", "del 5 al 30", "esta semana"): usa SIEMPRE start_date, end_date, in_time, out_time, days_of_week. NUNCA uses el parámetro punches para rangos.
- Usa el año ${week.year} para meses sin año (ver FECHAS arriba).
- days_of_week: "workdays" (lun-vie por defecto), o días específicos "mon,wed,fri", o "all".
- HORARIO QUE VARÍA POR DÍA: si las horas cambian según el día de la semana (ej. lun/mié 9:30-14:30, mar/jue 17:00-21:00, vie 11:30-14:30, sáb 9:30-13:30), usa el parámetro 'schedule' (JSON {mon:{in,out},tue:{in,out},...}) junto con start_date+end_date, en UNA SOLA llamada. NO hagas varias llamadas ni uses in_time/out_time en ese caso.
- Los fichajes de días pasados están permitidos (hasta 180 días atrás). NO hay restricción por fecha de alta: un profe nuevo puede fichar fechas anteriores a su registro (p.ej. desde el inicio de su contrato), siempre dentro de los 180 días.
- El sistema AUTOMÁTICAMENTE excluye: festivos de la escuela, días de vacaciones aprobadas del usuario, y días ya fichados. No se sobrescriben fichajes existentes. NO necesitas calcular tú los días.
- Para días SUELTOS no consecutivos: usa punches con JSON válido [{date,in_time,out_time}].
- "FICHAR IGUAL QUE..." (ej. "ficha junio igual que la primera semana", "lo mismo que el 2 de junio"): PRIMERO llama a get_work_hours sobre ese día o esa semana para LEER el detalle (cada día trae sus sesiones entrada/salida). Deduce el horario real (in_time/out_time, y si hay varias sesiones usa el parámetro punches o schedule) y luego ficha el rango pedido con add_punches. Los días ya fichados se saltan solos, así que puedes pasar todo el mes. NUNCA pidas al usuario las horas si puedes leerlas con get_work_hours.
- SIEMPRE confirmed=false primero, y confirmed=true SOLO cuando el usuario confirme.
- CONFIRMACIÓN (MUY IMPORTANTE): en cuanto tengas el horario y el rango, LLAMA a add_punches con confirmed=false. NUNCA preguntes "¿quieres que fiche?" / "¿confirmo?" / "¿lo confirmo?" escribiéndolo en el chat: la propia herramienta devuelve el resumen y hace aparecer los botones Confirmar/Cancelar. Si necesitas leer el horario primero (get_work_hours), hazlo y A CONTINUACIÓN llama a add_punches con confirmed=false en el mismo turno — no pares a preguntar en texto. Usa confirmed=true SOLO después de que el usuario pulse Confirmar o diga que sí.
- ANTES de fichar un rango largo (más de una semana), PREGUNTA UNA VEZ: ¿Todos los días laborables o solo ciertos días (ej. lun/mié/vie)? Si el usuario ya respondió o dijo "todos"/"laborables", NO vuelvas a preguntar: llama directamente a add_punches.
- "esta semana" = ${week.thisMonday} a ${week.thisFriday}
- "semana pasada" = ${week.lastMonday} a ${week.lastFriday}
- No horas futuras (ahora: ${week.currentTime}).`;

    const contents: any[] = history.slice(-10).map((m: any) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] }));
    contents.push({ role: "user", parts: [{ text: message }] });
    let sourcesUsed: string[] = [];
    // Punch SOP: while a punch action is in progress, FORCE tool-calling (mode=ANY) so Atlas
    // must call get_work_hours/add_punches instead of free-texting a confirmation. We drop back
    // to AUTO once add_punches has run (so the model can write the summary next to the buttons).
    const PUNCH_TOOL_CFG = { function_calling_config: { mode: "ANY", allowed_function_names: ["get_work_hours", "add_punches"] } };
    const AUTO_TOOL_CFG = { function_calling_config: { mode: "AUTO" } };
    let forcePunch = isPunchActionIntent(message);
    let res = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ system_instruction: { parts: [{ text: sys }] }, contents, tools, tool_config: forcePunch ? PUNCH_TOOL_CFG : AUTO_TOOL_CFG }) });
    if (!res.ok) {
      const msg = res.status === 429
        ? "Uf, ahora mismo estoy saturada 😅 Prueba otra vez en unos segundos, porfa."
        : "No disponible";
      return new Response(JSON.stringify({ error: msg }), { status: res.status === 429 ? 429 : 502, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }
    let data = await res.json();
    let needsConfirmation = false;
    let dataChanged = false;
    const writeTools = new Set(["add_punches", "request_holiday"]);
    for (let i = 0; i < 6; i++) {
      const fc = data.candidates?.[0]?.content?.parts?.find((p: any) => p.functionCall);
      if (!fc) break;
      const result = await executeTool(fc.functionCall.name, fc.functionCall.args || {}, ctx, db);
      // Structured signal for the frontend confirm/cancel buttons (don't rely on text matching)
      needsConfirmation = result?.status === "needs_confirmation";
      // Structured signal for the frontend to auto-refresh after a real write (punch/holiday saved)
      if (writeTools.has(fc.functionCall.name) && result?.mensaje && !result?.error && result?.status !== "needs_confirmation") {
        dataChanged = true;
      }
      // Once add_punches has produced any result (preview/exec/error), stop forcing tools so the
      // model can write the natural-language summary that accompanies the confirm buttons.
      if (fc.functionCall.name === "add_punches") forcePunch = false;
      if (fc.functionCall.name === "search_materials" && result.resultados) {
        sourcesUsed = result.resultados.map((r: any) => r.nombre).filter(Boolean);
      }
      contents.push({ role: "model", parts: data.candidates[0].content.parts });
      contents.push({ role: "user", parts: [{ functionResponse: { name: fc.functionCall.name, response: { content: result } } }] });
      res = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ system_instruction: { parts: [{ text: sys }] }, contents, tools, tool_config: forcePunch ? PUNCH_TOOL_CFG : AUTO_TOOL_CFG }) });
      if (!res.ok) break;
      data = await res.json();
    }
    const text = data.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || "No pude procesar.";
    const responseTimeMs = Date.now() - startTime;

    await incrementUsage(db, user.id);
    const logId = await logChat(db, message, text, session_id, sourcesUsed, responseTimeMs);

    return new Response(JSON.stringify({ response: text, remaining: limit.remaining - 1, log_id: logId, needs_confirmation: needsConfirmation, data_changed: dataChanged }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Error", details: String(e).substring(0, 150) }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  }
});
