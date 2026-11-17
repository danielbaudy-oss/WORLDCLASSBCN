// Supabase Configuration
const SUPABASE_URL = 'https://ruytavhodexoxkejrgyb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_gfNxT6X2meKFQQhS1jHA3Q_BIcTTYJ5';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// App defaults (matching existing Code.js DEFAULTS)
const DEFAULTS = {
  ANNUAL_DAYS: 31,
  PERSONAL_DAYS: 3,
  SCHOOL_DAYS: 4,
  EXPECTED_YEARLY_HOURS: 1000,
  // Full-time reference for the "% de jornada" field. 1230 = convenio lective max for docents;
  // the existing part-timers are exact fractions of it (984 = 80 %, 615 = 50 %, 492 = 40 %).
  FULLTIME_YEARLY_HOURS: 1230,
  UNPAID_DAYS: 10,
  MAX_PAST_DAYS: 30,
  PUENTE_DAYS: 9,
  PREP_TIME_YEARLY: 70,
  WORKING_WEEKS_PER_YEAR: 47,
  MEDICAL_APPT_HOURS: 20
};

const ADMIN_DEFAULTS = {
  ANNUAL_DAYS: 31,
  PERSONAL_DAYS: 3,
  SCHOOL_DAYS: 4,
  EXPECTED_YEARLY_HOURS: 1300,
  // Convenio Art. 18: personal d'administració i comercial = 1.530 h full time
  FULLTIME_YEARLY_HOURS: 1530,
  UNPAID_DAYS: 10,
  PREP_TIME_YEARLY: 0,
  MEDICAL_APPT_HOURS: 20
};

const HOLIDAY_TYPES = {
  Annual: { name: 'Vacaciones', shortName: 'Vacaciones', emoji: '🏖️', color: 'annual', hasLimit: true },
  Personal: { name: 'Descanso Retribuido Empleado', shortName: 'D.R. Empleado', emoji: '👤', color: 'personal', hasLimit: true },
  School: { name: 'Descanso Retribuido Empresa', shortName: 'D.R. Empresa', emoji: '🏢', color: 'school', hasLimit: true },
  Medical: { name: 'Baja Médica', shortName: 'Baja', emoji: '🏥', color: 'medical', hasLimit: false },
  MedAppt: { name: 'Visita Médica', shortName: 'Visita Méd.', emoji: '⚕️', color: 'medappt', hasLimit: true, isHoursBased: true },
  // Permiso Retribuido (Convenio Art. 28): paid leave — counts as WORKED time. Entered by HOURS
  // (like Visita Médica): a full day off still only needs the hours marked, since schedules vary.
  Permiso: { name: 'Permiso Retribuido', shortName: 'P. Retribuido', emoji: '📋', color: 'permiso', hasLimit: false, isHoursBased: true, requiresReason: true,
    description: 'Permiso retribuido (Art. 28 del convenio): ausencia justificada con derecho a sueldo (boda, fallecimiento o enfermedad grave de familiar, deberes legales, etc.). Cuenta como tiempo trabajado: marca las HORAS de ausencia.' },
  // Permiso No Retribuido (Convenio Art. 29): unpaid leave — NOT worked. Entered by DAYS, with an
  // annual contingent (unpaid_days, default 10 working days).
  PermisoNoRet: { name: 'Permiso No Retribuido', shortName: 'P. No Retrib.', emoji: '🚫', color: 'permisonoret', hasLimit: true, requiresReason: true,
    description: 'Permiso no retribuido (Art. 29 del convenio): ausencia sin sueldo. Máximo 2 al año, hasta 10 días laborables en total, con 15 días laborables de preaviso. No cuenta como tiempo trabajado.' }
};

// Convenio Art. 28 — motives for Permiso Retribuido. dayLimit is the annual contingent in days
// (null = "tiempo indispensable", no fixed limit). Motive g) Consulta médica 20h is intentionally
// excluded: it's handled separately by the "Visita Médica" (MedAppt) type.
const PERMISO_MOTIVES = [
  { code: 'a', label: 'Matrimonio', dayLimit: 15, note: '15 días naturales' },
  { code: 'b', label: 'Hospitalización/enfermedad grave de familiar', dayLimit: 5, note: 'hasta 2º grado' },
  { code: 'c', label: 'Fallecimiento de familiar', dayLimit: 3, note: '+2 días si hay desplazamiento fuera de provincia' },
  { code: 'd', label: 'Traslado de domicilio', dayLimit: 1, note: '' },
  { code: 'e', label: 'Boda de hijo/a, hermano/a o familiar 1er grado', dayLimit: 1, note: '' },
  { code: 'f', label: 'Deber público y personal (votar, etc.)', dayLimit: null, note: 'tiempo indispensable' },
  { code: 'h', label: 'Funciones sindicales / representación', dayLimit: null, note: 'según ley' },
  { code: 'i', label: 'Exámenes prenatales / preparación al parto / adopción', dayLimit: null, note: 'tiempo indispensable' },
  { code: 'j', label: 'Imposibilidad de acceder al centro (catástrofe/meteo)', dayLimit: 4, note: 'hasta 4 días' }
];

