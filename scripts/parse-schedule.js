/**
 * WorldClass BCN — schedule parser (Salas Raval / Salas Glories grids).
 *
 * Parses the multi-line class cells from the "Salas <location>" tabs of the
 * "Super excel 25-26" sheet into structured class records.
 *
 * This is a PURE module (no network) so it can be unit-tested offline against
 * real cell samples and later ported into the `index-schedule` Edge Function.
 *
 * Run the built-in self-test:  node scripts/parse-schedule.js
 *
 * Cell shape (tolerant — real cells vary):
 *   Line 1:  TEACHER  LEVEL[/MODULE]  [status emojis] [ROT]
 *   Line 2:  <hours>h  <days>  <start>-<end>        e.g. "10h L-V 9-10.50"
 *   Line 3:  <level>: <DD.MM|D/M/YY>  OR  Start:<date>
 *   Line 4:  <count>p   <free-text transition note>
 * Extra/!positional lines are scanned for the same tokens and the leftover
 * becomes `notes`.
 */

// Zero-width / bidi marks Google Sheets sprinkles between emojis.
const ZERO_WIDTH = /[\u200B-\u200F\u2060\uFEFF]/g;

const STATUS_BY_EMOJI = {
  '⚽': 'active',
  '💐': 'starting',
  '⚠': 'warning',
  '⛔': 'blocked',
};

// --- helpers ---------------------------------------------------------------

function clean(s) {
  return (s == null ? '' : String(s)).replace(ZERO_WIDTH, '').replace(/\uFE0F/g, '').trim();
}

function normalizeTime(tok) {
  // "9" -> 09:00, "10.50" -> 10:50, "9:30" -> 09:30, "11" -> 11:00
  const m = clean(tok).match(/^(\d{1,2})(?:[.:](\d{2}))?$/);
  if (!m) return null;
  const h = String(parseInt(m[1], 10)).padStart(2, '0');
  const min = m[2] || '00';
  return `${h}:${min}`;
}

// "L-V" -> [L,M,X,J,V]; "L,X" -> [L,X]; "M&J" -> [M,J]; "S" -> [S]
const DAY_ORDER = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
function parseDays(tok) {
  const t = clean(tok).toUpperCase().replace(/\s+/g, '');
  if (!t) return null;
  if (/^[LMXJVSD]-[LMXJVSD]$/.test(t)) {
    const a = DAY_ORDER.indexOf(t[0]);
    const b = DAY_ORDER.indexOf(t[2]);
    if (a >= 0 && b >= a) return DAY_ORDER.slice(a, b + 1);
  }
  const parts = t.split(/[,&]/).filter(Boolean);
  const days = parts.filter((p) => DAY_ORDER.includes(p));
  return days.length ? days : null;
}

// --- core ------------------------------------------------------------------

