// Supabase Configuration
const SUPABASE_URL = 'https://ruytavhodexoxkejrgyb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_gfNxT6X2meKFQQhS1jHA3Q_BIcTTYJ5';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Round a "HH:MM" time string to the nearest 15-minute step (00/15/30/45).
// Native <input type="time"> only steps in 15-min increments via the spinner, but desktop
// browsers still let you type/scroll any minute — so we snap the value to a quarter hour
// on change and again before saving. Clamped to stay within the same day.
function roundTimeToQuarter(timeStr) {
  if (!timeStr || !/^\d{1,2}:\d{2}/.test(timeStr)) return timeStr;
  var parts = timeStr.split(':');
  var total = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  var rounded = Math.round(total / 15) * 15;
  if (rounded >= 24 * 60) rounded = 23 * 60 + 45;
  if (rounded < 0) rounded = 0;
  return String(Math.floor(rounded / 60)).padStart(2, '0') + ':' + String(rounded % 60).padStart(2, '0');
}

// App defaults (matching existing Code.js DEFAULTS)
const DEFAULTS = {
  ANNUAL_DAYS: 31,
  PERSONAL_DAYS: 3,
  SCHOOL_DAYS: 4,
  EXPECTED_YEARLY_HOURS: 1000,
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
  PREP_TIME_YEARLY: 0,
  MEDICAL_APPT_HOURS: 20
};

const HOLIDAY_TYPES = {
  Annual: { name: 'Vacaciones', shortName: 'Vacaciones', emoji: '🏖️', color: 'annual', hasLimit: true },
  Personal: { name: 'Descanso Retribuido Empleado', shortName: 'D.R. Empleado', emoji: '👤', color: 'personal', hasLimit: true },
  School: { name: 'Descanso Retribuido Empresa', shortName: 'D.R. Empresa', emoji: '🏢', color: 'school', hasLimit: true },
  Medical: { name: 'Baja Médica', shortName: 'Médico', emoji: '🏥', color: 'medical', hasLimit: false },
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