// Fetch ALL rows for a query, paging past PostgREST's server row cap (max 1000/request).
// The app crossed 10,000 yearly punches in Aug 2026, so single-shot .limit(10000) queries
// started silently dropping rows (e.g. Joan's late-July punches missing from monthly view).
// buildQuery: function returning a FRESH Supabase query each call (no .range/.limit on it).
// A stable .order() (e.g. .order('id')) is appended automatically for consistent paging.
async function fetchAllRows(buildQuery, pageSize) {
  pageSize = pageSize || 1000;
  var all = [];
  for (var from = 0; ; from += pageSize) {
    var res = await buildQuery().order('id', { ascending: true }).range(from, from + pageSize - 1);
    if (res.error) return { data: all, error: res.error };
    var rows = res.data || [];
    all = all.concat(rows);
    if (rows.length < pageSize) break;
  }
  return { data: all, error: null };
}

// Target used ONLY as the denominator of the progress percentage.
//
// expected_yearly_hours (the NOMINAL figure) still drives everything else: it's what's shown in
// the tables/edit modals, it sets hoursPerWorkingDay (so baja/medical credit is valued at the
// nominal rate), and it produces the displayed "Xh esp" expected-to-date.
// profiles.hours_adjustment (default 0) only softens the percentage denominator
// (e.g. Rocío: everything computed at 1500, but the % measured against 1400).
function progressTargetHours(profile, fallback) {
  var nominal = (profile && profile.expected_yearly_hours) || fallback;
  var adj = (profile && parseFloat(profile.hours_adjustment)) || 0;
  return nominal + adj;
}

// ========================================
// JORNADA SEGMENTS ("cambios de jornada")
// ========================================
// jornada_segments rows: from valid_from on, the person's FULL-YEAR rate is yearly_hours.
// Days before the earliest row use the earliest row's rate. No rows = the single
// profiles.expected_yearly_hours rate, computed with exactly the previous expressions.