function parseCell(raw) {
  const text = clean(raw);
  if (!text || text.length < 2) return null;

  const lines = text.split(/\n+/).map(clean).filter(Boolean);
  if (!lines.length) return null;

  const out = {
    teacher: null, level: null, module: null,
    hours_per_week: null, days: null, time_start: null, time_end: null,
    course_end: null, start_date: null, student_count: null,
    status: 'active', rotation: false, notes: null, raw: text,
  };

  // ---- Line 1: teacher + level/module + status ----
  const line1 = lines[0];
  const statuses = [];
  for (const [emoji, status] of Object.entries(STATUS_BY_EMOJI)) {
    if (line1.includes(emoji)) statuses.push(status);
  }
  if (statuses.length) out.status = statuses.includes('blocked') ? 'blocked'
    : statuses.includes('warning') ? 'warning'
    : statuses.includes('starting') ? 'starting' : 'active';

  // strip emojis (anything outside basic latin/level chars) from line 1
  const l1 = line1.replace(/[^\x00-\x7F]/g, ' ').replace(/\s+/g, ' ').trim();
  const tokens = l1.split(' ').filter(Boolean);
  if (tokens.length) out.teacher = tokens[0].replace(/^["'.,]+|["'.,]+$/g, '');
  const rest1 = tokens.slice(1).join(' ');
  if (/\bROT\b/i.test(rest1)) out.rotation = true;
  const lvl = rest1.match(/([A-C][0-2](?:\.\d)?)(?:\s*\/\s*(M\d+))?/i);
  if (lvl) {
    out.level = lvl[1].toUpperCase();
    if (lvl[2]) out.module = lvl[2].toUpperCase();
  }
  const modOnly = rest1.match(/\bM(\d+)\b/);
  if (!out.module && modOnly) out.module = 'M' + modOnly[1];

  // ---- scan remaining lines for tokens ----
  const leftovers = [];
  for (let i = 1; i < lines.length; i++) {
    let ln = lines[i];
    let consumed = false;

    const hrs = ln.match(/(\d+(?:\.\d+)?)\s*h\b/i);
    if (hrs) { out.hours_per_week = parseFloat(hrs[1]); consumed = true; }

    const dayTok = ln.match(/\b([LMXJVSD](?:-[LMXJVSD]|(?:[,&][LMXJVSD])+)?)\b/);
    if (dayTok) { const d = parseDays(dayTok[1]); if (d) { out.days = d; consumed = true; } }

    const timeRange = ln.match(/(\d{1,2}(?:[.:]\d{2})?)\s*-\s*(\d{1,2}(?:[.:]\d{2})?)/);
    if (timeRange) {
      const ts = normalizeTime(timeRange[1]);
      const te = normalizeTime(timeRange[2]);
      // avoid treating a DD.MM date as a time range (those have no second value > 23 etc.)
      if (ts && te) { out.time_start = ts; out.time_end = te; consumed = true; }
    }

    const count = ln.match(/(\d+)\s*p\b/i);
    if (count) { out.student_count = parseInt(count[1], 10); consumed = true; }

    const start = ln.match(/start\s*:?\s*([0-9]{1,2}[\/.][0-9]{1,2}(?:[\/.][0-9]{2,4})?)/i);
    if (start) { out.start_date = start[1]; consumed = true; }

    const endDate = ln.match(/^[A-C][0-2](?:\.\d)?\s*:?\s*([0-9]{1,2}[.\/][0-9]{1,2}(?:[\/.][0-9]{2,4})?)/i);
    if (endDate) { out.course_end = endDate[1]; consumed = true; }

    if (!consumed) leftovers.push(ln);
  }
  if (leftovers.length) out.notes = leftovers.join(' | ');

  return out;
}

/**
 * Parse a whole "Salas <location>" grid (raw 2D values from the Sheets API).
 * Row 0 = room names (cols C+). Row 1 = room CREDENTIALS — SKIPPED, never read.
 * Col 0 = section label, Col 1 = time slot, cols 2+ = class cells per room.
 */
function parseSalasGrid(values, location) {
  if (!values || !values.length) return [];
  const roomRow = values[0] || [];
  const rooms = {};
  for (let c = 2; c < roomRow.length; c++) {
    const name = clean(roomRow[c]);
    if (name) rooms[c] = name;
  }
  const classes = [];
  const seen = new Set();
  // start at row 2 to SKIP the credentials row (row index 1)
  for (let r = 2; r < values.length; r++) {
    const row = values[r] || [];
    for (let c = 2; c < row.length; c++) {
      if (!rooms[c]) continue;
      const parsed = parseCell(row[c]);
      if (!parsed || !parsed.teacher || !parsed.level) continue;
      // de-dupe: the same class cell can repeat down a merged block
      const key = `${parsed.teacher}|${parsed.level}|${parsed.module}|${rooms[c]}|${parsed.time_start}`;
      if (seen.has(key)) continue;
      seen.add(key);
      classes.push({ ...parsed, room: rooms[c], location });
    }
  }
  return classes;
}

module.exports = { parseCell, parseSalasGrid, normalizeTime, parseDays };

// --- self-test -------------------------------------------------------------
if (require.main === module) {
  const samples = [
    'SARA A2.1/M1 \u200b\u200b\u26bd\u200b\n10h L-V 9-10.50\nA1.2: 4.05\n12p  1.9-a2.2 m6',
    'ANDREA B2/M2\u200b\u200b\u200b \u200b\u26bd\u200b\n10h L-V 9-10.50\n7p',
    'LAIA A1.2/M5 \u200b\u200b\u200b\u26bd\u200b\n10h L-V 9-10.50\nA1.2: 08.06\n7p \n1.9-a2.2 m4',
    'ANDRES B1.1/M4 \u26bd\n10h L-V 9-10.50\nB1.1: 4.05\n3p\n a0 10.8',
    'ANDREA A1.1/M3 \ud83d\udc90\u200b\n20h  L-V 11-15\nStart:8/6/26\n8p  a0 19.10',
    'RAUL A2.2/M6 \ud83d\udc90\u200b\u200b\u26d4\ufe0f\n20h  L-V 11-15\nA2.1: 18.05\n8p \nse une con andres 6.7?',
    'NEREA B1.1/M4 \ud83d\udc90\u26a0\ufe0f\u200b\n20h  L-V 11-15\nB1.1: 1.06\n9p \nA0 20.7 -coge el 27.7',
    'LAIA B2 ROT \u200b\u26bd\u200b\n10 Pers Registro eval',
  ];
  for (const s of samples) {
    const p = parseCell(s);
    console.log('—'.repeat(60));
    console.log('RAW :', JSON.stringify(s));
    console.log('OUT :', JSON.stringify({
      teacher: p.teacher, level: p.level, module: p.module, status: p.status,
      hours_per_week: p.hours_per_week, days: p.days,
      time: p.time_start && `${p.time_start}-${p.time_end}`,
      course_end: p.course_end, start_date: p.start_date,
      student_count: p.student_count, rotation: p.rotation, notes: p.notes,
    }));
  }
}
