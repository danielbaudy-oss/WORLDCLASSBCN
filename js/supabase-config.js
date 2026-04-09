// Supabase Configuration
const SUPABASE_URL = 'https://ruytavhodexoxkejrgyb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_gfNxT6X2meKFQQhS1jHA3Q_BIcTTYJ5';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  Permiso: { name: 'Permiso Retribuido', shortName: 'Permiso', emoji: '📋', color: 'permiso', hasLimit: false, requiresReason: true }
};