function _jornadaFmt(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// segments: ONE person's rows sorted by valid_from asc (non-empty).
function jornadaRateOn(segments, dateStr) {
  var r = segments[0].yearly_hours;
  for (var i = 0; i < segments.length; i++) {
    if (segments[i].valid_from <= dateStr) r = segments[i].yearly_hours;
  }
  return r;
}

function _jornadaSegIndex(segments, dateStr) {
  var k = 0;
  for (var i = 0; i < segments.length; i++) {
    if (segments[i].valid_from <= dateStr) k = i;
  }
  return k;
}

// Calls fn(dateStr) for every weekday in [start, end] not in excludeSet.
function _jornadaEachWeekday(start, end, excludeSet, fn) {
  var cur = new Date(start + 'T12:00:00');
  var last = new Date(end + 'T12:00:00');
  while (cur <= last) {
    var dow = cur.getDay();
    var ds = _jornadaFmt(cur);
    if (dow !== 0 && dow !== 6 && !(excludeSet && excludeSet.has(ds))) fn(ds);
    cur.setDate(cur.getDate() + 1);
  }
}

// Expected-hours targets for one person, using the rate in force on each working day.
// o = { profile, segments, fallback, allWorkingDays, passedWorkingDays, holidayDates,
//       contractStart, contractEnd, windowFraction, totalWorkingDays, progressRatio, todayStr }
// (windowFraction / totalWorkingDays / progressRatio come from getTeacherProgress or its mirror.)
function computeJornadaTargets(o) {
  var profile = o.profile;
  var segments = o.segments || [];
  var wf = o.windowFraction;
  var T = o.totalWorkingDays;
  var adj = (profile && parseFloat(profile.hours_adjustment)) || 0;
  var cs = o.contractStart || null, ce = o.contractEnd || null;
  var outside = function(d) { return (cs && d < cs) || (ce && d > ce); };
  var hasSegments = segments.length > 0;

  // Per-segment in-window working days (cnt) and of those, passed (raw).
  var cnt = [], raw = [], i;
  for (i = 0; i < segments.length; i++) { cnt.push(0); raw.push(0); }
  var usedIdx = {}, usedCount = 0, lastIdx = -1;
  if (hasSegments) {
    o.allWorkingDays.forEach(function(ds) {
      if (outside(ds)) return;
      var k = _jornadaSegIndex(segments, ds);
      cnt[k]++;
      if (o.passedWorkingDays.has(ds)) raw[k]++;
      if (!usedIdx[k]) { usedIdx[k] = true; usedCount++; }
      lastIdx = k;
    });
  }

  var changes = [];
  var year = String(o.todayStr).substring(0, 4);
  for (i = 1; i < segments.length; i++) {
    if (String(segments[i].valid_from).substring(0, 4) === year &&
        segments[i].yearly_hours !== segments[i - 1].yearly_hours) {
      changes.push({ date: segments[i].valid_from, fromHours: segments[i - 1].yearly_hours, toHours: segments[i].yearly_hours });
    }
  }
  var currentRate = hasSegments ? jornadaRateOn(segments, o.todayStr) : ((profile && profile.expected_yearly_hours) || o.fallback);

  // Flat path: no segments, or every in-window working day in one segment. Same expressions,
  // same order as before this feature, so unchanged people get bit-identical numbers.
  if (!hasSegments || usedCount <= 1) {
    var nominal, progressTarget;
    if (!hasSegments) {
      nominal = (profile && profile.expected_yearly_hours) || o.fallback;
      progressTarget = progressTargetHours(profile, o.fallback) * wf;
    } else {
      nominal = usedCount === 1 ? segments[lastIdx].yearly_hours : jornadaRateOn(segments, o.todayStr);
      progressTarget = (nominal + adj) * wf;
    }
    var expectedYearly = nominal * wf;
    // This year's expected hours per segment (all of it in the one segment that covers the window).
    var perSegmentYearly = [expectedYearly];
    if (hasSegments) {
      perSegmentYearly = segments.map(function() { return 0; });
      perSegmentYearly[usedCount === 1 ? lastIdx : _jornadaSegIndex(segments, o.todayStr)] = expectedYearly;
    }
    var hpd = T > 0 ? expectedYearly / T : 0;
    var denomRate = T > 0 ? progressTarget / T : 0;
    return {
      hasSegments: hasSegments,
      currentRate: currentRate,
      expectedYearly: expectedYearly,
      perSegmentYearly: perSegmentYearly,
      progressTarget: progressTarget,
      expectedToDate: expectedYearly * o.progressRatio,
      progressDenom: progressTarget * o.progressRatio,
      hoursPerDayOn: function() { return hpd; },
      denomPerDayOn: function() { return denomRate; },
      creditForRange: function(start, end, schoolHolidayDates) {
        var n = 0;
        _jornadaEachWeekday(start, end, schoolHolidayDates, function() { n++; });
        return n * hpd;
      },
      periodExpected: function(start, end, excludeSet) {
        var n = 0;
        _jornadaEachWeekday(start, end, excludeSet, function() { n++; });
        return { expected: n * hpd, denom: n * denomRate };
      },
      changes: changes
    };
  }

  // Segment path.
  var F = o.allWorkingDays.size;
  var segYearly = 0, perSeg = [];
  for (i = 0; i < segments.length; i++) {
    perSeg.push(segments[i].yearly_hours * cnt[i] / F);
    segYearly += perSeg[i];
  }
  var segTarget = segYearly + adj * wf;
  var taken = 0;
  if (o.holidayDates) {
    o.holidayDates.forEach(function(ds) {
      if (outside(ds)) return;
      if (o.allWorkingDays.has(ds) && o.passedWorkingDays.has(ds)) taken++;
    });
  }
  var hpdK = [], denomK = [];
  for (i = 0; i < segments.length; i++) {
    hpdK.push(T > 0 ? segments[i].yearly_hours * wf / T : 0);
    denomK.push(T > 0 ? (segments[i].yearly_hours + adj) * wf / T : 0);
  }
  var expToDate = 0, denomToDate = 0;
  if (T > 0) {
    for (i = 0; i < segments.length; i++) {
      expToDate += hpdK[i] * raw[i];
      denomToDate += denomK[i] * raw[i];
    }
    expToDate = Math.max(0, expToDate - taken * (segYearly / T));
    denomToDate = Math.max(0, denomToDate - taken * (segTarget / T));
  }
  var hpdOn = function(ds) { return hpdK[_jornadaSegIndex(segments, ds)]; };
  var denomOn = function(ds) { return denomK[_jornadaSegIndex(segments, ds)]; };
  return {
    hasSegments: true,
    currentRate: currentRate,
    expectedYearly: segYearly,
    perSegmentYearly: perSeg,
    progressTarget: segTarget,
    expectedToDate: expToDate,
    progressDenom: denomToDate,
    hoursPerDayOn: hpdOn,
    denomPerDayOn: denomOn,
    creditForRange: function(start, end, schoolHolidayDates) {
      var s = 0;
      _jornadaEachWeekday(start, end, schoolHolidayDates, function(ds) { s += hpdOn(ds); });
      return s;
    },
    periodExpected: function(start, end, excludeSet) {
      var e = 0, dn = 0;
      _jornadaEachWeekday(start, end, excludeSet, function(ds) { e += hpdOn(ds); dn += denomOn(ds); });
      return { expected: e, denom: dn };
    },
    changes: changes
  };
}

// "% de jornada" label for a full-year rate (same rounding as the settings modal).
function jornadaPctLabel(hours, isAdmin) {
  var base = (isAdmin ? ADMIN_DEFAULTS : DEFAULTS).FULLTIME_YEARLY_HOURS;
  return (Math.round(hours / base * 1000) / 10) + '%';
}

// rows (any order, several people) -> { profile_id: [rows sorted by valid_from] }
function jornadaSegmentsByProfile(rows) {
  var map = {};
  (rows || []).forEach(function(r) {
    if (!map[r.profile_id]) map[r.profile_id] = [];
    map[r.profile_id].push(r);
  });
  Object.keys(map).forEach(function(k) {
    map[k].sort(function(a, b) { return a.valid_from < b.valid_from ? -1 : (a.valid_from > b.valid_from ? 1 : 0); });
  });
  return map;
}
