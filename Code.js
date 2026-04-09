/**
 * ========================================
 * TIME PUNCH TOOL - WORLDCLASS BCN
 * ========================================
 */

// ========================================
// CORE HELPERS
// ========================================

const SS = () => SpreadsheetApp.getActiveSpreadsheet();
const TZ = () => Session.getScriptTimeZone();
const NOW = () => new Date();
const TODAY_STR = () => Utilities.formatDate(NOW(), TZ(), 'yyyy-MM-dd');

// ========================================
// SERVER-SIDE CACHING
// ========================================

const CACHE_KEYS = {
  TEACHERS: 'punch_teachers_data',
  PUNCHES: 'punch_punches_data',
  HOLIDAYS: 'punch_holidays_data',
  SCHOOL_HOLIDAYS: 'punch_school_holidays'
};

const CACHE_DURATION = 300; // 5 minutes in seconds

function getCache() {
  return CacheService.getScriptCache();
}

function getCachedData(key, fetchFn) {
  const cache = getCache();
  const cached = cache.get(key);
  
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      Logger.log('Cache parse error for ' + key + ': ' + e.message);
    }
  }
  
  const data = fetchFn();
  try {
    const jsonStr = JSON.stringify(data);
    // CacheService has 100KB limit per key
    if (jsonStr.length < 100000) {
      cache.put(key, jsonStr, CACHE_DURATION);
    }
  } catch (e) {
    Logger.log('Cache store error for ' + key + ': ' + e.message);
  }
  
  return data;
}

function invalidateCache(keys) {
  const cache = getCache();
  if (Array.isArray(keys)) {
    cache.removeAll(keys);
  } else {
    cache.remove(keys);
  }
}

function invalidateAllPunchCache() {
  invalidateCache([CACHE_KEYS.TEACHERS, CACHE_KEYS.PUNCHES, CACHE_KEYS.HOLIDAYS, CACHE_KEYS.SCHOOL_HOLIDAYS]);
}

// ========================================
// DEFAULT VALUES - CENTRALIZED
// ========================================

const DEFAULTS = {
  ANNUAL_DAYS: 31,
  PERSONAL_DAYS: 3,  // Now D.R. Empleado
  SCHOOL_DAYS: 4,    // Now D.R. Empresa
  EXPECTED_YEARLY_HOURS: 1000,
  MAX_PAST_DAYS: 30,
  PUENTE_DAYS: 9,
  PREP_TIME_YEARLY: 70,    // Total yearly prep hours
  WORKING_WEEKS_PER_YEAR: 47,  // ~47 working weeks 
  MEDICAL_APPT_HOURS: 20  // NEW
};
const ADMIN_DEFAULTS = {
  ANNUAL_DAYS: 31,
  PERSONAL_DAYS: 3,
  SCHOOL_DAYS: 4,
  EXPECTED_YEARLY_HOURS: 1300,
  PREP_TIME_YEARLY: 0,  // Admins don't have prep time
  MEDICAL_APPT_HOURS: 20  // NEW
};
// Sheet names centralized
const SHEETS = {
  TIME_PUNCHES: 'Time_Punches',
  TEACHERS: 'Punch_Teachers',
  ADMINS: 'Punch_Admins',
  CONFIG: 'Punch_Config',
  HOLIDAY_REQUESTS: 'Punch_Holiday_Requests',
  SCHOOL_HOLIDAYS: 'Punch_School_Holidays',
  PREP_TIME: 'Punch_Prep_Time',  // NEW
  PAID_HOURS: 'Punch_Paid_Hours'  // NEW
};

// Holiday type names - centralized for easy updates
const HOLIDAY_TYPES = {
  Annual: {
    name: 'Vacaciones',
    shortName: 'Vacaciones',
    emoji: '🏖️',
    color: 'annual',
    hasLimit: true
  },
  Personal: {
    name: 'Descanso Retribuido Empleado',
    shortName: 'D.R. Empleado',
    emoji: '👤',
    color: 'personal',
    hasLimit: true
  },
  School: {
    name: 'Descanso Retribuido Empresa',
    shortName: 'D.R. Empresa',
    emoji: '🏢',
    color: 'school',
    hasLimit: true
  },
  Medical: {
    name: 'Baja Médica',
    shortName: 'Médico',
    emoji: '🏥',
    color: 'medical',
    hasLimit: false
  },
  MedAppt: {
    name: 'Visita Médica',
    shortName: 'Visita Méd.',
    emoji: '⚕️',
    color: 'medappt',
    hasLimit: true,
    isHoursBased: true
  },
  Permiso: {
    name: 'Permiso Retribuido',
    shortName: 'Permiso',
    emoji: '📋',
    color: 'permiso',
    hasLimit: false,
    requiresReason: true
  }
};

function getHolidayTypeName(type, short = false) {
  const config = HOLIDAY_TYPES[type];
  if (!config) return type;
  return short ? config.shortName : config.name;
}

function getHolidayTypeEmoji(type) {
  return HOLIDAY_TYPES[type]?.emoji || '📅';
}

function formatTimeValue(timeVal) {
  if (timeVal instanceof Date) {
    return `${String(timeVal.getHours()).padStart(2, '0')}:${String(timeVal.getMinutes()).padStart(2, '0')}`;
  }
  const match = String(timeVal).match(/(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : String(timeVal);
}

function parseTime(timeStr) {
  const match = String(timeStr).match(/(\d{1,2}):(\d{2})/);
  return match ? { hours: parseInt(match[1]) || 0, minutes: parseInt(match[2]) || 0 } : null;
}

function isValidTime(timeStr) {
  if (!timeStr) return false;
  const match = String(timeStr).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function formatDateStr(date) {
  if (!date) return '';
  
  // If it's already a string in correct format, return it
  if (typeof date === 'string') {
    // Check if it's already yyyy-MM-dd format
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }
    // Try to parse it as a date
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      return Utilities.formatDate(parsed, TZ(), 'yyyy-MM-dd');
    }
    return date;
  }
  
  // If it's a Date object
  if (date instanceof Date) {
    return Utilities.formatDate(date, TZ(), 'yyyy-MM-dd');
  }
  
  // If it's a number (Excel serial date)
  if (typeof date === 'number') {
    const d = new Date((date - 25569) * 86400 * 1000);
    return Utilities.formatDate(d, TZ(), 'yyyy-MM-dd');
  }
  
  return String(date);
}

function getSheetData(sheetName) {
  const sheet = SS().getSheetByName(sheetName);
  return sheet && sheet.getLastRow() > 1 ? sheet.getDataRange().getValues() : null;
}

// Cached version of getSheetData
function getSheetDataCached(sheetName) {
  const cacheKey = 'sheet_' + sheetName;
  return getCachedData(cacheKey, () => getSheetData(sheetName));
}

function findColumnIndex(headers, ...names) {
  for (const name of names) {
    const idx = headers.indexOf(name);
    if (idx !== -1) return idx;
  }
  return -1;
}

// ========================================
// OPTIMIZED ROW FINDER using TextFinder
// ========================================

function findRowByColumnValue(sheetName, columnIndex, searchValue) {
  const sheet = SS().getSheetByName(sheetName);
  if (!sheet) return null;
  
  const searchColumn = sheet.getRange(1, columnIndex + 1, sheet.getLastRow(), 1);
  const finder = searchColumn.createTextFinder(String(searchValue)).matchEntireCell(true);
  const found = finder.findNext();
  
  if (found) {
    return found.getRow();
  }
  return null;
}

// ========================================
// SETUP - RUN ONCE TO CREATE SHEETS
// ========================================

function setupTimePunchSheets() {
  const ss = SS();
  const headerStyle = { bg: '#092b50', color: '#ffffff', bold: true };
  
  const sheets = [
    {
      name: SHEETS.TIME_PUNCHES,
      headers: ['PunchID', 'TeacherName', 'TeacherEmail', 'Date', 'Time', 'PunchType', 'CreatedAt', 'EditedAt', 'Notes'],
      widths: [180, 150, 200, 100, 80, 80, 150, 150, 200]
    },
    {
      name: SHEETS.TEACHERS,
      headers: ['TeacherID', 'Name', 'Email', 'Status'],
      data: [
        ['T001', 'ROCÍO', 'rocio@worldclassbcn.com', 'Active'],
        ['T002', 'ANDREA', 'andrea@worldclassbcn.com', 'Active'],
        ['T003', 'RAÚL', 'raul@worldclassbcn.com', 'Active'],
        ['T004', 'MARÍA', 'maria@worldclassbcn.com', 'Active'],
        ['T005', 'CARLOS', 'carlos@worldclassbcn.com', 'Active']
      ]
    },
    {
      name: SHEETS.ADMINS,
      headers: ['Email', 'Name', 'Status'],
      data: [['rocio@worldclassbcn.com', 'Rocío', 'Active']]
    },
    {
      name: SHEETS.CONFIG,
      headers: ['Setting', 'Value', 'Description'],
      data: [
        ['SchoolName', 'WorldClass BCN', 'Name displayed in the app'],
        ['AllowPastPunches', 'true', 'Allow teachers to punch for past days'],
        ['MaxPastDays', '30', 'Maximum days in the past allowed'],
        ['DefaultPunchTime', 'current', 'Default time for punch'],
        ['PuenteDays', '9', 'Pre-assigned puente days for the year']
      ]
    }
  ];
  
  sheets.forEach(({ name, headers, widths, data }) => {
    let sheet = ss.getSheetByName(name);
    if (sheet) return;
    
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground(headerStyle.bg).setFontColor(headerStyle.color).setFontWeight('bold');
    
    if (widths) widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
    if (data) data.forEach(row => sheet.appendRow(row));
    sheet.setFrozenRows(1);
    Logger.log('✅ Created ' + name + ' sheet');
  });
  
  SpreadsheetApp.getUi().alert('✅ Setup Complete!', 'All Time Punch sheets have been created.', SpreadsheetApp.getUi().ButtonSet.OK);
  return true;
}

// ========================================
// WEB APP ENTRY POINT - SECURED
// ========================================

function doGet(e) {
  try {
    let userEmail = '';
    try { 
      userEmail = Session.getActiveUser().getEmail(); 
    } catch (err) {
      Logger.log('Session error: ' + err.message);
    }
    
    if (!userEmail) {
      return showGoogleLoginRequired();
    }
    
    const normalizedEmail = userEmail.toLowerCase().trim();
    const role = e.parameter.role;
    const isAdminUser = isAdmin(normalizedEmail);
    
    // Check if user is a teacher OR an admin worker who can punch
    const teacher = getTeacherByEmail(normalizedEmail);
    const adminWorker = getAdminWorkerByEmail(normalizedEmail);
    const canPunch = teacher || adminWorker;
    const punchUser = teacher || adminWorker;
    
    if (role === 'admin' && isAdminUser) {
      const template = HtmlService.createTemplateFromFile('AdminPunch');
      template.adminEmail = normalizedEmail;
      template.adminName = getAdminName(normalizedEmail);
      template.deploymentUrl = ScriptApp.getService().getUrl();
      return template.evaluate()
        .setTitle('WorldClassBCN')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
        .setFaviconUrl('https://i.ibb.co/93tykMkW/logo-1.png')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
    
    if (canPunch) {
      if (isAdminUser && !role) return showRoleSelectionPunch(normalizedEmail, punchUser.name);
      
      const template = HtmlService.createTemplateFromFile('TeacherPunch');
      Object.assign(template, {
        teacherEmail: normalizedEmail,
        teacherName: punchUser.name,
        hasAdminRole: isAdminUser,
        isAdminWorker: !!adminWorker && !teacher,  // True if admin worker only
        deploymentUrl: ScriptApp.getService().getUrl()
      });
      return template.evaluate()
        .setTitle('WorldClassBCN')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
        .setFaviconUrl('https://i.ibb.co/93tykMkW/logo-1.png')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
    
    if (isAdminUser) {
      const template = HtmlService.createTemplateFromFile('AdminPunch');
      template.adminEmail = normalizedEmail;
      template.adminName = getAdminName(normalizedEmail);
      template.deploymentUrl = ScriptApp.getService().getUrl();
      return template.evaluate()
        .setTitle('WorldClassBCN')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
        .setFaviconUrl('https://i.ibb.co/93tykMkW/logo-1.png')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
    
    return showAccessDenied(userEmail);
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return showPunchError('System error: ' + error.message);
  }
}

function showGoogleLoginRequired() {
  return HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
          font-family: 'Google Sans', Arial, sans-serif;
          background: linear-gradient(135deg, #092b50 0%, #59d2ff 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .card {
          background: white;
          border-radius: 24px;
          padding: 50px 40px;
          max-width: 450px;
          width: 100%;
          text-align: center;
          box-shadow: 0 25px 80px rgba(9, 43, 80, 0.4);
        }
        .logo { width: 80px; height: auto; margin-bottom: 20px; }
        .logo-fallback { font-size: 64px; margin-bottom: 20px; }
        h1 { color: #092b50; font-size: 24px; margin-bottom: 10px; }
        .subtitle { color: #64748b; margin-bottom: 30px; font-size: 14px; line-height: 1.6; }
        .google-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 16px 32px;
          background: #fff;
          border: 2px solid #4285f4;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          color: #092b50;
          cursor: pointer;
          transition: all 0.3s;
          text-decoration: none;
          width: 100%;
          max-width: 300px;
        }
        .google-btn:hover {
          background: #4285f4;
          color: white;
          box-shadow: 0 4px 15px rgba(66, 133, 244, 0.4);
        }
        .google-icon { width: 24px; height: 24px; }
        .steps {
          margin-top: 30px;
          padding: 20px;
          background: #f8fafc;
          border-radius: 12px;
          text-align: left;
        }
        .steps-title { font-weight: 700; color: #092b50; margin-bottom: 12px; font-size: 14px; }
        .step { display: flex; gap: 10px; margin-bottom: 8px; font-size: 13px; color: #64748b; }
        .step-num { 
          width: 20px; height: 20px; 
          background: #59d2ff; color: #092b50; 
          border-radius: 50%; 
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700; flex-shrink: 0;
        }
        .help-text {
          margin-top: 20px;
          color: #94a3b8;
          font-size: 11px;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <img src="https://i0.wp.com/worldclassbcn.com/wp-content/uploads/2025/05/worldclass_logo.png?fit=368%2C396&ssl=1" 
             alt="WorldClass BCN" class="logo"
             onerror="this.style.display='none'; document.getElementById('logoFallback').style.display='block';">
        <div id="logoFallback" class="logo-fallback" style="display: none;">🔐</div>
        
        <h1>Iniciar Sesión con Google</h1>
        <p class="subtitle">Para acceder al sistema de fichaje, necesitas iniciar sesión con tu cuenta de Google de WorldClass BCN.</p>
        
        <a href="javascript:void(0)" onclick="openInNewWindow()" class="google-btn">
          <svg class="google-icon" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continuar con Google
        </a>
        
        <div class="steps">
          <div class="steps-title">📋 Pasos para iniciar sesión:</div>
          <div class="step"><span class="step-num">1</span><span>Haz clic en "Continuar con Google"</span></div>
          <div class="step"><span class="step-num">2</span><span>Selecciona tu cuenta @worldclassbcn.com</span></div>
          <div class="step"><span class="step-num">3</span><span>Autoriza el acceso si es la primera vez</span></div>
        </div>
        
        <div class="help-text">
          ¿Problemas? Asegúrate de usar el navegador donde tienes tu cuenta de Google abierta.<br>
          Contacta al administrador si necesitas ayuda.
        </div>
      </div>
      
      <script>
        function openInNewWindow() {
          window.open(window.location.href, '_blank', 'width=500,height=700');
        }
        setTimeout(function() {
          window.location.reload();
        }, 3000);
      </script>
    </body>
    </html>
  `).setTitle('🔐 Iniciar Sesión - WorldClass BCN')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function showAccessDenied(email) {
  const webAppUrl = ScriptApp.getService().getUrl();
  const logoutUrl = 'https://accounts.google.com/logout?continue=' + encodeURIComponent(webAppUrl);
  
  return HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
          font-family: 'Google Sans', Arial, sans-serif;
          background: linear-gradient(135deg, #092b50 0%, #59d2ff 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .card {
          background: white;
          border-radius: 24px;
          padding: 40px 30px;
          max-width: 450px;
          width: 100%;
          text-align: center;
          box-shadow: 0 25px 80px rgba(9, 43, 80, 0.4);
        }
        .icon { font-size: 64px; margin-bottom: 20px; }
        h1 { color: #ef4444; font-size: 22px; margin-bottom: 10px; }
        .message {
          background: #fef2f2;
          border: 1px solid #fecaca;
          padding: 16px;
          border-radius: 12px;
          margin: 20px 0;
          color: #991b1b;
          font-size: 14px;
        }
        .email-box {
          background: #fee2e2;
          padding: 12px;
          border-radius: 8px;
          font-family: monospace;
          color: #991b1b;
          font-size: 13px;
          margin: 15px 0;
          word-break: break-all;
        }
        .btn {
          display: block;
          width: 100%;
          padding: 16px;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          margin-bottom: 12px;
          transition: all 0.2s;
        }
        .btn-primary {
          background: #092b50;
          color: white;
        }
        .btn-primary:hover { background: #0a3a6b; }
        .btn-secondary {
          background: #f1f5f9;
          color: #475569;
        }
        .btn-secondary:hover { background: #e2e8f0; }
        .help-text {
          color: #64748b;
          font-size: 12px;
          margin-top: 20px;
          line-height: 1.6;
        }
        .tip {
          background: #fef3c7;
          border-radius: 10px;
          padding: 15px;
          font-size: 12px;
          color: #92400e;
          margin-top: 20px;
          text-align: left;
        }
        .tip-title { font-weight: 700; margin-bottom: 5px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">🔒</div>
        <h1>Cuenta No Registrada</h1>
        <div class="message">
          Has iniciado sesión con una cuenta que no está en el sistema.
        </div>
        <div class="email-box">${email}</div>
        
        <a href="${logoutUrl}" class="btn btn-primary">
          🔄 Cambiar de Cuenta
        </a>
        
        <a href="${webAppUrl}" class="btn btn-secondary">
          ↻ Intentar de Nuevo
        </a>
        
        <div class="tip">
          <div class="tip-title">💡 Consejo:</div>
          Después de iniciar sesión con tu cuenta correcta, añade esta app a tu pantalla de inicio para no tener que volver a seleccionar la cuenta.
        </div>
        
        <div class="help-text">
          Si crees que deberías tener acceso, contacta al administrador.
        </div>
      </div>
    </body>
    </html>
  `).setTitle('🔒 Acceso Denegado - WorldClass BCN')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function showRoleSelectionPunch(email, teacherName) {
  const deploymentUrl = ScriptApp.getService().getUrl();
  return HtmlService.createHtmlOutput(`
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Google Sans',Arial,sans-serif;background:linear-gradient(135deg,#092b50 0%,#59d2ff 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{background:#fff;border-radius:20px;padding:40px;max-width:500px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3)}h1{color:#092b50;margin-bottom:10px}.subtitle{color:#64748b;margin-bottom:30px}.role-btn{display:block;width:100%;padding:20px;margin:10px 0;border:2px solid #e0e7ff;border-radius:12px;background:#fff;cursor:pointer;transition:all .3s;text-align:left}.role-btn:hover{border-color:#59d2ff;background:#f0f9ff;transform:translateY(-2px)}.role-icon{font-size:32px;margin-bottom:10px}.role-title{font-size:18px;font-weight:700;color:#092b50}.role-desc{font-size:14px;color:#64748b;margin-top:5px}</style></head>
    <body><div class="card"><h1>👋 ¡Hola, ${teacherName}!</h1><p class="subtitle">Elige tu panel</p>
    <button class="role-btn" onclick="selectRole('teacher')"><div class="role-icon">🕐</div><div class="role-title">Fichaje de Empleado</div><div class="role-desc">Fichar entrada/salida y ver tus horas</div></button>
    <button class="role-btn" onclick="selectRole('admin')"><div class="role-icon">📊</div><div class="role-title">Panel de Administración</div><div class="role-desc">Ver todos los empleados y gestionar fichajes</div></button></div>
    <script>function selectRole(role){window.top.location.href='${deploymentUrl}?role='+role;}</script></body></html>
  `).setTitle('🕐 Control de Fichaje - Seleccionar Rol').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function showPunchError(message) {
  return HtmlService.createHtmlOutput(`
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>body{font-family:Arial;background:linear-gradient(135deg,#092b50 0%,#59d2ff 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{background:#fff;border-radius:20px;padding:40px;max-width:400px;text-align:center}h1{color:#ef4444}.message{background:#fee2e2;padding:15px;border-radius:8px;margin:20px 0;color:#991b1b}a{display:inline-block;padding:12px 24px;background:#092b50;color:#fff;text-decoration:none;border-radius:8px;margin-top:20px}</style></head>
    <body><div class="card"><h1>❌ Acceso Denegado</h1><div class="message">${message}</div><a href="?">← Intentar de Nuevo</a></div></body></html>
  `).setTitle('Acceso Denegado').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ========================================
// AUTHENTICATION HELPERS
// ========================================

function getTeacherByEmail(email) {
  const data = getSheetData(SHEETS.TEACHERS);
  if (!data) return null;
  
  const normalizedEmail = email.toLowerCase().trim();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2] || '').toLowerCase().trim() === normalizedEmail && data[i][3] === 'Active') {
      return { id: data[i][0], name: data[i][1], email: normalizedEmail };
    }
  }
  return null;
}

function isAdmin(email) {
  const data = getSheetData(SHEETS.ADMINS);
  if (!data) return false;
  
  const normalizedEmail = email.toLowerCase().trim();
  return data.slice(1).some(row => String(row[0] || '').toLowerCase().trim() === normalizedEmail && row[2] === 'Active');
}

function getAdminName(email) {
  const data = getSheetData(SHEETS.ADMINS);
  if (!data) return 'Admin';
  
  const normalizedEmail = email.toLowerCase().trim();
  const row = data.slice(1).find(r => String(r[0] || '').toLowerCase().trim() === normalizedEmail);
  return row ? (row[1] || 'Admin') : 'Admin';
}

function getDeploymentUrl() { return ScriptApp.getService().getUrl(); }

// ========================================
// PUNCH FUNCTIONS
// ========================================

function getTodayDateString() { return TODAY_STR(); }
function isFutureDate(dateStr) { return dateStr > TODAY_STR(); }

function getPunchesForDay(teacherEmail, dateStr) {
  try {
    const sheet = SS().getSheetByName(SHEETS.TIME_PUNCHES);
    if (!sheet || sheet.getLastRow() < 2) return [];
    
    const normalizedEmail = teacherEmail.toLowerCase().trim();
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
    
    return data
      .filter(row => {
        const rowEmail = String(row[2] || '').toLowerCase().trim();
        const rowDate = formatDateStr(row[3]);
        const rowType = String(row[5] || '').toUpperCase().trim();
        // Only return IN/OUT punches, NOT PREP
        return rowEmail === normalizedEmail && rowDate === dateStr && (rowType === 'IN' || rowType === 'OUT');
      })
      .map(row => ({
        punchId: String(row[0]),
        teacherName: String(row[1]),
        date: formatDateStr(row[3]),
        time: formatTimeValue(row[4]),
        punchType: String(row[5]).toUpperCase().trim(),
        notes: String(row[8] || '')
      }))
      .sort((a, b) => a.time.localeCompare(b.time));
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return [];
  }
}

function editPunch(punchId, newTime, newNotes, callerEmail) {
  try {
    if (!isValidTime(newTime)) return { success: false, message: 'Invalid time format. Use HH:MM (e.g., 09:30)' };
    
    const lock = LockService.getUserLock();
    if (!lock.tryLock(10000)) {
      return { success: false, message: 'Sistema ocupado. Por favor intenta de nuevo.' };
    }
    
    try {
      const sheet = SS().getSheetByName(SHEETS.TIME_PUNCHES);
      if (!sheet) throw new Error('Time_Punches sheet not found');
      
      const rowNum = findRowByColumnValue(SHEETS.TIME_PUNCHES, 0, punchId);
      
      if (rowNum && rowNum > 1) {
        // Check ownership - only owner or Super Admin can edit
        const punchEmail = String(sheet.getRange(rowNum, 3).getValue() || '').toLowerCase().trim();
        const callerNormalized = (callerEmail || '').toLowerCase().trim();
        const isOwner = punchEmail === callerNormalized;
        const callerIsSuperAdmin = isSuperAdmin(callerEmail);
        
        if (!isOwner && !callerIsSuperAdmin) {
          return { success: false, message: 'Solo puedes editar tus propios fichajes' };
        }
        
        // Check if date is frozen
        const punchDate = formatDateStr(sheet.getRange(rowNum, 4).getValue());
        const editCheck = canEditPunchesForDate(punchDate, callerEmail || '');
        
        if (!editCheck.canEdit) {
          return { success: false, message: editCheck.message || 'Este fichaje está congelado', frozen: true };
        }
        
        sheet.getRange(rowNum, 5).setValue(newTime);
        if (newNotes !== undefined) sheet.getRange(rowNum, 9).setValue(newNotes);
        sheet.getRange(rowNum, 8).setValue(Utilities.formatDate(NOW(), TZ(), 'yyyy-MM-dd HH:mm:ss'));
        
        invalidateCache(CACHE_KEYS.PUNCHES);
        
        return { success: true, message: 'Punch updated to ' + newTime };
      }
      
      throw new Error('Punch not found');
      
    } finally {
      lock.releaseLock();
    }
    
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return { success: false, message: error.message };
  }
}

function deletePunch(punchId, callerEmail) {
  try {
    const lock = LockService.getUserLock();
    if (!lock.tryLock(10000)) {
      return { success: false, message: 'Sistema ocupado. Por favor intenta de nuevo.' };
    }
    
    try {
      const sheet = SS().getSheetByName(SHEETS.TIME_PUNCHES);
      if (!sheet) throw new Error('Time_Punches sheet not found');
      
      const rowNum = findRowByColumnValue(SHEETS.TIME_PUNCHES, 0, punchId);
      
      if (rowNum && rowNum > 1) {
        // Check ownership - only owner or Super Admin can delete
        const punchEmail = String(sheet.getRange(rowNum, 3).getValue() || '').toLowerCase().trim();
        const callerNormalized = (callerEmail || '').toLowerCase().trim();
        const isOwner = punchEmail === callerNormalized;
        const callerIsSuperAdmin = isSuperAdmin(callerEmail);
        
        if (!isOwner && !callerIsSuperAdmin) {
          return { success: false, message: 'Solo puedes eliminar tus propios fichajes' };
        }
        
        // Check if date is frozen
        const punchDate = formatDateStr(sheet.getRange(rowNum, 4).getValue());
        const editCheck = canEditPunchesForDate(punchDate, callerEmail || '');
        
        if (!editCheck.canEdit) {
          return { success: false, message: editCheck.message || 'Este fichaje está congelado', frozen: true };
        }
        
        sheet.deleteRow(rowNum);
        invalidateCache(CACHE_KEYS.PUNCHES);
        
        return { success: true, message: 'Punch deleted' };
      }
      
      throw new Error('Punch not found');
      
    } finally {
      lock.releaseLock();
    }
    
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return { success: false, message: error.message };
  }
}

function getTeacherPunchedDays(teacherEmail, year, month) {
  try {
    const sheet = SS().getSheetByName(SHEETS.TIME_PUNCHES);
    if (!sheet || sheet.getLastRow() < 2) return {};
    
    const normalizedEmail = teacherEmail.toLowerCase().trim();
    const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const endStr = Utilities.formatDate(new Date(year, month, 0), TZ(), 'yyyy-MM-dd');
    const data = sheet.getRange(2, 3, sheet.getLastRow() - 1, 4).getValues();
    
    const punchedDays = {};
    data.forEach(row => {
      if (String(row[0] || '').toLowerCase().trim() !== normalizedEmail) return;
      const rowDateStr = formatDateStr(row[1]);
      if (rowDateStr < startStr || rowDateStr > endStr) return;
      
      const punchType = String(row[3]).toUpperCase();
      if (punchType === 'PREP') return; // Skip prep time punches
      
      if (!punchedDays[rowDateStr]) {
        punchedDays[rowDateStr] = { count: 0, hasIn: false, hasOut: false, punches: [] };
      }
      punchedDays[rowDateStr].count++;
      if (punchType === 'IN') punchedDays[rowDateStr].hasIn = true;
      else if (punchType === 'OUT') punchedDays[rowDateStr].hasOut = true;
      
      // Store punch for hours calculation
      punchedDays[rowDateStr].punches.push({
        time: formatTimeValue(row[2]),
        punchType: punchType
      });
    });
    
    // Calculate hours for each day
    Object.keys(punchedDays).forEach(dateStr => {
      const day = punchedDays[dateStr];
      day.hours = calculateDayHours(day.punches);
    });
    
    return punchedDays;
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return {};
  }
}

function calculateDayHours(punches) {
  if (!punches || !punches.length) return 0;
  
  // Sort by time
  const sorted = [...punches].sort((a, b) => a.time.localeCompare(b.time));
  
  let totalMinutes = 0;
  for (let i = 0; i < sorted.length - 1; i += 2) {
    if (sorted[i].punchType === 'IN' && sorted[i + 1]?.punchType === 'OUT') {
      const inTime = parseTime(sorted[i].time);
      const outTime = parseTime(sorted[i + 1].time);
      if (inTime && outTime) {
        const diff = (outTime.hours * 60 + outTime.minutes) - (inTime.hours * 60 + inTime.minutes);
        if (diff > 0) totalMinutes += diff;
      }
    }
  }
  
  return Math.round((totalMinutes / 60) * 100) / 100;
}

function calculateHoursFromPunches(punches, startDate, endDate) {
  const punchesByDate = {};
  punches.forEach(punch => {
    // Skip PREP punches - they're not IN/OUT pairs
    const type = punch.punchType || punch.type;
    if (type === 'PREP') return;
    
    if ((startDate && punch.date < startDate) || (endDate && punch.date > endDate)) return;
    (punchesByDate[punch.date] = punchesByDate[punch.date] || []).push(punch);
  });
  
  let totalMinutes = 0;
  Object.values(punchesByDate).forEach(dayPunches => {
    dayPunches.sort((a, b) => a.time.localeCompare(b.time));
    for (let i = 0; i < dayPunches.length - 1; i += 2) {
      const punchType = dayPunches[i].punchType || dayPunches[i].type;
      const nextPunchType = dayPunches[i + 1]?.punchType || dayPunches[i + 1]?.type;
      
      if (punchType === 'IN' && nextPunchType === 'OUT') {
        const inTime = parseTime(dayPunches[i].time), outTime = parseTime(dayPunches[i + 1].time);
        if (inTime && outTime) {
          const diff = (outTime.hours * 60 + outTime.minutes) - (inTime.hours * 60 + inTime.minutes);
          if (diff > 0) totalMinutes += diff;
        }
      }
    }
  });
  
  return Math.round((totalMinutes / 60) * 100) / 100;
}

function calculateHoursForTeacher(teacherEmail, startDate, endDate) {
  try {
    const data = getSheetData(SHEETS.TIME_PUNCHES);
    if (!data) return 0;
    
    const normalizedEmail = teacherEmail.toLowerCase().trim();
    const punchesByDate = {};
    
    data.slice(1).forEach(row => {
      if (String(row[2] || '').toLowerCase().trim() !== normalizedEmail) return;
      const rowDateStr = formatDateStr(row[3]);
      if ((startDate && rowDateStr < startDate) || (endDate && rowDateStr > endDate)) return;
      (punchesByDate[rowDateStr] = punchesByDate[rowDateStr] || []).push({
        time: formatTimeValue(row[4]),
        punchType: String(row[5])
      });
    });
    
    let totalMinutes = 0;
    Object.values(punchesByDate).forEach(dayPunches => {
      dayPunches.sort((a, b) => a.time.localeCompare(b.time));
      for (let i = 0; i < dayPunches.length - 1;) {
        if (dayPunches[i].punchType === 'IN' && dayPunches[i + 1]?.punchType === 'OUT') {
          const inTime = parseTime(dayPunches[i].time), outTime = parseTime(dayPunches[i + 1].time);
          if (inTime && outTime) {
            const diff = (outTime.hours * 60 + outTime.minutes) - (inTime.hours * 60 + inTime.minutes);
            if (diff > 0) totalMinutes += diff;
          }
          i += 2;
        } else i++;
      }
    });
    
    return Math.round((totalMinutes / 60) * 100) / 100;
  } catch (error) {
    Logger.log('❌ ERROR calculating hours: ' + error.message);
    return 0;
  }
}

// ========================================
// ADMIN FUNCTIONS - OPTIMIZED
// ========================================

function getAllTeachersWithHours() {
  try {
    const teachersData = getSheetData(SHEETS.TEACHERS);
    const punchesData = getSheetData(SHEETS.TIME_PUNCHES) || [];
    if (!teachersData) return [];
    
    const now = NOW();
    const monthStart = Utilities.formatDate(new Date(now.getFullYear(), now.getMonth(), 1), TZ(), 'yyyy-MM-dd');
    const monthEnd = Utilities.formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0), TZ(), 'yyyy-MM-dd');
    
    const punchesByEmail = {};
    punchesData.slice(1).forEach(row => {
      const email = String(row[2] || '').toLowerCase().trim();
      (punchesByEmail[email] = punchesByEmail[email] || []).push({
        date: formatDateStr(row[3]),
        time: formatTimeValue(row[4]),
        punchType: String(row[5])
      });
    });
    
    return teachersData.slice(1)
      .filter(row => row[3] === 'Active')
      .map(row => {
        const email = String(row[2] || '').toLowerCase().trim();
        const teacherPunches = punchesByEmail[email] || [];
        return {
          id: row[0],
          name: String(row[1]),
          email,
          monthlyHours: calculateHoursFromPunches(teacherPunches, monthStart, monthEnd),
          totalHours: calculateHoursFromPunches(teacherPunches, null, null)
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return [];
  }
}

function isLeapYear(year) {
  return ((year % 4 === 0) && (year % 100 !== 0)) || (year % 400 === 0);
}

function getAllTeachersWithHoursForMonth(year, month) {
  try {
    const teachersData = getSheetData(SHEETS.TEACHERS);
    const punchesData = getSheetData(SHEETS.TIME_PUNCHES) || [];
    if (!teachersData) return { teachers: [], monthName: '' };
    
    const headers = teachersData[0];
    const expectedHoursColIndex = headers.indexOf('ExpectedYearlyHours');
    
    const monthStart = Utilities.formatDate(new Date(year, month - 1, 1), TZ(), 'yyyy-MM-dd');
    const monthEnd = Utilities.formatDate(new Date(year, month, 0), TZ(), 'yyyy-MM-dd');
    const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    const now = NOW();
    const isCurrentMonth = (year === now.getFullYear() && month === now.getMonth() + 1);
    const isPastMonth = (year < now.getFullYear()) || (year === now.getFullYear() && month < now.getMonth() + 1);
    
    const progressDate = isCurrentMonth ? now : new Date(year, month, 0);
    const startOfYear = new Date(progressDate.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((progressDate - startOfYear) / (24 * 60 * 60 * 1000)) + 1;
    const totalDaysInYear = isLeapYear(progressDate.getFullYear()) ? 366 : 365;
    const yearProgress = dayOfYear / totalDaysInYear;
    
    const punchesByEmail = {};
    punchesData.slice(1).forEach(row => {
      const email = String(row[2] || '').toLowerCase().trim();
      (punchesByEmail[email] = punchesByEmail[email] || []).push({
        date: formatDateStr(row[3]),
        time: formatTimeValue(row[4]),
        punchType: String(row[5])
      });
    });
    
    let totalProgress = 0, teachersOnTrack = 0, teachersBehind = 0;
    
    const teachers = teachersData.slice(1)
      .filter(row => row[3] === 'Active')
      .map(row => {
        const email = String(row[2] || '').toLowerCase().trim();
        const expectedYearlyHours = expectedHoursColIndex !== -1 ? (parseFloat(row[expectedHoursColIndex]) || DEFAULTS.EXPECTED_YEARLY_HOURS) : DEFAULTS.EXPECTED_YEARLY_HOURS;
        const teacherPunches = punchesByEmail[email] || [];
        
        const monthlyHours = calculateHoursFromPunches(teacherPunches, monthStart, monthEnd);
        const totalHours = calculateHoursFromPunches(teacherPunches, null, monthEnd);
        const expectedHoursToDate = expectedYearlyHours * yearProgress;
        const progressPercent = expectedHoursToDate > 0 ? (totalHours / expectedHoursToDate) * 100 : 0;
        
        totalProgress += progressPercent;
        progressPercent >= 98 ? teachersOnTrack++ : teachersBehind++;
        
        return {
          id: row[0], name: String(row[1]), email, monthlyHours, totalHours,
          expectedYearlyHours, expectedHoursToDate, progressPercent
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    
    return {
      teachers, monthName, year, month, isCurrentMonth, isPastMonth,
      yearProgress: yearProgress * 100,
      avgProgress: teachers.length > 0 ? totalProgress / teachers.length : 0,
      teachersOnTrack, teachersBehind
    };
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return { teachers: [], monthName: '', error: error.message };
  }
}

function getTeacherMonthlyPunches(teacherEmail, year, month) {
  try {
    const data = getSheetData(SHEETS.TIME_PUNCHES);
    if (!data) return [];
    
    const normalizedEmail = teacherEmail.toLowerCase().trim();
    const startStr = Utilities.formatDate(new Date(year, month - 1, 1), TZ(), 'yyyy-MM-dd');
    const endStr = Utilities.formatDate(new Date(year, month, 0), TZ(), 'yyyy-MM-dd');
    
    return data.slice(1)
      .filter(row => {
        const rowEmail = String(row[2] || '').toLowerCase().trim();
        const rowDateStr = formatDateStr(row[3]);
        return rowEmail === normalizedEmail && rowDateStr >= startStr && rowDateStr <= endStr;
      })
      .map(row => ({
        punchId: String(row[0]),
        teacherName: String(row[1]),
        date: formatDateStr(row[3]),
        time: formatTimeValue(row[4]),
        punchType: String(row[5]),
        notes: String(row[8] || '')
      }))
      .sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : a.time.localeCompare(b.time));
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return [];
  }
}

function getTeacherPunchesForDay(teacherEmail, dateStr) {
  return getPunchesForDay(teacherEmail, dateStr);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ========================================
// OPTIMIZED: Combined data fetch with caching
// ========================================
// ========================================
// UPDATED: getAllTeachersWithHoursAndHolidays - Add weekly hours
// ========================================

function getAllTeachersWithHoursAndHolidays(year, month, weekOffset) {
  try {
    const startTime = Date.now();
    weekOffset = weekOffset || 0;
    
    const teachersData = getSheetData(SHEETS.TEACHERS);
    const punchesData = getSheetData(SHEETS.TIME_PUNCHES) || [];
    const holidayData = getSheetData(SHEETS.HOLIDAY_REQUESTS) || [];
    
    if (!teachersData) return { teachers: [], monthName: '', error: 'Teachers sheet not found' };
    
    const headers = teachersData[0];
    const cols = {
      id: findColumnIndex(headers, 'TeacherID'),
      name: findColumnIndex(headers, 'Name'),
      email: findColumnIndex(headers, 'Email'),
      status: findColumnIndex(headers, 'Status'),
      annual: findColumnIndex(headers, 'AnnualDays'),
      personal: findColumnIndex(headers, 'PersonalDays'),
      school: findColumnIndex(headers, 'SchoolDays'),
      expected: findColumnIndex(headers, 'ExpectedYearlyHours'),
      prepTimeYearly: findColumnIndex(headers, 'PrepTimeYearly'),
      medApptHours: findColumnIndex(headers, 'MedApptHours')
    };
    
    const now = NOW();
    
    // Date range strings
    const monthStart = Utilities.formatDate(new Date(year, month - 1, 1), TZ(), 'yyyy-MM-dd');
    const monthEnd = Utilities.formatDate(new Date(year, month, 0), TZ(), 'yyyy-MM-dd');
    const yearStart = year + '-01-01';
    const yearEnd = year + '-12-31';
    const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    // Calculate week bounds
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + (weekOffset * 7));
    const weekBounds = getWeekBounds(baseDate);
    const weekStart = weekBounds.start;
    const weekEnd = weekBounds.end;
    const weekNumber = weekBounds.weekNumber;
    const weekDisplay = weekBounds.mondayDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ' - ' + weekBounds.sundayDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    
    const isCurrentMonth = (year === now.getFullYear() && month === now.getMonth() + 1);
    
    // Step 1: Build school holiday date set
    const schoolHolidayDates = buildSchoolHolidayDateSet(year);
    
    // Step 2: Calculate progress date
    const progressDate = isCurrentMonth ? now : new Date(year, month, 0);
    
    // Step 3: Pre-compute base working days
    const baseWorkingDays = precomputeWorkingDays(year, progressDate, schoolHolidayDates);
    
    // Step 4: Build teacher holiday dates (EXCLUDES Medical)
    const teacherHolidayDatesByEmail = buildTeacherHolidayDates(holidayData, year);
    
    // Step 5: Build medical dates separately
    const medicalDatesByEmail = buildMedicalDates(holidayData, year);
    
    // Pre-process MedAppt hours
    const medApptByEmail = buildMedApptHoursByEmail(holidayData, yearStart, yearEnd);
    
    // ========================================
    // Pre-process punches
    // ========================================
    const punchesByEmail = {};
    const prepByEmail = {};
    
    punchesData.slice(1).forEach(row => {
      const email = String(row[2] || '').toLowerCase().trim();
      if (!email) return;
      
      const punchType = String(row[5] || '').toUpperCase().trim();
      const rowDate = formatDateStr(row[3]);
      
      if (punchType === 'PREP') {
        if (rowDate >= yearStart && rowDate <= yearEnd) {
          if (!prepByEmail[email]) {
            prepByEmail[email] = { totalHours: 0, weeksLogged: 0 };
          }
          const notesField = String(row[8] || '');
          let hours = 0;
          if (notesField.includes('Hours:')) {
            const hoursMatch = notesField.match(/Hours:\s*([\d.]+)/);
            if (hoursMatch) hours = parseFloat(hoursMatch[1]) || 0;
          } else {
            const allocation = getTeacherPrepTimeAllocation(email);
            hours = allocation.weeklyHours;
          }
          prepByEmail[email].totalHours += hours;
          prepByEmail[email].weeksLogged++;
        }
      } else if (punchType === 'IN' || punchType === 'OUT') {
        if (!punchesByEmail[email]) punchesByEmail[email] = [];
        punchesByEmail[email].push({
          date: rowDate,
          time: formatTimeValue(row[4]),
          punchType: punchType
        });
      }
    });
    
    // Pre-process holidays for summary
    const holidaysByEmail = {};
    holidayData.slice(1).forEach(row => {
      const email = String(row[2] || '').toLowerCase().trim();
      if (!email) return;
      
      const days = parseFloat(row[5]) || 0;
      const status = String(row[6]);
      const type = String(row[7] || 'Annual');
      
      if (!holidaysByEmail[email]) {
        holidaysByEmail[email] = { 
          annualUsed: 0, annualPending: 0, 
          personalUsed: 0, personalPending: 0, 
          schoolUsed: 0, 
          medicalUsed: 0, medicalPending: 0,
          medApptUsed: 0, medApptPending: 0,
          permisoUsed: 0, permisoPending: 0
        };
      }
      
      const h = holidaysByEmail[email];
      if (type === 'Annual') {
        if (status === 'Approved') h.annualUsed += days;
        else if (status === 'Pending') h.annualPending += days;
      } else if (type === 'Personal') {
        if (status === 'Approved') h.personalUsed += days;
        else if (status === 'Pending') h.personalPending += days;
      } else if (type === 'School' && status === 'Approved') {
        h.schoolUsed += days;
      } else if (type === 'Medical') {
        if (status === 'Approved') h.medicalUsed += days;
        else if (status === 'Pending') h.medicalPending += days;
      } else if (type === 'MedAppt') {
        if (status === 'Approved') h.medApptUsed += days;
        else if (status === 'Pending') h.medApptPending += days;
      } else if (type === 'Permiso') {
        if (status === 'Approved') h.permisoUsed += days;
        else if (status === 'Pending') h.permisoPending += days;
      }
    });
    
    // Pre-process paid hours
    const paidByEmail = { year: {}, month: {}, week: {} };
    const paidHoursSheet = SS().getSheetByName(SHEETS.PAID_HOURS);
    if (paidHoursSheet && paidHoursSheet.getLastRow() > 1) {
      const paidData = paidHoursSheet.getRange(2, 1, paidHoursSheet.getLastRow() - 1, 5).getValues();
      paidData.forEach(row => {
        const email = String(row[2] || '').toLowerCase().trim();
        const dateStr = formatDateStr(row[4]);
        const hours = parseFloat(row[3]) || 0;
        
        if (dateStr >= yearStart && dateStr <= yearEnd) {
          if (!paidByEmail.year[email]) paidByEmail.year[email] = 0;
          paidByEmail.year[email] += hours;
        }
        if (dateStr >= monthStart && dateStr <= monthEnd) {
          if (!paidByEmail.month[email]) paidByEmail.month[email] = 0;
          paidByEmail.month[email] += hours;
        }
        if (dateStr >= weekStart && dateStr <= weekEnd) {
          if (!paidByEmail.week[email]) paidByEmail.week[email] = 0;
          paidByEmail.week[email] += hours;
        }
      });
    }
    
    let totalProgress = 0, teachersOnTrack = 0, teachersBehind = 0;
    
    // ========================================
    // BUILD TEACHER LIST
    // ========================================
    
    const teachers = teachersData.slice(1)
      .filter(row => row[cols.status >= 0 ? cols.status : 3] === 'Active')
      .map(row => {
        const email = String(row[cols.email >= 0 ? cols.email : 2] || '').toLowerCase().trim();
        const name = String(row[cols.name >= 0 ? cols.name : 1]);
        
        const annualTotal = cols.annual >= 0 ? (parseInt(row[cols.annual]) || DEFAULTS.ANNUAL_DAYS) : DEFAULTS.ANNUAL_DAYS;
        const personalTotal = cols.personal >= 0 ? (parseInt(row[cols.personal]) || DEFAULTS.PERSONAL_DAYS) : DEFAULTS.PERSONAL_DAYS;
        const schoolTotal = cols.school >= 0 ? (parseInt(row[cols.school]) || DEFAULTS.SCHOOL_DAYS) : DEFAULTS.SCHOOL_DAYS;
        const expectedYearlyHours = cols.expected >= 0 ? (parseInt(row[cols.expected]) || DEFAULTS.EXPECTED_YEARLY_HOURS) : DEFAULTS.EXPECTED_YEARLY_HOURS;
        const prepTimeYearly = cols.prepTimeYearly >= 0 ? (parseFloat(row[cols.prepTimeYearly]) || DEFAULTS.PREP_TIME_YEARLY) : DEFAULTS.PREP_TIME_YEARLY;
        
        const teacherPunches = punchesByEmail[email] || [];
        
        // Calculate hours worked from punches
        const monthlyHoursWorked = calculateHoursFromPunches(teacherPunches, monthStart, monthEnd);
        const weeklyHoursWorked = calculateHoursFromPunches(teacherPunches, weekStart, weekEnd);
        const totalHoursWorked = calculateHoursFromPunches(teacherPunches, yearStart, monthEnd);
        
        // Subtract paid hours
        const paidHoursYear = paidByEmail.year[email] || 0;
        const paidHoursMonth = paidByEmail.month[email] || 0;
        const paidHoursWeek = paidByEmail.week[email] || 0;
        
        // ========================================
        // PROGRESS CALCULATION
        // ========================================
        
        const teacherHolidayDates = teacherHolidayDatesByEmail[email] || new Set();
        const annualWorkingDays = Math.max(0, annualTotal - 3);
        const allocatedDays = annualWorkingDays + personalTotal + schoolTotal;
        const workingDayProgress = getTeacherWorkingDayProgress(baseWorkingDays, teacherHolidayDates, allocatedDays);
        
        const hoursPerWorkingDay = workingDayProgress.totalWorkingDays > 0 
          ? expectedYearlyHours / workingDayProgress.totalWorkingDays 
          : 0;
        
        // ========================================
        // MEDICAL HOURS CALCULATION
        // ========================================
        const teacherMedicalDates = medicalDatesByEmail[email] || new Set();
        
        const medicalWorkingDaysYear = countMedicalWorkingDaysInRange(teacherMedicalDates, baseWorkingDays, yearStart, monthEnd);
        const medicalWorkingDaysMonth = countMedicalWorkingDaysInRange(teacherMedicalDates, baseWorkingDays, monthStart, monthEnd);
        const medicalWorkingDaysWeek = countMedicalWorkingDaysInRange(teacherMedicalDates, baseWorkingDays, weekStart, weekEnd);
        
        const medicalHoursYear = Math.round(medicalWorkingDaysYear * hoursPerWorkingDay * 100) / 100;
        const medicalHoursMonth = Math.round(medicalWorkingDaysMonth * hoursPerWorkingDay * 100) / 100;
        const medicalHoursWeek = Math.round(medicalWorkingDaysWeek * hoursPerWorkingDay * 100) / 100;
        
        // ========================================
        // MEDAPPT HOURS
        // ========================================
        const teacherMedAppt = medApptByEmail[email] || { total: 0, records: [] };
        const medApptHoursYear = teacherMedAppt.total;
        const medApptHoursMonth = getMedApptHoursFromRecords(teacherMedAppt.records, monthStart, monthEnd);
        const medApptHoursWeek = getMedApptHoursFromRecords(teacherMedAppt.records, weekStart, weekEnd);
        
        // ========================================
        // FINAL HOURS = punched - paid + medical (sick) + medAppt
        // ========================================
        const monthlyHours = monthlyHoursWorked - paidHoursMonth + medicalHoursMonth + medApptHoursMonth;
        const weeklyHours = weeklyHoursWorked - paidHoursWeek + medicalHoursWeek + medApptHoursWeek;
        const totalHours = totalHoursWorked - paidHoursYear + medicalHoursYear + medApptHoursYear;
        
        // Expected hours based on working days ratio
        const expectedHoursToDate = expectedYearlyHours * workingDayProgress.progressRatio;
        
        // Progress percentage
        const progressPercent = expectedHoursToDate > 0 
          ? (totalHours / expectedHoursToDate) * 100 
          : (totalHours > 0 ? 100 : 0);
        
        // Calculate expected weekly hours
        const expectedWeeklyHours = Math.round(hoursPerWorkingDay * 5 * 10) / 10;
        
        totalProgress += progressPercent;
        if (progressPercent >= 98) teachersOnTrack++;
        else teachersBehind++;
        
        const holidays = holidaysByEmail[email] || { 
          annualUsed: 0, annualPending: 0, 
          personalUsed: 0, personalPending: 0, 
          schoolUsed: 0, 
          medicalUsed: 0, medicalPending: 0,
          medApptUsed: 0, medApptPending: 0,
          permisoUsed: 0, permisoPending: 0
        };
        
        const prep = prepByEmail[email] || { totalHours: 0, weeksLogged: 0 };
        
        return {
          id: row[cols.id >= 0 ? cols.id : 0],
          name: name,
          email: email,
          monthlyHours: monthlyHours,
          weeklyHours: weeklyHours,
          totalHoursWorked: totalHoursWorked,
          totalHours: totalHours,
          paidHours: Math.round(paidHoursYear * 100) / 100,
          paidHoursMonth: Math.round(paidHoursMonth * 100) / 100,
          paidHoursWeek: Math.round(paidHoursWeek * 100) / 100,
          
          // Medical hours breakdown
          medicalHours: medicalHoursYear,
          medicalHoursMonth: medicalHoursMonth,
          medicalHoursWeek: medicalHoursWeek,
          medicalWorkingDays: medicalWorkingDaysYear,
          
          expectedWeeklyHours: expectedWeeklyHours,
          expectedYearlyHours: expectedYearlyHours,
          expectedHoursToDate: Math.round(expectedHoursToDate * 10) / 10,
          progressPercent: Math.round(progressPercent * 10) / 10,
          
          // Working days info
          totalWorkingDays: workingDayProgress.totalWorkingDays,
          workingDaysPassed: workingDayProgress.passedWorkingDays,
          workingDaysRemaining: workingDayProgress.remainingWorkingDays,
          hoursPerWorkingDay: Math.round(hoursPerWorkingDay * 100) / 100,
          
          // Holiday info
          annualTotal: annualTotal,
          annualUsed: holidays.annualUsed,
          annualPending: holidays.annualPending,
          annualRemaining: annualTotal - holidays.annualUsed - holidays.annualPending,
          personalTotal: personalTotal,
          personalUsed: holidays.personalUsed,
          personalPending: holidays.personalPending,
          personalRemaining: personalTotal - holidays.personalUsed - holidays.personalPending,
          schoolTotal: schoolTotal,
          schoolUsed: holidays.schoolUsed,
          medicalUsed: holidays.medicalUsed,
          medicalPending: holidays.medicalPending,
          permisoUsed: holidays.permisoUsed,
          permisoPending: holidays.permisoPending,
          
          // MedAppt
          medApptTotal: cols.medApptHours >= 0 ? (parseFloat(row[cols.medApptHours]) || DEFAULTS.MEDICAL_APPT_HOURS) : DEFAULTS.MEDICAL_APPT_HOURS,
          medApptUsed: Math.round((holidays.medApptUsed || 0) * 100) / 100,
          medApptPending: Math.round((holidays.medApptPending || 0) * 100) / 100,
          medApptHours: medApptHoursYear,
          medApptHoursMonth: medApptHoursMonth,
          medApptHoursWeek: medApptHoursWeek,
          
          // Prep time
          prepTimeYearly: prepTimeYearly,
          prepTimeTotal: Math.round(prep.totalHours * 10) / 10,
          prepTimeWeeksLogged: prep.weeksLogged,
          prepTimeProgress: prepTimeYearly > 0 ? Math.round((prep.totalHours / prepTimeYearly) * 100) : 0
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    
    Logger.log('✅ Completed in ' + (Date.now() - startTime) + 'ms - ' + teachers.length + ' teachers');
    
    return {
      teachers: teachers,
      monthName: monthName,
      year: year,
      month: month,
      isCurrentMonth: isCurrentMonth,
      yearProgress: baseWorkingDays.passedWorkingDaysCount / baseWorkingDays.allWorkingDaysCount * 100,
      avgProgress: teachers.length > 0 ? totalProgress / teachers.length : 0,
      teachersOnTrack: teachersOnTrack,
      teachersBehind: teachersBehind,
      puenteDays: DEFAULTS.PUENTE_DAYS,
      weekStart: weekStart,
      weekEnd: weekEnd,
      weekNumber: weekNumber,
      weekDisplay: weekDisplay,
      weekOffset: weekOffset,
      
      baseWorkingDaysTotal: baseWorkingDays.allWorkingDaysCount,
      baseWorkingDaysPassed: baseWorkingDays.passedWorkingDaysCount,
      schoolHolidaysCount: schoolHolidayDates.size
    };
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return { teachers: [], monthName: '', error: error.message };
  }
}

// ========================================
// NEW: Get teachers data for a specific week
// ========================================

function getTeachersForWeek(weekOffset = 0) {
  const now = new Date();
  return getAllTeachersWithHoursAndHolidays(now.getFullYear(), now.getMonth() + 1, weekOffset);
}
// ========================================
// HOLIDAY SYSTEM
// ========================================

function setupPunchHolidaySheets() {
  const ss = SS();
  const headerStyle = { bg: '#092b50', color: '#ffffff' };
  
  const sheets = [
    { name: SHEETS.HOLIDAY_REQUESTS, headers: ['RequestID', 'TeacherName', 'TeacherEmail', 'StartDate', 'EndDate', 'TotalDays', 'Status', 'HolidayType', 'RequestDate', 'ApprovedBy', 'ApprovalDate', 'Reason', 'Notes'] },
    { name: SHEETS.SCHOOL_HOLIDAYS, headers: ['StartDate', 'EndDate', 'Name', 'Type', 'HolidayID'] }
  ];
  
  sheets.forEach(({ name, headers }) => {
    let sheet = ss.getSheetByName(name);
    if (sheet) return;
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground(headerStyle.bg).setFontColor(headerStyle.color).setFontWeight('bold');
    sheet.setFrozenRows(1);
  });
  
  // Add columns to teachers if needed
  const teachersSheet = ss.getSheetByName(SHEETS.TEACHERS);
  if (teachersSheet) {
    const headers = teachersSheet.getRange(1, 1, 1, teachersSheet.getLastColumn()).getValues()[0];
    const colsToAdd = ['AnnualDays', 'PersonalDays'].filter(c => !headers.includes(c));
    
    if (colsToAdd.length) {
      let nextCol = teachersSheet.getLastColumn() + 1;
      colsToAdd.forEach((col, i) => {
        teachersSheet.getRange(1, nextCol + i).setValue(col);
        const defaultVal = col === 'AnnualDays' ? DEFAULTS.ANNUAL_DAYS : DEFAULTS.PERSONAL_DAYS;
        for (let row = 2; row <= teachersSheet.getLastRow(); row++) {
          teachersSheet.getRange(row, nextCol + i).setValue(defaultVal);
        }
      });
    }
  }
  
  SpreadsheetApp.getUi().alert('✅ Holiday sheets setup complete!');
}

// Migration function - run once to add HolidayID column
function migrateSchoolHolidaysAddId() {
  const sheet = SS().getSheetByName(SHEETS.SCHOOL_HOLIDAYS);
  if (!sheet) return { success: false, message: 'Sheet not found' };
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  // Check if HolidayID column exists
  let idCol = headers.indexOf('HolidayID');
  
  if (idCol === -1) {
    // Add the column
    idCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, idCol).setValue('HolidayID')
      .setBackground('#092b50')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
  } else {
    idCol = idCol + 1; // Convert to 1-based
  }
  
  // Add IDs to existing rows
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    for (let i = 2; i <= lastRow; i++) {
      const currentId = sheet.getRange(i, idCol).getValue();
      if (!currentId) {
        sheet.getRange(i, idCol).setValue('SCHOOLHOL_' + Date.now() + '_' + i);
        Utilities.sleep(10); // Ensure unique timestamps
      }
    }
  }
  
  Logger.log('✅ Migration complete - HolidayID column added');
  return { success: true, message: 'Migration complete' };
}

function getPunchSchoolHolidays() {
  try {
    const data = getSheetData(SHEETS.SCHOOL_HOLIDAYS);
    if (!data) return {};
    
    const holidays = {};
    data.slice(1).forEach(row => {
      if (!row[0] || !row[1]) return;
      const current = new Date(row[0]), end = new Date(row[1]);
      while (current <= end) {
        holidays[formatDateStr(current)] = row[2];
        current.setDate(current.getDate() + 1);
      }
    });
    return holidays;
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return {};
  }
}

function submitPunchHolidayRequest(teacherEmail, teacherName, type, startDate, endDate, reason, hours, medApptStartTime, medApptEndTime) {
  try {
    const sheet = SS().getSheetByName(SHEETS.HOLIDAY_REQUESTS);
    if (!sheet) return { success: false, message: 'Holiday requests sheet not found. Please run setup first.' };
    
    // Validate that Permiso type requires a reason
    if (type === 'Permiso' && (!reason || reason.trim() === '')) {
      return { success: false, message: 'El Permiso Retribuido requiere especificar un motivo.' };
    }
    
    // ========================================
    // HANDLE MEDAPPT (HOUR-BASED)
    // ========================================
    if (type === 'MedAppt') {
      if (!medApptStartTime || !medApptEndTime) {
        return { success: false, message: 'Por favor indica el horario de la visita médica.' };
      }
      if (!startDate) {
        return { success: false, message: 'Por favor selecciona la fecha de la visita.' };
      }
      
      // Calculate hours from time range
      const startParts = String(medApptStartTime).split(':').map(Number);
      const endParts = String(medApptEndTime).split(':').map(Number);
      const diffMinutes = (endParts[0] * 60 + endParts[1]) - (startParts[0] * 60 + startParts[1]);
      
      if (diffMinutes <= 0) {
        return { success: false, message: 'La hora final debe ser posterior a la inicial.' };
      }
      
      const apptHours = Math.round((diffMinutes / 60) * 100) / 100;
      
      if (apptHours > 8) {
        return { success: false, message: 'Las horas de visita médica no pueden superar 8h por solicitud.' };
      }
      
      // Check limit
      const summary = getPunchTeacherHolidaySummary(teacherEmail);
      const remaining = summary.medApptTotal - summary.medApptUsed - summary.medApptPending;
      if (apptHours > remaining) {
        return { success: false, message: `No tienes suficientes horas de visita médica. Te quedan ${remaining}h de ${summary.medApptTotal}h.` };
      }
      
      const requestId = 'PHOLIDAY_' + Date.now();
      const timeRange = medApptStartTime + '-' + medApptEndTime;
      
      sheet.appendRow([
        requestId, teacherName, teacherEmail.toLowerCase().trim(),
        startDate, startDate, apptHours,
        'Pending', 'MedAppt', NOW(), '', '',
        reason || '', timeRange
      ]);
      
      invalidateCache(CACHE_KEYS.HOLIDAYS);
      
      return {
        success: true,
        message: `Solicitud de Visita Médica enviada (${apptHours}h: ${timeRange})`,
        requestId,
        totalDays: apptHours
      };
    }
    
    // ========================================
    // HANDLE DAY-BASED TYPES (existing logic)
    // ========================================
    const start = new Date(startDate), end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    
    if (end < start) return { success: false, message: 'End date must be on or after start date' };
    
    const totalDays = Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
    
    if (totalDays === 0) return { success: false, message: 'Por favor selecciona al menos un día' };
    
    // Check limits for Personal and Annual types
    if (type === 'Personal' || type === 'Annual') {
      const summary = getPunchTeacherHolidaySummary(teacherEmail);
      const remaining = type === 'Personal' 
        ? summary.personalTotal - summary.personalUsed - summary.personalPending
        : summary.annualTotal - summary.annualUsed - summary.annualPending;
      
      const typeName = type === 'Personal' ? 'D.R. Empleado' : 'vacaciones';
      if (totalDays > remaining) {
        return { success: false, message: `No tienes suficientes días de ${typeName}. Te quedan ${remaining} días.` };
      }
    }
    
    const requestId = 'PHOLIDAY_' + Date.now();
    sheet.appendRow([requestId, teacherName, teacherEmail.toLowerCase().trim(), startDate, endDate, totalDays, 'Pending', type, NOW(), '', '', reason || '', '']);
    
    invalidateCache(CACHE_KEYS.HOLIDAYS);
    
    const typeConfig = HOLIDAY_TYPES[type] || { shortName: type };
    let message = `Solicitud de ${typeConfig.shortName} enviada (${totalDays} día${totalDays !== 1 ? 's' : ''})`;
    
    return { success: true, message, requestId, totalDays };
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return { success: false, message: 'Error: ' + error.message };
  }
}

function calculateWorkingDays(startDate, endDate) {
  try {
    const start = new Date(startDate), end = new Date(endDate);
    if (end < start) return { totalDays: 0 };
    
    // Count ALL calendar days
    const totalDays = Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
    
    return { totalDays };
  } catch (error) {
    return { totalDays: 0 };
  }
}

function getPunchTeacherHolidaySummary(teacherEmail) {
  try {
    const teachersData = getSheetData(SHEETS.TEACHERS);
    const adminsData = getSheetData(SHEETS.ADMINS);
    const holidayData = getSheetData(SHEETS.HOLIDAY_REQUESTS);
    
    const normalizedEmail = teacherEmail.toLowerCase().trim();
    let annualTotal = DEFAULTS.ANNUAL_DAYS, personalTotal = DEFAULTS.PERSONAL_DAYS, schoolTotal = DEFAULTS.SCHOOL_DAYS;
    let medApptTotal = DEFAULTS.MEDICAL_APPT_HOURS;
    let foundUser = false;
    
    if (teachersData) {
      const headers = teachersData[0];
      const emailCol = findColumnIndex(headers, 'Email');
      const annualCol = findColumnIndex(headers, 'AnnualDays');
      const personalCol = findColumnIndex(headers, 'PersonalDays');
      const schoolCol = findColumnIndex(headers, 'SchoolDays');
      const medApptCol = findColumnIndex(headers, 'MedApptHours');
      
      const row = teachersData.slice(1).find(r => String(r[emailCol >= 0 ? emailCol : 2] || '').toLowerCase().trim() === normalizedEmail);
      if (row) {
        if (annualCol >= 0) annualTotal = parseInt(row[annualCol]) || DEFAULTS.ANNUAL_DAYS;
        if (personalCol >= 0) personalTotal = parseInt(row[personalCol]) || DEFAULTS.PERSONAL_DAYS;
        if (schoolCol >= 0) schoolTotal = parseInt(row[schoolCol]) || DEFAULTS.SCHOOL_DAYS;
        if (medApptCol >= 0) medApptTotal = parseFloat(row[medApptCol]) || DEFAULTS.MEDICAL_APPT_HOURS;
        foundUser = true;
      }
    }
    
    // Check admins too
    if (!foundUser && adminsData) {
      const headers = adminsData[0];
      const emailCol = findColumnIndex(headers, 'Email');
      const annualCol = findColumnIndex(headers, 'AnnualDays');
      const personalCol = findColumnIndex(headers, 'PersonalDays');
      const schoolCol = findColumnIndex(headers, 'SchoolDays');
      const medApptCol = findColumnIndex(headers, 'MedApptHours');
      
      const row = adminsData.slice(1).find(r => String(r[emailCol >= 0 ? emailCol : 0] || '').toLowerCase().trim() === normalizedEmail);
      if (row) {
        if (annualCol >= 0) annualTotal = parseInt(row[annualCol]) || ADMIN_DEFAULTS.ANNUAL_DAYS;
        if (personalCol >= 0) personalTotal = parseInt(row[personalCol]) || ADMIN_DEFAULTS.PERSONAL_DAYS;
        if (schoolCol >= 0) schoolTotal = parseInt(row[schoolCol]) || ADMIN_DEFAULTS.SCHOOL_DAYS;
        if (medApptCol >= 0) medApptTotal = parseFloat(row[medApptCol]) || ADMIN_DEFAULTS.MEDICAL_APPT_HOURS;
        foundUser = true;
      }
    }
    
    const counts = { 
      annualUsed: 0, annualPending: 0, 
      personalUsed: 0, personalPending: 0, 
      schoolUsed: 0, 
      medicalUsed: 0, medicalPending: 0,
      medApptUsed: 0, medApptPending: 0,
      permisoUsed: 0, permisoPending: 0
    };
    const requests = [];
    
    if (holidayData) {
      holidayData.slice(1).forEach(row => {
        if (String(row[2] || '').toLowerCase().trim() !== normalizedEmail) return;
        
        const days = parseFloat(row[5]) || 0; // float for MedAppt hours
        const status = String(row[6]);
        const type = String(row[7] || 'Annual');
        
        if (type === 'Annual') {
          status === 'Approved' ? counts.annualUsed += days : status === 'Pending' && (counts.annualPending += days);
        } else if (type === 'Personal') {
          status === 'Approved' ? counts.personalUsed += days : status === 'Pending' && (counts.personalPending += days);
        } else if (type === 'School' && status === 'Approved') {
          counts.schoolUsed += days;
        } else if (type === 'Medical') {
          status === 'Approved' ? counts.medicalUsed += days : status === 'Pending' && (counts.medicalPending += days);
        } else if (type === 'MedAppt') {
          status === 'Approved' ? counts.medApptUsed += days : status === 'Pending' && (counts.medApptPending += days);
        } else if (type === 'Permiso') {
          status === 'Approved' ? counts.permisoUsed += days : status === 'Pending' && (counts.permisoPending += days);
        }
        
               requests.push({
          requestId: String(row[0]),
          startDate: formatDateStr(row[3]),
          endDate: formatDateStr(row[4]),
          days, status, type,
          requestDate: formatDateStr(row[8]),
          reason: String(row[11] || ''),
          isHoursBased: type === 'MedAppt',
          timeRange: String(row[12] || '')
        });
      });
    }
    
    // Round MedAppt values
    counts.medApptUsed = Math.round(counts.medApptUsed * 100) / 100;
    counts.medApptPending = Math.round(counts.medApptPending * 100) / 100;
    
    return {
      annualTotal, annualUsed: counts.annualUsed, annualPending: counts.annualPending,
      annualRemaining: annualTotal - counts.annualUsed - counts.annualPending,
      personalTotal, personalUsed: counts.personalUsed, personalPending: counts.personalPending,
      personalRemaining: personalTotal - counts.personalUsed - counts.personalPending,
      schoolTotal, schoolUsed: counts.schoolUsed, schoolRemaining: schoolTotal - counts.schoolUsed,
      medicalUsed: counts.medicalUsed, medicalPending: counts.medicalPending,
      medApptTotal: medApptTotal,
      medApptUsed: counts.medApptUsed,
      medApptPending: counts.medApptPending,
      medApptRemaining: Math.round((medApptTotal - counts.medApptUsed - counts.medApptPending) * 100) / 100,
      permisoUsed: counts.permisoUsed, permisoPending: counts.permisoPending,
      puenteDays: DEFAULTS.PUENTE_DAYS,
      requests
    };
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return {
      annualTotal: DEFAULTS.ANNUAL_DAYS, annualUsed: 0, annualPending: 0, annualRemaining: DEFAULTS.ANNUAL_DAYS,
      personalTotal: DEFAULTS.PERSONAL_DAYS, personalUsed: 0, personalPending: 0, personalRemaining: DEFAULTS.PERSONAL_DAYS,
      schoolTotal: DEFAULTS.SCHOOL_DAYS, schoolUsed: 0, schoolRemaining: DEFAULTS.SCHOOL_DAYS,
      medicalUsed: 0, medicalPending: 0,
      medApptTotal: DEFAULTS.MEDICAL_APPT_HOURS, medApptUsed: 0, medApptPending: 0, medApptRemaining: DEFAULTS.MEDICAL_APPT_HOURS,
      permisoUsed: 0, permisoPending: 0,
      puenteDays: DEFAULTS.PUENTE_DAYS,
      requests: []
    };
  }
}

function getPendingPunchHolidayRequests() {
  try {
    const data = getSheetData(SHEETS.HOLIDAY_REQUESTS);
    if (!data) return [];
    
    return data.slice(1)
      .filter(row => row[6] === 'Pending')
      .map((row, i) => ({
        requestId: String(row[0]),
        teacherName: String(row[1]),
        teacherEmail: String(row[2]),
        startDate: formatDateStr(row[3]),
        endDate: formatDateStr(row[4]),
        days: parseInt(row[5]) || 0,
        holidayType: String(row[7] || 'Annual'),
        requestDate: formatDateStr(row[8]),
        reason: String(row[11] || ''),
        rowNumber: i + 2
      }));
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return [];
  }
}

function processPunchHolidayRequest(requestId, action, adminEmail) {
  try {
    const sheet = SS().getSheetByName(SHEETS.HOLIDAY_REQUESTS);
    if (!sheet) return { success: false, message: 'Holiday sheet not found' };
    
    // Use TextFinder for faster lookup
    const rowNum = findRowByColumnValue(SHEETS.HOLIDAY_REQUESTS, 0, requestId);
    
    if (rowNum && rowNum > 1) {
      const newStatus = action === 'approve' ? 'Approved' : 'Rejected';
      sheet.getRange(rowNum, 7).setValue(newStatus);
      sheet.getRange(rowNum, 10).setValue(adminEmail);
      sheet.getRange(rowNum, 11).setValue(NOW());
      
      // Invalidate cache
      invalidateCache(CACHE_KEYS.HOLIDAYS);
      
      return { success: true, message: `Request ${newStatus.toLowerCase()} successfully` };
    }
    
    return { success: false, message: 'Request not found' };
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return { success: false, message: error.message };
  }
}

function getAllPunchTeachersHolidayStatus() {
  try {
    const teachersData = getSheetData(SHEETS.TEACHERS);
    const holidayData = getSheetData(SHEETS.HOLIDAY_REQUESTS);
    if (!teachersData) return [];
    
    const headers = teachersData[0];
    const cols = {
      id: findColumnIndex(headers, 'TeacherID'),
      name: findColumnIndex(headers, 'Name'),
      email: findColumnIndex(headers, 'Email'),
      status: findColumnIndex(headers, 'Status'),
      annual: findColumnIndex(headers, 'AnnualDays'),
      personal: findColumnIndex(headers, 'PersonalDays'),
      school: findColumnIndex(headers, 'SchoolDays'),
      medApptHours: findColumnIndex(headers, 'MedApptHours')
    };
    
    const holidayByEmail = {};
    if (holidayData) {
      holidayData.slice(1).forEach(row => {
        const email = String(row[2] || '').toLowerCase().trim();
        const days = parseFloat(row[5]) || 0;
        const status = String(row[6]);
        const type = String(row[7] || 'Annual');
        
        if (!holidayByEmail[email]) {
          holidayByEmail[email] = { 
            annualUsed: 0, annualPending: 0, 
            personalUsed: 0, personalPending: 0, 
            schoolUsed: 0, 
            medicalUsed: 0, medicalPending: 0,
            medApptUsed: 0, medApptPending: 0,
            permisoUsed: 0, permisoPending: 0
          };
        }
        
        const h = holidayByEmail[email];
        if (type === 'Annual') status === 'Approved' ? h.annualUsed += days : status === 'Pending' && (h.annualPending += days);
        else if (type === 'Personal') status === 'Approved' ? h.personalUsed += days : status === 'Pending' && (h.personalPending += days);
        else if (type === 'School' && status === 'Approved') h.schoolUsed += days;
        else if (type === 'Medical') status === 'Approved' ? h.medicalUsed += days : status === 'Pending' && (h.medicalPending += days);
        else if (type === 'MedAppt') {
          status === 'Approved' ? h.medApptUsed += days : status === 'Pending' && (h.medApptPending += days);
        }
        else if (type === 'Permiso') status === 'Approved' ? h.permisoUsed += days : status === 'Pending' && (h.permisoPending += days);
      });
    }
    
    return teachersData.slice(1)
      .filter(row => row[cols.status >= 0 ? cols.status : 3] === 'Active')
      .map(row => {
        const email = String(row[cols.email >= 0 ? cols.email : 2] || '').toLowerCase().trim();
        const annualTotal = cols.annual >= 0 ? (parseInt(row[cols.annual]) || DEFAULTS.ANNUAL_DAYS) : DEFAULTS.ANNUAL_DAYS;
        const personalTotal = cols.personal >= 0 ? (parseInt(row[cols.personal]) || DEFAULTS.PERSONAL_DAYS) : DEFAULTS.PERSONAL_DAYS;
        const schoolTotal = cols.school >= 0 ? (parseInt(row[cols.school]) || DEFAULTS.SCHOOL_DAYS) : DEFAULTS.SCHOOL_DAYS;
        const medApptTotal = cols.medApptHours >= 0 ? (parseFloat(row[cols.medApptHours]) || DEFAULTS.MEDICAL_APPT_HOURS) : DEFAULTS.MEDICAL_APPT_HOURS;
        const usage = holidayByEmail[email] || { 
          annualUsed: 0, annualPending: 0, 
          personalUsed: 0, personalPending: 0, 
          schoolUsed: 0, 
          medicalUsed: 0, medicalPending: 0,
          medApptUsed: 0, medApptPending: 0,
          permisoUsed: 0, permisoPending: 0
        };
        
        return {
          name: String(row[cols.name >= 0 ? cols.name : 1]),
          email,
          annualTotal, annualUsed: usage.annualUsed, annualPending: usage.annualPending,
          annualRemaining: annualTotal - usage.annualUsed - usage.annualPending,
          personalTotal, personalUsed: usage.personalUsed, personalPending: usage.personalPending,
          personalRemaining: personalTotal - usage.personalUsed - usage.personalPending,
          schoolTotal, schoolUsed: usage.schoolUsed, schoolRemaining: schoolTotal - usage.schoolUsed,
          medicalUsed: usage.medicalUsed, medicalPending: usage.medicalPending,
          permisoUsed: usage.permisoUsed, permisoPending: usage.permisoPending,
          medApptTotal: medApptTotal,
          medApptUsed: Math.round((usage.medApptUsed || 0) * 100) / 100,
          medApptPending: Math.round((usage.medApptPending || 0) * 100) / 100,
          medApptRemaining: Math.round((medApptTotal - (usage.medApptUsed || 0) - (usage.medApptPending || 0)) * 100) / 100,
          puenteDays: DEFAULTS.PUENTE_DAYS
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return [];
  }
}

function assignPunchSchoolDay(teacherName, teacherEmail, date, adminEmail) {
  try {
    const sheet = SS().getSheetByName(SHEETS.HOLIDAY_REQUESTS);
    if (!sheet) return { success: false, message: 'Holiday sheet not found' };
    
    const normalizedEmail = teacherEmail.toLowerCase().trim();
    const data = sheet.getDataRange().getValues();
    
    // Check existing
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][2] || '').toLowerCase().trim() === normalizedEmail && data[i][7] === 'School' && data[i][6] === 'Approved') {
        if (formatDateStr(data[i][3]) === date) {
          return { success: false, message: 'El profesor ya tiene un D.R. Empresa asignado en ' + date };
        }
      }
    }
    
    const summary = getPunchTeacherHolidaySummary(teacherEmail);
    if (summary.schoolUsed >= summary.schoolTotal) {
      return { success: false, message: 'El profesor ya ha usado todos sus días de D.R. Empresa' };
    }
    
    const requestId = 'PSCHOOL_' + Date.now();
    const now = NOW();
    sheet.appendRow([requestId, teacherName, normalizedEmail, date, date, 1, 'Approved', 'School', now, adminEmail, now, 'D.R. Empresa asignado por admin', '']);
    
    // Invalidate cache
    invalidateCache(CACHE_KEYS.HOLIDAYS);
    
    return { success: true, message: `D.R. Empresa asignado a ${teacherName} el ${date}` };
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return { success: false, message: error.message };
  }
}

function getPunchTeacherHolidaysForCalendar(teacherEmail) {
  try {
    const holidayData = getSheetData(SHEETS.HOLIDAY_REQUESTS);
    const normalizedEmail = teacherEmail.toLowerCase().trim();
    const teacherHolidays = {};
    
    if (holidayData) {
      holidayData.slice(1).forEach(row => {
        if (String(row[2] || '').toLowerCase().trim() !== normalizedEmail || row[6] !== 'Approved') return;
        
        const type = row[7] || 'Annual';
        const current = new Date(row[3]), end = new Date(row[4]);
        while (current <= end) {
          teacherHolidays[formatDateStr(current)] = type;
          current.setDate(current.getDate() + 1);
        }
      });
    }
    
    return { teacher: teacherHolidays, school: getPunchSchoolHolidays() };
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return { teacher: {}, school: {} };
  }
}

// ========================================
// EXPORT TO GOOGLE SHEET - SIMPLIFIED VERSION
// ========================================

function exportPunchMonthlyReportCSV(year, month) {
  try {
    const startTime = Date.now();
    
    // Date ranges
    const monthStart = Utilities.formatDate(new Date(year, month - 1, 1), TZ(), 'yyyy-MM-dd');
    const monthEnd = Utilities.formatDate(new Date(year, month, 0), TZ(), 'yyyy-MM-dd');
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const monthName = new Date(year, month - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    const exportDate = Utilities.formatDate(NOW(), TZ(), 'dd/MM/yyyy HH:mm');
    
    // ========================================
    // GATHER ALL DATA
    // ========================================
    
    const teachersData = getSheetData(SHEETS.TEACHERS) || [];
    const adminsData = getSheetData(SHEETS.ADMINS) || [];
    const punchesData = getSheetData(SHEETS.TIME_PUNCHES) || [];
    const holidayData = getSheetData(SHEETS.HOLIDAY_REQUESTS) || [];
    
    // Get school holidays for working days calculation
    const schoolHolidayDates = buildSchoolHolidayDateSet(year);
    const asOfDate = new Date(year, month, 0);
    const baseWorkingDays = precomputeWorkingDays(year, asOfDate, schoolHolidayDates);
    
    // Build medical dates
    const medicalDatesByEmail = buildMedicalDates(holidayData, year);
    
    // ========================================
    // PROCESS PUNCHES
    // ========================================
    
    const punchesByEmail = {};
    const prepByEmail = {};
    
    if (punchesData.length > 1) {
      punchesData.slice(1).forEach(row => {
        const email = String(row[2] || '').toLowerCase().trim();
        if (!email) return;
        
        const punchType = String(row[5] || '').toUpperCase().trim();
        const rowDate = formatDateStr(row[3]);
        
        if (punchType === 'PREP') {
          if (rowDate >= yearStart && rowDate <= yearEnd) {
            if (!prepByEmail[email]) prepByEmail[email] = { totalHours: 0, weeksLogged: 0 };
            const notesField = String(row[8] || '');
            let hours = 1.5;
            if (notesField.includes('Hours:')) {
              const hoursMatch = notesField.match(/Hours:\s*([\d.]+)/);
              if (hoursMatch) hours = parseFloat(hoursMatch[1]) || 1.5;
            }
            prepByEmail[email].totalHours += hours;
            prepByEmail[email].weeksLogged++;
          }
        } else if (punchType === 'IN' || punchType === 'OUT') {
          if (!punchesByEmail[email]) punchesByEmail[email] = [];
          punchesByEmail[email].push({
            date: rowDate,
            time: formatTimeValue(row[4]),
            punchType: punchType
          });
        }
      });
    }
    
    // ========================================
    // PROCESS HOLIDAYS - Count actual days in month
    // ========================================
    
    const holidayDaysInMonth = {};
    const holidayDatesByEmail = {};
    
    if (holidayData.length > 1) {
      holidayData.slice(1).forEach(row => {
        const email = String(row[2] || '').toLowerCase().trim();
        if (!email) return;
        
        const status = String(row[6]);
        const type = String(row[7] || 'Annual');
        
        if (status !== 'Approved') return;
        
        const startDate = new Date(row[3]);
        const endDate = new Date(row[4]);
        
        if (!holidayDaysInMonth[email]) {
          holidayDaysInMonth[email] = { annual: 0, personal: 0, medical: 0, school: 0, permiso: 0, total: 0 };
        }
        if (!holidayDatesByEmail[email]) {
          holidayDatesByEmail[email] = new Set();
        }
        
        const current = new Date(startDate);
        current.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(0, 0, 0, 0);
        
        while (current <= end) {
          const dateStr = formatDateStr(current);
          
          // For year totals — only NON-medical for progress denominator
          if (dateStr >= yearStart && dateStr <= yearEnd && type !== 'Medical') {
            holidayDatesByEmail[email].add(dateStr);
          }
          
          // Count ACTUAL days that fall within the exported month
          if (dateStr >= monthStart && dateStr <= monthEnd) {
            const m = holidayDaysInMonth[email];
            if (type === 'Annual') { m.annual++; m.total++; }
            else if (type === 'Personal') { m.personal++; m.total++; }
            else if (type === 'School') { m.school++; m.total++; }
            else if (type === 'Medical') { m.medical++; m.total++; }
            else if (type === 'Permiso') { m.permiso++; m.total++; }
          }
          
          current.setDate(current.getDate() + 1);
        }
      });
    }
    
    // ========================================
    // BUILD EMPLOYEE LIST
    // ========================================
    
    const employees = [];
    
    // Add Teachers
    if (teachersData.length > 1) {
      const headers = teachersData[0];
      const cols = {
        name: findColumnIndex(headers, 'Name'),
        email: findColumnIndex(headers, 'Email'),
        status: findColumnIndex(headers, 'Status'),
        annual: findColumnIndex(headers, 'AnnualDays'),
        personal: findColumnIndex(headers, 'PersonalDays'),
        school: findColumnIndex(headers, 'SchoolDays'),
        expected: findColumnIndex(headers, 'ExpectedYearlyHours'),
        prepTimeYearly: findColumnIndex(headers, 'PrepTimeYearly')
      };
      
      teachersData.slice(1).forEach(row => {
        if (row[cols.status >= 0 ? cols.status : 3] !== 'Active') return;
        
        employees.push({
          type: 'Profesor',
          name: String(row[cols.name >= 0 ? cols.name : 1]),
          email: String(row[cols.email >= 0 ? cols.email : 2] || '').toLowerCase().trim(),
          expectedYearlyHours: cols.expected >= 0 ? (parseInt(row[cols.expected]) || DEFAULTS.EXPECTED_YEARLY_HOURS) : DEFAULTS.EXPECTED_YEARLY_HOURS,
          annualTotal: cols.annual >= 0 ? (parseInt(row[cols.annual]) || DEFAULTS.ANNUAL_DAYS) : DEFAULTS.ANNUAL_DAYS,
          personalTotal: cols.personal >= 0 ? (parseInt(row[cols.personal]) || DEFAULTS.PERSONAL_DAYS) : DEFAULTS.PERSONAL_DAYS,
          schoolTotal: cols.school >= 0 ? (parseInt(row[cols.school]) || DEFAULTS.SCHOOL_DAYS) : DEFAULTS.SCHOOL_DAYS,
          prepTimeYearly: cols.prepTimeYearly >= 0 ? (parseFloat(row[cols.prepTimeYearly]) || DEFAULTS.PREP_TIME_YEARLY) : DEFAULTS.PREP_TIME_YEARLY
        });
      });
    }
    
    // Add Admins
    if (adminsData.length > 1) {
      const headers = adminsData[0];
      const cols = {
        email: findColumnIndex(headers, 'Email'),
        name: findColumnIndex(headers, 'Name'),
        status: findColumnIndex(headers, 'Status'),
        annual: findColumnIndex(headers, 'AnnualDays'),
        personal: findColumnIndex(headers, 'PersonalDays'),
        school: findColumnIndex(headers, 'SchoolDays'),
        expected: findColumnIndex(headers, 'ExpectedYearlyHours')
      };
      
      adminsData.slice(1).forEach(row => {
        if (row[cols.status >= 0 ? cols.status : 2] !== 'Active') return;
        
        employees.push({
          type: 'Admin',
          name: String(row[cols.name >= 0 ? cols.name : 1]),
          email: String(row[cols.email >= 0 ? cols.email : 0] || '').toLowerCase().trim(),
          expectedYearlyHours: cols.expected >= 0 ? (parseInt(row[cols.expected]) || ADMIN_DEFAULTS.EXPECTED_YEARLY_HOURS) : ADMIN_DEFAULTS.EXPECTED_YEARLY_HOURS,
          annualTotal: cols.annual >= 0 ? (parseInt(row[cols.annual]) || ADMIN_DEFAULTS.ANNUAL_DAYS) : ADMIN_DEFAULTS.ANNUAL_DAYS,
          personalTotal: cols.personal >= 0 ? (parseInt(row[cols.personal]) || ADMIN_DEFAULTS.PERSONAL_DAYS) : ADMIN_DEFAULTS.PERSONAL_DAYS,
          schoolTotal: cols.school >= 0 ? (parseInt(row[cols.school]) || ADMIN_DEFAULTS.SCHOOL_DAYS) : ADMIN_DEFAULTS.SCHOOL_DAYS,
          prepTimeYearly: 0
        });
      });
    }
    
    // Sort
    employees.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'Profesor' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    
    if (employees.length === 0) {
      return { success: false, message: 'No hay empleados activos para exportar' };
    }
    
    // ========================================
    // CREATE GOOGLE SHEET
    // ========================================
    
    const fileName = `Informe Horas - ${monthName}`;
    const newSpreadsheet = SpreadsheetApp.create(fileName);
    const sheet = newSpreadsheet.getActiveSheet();
    sheet.setName('Informe Mensual');
    
    const COLORS = {
      headerBg: '#092b50',
      headerText: '#ffffff',
      subHeaderBg: '#59d2ff',
      subHeaderText: '#092b50',
      profesorBg: '#f0fdf4',
      adminBg: '#eff6ff',
      successText: '#059669',
      warningText: '#d97706',
      dangerText: '#dc2626',
      borderColor: '#e2e8f0',
      holidayBg: '#fef3c7',
      medicalBg: '#fee2e2'
    };
    
    let row = 1;
    
    // TITLE
    sheet.getRange(row, 1, 1, 9).merge()
      .setValue('📊 INFORME MENSUAL - ' + monthName.toUpperCase())
      .setBackground(COLORS.headerBg)
      .setFontColor(COLORS.headerText)
      .setFontSize(16)
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
    sheet.setRowHeight(row, 50);
    row++;
    
    sheet.getRange(row, 1).setValue('Exportado:').setFontWeight('bold');
    sheet.getRange(row, 2).setValue(exportDate);
    sheet.getRange(row, 4).setValue('Total Empleados:').setFontWeight('bold');
    sheet.getRange(row, 5).setValue(employees.length);
    row += 2;
    
    // ========================================
    // MAIN TABLE HEADERS
    // ========================================
    
    const dataStartRow = row;
    const tableHeaders = [
      'Tipo', 
      'Nombre', 
      'Email',
      'Horas Fichadas',
      'H. Médicas',
      'Total Mes', 
      'Total Año', 
      'Progreso %',
      // Holiday days IN THIS MONTH
      'Vac.',
      'D.R.Emp',
      'Médico',
      'D.R.Empr',
      'Permiso',
      'Total Off',
      'H.No Lect.'
    ];
    
    sheet.getRange(row, 1, 1, tableHeaders.length).setValues([tableHeaders])
      .setBackground(COLORS.headerBg)
      .setFontColor(COLORS.headerText)
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setWrap(true);
    sheet.setRowHeight(row, 40);
    row++;
    
    // ========================================
    // DATA ROWS
    // ========================================
    
    const totals = {
      monthlyPunched: 0,
      monthlyMedical: 0,
      monthlyTotal: 0,
      yearlyHours: 0,
      teachers: 0,
      admins: 0,
      daysOff: { annual: 0, personal: 0, medical: 0, school: 0, permiso: 0, total: 0 }
    };
    
    employees.forEach(emp => {
      const email = emp.email;
      const punches = punchesByEmail[email] || [];
      
      // Calculate punched hours
      const monthlyPunched = calculateHoursFromPunches(punches, monthStart, monthEnd);
      const yearlyPunched = calculateHoursFromPunches(punches, yearStart, monthEnd);
      
      // Progress calculation
      const annualWorkingDays = Math.max(0, emp.annualTotal - 3);
      const allocatedDays = annualWorkingDays + emp.personalTotal + emp.schoolTotal;
      const empHolidayDates = holidayDatesByEmail[email] || new Set();
      const workingDayProgress = getTeacherWorkingDayProgress(baseWorkingDays, empHolidayDates, allocatedDays);
      
      const hoursPerWorkingDay = workingDayProgress.totalWorkingDays > 0 
        ? emp.expectedYearlyHours / workingDayProgress.totalWorkingDays 
        : 0;
      
      // Medical hours
      const empMedicalDates = medicalDatesByEmail[email] || new Set();
      const medicalDaysMonth = countMedicalWorkingDaysInRange(empMedicalDates, baseWorkingDays, monthStart, monthEnd);
      const medicalDaysYear = countMedicalWorkingDaysInRange(empMedicalDates, baseWorkingDays, yearStart, monthEnd);
      const medicalHoursMonth = Math.round(medicalDaysMonth * hoursPerWorkingDay * 100) / 100;
      const medicalHoursYear = Math.round(medicalDaysYear * hoursPerWorkingDay * 100) / 100;
      
      // Total = punched + medical
      const monthlyTotal = monthlyPunched + medicalHoursMonth;
      const yearlyTotal = yearlyPunched + medicalHoursYear;
      
      const expectedHoursToDate = emp.expectedYearlyHours * workingDayProgress.progressRatio;
      const progressPercent = expectedHoursToDate > 0 ? (yearlyTotal / expectedHoursToDate) * 100 : 0;
      
      // Holiday days in this month
      const monthDays = holidayDaysInMonth[email] || { annual: 0, personal: 0, medical: 0, school: 0, permiso: 0, total: 0 };
      
      // Prep time
      const prep = prepByEmail[email] || { totalHours: 0 };
      
      // Accumulate totals
      totals.monthlyPunched += monthlyPunched;
      totals.monthlyMedical += medicalHoursMonth;
      totals.monthlyTotal += monthlyTotal;
      totals.yearlyHours += yearlyTotal;
      totals.daysOff.annual += monthDays.annual;
      totals.daysOff.personal += monthDays.personal;
      totals.daysOff.medical += monthDays.medical;
      totals.daysOff.school += monthDays.school;
      totals.daysOff.permiso += monthDays.permiso;
      totals.daysOff.total += monthDays.total;
      if (emp.type === 'Profesor') totals.teachers++;
      else totals.admins++;
      
      // Build row data
      const rowData = [
        emp.type,
        emp.name,
        email,
        Math.round(monthlyPunched * 100) / 100,
        medicalHoursMonth > 0 ? Math.round(medicalHoursMonth * 100) / 100 : '',
        Math.round(monthlyTotal * 100) / 100,
        Math.round(yearlyTotal * 100) / 100,
        Math.round(progressPercent * 10) / 10,
        monthDays.annual || '',
        monthDays.personal || '',
        monthDays.medical || '',
        monthDays.school || '',
        monthDays.permiso || '',
        monthDays.total || '',
        emp.prepTimeYearly > 0 ? Math.round(prep.totalHours * 10) / 10 : '-'
      ];
      
      const rowRange = sheet.getRange(row, 1, 1, rowData.length);
      rowRange.setValues([rowData]);
      
      // Row styling
      const bgColor = emp.type === 'Profesor' ? COLORS.profesorBg : COLORS.adminBg;
      rowRange.setBackground(bgColor);
      
      // Progress cell color
      const progressCell = sheet.getRange(row, 8);
      if (progressPercent >= 98) {
        progressCell.setFontColor(COLORS.successText);
      } else if (progressPercent >= 80) {
        progressCell.setFontColor(COLORS.warningText);
      } else {
        progressCell.setFontColor(COLORS.dangerText);
      }
      progressCell.setFontWeight('bold');
      
      // Highlight medical hours
      if (medicalHoursMonth > 0) {
        sheet.getRange(row, 5).setBackground(COLORS.medicalBg).setFontWeight('bold');
      }
      
      // Highlight if employee had days off this month
      if (monthDays.total > 0) {
        sheet.getRange(row, 9, 1, 6).setBackground(COLORS.holidayBg);
      }
      
      row++;
    });
    
    // ========================================
    // TOTALS ROW
    // ========================================
    
    const totalsRow = [
      'TOTAL', 
      `${totals.teachers} Prof + ${totals.admins} Admin`, 
      '',
      Math.round(totals.monthlyPunched * 100) / 100,
      totals.monthlyMedical > 0 ? Math.round(totals.monthlyMedical * 100) / 100 : '',
      Math.round(totals.monthlyTotal * 100) / 100,
      Math.round(totals.yearlyHours * 100) / 100,
      '',
      totals.daysOff.annual || '',
      totals.daysOff.personal || '',
      totals.daysOff.medical || '',
      totals.daysOff.school || '',
      totals.daysOff.permiso || '',
      totals.daysOff.total || '',
      ''
    ];
    
    sheet.getRange(row, 1, 1, totalsRow.length).setValues([totalsRow])
      .setBackground(COLORS.subHeaderBg)
      .setFontColor(COLORS.subHeaderText)
      .setFontWeight('bold');
    sheet.setRowHeight(row, 35);
    
    // ========================================
    // FORMATTING
    // ========================================
    
    const colWidths = [70, 150, 220, 85, 75, 80, 80, 70, 50, 60, 60, 65, 60, 65, 75];
    colWidths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
    
    // Number formats
    sheet.getRange(dataStartRow + 1, 4, employees.length, 4).setNumberFormat('0.00');
    sheet.getRange(dataStartRow + 1, 8, employees.length, 1).setNumberFormat('0.0');
    
    // Center align
    sheet.getRange(dataStartRow, 4, employees.length + 2, 12).setHorizontalAlignment('center');
    
    // Borders
    sheet.getRange(dataStartRow, 1, employees.length + 2, tableHeaders.length)
      .setBorder(true, true, true, true, true, true, COLORS.borderColor, SpreadsheetApp.BorderStyle.SOLID);
    
    sheet.setFrozenRows(dataStartRow);
    sheet.autoResizeColumn(2);
    sheet.autoResizeColumn(3);
    
    // ========================================
    // LEGEND
    // ========================================
    
    row += 2;
    sheet.getRange(row, 1, 1, 4).merge()
      .setValue('📋 LEYENDA')
      .setFontWeight('bold')
      .setFontSize(11);
    row++;
    
    const legendItems = [
      ['Horas Fichadas', 'Horas registradas con IN/OUT'],
      ['H. Médicas', 'Horas equivalentes por baja médica (calculadas automáticamente)'],
      ['Total Mes', 'Fichadas + Médicas'],
      ['Total Año', 'Acumulado del año (fichadas + médicas)'],
      ['Vac.', 'Vacaciones'],
      ['D.R.Emp', 'Descanso Retribuido Empleado'],
      ['Médico', 'Baja médica'],
      ['D.R.Empr', 'Descanso Retribuido Empresa'],
      ['Permiso', 'Permiso retribuido'],
      ['Total Off', 'Total días de ausencia en el mes'],
      ['H.No Lect.', 'Horas no lectivas (año)']
    ];
    
    legendItems.forEach(item => {
      sheet.getRange(row, 1).setValue(item[0]).setFontWeight('bold');
      sheet.getRange(row, 2, 1, 3).merge().setValue(item[1]);
      row++;
    });
    
    // ========================================
    // DONE
    // ========================================
    
    const sheetUrl = newSpreadsheet.getUrl();
    
    Logger.log(`✅ Export complete: ${employees.length} employees in ${Date.now() - startTime}ms`);
    
    return { 
      success: true, 
      url: sheetUrl,
      filename: fileName,
      message: `Informe creado: ${totals.teachers} profesores + ${totals.admins} admins`
    };
    
  } catch (error) {
    Logger.log('❌ Export error: ' + error.message + '\n' + error.stack);
    return { success: false, message: 'Error al exportar: ' + error.message };
  }
}

// ========================================
// SCHOOL HOLIDAYS MANAGEMENT
// ========================================

function getAllSchoolHolidays() {
  try {
    const data = getSheetData(SHEETS.SCHOOL_HOLIDAYS);
    if (!data) return [];
    
    const headers = data[0];
    const idCol = findColumnIndex(headers, 'HolidayID');
    
    return data.slice(1)
      .filter(row => row[0])
      .map((row, i) => {
        const startDateStr = formatDateStr(row[0]);
        const endDateStr = formatDateStr(row[1]);
        const days = Math.floor((new Date(endDateStr) - new Date(startDateStr)) / (24 * 60 * 60 * 1000)) + 1;
        
        return {
          holidayId: idCol >= 0 ? String(row[idCol] || '') : '',
          startDate: startDateStr,
          endDate: endDateStr,
          name: String(row[2] || ''),
          type: String(row[3] || 'Holiday'),
          days
        };
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return [];
  }
}

function addPunchSchoolHoliday(startDate, endDate, name, type) {
  try {
    let sheet = SS().getSheetByName(SHEETS.SCHOOL_HOLIDAYS);
    if (!sheet) {
      sheet = SS().insertSheet(SHEETS.SCHOOL_HOLIDAYS);
      sheet.appendRow(['StartDate', 'EndDate', 'Name', 'Type', 'HolidayID']);
      sheet.getRange(1, 1, 1, 5).setBackground('#092b50').setFontColor('#ffffff').setFontWeight('bold');
    }
    
    const holidayId = 'SCHOOLHOL_' + Date.now();
    sheet.appendRow([startDate, endDate, name, type || 'Holiday', holidayId]);
    
    // Invalidate cache
    invalidateCache(CACHE_KEYS.SCHOOL_HOLIDAYS);
    
    return { success: true, message: 'Festivo/Puente añadido correctamente', holidayId };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function updateSchoolHoliday(holidayId, startDate, endDate, name, type) {
  try {
    if (!name || !startDate || !endDate) return { success: false, message: 'Please fill in all required fields' };
    if (endDate < startDate) return { success: false, message: 'End date must be after start date' };
    
    const sheet = SS().getSheetByName(SHEETS.SCHOOL_HOLIDAYS);
    if (!sheet) return { success: false, message: 'School holidays sheet not found' };
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idCol = findColumnIndex(headers, 'HolidayID');
    
    if (idCol === -1) return { success: false, message: 'HolidayID column not found. Please run migrateSchoolHolidaysAddId() first.' };
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(holidayId)) {
        sheet.getRange(i + 1, 1, 1, 4).setValues([[startDate, endDate, name, type || 'Holiday']]);
        
        // Invalidate cache
        invalidateCache(CACHE_KEYS.SCHOOL_HOLIDAYS);
        
        return { success: true, message: 'Festivo/Puente actualizado correctamente' };
      }
    }
    return { success: false, message: 'School holiday not found' };
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return { success: false, message: error.message };
  }
}

function deleteSchoolHoliday(holidayId) {
  try {
    const sheet = SS().getSheetByName(SHEETS.SCHOOL_HOLIDAYS);
    if (!sheet) return { success: false, message: 'School holidays sheet not found' };
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idCol = findColumnIndex(headers, 'HolidayID');
    
    if (idCol === -1) return { success: false, message: 'HolidayID column not found. Please run migrateSchoolHolidaysAddId() first.' };
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(holidayId)) {
        sheet.deleteRow(i + 1);
        
        // Invalidate cache
        invalidateCache(CACHE_KEYS.SCHOOL_HOLIDAYS);
        
        return { success: true, message: 'Festivo/Puente eliminado correctamente' };
      }
    }
    return { success: false, message: 'School holiday not found' };
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return { success: false, message: error.message };
  }
}

// ========================================
// ASSIGNED SCHOOL DAYS MANAGEMENT (D.R. Empresa)
// ========================================

function getAllAssignedSchoolDays() {
  try {
    const data = getSheetData(SHEETS.HOLIDAY_REQUESTS);
    if (!data) return [];
    
    return data.slice(1)
      .filter(row => String(row[7] || '') === 'School')
      .map((row, i) => ({
        requestId: String(row[0]),
        teacherName: String(row[1]),
        teacherEmail: String(row[2]),
        date: formatDateStr(row[3]),
        status: String(row[6]),
        assignedBy: String(row[9] || ''),
        assignedDate: formatDateStr(row[8]),
        rowNumber: i + 2
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return [];
  }
}

function updateAssignedSchoolDay(requestId, newDate) {
  try {
    const sheet = SS().getSheetByName(SHEETS.HOLIDAY_REQUESTS);
    if (!sheet) return { success: false, message: 'Holiday requests sheet not found' };
    
    // Use TextFinder for faster lookup
    const rowNum = findRowByColumnValue(SHEETS.HOLIDAY_REQUESTS, 0, requestId);
    
    if (rowNum && rowNum > 1) {
      sheet.getRange(rowNum, 4).setValue(newDate);
      sheet.getRange(rowNum, 5).setValue(newDate);
      
      // Invalidate cache
      invalidateCache(CACHE_KEYS.HOLIDAYS);
      
      return { success: true, message: 'D.R. Empresa actualizado correctamente' };
    }
    
    return { success: false, message: 'D.R. Empresa not found' };
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return { success: false, message: error.message };
  }
}

function deleteAssignedSchoolDay(requestId) {
  try {
    const sheet = SS().getSheetByName(SHEETS.HOLIDAY_REQUESTS);
    if (!sheet) return { success: false, message: 'Holiday requests sheet not found' };
    
    // Use TextFinder for faster lookup
    const rowNum = findRowByColumnValue(SHEETS.HOLIDAY_REQUESTS, 0, requestId);
    
    if (rowNum && rowNum > 1) {
      sheet.deleteRow(rowNum);
      
      // Invalidate cache
      invalidateCache(CACHE_KEYS.HOLIDAYS);
      
      return { success: true, message: 'D.R. Empresa eliminado correctamente' };
    }
    
    return { success: false, message: 'D.R. Empresa not found' };
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return { success: false, message: error.message };
  }
}

// ========================================
// APPROVED HOLIDAY MANAGEMENT
// ========================================

function getApprovedHolidayRequests() {
  try {
    const data = getSheetData(SHEETS.HOLIDAY_REQUESTS);
    if (!data) return [];
    
    return data.slice(1)
      .filter(row => String(row[6]) === 'Approved' && String(row[7] || 'Annual') !== 'School')
      .map((row, i) => ({
        requestId: String(row[0]),
        teacherName: String(row[1]),
        teacherEmail: String(row[2]),
        startDate: formatDateStr(row[3]),
        endDate: formatDateStr(row[4]),
        days: parseInt(row[5]) || 0,
        holidayType: String(row[7] || 'Annual'),
        requestDate: formatDateStr(row[8]),
        approvedBy: String(row[9] || ''),
        approvalDate: formatDateStr(row[10]),
        reason: String(row[11] || ''),
        rowNumber: i + 2
      }))
      .sort((a, b) => b.approvalDate.localeCompare(a.approvalDate));
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return [];
  }
}

function deleteApprovedHolidayRequest(requestId, adminEmail) {
  try {
    const sheet = SS().getSheetByName(SHEETS.HOLIDAY_REQUESTS);
    if (!sheet) return { success: false, message: 'Holiday requests sheet not found' };
    
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === requestId) {
        if (data[i][6] !== 'Approved') return { success: false, message: 'Can only delete approved requests. This request is: ' + data[i][6] };
        
        const teacherName = data[i][1], holidayType = data[i][7], days = data[i][5];
        const typeName = getHolidayTypeName(holidayType, true);
        sheet.deleteRow(i + 1);
        
        // Invalidate cache
        invalidateCache(CACHE_KEYS.HOLIDAYS);
        
        return {
          success: true,
          message: `${teacherName}: ${typeName} (${days} días) ha sido eliminado`,
          deletedRequest: { teacherName, holidayType, days }
        };
      }
    }
    return { success: false, message: 'Request not found' };
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return { success: false, message: error.message };
  }
}

function getApprovedRequestsCount() {
  try {
    const data = getSheetData(SHEETS.HOLIDAY_REQUESTS);
    if (!data) return { annual: 0, personal: 0, medical: 0, permiso: 0, total: 0 };
    
    let annual = 0, personal = 0, medical = 0, permiso = 0;
    data.slice(1).forEach(row => {
      if (String(row[6]) !== 'Approved') return;
      const type = String(row[7] || 'Annual');
      if (type === 'Annual') annual++;
      else if (type === 'Personal') personal++;
      else if (type === 'Medical') medical++;
      else if (type === 'Permiso') permiso++;
    });
    
    return { annual, personal, medical, permiso, total: annual + personal + medical + permiso };
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return { annual: 0, personal: 0, medical: 0, permiso: 0, total: 0 };
  }
}

// ========================================
// TEACHER MANAGEMENT
// ========================================
function addNewTeacher(teacherData) {
  try {
    if (!teacherData.name?.trim()) return { success: false, message: 'Teacher name is required' };
    
    const sheet = SS().getSheetByName(SHEETS.TEACHERS);
    if (!sheet) return { success: false, message: 'Teachers sheet not found. Please run setup first.' };
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    // Check duplicate email
    if (teacherData.email?.trim()) {
      const emailCol = headers.indexOf('Email');
      const normalizedEmail = teacherData.email.toLowerCase().trim();
      if (data.slice(1).some(row => String(row[emailCol >= 0 ? emailCol : 2] || '').toLowerCase().trim() === normalizedEmail)) {
        return { success: false, message: 'A teacher with this email already exists' };
      }
    }
    
    // Generate ID
    let maxId = 0;
    data.slice(1).forEach(row => {
      const match = String(row[0] || '').match(/T(\d+)/);
      if (match) maxId = Math.max(maxId, parseInt(match[1]));
    });
    const newId = 'T' + String(maxId + 1).padStart(3, '0');
    
    // Ensure required columns exist
      const requiredCols = ['TeacherID', 'Name', 'Email', 'Status', 'AnnualDays', 'PersonalDays', 'SchoolDays', 'ExpectedYearlyHours', 'PrepTimeYearly', 'MedApptHours'];
    let lastCol = sheet.getLastColumn();
    
    requiredCols.forEach(colName => {
      if (headers.indexOf(colName) === -1) {
        lastCol++;
        sheet.getRange(1, lastCol).setValue(colName).setBackground('#092b50').setFontColor('#ffffff').setFontWeight('bold');
        headers.push(colName);
        
        // Set default values for existing rows
        const defaultVal = colName === 'MedApptHours' ? DEFAULTS.MEDICAL_APPT_HOURS :
                          colName === 'PrepTimeYearly' ? DEFAULTS.PREP_TIME_YEARLY : 
                          colName === 'AnnualDays' ? DEFAULTS.ANNUAL_DAYS :
                          colName === 'PersonalDays' ? DEFAULTS.PERSONAL_DAYS :
                          colName === 'SchoolDays' ? DEFAULTS.SCHOOL_DAYS :
                          colName === 'ExpectedYearlyHours' ? DEFAULTS.EXPECTED_YEARLY_HOURS : '';
        
        if (defaultVal !== '' && sheet.getLastRow() > 1) {
          for (let row = 2; row <= sheet.getLastRow(); row++) {
            sheet.getRange(row, lastCol).setValue(defaultVal);
          }
        }
      }
    });
    
    // Re-read headers after potentially adding columns
    const finalHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    const newRow = finalHeaders.map(header => {
      switch(header) {
        case 'TeacherID': return newId;
        case 'Name': return teacherData.name.trim().toUpperCase();
        case 'Email': return (teacherData.email || '').toLowerCase().trim();
        case 'Status': return teacherData.status || 'Active';
        case 'AnnualDays': return parseInt(teacherData.annualDays) || DEFAULTS.ANNUAL_DAYS;
        case 'PersonalDays': return parseInt(teacherData.personalDays) || DEFAULTS.PERSONAL_DAYS;
        case 'SchoolDays': return parseInt(teacherData.schoolDays) || DEFAULTS.SCHOOL_DAYS;
        case 'ExpectedYearlyHours': return parseInt(teacherData.expectedYearlyHours) || DEFAULTS.EXPECTED_YEARLY_HOURS;
        case 'PrepTimeYearly': return parseFloat(teacherData.prepTimeYearly) || DEFAULTS.PREP_TIME_YEARLY;
        case 'MedApptHours': return parseFloat(teacherData.medApptHours) || DEFAULTS.MEDICAL_APPT_HOURS;
        default: return '';
      }
    });
    
    sheet.appendRow(newRow);
    
    // Invalidate cache
    invalidateCache(CACHE_KEYS.TEACHERS);
    
    return { success: true, message: `Profesor "${teacherData.name.toUpperCase()}" añadido correctamente!`, teacherId: newId };
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return { success: false, message: error.message };
  }
}
function deactivateTeacher(teacherEmail) {
  try {
    const sheet = SS().getSheetByName(SHEETS.TEACHERS);
    if (!sheet) return { success: false, message: 'Teachers sheet not found' };
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const normalizedEmail = teacherEmail.toLowerCase().trim();
    
    const emailCol = headers.indexOf('Email');
    const statusCol = headers.indexOf('Status');
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][emailCol >= 0 ? emailCol : 2] || '').toLowerCase().trim() === normalizedEmail) {
        sheet.getRange(i + 1, (statusCol >= 0 ? statusCol : 3) + 1).setValue('Inactive');
        
        // Invalidate cache
        invalidateCache(CACHE_KEYS.TEACHERS);
        
        return { success: true, message: 'Profesor desactivado correctamente' };
      }
    }
    return { success: false, message: 'Teacher not found' };
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return { success: false, message: error.message };
  }
}

// ========================================
// CALENDAR VIEW - ALL HOLIDAYS
// ========================================

function getAllHolidaysForCalendar(year, month) {
  try {
    const holidayData = getSheetData(SHEETS.HOLIDAY_REQUESTS);
    const schoolHolidaysData = getSheetData(SHEETS.SCHOOL_HOLIDAYS);
    
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);
    const monthName = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    // Initialize calendar data
    const calendarData = {};
    const current = new Date(monthStart);
    while (current <= monthEnd) {
      calendarData[formatDateStr(current)] = { schoolHoliday: null, teacherHolidays: [] };
      current.setDate(current.getDate() + 1);
    }
    
    // Load school holidays (includes puente days)
    if (schoolHolidaysData) {
      schoolHolidaysData.slice(1).forEach(row => {
        if (!row[0]) return;
        const start = new Date(row[0]), end = new Date(row[1]);
        const holidayName = String(row[2] || 'Festivo');
        const cur = new Date(start);
        while (cur <= end) {
          const dateStr = formatDateStr(cur);
          if (calendarData[dateStr]) calendarData[dateStr].schoolHoliday = holidayName;
          cur.setDate(cur.getDate() + 1);
        }
      });
    }
    
    // Load teacher holidays
    if (holidayData) {
      holidayData.slice(1).forEach(row => {
        if (String(row[6]) !== 'Approved') return;
        
        const teacherName = String(row[1]);
        const holidayType = String(row[7] || 'Annual');
        const start = new Date(row[3]), end = new Date(row[4]);
        const cur = new Date(start);
        
        while (cur <= end) {
          const dateStr = formatDateStr(cur);
          if (calendarData[dateStr]) {
            const existing = calendarData[dateStr].teacherHolidays.find(t => t.name === teacherName && t.type === holidayType);
            if (!existing) calendarData[dateStr].teacherHolidays.push({ name: teacherName, type: holidayType });
          }
          cur.setDate(cur.getDate() + 1);
        }
      });
    }
    
    // Calculate stats
    let schoolHolidayDays = 0, totalTeacherHolidayDays = 0;
    Object.values(calendarData).forEach(day => {
      if (day.schoolHoliday) schoolHolidayDays++;
      totalTeacherHolidayDays += day.teacherHolidays.length;
    });
    
    return {
      success: true, year, month, monthName, calendarData,
      stats: { schoolHolidayDays, totalTeacherHolidayDays },
      puenteDays: DEFAULTS.PUENTE_DAYS
    };
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return { success: false, error: error.message };
  }
}

function getHolidayDetailsForDate(dateStr) {
  try {
    const holidayData = getSheetData(SHEETS.HOLIDAY_REQUESTS);
    const schoolHolidaysData = getSheetData(SHEETS.SCHOOL_HOLIDAYS);
    
    const targetDate = new Date(dateStr);
    targetDate.setHours(0, 0, 0, 0);
    
    const result = { date: dateStr, schoolHoliday: null, teacherHolidays: [] };
    
    // Check school holidays
    if (schoolHolidaysData) {
      for (let i = 1; i < schoolHolidaysData.length; i++) {
        const row = schoolHolidaysData[i];
        if (!row[0]) continue;
        
        const start = new Date(row[0]), end = new Date(row[1]);
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        
        if (targetDate >= start && targetDate <= end) {
          result.schoolHoliday = { name: String(row[2] || 'Festivo'), type: String(row[3] || 'Holiday') };
          break;
        }
      }
    }
    
    // Get teacher holidays
    if (holidayData) {
      holidayData.slice(1).forEach(row => {
        if (String(row[6]) !== 'Approved') return;
        
        const start = new Date(row[3]), end = new Date(row[4]);
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        
        if (targetDate >= start && targetDate <= end) {
          result.teacherHolidays.push({
            name: String(row[1]),
            email: String(row[2]),
            type: String(row[7] || 'Annual'),
            reason: String(row[11] || '')
          });
        }
      });
    }
    
    result.teacherHolidays.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return { date: dateStr, schoolHoliday: null, teacherHolidays: [], error: error.message };
  }
}

// ========================================
// YEAR-END ARCHIVE - OPTIMIZED
// ========================================

function archiveYearData(year) {
  try {
    const ss = SS();
    const results = { punches: 0, holidays: 0, errors: [] };
    
    // Archive Punches
    const punchSheet = ss.getSheetByName(SHEETS.TIME_PUNCHES);
    if (punchSheet && punchSheet.getLastRow() > 1) {
      const archivePunchName = `Archive_Punches_${year}`;
      let archivePunch = ss.getSheetByName(archivePunchName);
      
      if (!archivePunch) {
        archivePunch = ss.insertSheet(archivePunchName);
        // Copy headers
        const headers = punchSheet.getRange(1, 1, 1, punchSheet.getLastColumn()).getValues();
        archivePunch.getRange(1, 1, 1, headers[0].length).setValues(headers);
        archivePunch.getRange(1, 1, 1, headers[0].length)
          .setBackground('#092b50')
          .setFontColor('#ffffff')
          .setFontWeight('bold');
        archivePunch.setFrozenRows(1);
      }
      
      const punchData = punchSheet.getRange(2, 1, punchSheet.getLastRow() - 1, punchSheet.getLastColumn()).getValues();
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;
      
      const toArchive = [];
      const toKeep = [];
      
      punchData.forEach(row => {
        const dateStr = formatDateStr(row[3]);
        if (dateStr >= yearStart && dateStr <= yearEnd) {
          toArchive.push(row);
        } else {
          toKeep.push(row);
        }
      });
      
      if (toArchive.length > 0) {
        const archiveLastRow = archivePunch.getLastRow();
        archivePunch.getRange(archiveLastRow + 1, 1, toArchive.length, toArchive[0].length).setValues(toArchive);
        results.punches = toArchive.length;
        
        // OPTIMIZED: Single operation to replace all data
        const numCols = punchSheet.getLastColumn();
        const numRows = punchSheet.getLastRow() - 1;
        
        if (numRows > 0) {
          punchSheet.getRange(2, 1, numRows, numCols).clearContent();
        }
        
        if (toKeep.length > 0) {
          punchSheet.getRange(2, 1, toKeep.length, toKeep[0].length).setValues(toKeep);
        }
      }
    }
    
    // Archive Holiday Requests
    const holidaySheet = ss.getSheetByName(SHEETS.HOLIDAY_REQUESTS);
    if (holidaySheet && holidaySheet.getLastRow() > 1) {
      const archiveHolidayName = `Archive_Holidays_${year}`;
      let archiveHoliday = ss.getSheetByName(archiveHolidayName);
      
      if (!archiveHoliday) {
        archiveHoliday = ss.insertSheet(archiveHolidayName);
        const headers = holidaySheet.getRange(1, 1, 1, holidaySheet.getLastColumn()).getValues();
        archiveHoliday.getRange(1, 1, 1, headers[0].length).setValues(headers);
        archiveHoliday.getRange(1, 1, 1, headers[0].length)
          .setBackground('#092b50')
          .setFontColor('#ffffff')
          .setFontWeight('bold');
        archiveHoliday.setFrozenRows(1);
      }
      
      const holidayData = holidaySheet.getRange(2, 1, holidaySheet.getLastRow() - 1, holidaySheet.getLastColumn()).getValues();
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;
      
      const toArchive = [];
      const toKeep = [];
      
      holidayData.forEach(row => {
        const startDate = formatDateStr(row[3]);
        if (startDate >= yearStart && startDate <= yearEnd) {
          toArchive.push(row);
        } else {
          toKeep.push(row);
        }
      });
      
      if (toArchive.length > 0) {
        const archiveLastRow = archiveHoliday.getLastRow();
        archiveHoliday.getRange(archiveLastRow + 1, 1, toArchive.length, toArchive[0].length).setValues(toArchive);
        results.holidays = toArchive.length;
        
        // OPTIMIZED: Single operation to replace all data
        const numCols = holidaySheet.getLastColumn();
        const numRows = holidaySheet.getLastRow() - 1;
        
        if (numRows > 0) {
          holidaySheet.getRange(2, 1, numRows, numCols).clearContent();
        }
        
        if (toKeep.length > 0) {
          holidaySheet.getRange(2, 1, toKeep.length, toKeep[0].length).setValues(toKeep);
        }
      }
    }
    
    // Invalidate all caches after archive
    invalidateAllPunchCache();
    
    Logger.log(`✅ Archive complete for ${year}: ${results.punches} punches, ${results.holidays} holiday requests`);
    
    return {
      success: true,
      message: `Archivo completado para ${year}`,
      details: {
        punchesArchived: results.punches,
        holidaysArchived: results.holidays
      }
    };
  } catch (error) {
    Logger.log('❌ Archive error: ' + error.message);
    return { success: false, message: error.message };
  }
}

function getAvailableArchiveYears() {
  try {
    const punchSheet = SS().getSheetByName(SHEETS.TIME_PUNCHES);
    if (!punchSheet || punchSheet.getLastRow() < 2) return [];
    
    const dates = punchSheet.getRange(2, 4, punchSheet.getLastRow() - 1, 1).getValues();
    const years = new Set();
    const currentYear = new Date().getFullYear();
    
    dates.forEach(row => {
      if (row[0]) {
        const year = new Date(row[0]).getFullYear();
        if (year < currentYear) years.add(year); // Only past years
      }
    });
    
    return Array.from(years).sort((a, b) => b - a);
  } catch (error) {
    return [];
  }
}

// ========================================
// CACHE FUNCTIONS (Optional - for performance)
// ========================================

function updateTeacherCache() {
  const punchesSheet = SS().getSheetByName(SHEETS.TIME_PUNCHES);
  if (!punchesSheet || punchesSheet.getLastRow() < 2) return;
  
  let cacheSheet = SS().getSheetByName('Punch_Cache');
  if (!cacheSheet) {
    cacheSheet = SS().insertSheet('Punch_Cache');
    cacheSheet.appendRow(['Email', 'Date', 'PunchCount', 'TotalMinutes', 'LastUpdated']);
  }
  
  cacheSheet.getRange(2, 1, Math.max(cacheSheet.getLastRow() - 1, 1), 5).clearContent();
  
  const data = punchesSheet.getDataRange().getValues();
  const summary = {};
  
  data.slice(1).forEach(row => {
    const email = String(row[2] || '').toLowerCase().trim();
    const dateStr = formatDateStr(row[3]);
    const key = `${email}|${dateStr}`;
    
    if (!summary[key]) summary[key] = { email, date: dateStr, punches: [] };
    summary[key].punches.push({ time: formatTimeValue(row[4]), punchType: String(row[5]) });
  });
  
  const rows = Object.values(summary).map(s => {
    const minutes = calculateMinutesFromPunches(s.punches);
    return [s.email, s.date, s.punches.length, minutes, new Date()];
  });
  
  if (rows.length > 0) cacheSheet.getRange(2, 1, rows.length, 5).setValues(rows);
  Logger.log('Cache updated: ' + rows.length + ' entries');
}

function calculateMinutesFromPunches(punches) {
  punches.sort((a, b) => a.time.localeCompare(b.time));
  let totalMinutes = 0;
  
  for (let i = 0; i < punches.length - 1; i += 2) {
    if (punches[i].punchType === 'IN' && punches[i + 1]?.punchType === 'OUT') {
      const inTime = parseTime(punches[i].time), outTime = parseTime(punches[i + 1].time);
      if (inTime && outTime) {
        const diff = (outTime.hours * 60 + outTime.minutes) - (inTime.hours * 60 + inTime.minutes);
        if (diff > 0) totalMinutes += diff;
      }
    }
  }
  return totalMinutes;
}

function checkDataHealth() {
  const punches = SS().getSheetByName(SHEETS.TIME_PUNCHES);
  const holidays = SS().getSheetByName(SHEETS.HOLIDAY_REQUESTS);
  
  const punchRows = punches ? punches.getLastRow() - 1 : 0;
  const holidayRows = holidays ? holidays.getLastRow() - 1 : 0;
  
  Logger.log(`📊 Data Health Check`);
  Logger.log(`   Punch records: ${punchRows}`);
  Logger.log(`   Holiday requests: ${holidayRows}`);
  Logger.log(`   Total rows: ${punchRows + holidayRows}`);
  Logger.log(`   Status: ${punchRows < 30000 ? '✅ Healthy' : '⚠️ Consider archiving'}`);
  
  return { punchRows, holidayRows, total: punchRows + holidayRows };
}
// ========================================
// PREP TIME FUNCTIONS
// ========================================

/**
 * Setup prep time sheet - run once
 */
function setupPrepTimeSheet() {
  const ss = SS();
  let sheet = ss.getSheetByName(SHEETS.PREP_TIME);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.PREP_TIME);
    sheet.appendRow(['PrepID', 'TeacherName', 'TeacherEmail', 'WeekStart', 'WeekEnd', 'Hours', 'CreatedAt', 'PunchDate', 'Notes']);
    sheet.getRange(1, 1, 1, 9)
      .setBackground('#092b50')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 180);
    sheet.setColumnWidth(2, 150);
    sheet.setColumnWidth(3, 200);
    Logger.log('✅ Created Punch_Prep_Time sheet');
  }
  
  // Add PrepTimeYearly column to teachers if not exists
  const teachersSheet = ss.getSheetByName(SHEETS.TEACHERS);
  if (teachersSheet) {
    const headers = teachersSheet.getRange(1, 1, 1, teachersSheet.getLastColumn()).getValues()[0];
    if (headers.indexOf('PrepTimeYearly') === -1) {
      const nextCol = teachersSheet.getLastColumn() + 1;
      teachersSheet.getRange(1, nextCol).setValue('PrepTimeYearly')
        .setBackground('#092b50')
        .setFontColor('#ffffff')
        .setFontWeight('bold');
      // Set default value for existing teachers
      for (let row = 2; row <= teachersSheet.getLastRow(); row++) {
        teachersSheet.getRange(row, nextCol).setValue(DEFAULTS.PREP_TIME_YEARLY);
      }
      Logger.log('✅ Added PrepTimeYearly column to teachers');
    }
  }
  
  // Invalidate cache
  invalidateCache(CACHE_KEYS.TEACHERS);
  
  return { success: true, message: 'Prep time sheet setup complete' };
}

/**
 * Get the Monday of the week for a given date
 */
function getWeekStart(dateStr) {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  const monday = new Date(date.setDate(diff));
  return Utilities.formatDate(monday, TZ(), 'yyyy-MM-dd');
}

/**
 * Get the Sunday of the week for a given date
 */
function getWeekEnd(dateStr) {
  const weekStart = new Date(getWeekStart(dateStr));
  const sunday = new Date(weekStart);
  sunday.setDate(sunday.getDate() + 6);
  return Utilities.formatDate(sunday, TZ(), 'yyyy-MM-dd');
}

/**
 * Get teacher's yearly prep time allocation and calculate weekly amount
 */
function getTeacherPrepTimeAllocation(teacherEmail) {
  const teachersData = getSheetData(SHEETS.TEACHERS);
  let yearlyHours = DEFAULTS.PREP_TIME_YEARLY;
  
  if (teachersData) {
    const headers = teachersData[0];
    const emailCol = findColumnIndex(headers, 'Email');
    const prepCol = findColumnIndex(headers, 'PrepTimeYearly');
    
    const normalizedEmail = teacherEmail.toLowerCase().trim();
    const teacherRow = teachersData.slice(1).find(row => 
      String(row[emailCol >= 0 ? emailCol : 2] || '').toLowerCase().trim() === normalizedEmail
    );
    
    if (teacherRow && prepCol >= 0) {
      yearlyHours = parseFloat(teacherRow[prepCol]) || DEFAULTS.PREP_TIME_YEARLY;
    }
  }
  
  // Calculate weekly hours from yearly allocation
  const weeklyHours = Math.round((yearlyHours / DEFAULTS.WORKING_WEEKS_PER_YEAR) * 10) / 10;
  
  return {
    yearlyHours,
    weeklyHours,
    workingWeeks: DEFAULTS.WORKING_WEEKS_PER_YEAR
  };
}

/**
 * Check if prep time has been logged for the current week
 */
function getPrepTimeStatus(teacherEmail, dateStr) {
  try {
    const normalizedEmail = teacherEmail.toLowerCase().trim();
    const weekStart = getWeekStart(dateStr);
    
    // Get teacher's weekly hours (simplified)
    const allocation = getTeacherPrepTimeAllocation(teacherEmail);
    
    const sheet = SS().getSheetByName(SHEETS.PREP_TIME);
    if (!sheet || sheet.getLastRow() < 2) {
      return { 
        logged: false, 
        weeklyHours: allocation.weeklyHours
      };
    }
    
    // Use TextFinder for faster lookup
    const emailCol = sheet.getRange(2, 3, sheet.getLastRow() - 1, 1);
    const finder = emailCol.createTextFinder(normalizedEmail).matchEntireCell(true);
    const matches = finder.findAll();
    
    let logged = false;
    for (const match of matches) {
      const row = match.getRow();
      const rowWeekStart = formatDateStr(sheet.getRange(row, 4).getValue());
      if (rowWeekStart === weekStart) {
        logged = true;
        break;
      }
    }
    
    return { 
      logged, 
      weeklyHours: allocation.weeklyHours
    };
  } catch (error) {
    Logger.log('❌ ERROR getPrepTimeStatus: ' + error.message);
    return { 
      logged: false, 
      weeklyHours: 1.5
    };
  }
}

/**
 * Format week display string
 */
function formatWeekDisplay(weekStart, weekEnd) {
  const startDate = new Date(weekStart);
  const endDate = new Date(weekEnd);
  const options = { day: 'numeric', month: 'short' };
  return `${startDate.toLocaleDateString('es-ES', options)} - ${endDate.toLocaleDateString('es-ES', options)}`;
}

function addPrepTimePunch(teacherEmail, teacherName, dateStr, notes) {
  try {
    // Get a user-specific lock to prevent race conditions
    const lock = LockService.getUserLock();
    
    if (!lock.tryLock(10000)) {
      return { success: false, message: 'Sistema ocupado. Por favor intenta de nuevo.' };
    }
    
    try {
      const sheet = SS().getSheetByName(SHEETS.TIME_PUNCHES);
      if (!sheet) {
        return { success: false, message: 'Sheet not found' };
      }
      
      const normalizedEmail = teacherEmail.toLowerCase().trim();
      const weekStart = getWeekStart(dateStr);
      
      // Check if already logged this week
      if (sheet.getLastRow() > 1) {
        const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
        for (const row of data) {
          if (String(row[2] || '').toLowerCase().trim() === normalizedEmail && 
              String(row[5]).toUpperCase() === 'PREP') {
            const notesField = String(row[8] || '');
            let rowWeekStart = '';
            
            if (notesField.includes('Week:')) {
              let weekPart = notesField.split('Week:')[1].trim();
              if (weekPart.includes('|')) {
                weekPart = weekPart.split('|')[0].trim();
              }
              rowWeekStart = weekPart;
            } else {
              rowWeekStart = getWeekStart(formatDateStr(row[3]));
            }
            
            if (rowWeekStart === weekStart) {
              return { 
                success: false, 
                message: 'Ya registrado esta semana',
                alreadyLogged: true
              };
            }
          }
        }
      }
      
      // Get weekly hours
      const allocation = getTeacherPrepTimeAllocation(teacherEmail);
      const weeklyHours = allocation.weeklyHours;
      
      // Add as PREP punch
      const prepId = 'PREP_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      const createdAt = Utilities.formatDate(NOW(), TZ(), 'yyyy-MM-dd HH:mm:ss');
      const notesValue = 'Week: ' + weekStart + ' | Hours: ' + weeklyHours;
      
      sheet.appendRow([
        prepId,
        teacherName,
        normalizedEmail,
        dateStr,
        '',
        'PREP',
        createdAt,
        '',
        notesValue
      ]);
      
      // Invalidate cache
      invalidateCache(CACHE_KEYS.PUNCHES);
      
      return {
        success: true,
        message: `Horas No Lectivas: ${weeklyHours}h ✓`,
        prepId,
        hours: weeklyHours
      };
      
    } finally {
      lock.releaseLock();
    }
    
  } catch (error) {
    Logger.log('❌ ERROR addPrepTimePunch: ' + error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Get teacher's total prep time summary for the year
 */
function getTeacherPrepTimeSummary(teacherEmail, year) {
  try {
    const currentYear = year || new Date().getFullYear();
    const sheet = SS().getSheetByName(SHEETS.PREP_TIME);
    
    // Get teacher's yearly allocation
    const allocation = getTeacherPrepTimeAllocation(teacherEmail);
    
    if (!sheet || sheet.getLastRow() < 2) {
      return { 
        totalHours: 0, 
        weeksLogged: 0, 
        yearlyHours: allocation.yearlyHours,
        weeklyHours: allocation.weeklyHours,
        progressPercent: 0
      };
    }
    
    const normalizedEmail = teacherEmail.toLowerCase().trim();
    const yearStart = `${currentYear}-01-01`;
    const yearEnd = `${currentYear}-12-31`;
    
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
    
    let totalHours = 0;
    let weeksLogged = 0;
    
    data.forEach(row => {
      const rowEmail = String(row[2] || '').toLowerCase().trim();
      const rowWeekStart = formatDateStr(row[3]);
      const hours = parseFloat(row[5]) || 0;
      
      if (rowEmail === normalizedEmail && rowWeekStart >= yearStart && rowWeekStart <= yearEnd) {
        totalHours += hours;
        weeksLogged++;
      }
    });
    
    const progressPercent = allocation.yearlyHours > 0 
      ? Math.round((totalHours / allocation.yearlyHours) * 100) 
      : 0;
    
    return {
      totalHours: Math.round(totalHours * 10) / 10,
      weeksLogged,
      yearlyHours: allocation.yearlyHours,
      weeklyHours: allocation.weeklyHours,
      progressPercent
    };
  } catch (error) {
    Logger.log('❌ ERROR getTeacherPrepTimeSummary: ' + error.message);
    return { 
      totalHours: 0, 
      weeksLogged: 0, 
      yearlyHours: DEFAULTS.PREP_TIME_YEARLY,
      weeklyHours: DEFAULTS.PREP_TIME_YEARLY / DEFAULTS.WORKING_WEEKS_PER_YEAR,
      progressPercent: 0,
      error: error.message 
    };
  }
}

// ========================================
// UPDATE: getTeacherSettings - Add PrepTimeYearly
// ========================================

function getTeacherSettings(teacherEmail) {
  try {
    const data = getSheetData(SHEETS.TEACHERS);
    if (!data) return { success: false, message: 'Teachers sheet not found' };
    
    const headers = data[0];
    const normalizedEmail = teacherEmail.toLowerCase().trim();
    
    const cols = {
      id: findColumnIndex(headers, 'TeacherID'),
      name: findColumnIndex(headers, 'Name'),
      email: findColumnIndex(headers, 'Email'),
      status: findColumnIndex(headers, 'Status'),
      annual: findColumnIndex(headers, 'AnnualDays'),
      personal: findColumnIndex(headers, 'PersonalDays'),
      school: findColumnIndex(headers, 'SchoolDays'),
      expected: findColumnIndex(headers, 'ExpectedYearlyHours'),
      prepTimeYearly: findColumnIndex(headers, 'PrepTimeYearly'),
      medApptHours: findColumnIndex(headers, 'MedApptHours')
    };
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][cols.email >= 0 ? cols.email : 2] || '').toLowerCase().trim() === normalizedEmail) {
        const yearlyPrepTime = cols.prepTimeYearly >= 0 
          ? (parseFloat(data[i][cols.prepTimeYearly]) || DEFAULTS.PREP_TIME_YEARLY) 
          : DEFAULTS.PREP_TIME_YEARLY;
        
        return {
          success: true,
          teacher: {
            rowNumber: i + 1,
            teacherId: data[i][cols.id >= 0 ? cols.id : 0] || '',
            name: data[i][cols.name >= 0 ? cols.name : 1] || '',
            email: normalizedEmail,
            status: data[i][cols.status >= 0 ? cols.status : 3] || 'Active',
            annualDays: cols.annual >= 0 ? (parseInt(data[i][cols.annual]) || DEFAULTS.ANNUAL_DAYS) : DEFAULTS.ANNUAL_DAYS,
            personalDays: cols.personal >= 0 ? (parseInt(data[i][cols.personal]) || DEFAULTS.PERSONAL_DAYS) : DEFAULTS.PERSONAL_DAYS,
            schoolDays: cols.school >= 0 ? (parseInt(data[i][cols.school]) || DEFAULTS.SCHOOL_DAYS) : DEFAULTS.SCHOOL_DAYS,
            expectedYearlyHours: cols.expected >= 0 ? (parseInt(data[i][cols.expected]) || DEFAULTS.EXPECTED_YEARLY_HOURS) : DEFAULTS.EXPECTED_YEARLY_HOURS,
            prepTimeYearly: yearlyPrepTime,
            prepTimeWeekly: Math.round((yearlyPrepTime / DEFAULTS.WORKING_WEEKS_PER_YEAR) * 100) / 100,
            medApptHours: cols.medApptHours >= 0 
              ? (parseFloat(data[i][cols.medApptHours]) || DEFAULTS.MEDICAL_APPT_HOURS) 
              : DEFAULTS.MEDICAL_APPT_HOURS
          }
        };
      }
    }
    return { success: false, message: 'Teacher not found' };
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return { success: false, message: error.message };
  }
}

// ========================================
// UPDATE: updateTeacherSettings - Add PrepTimeYearly
// ========================================

function updateTeacherSettings(teacherEmail, settings) {
  try {
    const sheet = SS().getSheetByName(SHEETS.TEACHERS);
    if (!sheet) return { success: false, message: 'Teachers sheet not found' };
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const normalizedEmail = teacherEmail.toLowerCase().trim();
    
    let emailCol = headers.indexOf('Email');
    if (emailCol === -1) emailCol = 2;
    
    // Ensure columns exist
    const requiredCols = ['AnnualDays', 'PersonalDays', 'SchoolDays', 'ExpectedYearlyHours', 'PrepTimeYearly', 'MedApptHours'];
    let lastCol = sheet.getLastColumn();
    
    requiredCols.forEach(colName => {
      if (headers.indexOf(colName) === -1) {
        lastCol++;
        sheet.getRange(1, lastCol).setValue(colName).setBackground('#092b50').setFontColor('#ffffff').setFontWeight('bold');
        // Set default values for existing rows
        const defaultVal = colName === 'MedApptHours' ? DEFAULTS.MEDICAL_APPT_HOURS :
                          colName === 'PrepTimeYearly' ? DEFAULTS.PREP_TIME_YEARLY : 
                          colName === 'AnnualDays' ? DEFAULTS.ANNUAL_DAYS :
                          colName === 'PersonalDays' ? DEFAULTS.PERSONAL_DAYS :
                          colName === 'SchoolDays' ? DEFAULTS.SCHOOL_DAYS :
                          DEFAULTS.EXPECTED_YEARLY_HOURS;
        for (let row = 2; row <= sheet.getLastRow(); row++) {
          sheet.getRange(row, lastCol).setValue(defaultVal);
        }
      }
    });
    
    const updatedHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const cols = {
      annual: updatedHeaders.indexOf('AnnualDays') + 1,
      personal: updatedHeaders.indexOf('PersonalDays') + 1,
      school: updatedHeaders.indexOf('SchoolDays') + 1,
      expected: updatedHeaders.indexOf('ExpectedYearlyHours') + 1,
      prepTimeYearly: updatedHeaders.indexOf('PrepTimeYearly') + 1,
      medApptHours: updatedHeaders.indexOf('MedApptHours') + 1
    };
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][emailCol] || '').toLowerCase().trim() === normalizedEmail) {
        const rowNum = i + 1;
        if (settings.annualDays !== undefined && cols.annual > 0) 
          sheet.getRange(rowNum, cols.annual).setValue(parseInt(settings.annualDays) || DEFAULTS.ANNUAL_DAYS);
        if (settings.personalDays !== undefined && cols.personal > 0) 
          sheet.getRange(rowNum, cols.personal).setValue(parseInt(settings.personalDays) || DEFAULTS.PERSONAL_DAYS);
        if (settings.schoolDays !== undefined && cols.school > 0) 
          sheet.getRange(rowNum, cols.school).setValue(parseInt(settings.schoolDays) || DEFAULTS.SCHOOL_DAYS);
        if (settings.expectedYearlyHours !== undefined && cols.expected > 0) 
          sheet.getRange(rowNum, cols.expected).setValue(parseInt(settings.expectedYearlyHours) || DEFAULTS.EXPECTED_YEARLY_HOURS);
        if (settings.prepTimeYearly !== undefined && cols.prepTimeYearly > 0) 
          sheet.getRange(rowNum, cols.prepTimeYearly).setValue(parseFloat(settings.prepTimeYearly) || DEFAULTS.PREP_TIME_YEARLY);
        if (settings.medApptHours !== undefined && cols.medApptHours > 0) 
          sheet.getRange(rowNum, cols.medApptHours).setValue(parseFloat(settings.medApptHours) || DEFAULTS.MEDICAL_APPT_HOURS);
        
        invalidateCache(CACHE_KEYS.TEACHERS);
        
        return { success: true, message: 'Configuración actualizada para ' + data[i][1] };
      }
    }
    return { success: false, message: 'Teacher not found' };
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return { success: false, message: error.message };
  }
}

function runPrepTimeSetup() {
  setupPrepTimeSheet();
  Logger.log('✅ Prep time setup complete');
}
/**
 * Get all day data in ONE call - punches + prep time status
 */
function getDayDataCombined(teacherEmail, dateStr) {
  try {
    const normalizedEmail = teacherEmail.toLowerCase().trim();
    const weekStart = getWeekStart(dateStr);
    
    // Get teacher's weekly prep hours
    const allocation = getTeacherPrepTimeAllocation(teacherEmail);
    const weeklyHours = allocation.weeklyHours;
    
    // Check freeze status
    const freezeStatus = canEditPunchesForDate(dateStr, teacherEmail);
    
    // Get ALL data from Time_Punches in ONE read
    const punchSheet = SS().getSheetByName(SHEETS.TIME_PUNCHES);
    const punches = [];
    let prepLogged = false;
    
    if (punchSheet && punchSheet.getLastRow() > 1) {
      const punchData = punchSheet.getRange(2, 1, punchSheet.getLastRow() - 1, 9).getValues();
      
      punchData.forEach(row => {
        const rowEmail = String(row[2] || '').toLowerCase().trim();
        if (rowEmail !== normalizedEmail) return;
        
        const punchType = String(row[5] || '').toUpperCase().trim();
        const rowDate = formatDateStr(row[3]);
        
        if (punchType === 'PREP') {
          const notesField = String(row[8] || '');
          let prepWeekStart = '';
          
          if (notesField.includes('Week:')) {
            let weekPart = notesField.split('Week:')[1].trim();
            if (weekPart.includes('|')) weekPart = weekPart.split('|')[0].trim();
            prepWeekStart = weekPart;
          } else {
            prepWeekStart = getWeekStart(rowDate);
          }
          
          if (prepWeekStart === weekStart) prepLogged = true;
        }
        else if ((punchType === 'IN' || punchType === 'OUT') && rowDate === dateStr) {
          punches.push({
            punchId: String(row[0]),
            teacherName: String(row[1]),
            date: rowDate,
            time: formatTimeValue(row[4]),
            punchType: punchType,
            notes: String(row[8] || '')
          });
        }
      });
      
      punches.sort((a, b) => a.time.localeCompare(b.time));
    }
    
    // Check for MedAppt on this day
    const holidayData = getSheetData(SHEETS.HOLIDAY_REQUESTS);
    let medApptForDay = null;
    
     if (holidayData) {
      holidayData.slice(1).forEach(row => {
        if (String(row[2] || '').toLowerCase().trim() !== normalizedEmail) return;
        if (String(row[7]) !== 'MedAppt') return;
        if (String(row[6]) !== 'Approved') return;
        if (formatDateStr(row[3]) !== dateStr) return;
        
        medApptForDay = {
          requestId: String(row[0]),
          hours: parseFloat(row[5]) || 0,
          reason: String(row[11] || ''),
          timeRange: String(row[12] || '')
        };
      });
    }
    
    return {
      success: true,
      punches: punches,
      prepTime: {
        logged: prepLogged,
        weeklyHours: weeklyHours
      },
      freeze: {
        frozen: freezeStatus.frozen,
        canEdit: freezeStatus.canEdit,
        freezeDate: freezeStatus.freezeDate,
        message: freezeStatus.message
      },
      medAppt: medApptForDay
    };
  } catch (error) {
    Logger.log('❌ ERROR getDayDataCombined: ' + error.message);
    return {
      success: false,
      error: error.message,
      punches: [],
      prepTime: { logged: false, weeklyHours: 1.5 },
      freeze: { frozen: false, canEdit: true },
      medAppt: null
    };
  }
}

/**
 * Add prep time as a PREP punch in Time_Punches sheet
 */
function addPrepTimePunch(teacherEmail, teacherName, dateStr, notes) {
  try {
    const sheet = SS().getSheetByName(SHEETS.TIME_PUNCHES);
    if (!sheet) {
      return { success: false, message: 'Sheet not found' };
    }
    
    const normalizedEmail = teacherEmail.toLowerCase().trim();
    const weekStart = getWeekStart(dateStr);
    
    // Check if already logged this week
    if (sheet.getLastRow() > 1) {
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
      for (const row of data) {
        if (String(row[2] || '').toLowerCase().trim() === normalizedEmail && 
            String(row[5]).toUpperCase() === 'PREP') {
          const notesField = String(row[8] || '');
          let rowWeekStart;
          if (notesField.includes('Week:')) {
            rowWeekStart = notesField.split('Week:')[1].split('|')[0].trim();
          } else {
            rowWeekStart = getWeekStart(formatDateStr(row[3]));
          }
          
          if (rowWeekStart === weekStart) {
            return { 
              success: false, 
              message: 'Ya registrado esta semana',
              alreadyLogged: true
            };
          }
        }
      }
    }
    
    // Get weekly hours
    const allocation = getTeacherPrepTimeAllocation(teacherEmail);
    const weeklyHours = allocation.weeklyHours;
    
    // Add as PREP punch
    const prepId = 'PREP_' + Date.now();
    const createdAt = Utilities.formatDate(NOW(), TZ(), 'yyyy-MM-dd HH:mm:ss');
    
    // Store hours in Notes column to avoid date formatting issues
    // Format: "Week: 2025-12-29 | Hours: 1.5"
    const notesValue = 'Week: ' + weekStart + ' | Hours: ' + weeklyHours;
    
    sheet.appendRow([
      prepId,
      teacherName,
      normalizedEmail,
      dateStr,
      '',        // Leave Time column empty for PREP
      'PREP',
      createdAt,
      '',
      notesValue  // "Week: 2025-12-29 | Hours: 1.5"
    ]);
    
    // Invalidate cache
    invalidateCache(CACHE_KEYS.PUNCHES);
    
    return {
      success: true,
      message: `Horas No Lectivas: ${weeklyHours}h ✓`,
      prepId,
      hours: weeklyHours
    };
  } catch (error) {
    Logger.log('❌ ERROR addPrepTimePunch: ' + error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Delete prep time punch for a specific week
 */
function deletePrepTimePunch(teacherEmail, dateStr) {
  try {
    const sheet = SS().getSheetByName(SHEETS.TIME_PUNCHES);
    if (!sheet || sheet.getLastRow() < 2) {
      return { success: false, message: 'No hay registros' };
    }
    
    const normalizedEmail = teacherEmail.toLowerCase().trim();
    const weekStart = getWeekStart(dateStr);
    
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      const rowEmail = String(data[i][2] || '').toLowerCase().trim();
      const punchType = String(data[i][5]).toUpperCase();
      
      if (rowEmail === normalizedEmail && punchType === 'PREP') {
        const notesField = String(data[i][8] || '');
        let rowWeekStart = '';
        
        // Handle new format: "Week: 2025-12-29 | Hours: 1.5"
        // Also handle old format: "Week: 2025-12-29"
        if (notesField.includes('Week:')) {
          let weekPart = notesField.split('Week:')[1].trim();
          // If new format with pipe, extract just the date
          if (weekPart.includes('|')) {
            weekPart = weekPart.split('|')[0].trim();
          }
          rowWeekStart = weekPart;
        } else {
          // Fallback: calculate from record date
          rowWeekStart = getWeekStart(formatDateStr(data[i][3]));
        }
        
        if (rowWeekStart === weekStart) {
          sheet.deleteRow(i + 1);
          
          // Invalidate cache
          invalidateCache(CACHE_KEYS.PUNCHES);
          
          return { success: true, message: 'Eliminado correctamente' };
        }
      }
    }
    
    return { success: false, message: 'No se encontró el registro' };
  } catch (error) {
    Logger.log('❌ ERROR deletePrepTimePunch: ' + error.message);
    return { success: false, message: error.message };
  }
}
function debugAdminDataLoad() {
  // Simulate what the admin panel does
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  
  Logger.log('📅 Current Date: ' + now);
  Logger.log('📅 Loading data for: ' + year + '-' + month);
  
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  Logger.log('📅 Year range: ' + yearStart + ' to ' + yearEnd);
  
  // Get punches data
  const punchesData = getSheetData(SHEETS.TIME_PUNCHES) || [];
  Logger.log('📊 Total punch rows: ' + (punchesData.length - 1));
  
  // Process PREP entries
  const prepByEmail = {};
  let prepCount = 0;
  
  punchesData.slice(1).forEach((row, index) => {
    const email = String(row[2] || '').toLowerCase().trim();
    const punchType = String(row[5] || '').toUpperCase().trim();
    const rowDate = formatDateStr(row[3]);
    const hours = row[4];
    
    if (punchType === 'PREP') {
      prepCount++;
      Logger.log(`  PREP #${prepCount}: email="${email}", date="${rowDate}", hours=${hours}, type="${punchType}"`);
      Logger.log(`    Raw date value: ${row[3]} (type: ${typeof row[3]})`);
      Logger.log(`    Formatted date: ${rowDate}`);
      Logger.log(`    In year range? ${rowDate >= yearStart && rowDate <= yearEnd}`);
      
      if (rowDate >= yearStart && rowDate <= yearEnd) {
        if (!prepByEmail[email]) {
          prepByEmail[email] = { totalHours: 0, weeksLogged: 0 };
        }
        const parsedHours = parseFloat(hours) || 0;
        prepByEmail[email].totalHours += parsedHours;
        prepByEmail[email].weeksLogged++;
        Logger.log(`    ✅ Added ${parsedHours}h to ${email}`);
      } else {
        Logger.log(`    ❌ SKIPPED - outside year range`);
      }
    }
  });
  
  Logger.log('\n📊 PREP Summary by Email:');
  Object.keys(prepByEmail).forEach(email => {
    const data = prepByEmail[email];
    Logger.log(`  ${email}: ${data.totalHours}h total, ${data.weeksLogged} weeks`);
  });
  
  // Now test the actual function
  Logger.log('\n🔄 Testing getAllTeachersWithHoursAndHolidays...');
  const result = getAllTeachersWithHoursAndHolidays(year, month);
  
  Logger.log('📊 Result:');
  if (result.teachers) {
    result.teachers.forEach(t => {
      Logger.log(`  ${t.name} (${t.email}):`);
      Logger.log(`    - prepTimeTotal: ${t.prepTimeTotal}`);
      Logger.log(`    - prepTimeWeeksLogged: ${t.prepTimeWeeksLogged}`);
      Logger.log(`    - prepTimeYearly: ${t.prepTimeYearly}`);
      Logger.log(`    - prepTimeProgress: ${t.prepTimeProgress}%`);
    });
  }
  
  return result;
}

// ========================================
// WEEK BOUNDS HELPER
// ========================================

function getWeekBounds(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  
  return {
    start: Utilities.formatDate(monday, TZ(), 'yyyy-MM-dd'),
    end: Utilities.formatDate(sunday, TZ(), 'yyyy-MM-dd'),
    weekNumber: getWeekNumber(monday),
    mondayDate: monday,
    sundayDate: sunday
  };
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
function debugPunchMatching() {
  const year = 2026;
  const month = 1;
  
  const punchesData = getSheetData(SHEETS.TIME_PUNCHES) || [];
  const teachersData = getSheetData(SHEETS.TEACHERS);
  
  const monthStart = Utilities.formatDate(new Date(year, month - 1, 1), TZ(), 'yyyy-MM-dd');
  const monthEnd = Utilities.formatDate(new Date(year, month, 0), TZ(), 'yyyy-MM-dd');
  
  Logger.log('=== PUNCH DATA ===');
  
  // Build punchesByEmail exactly as in getAllTeachersWithHoursAndHolidays
  const punchesByEmail = {};
  
  punchesData.slice(1).forEach((row, idx) => {
    const email = String(row[2] || '').toLowerCase().trim();
    const punchType = String(row[5] || '').toUpperCase().trim();
    const rowDate = formatDateStr(row[3]);
    
    if (punchType === 'IN' || punchType === 'OUT') {
      if (!punchesByEmail[email]) punchesByEmail[email] = [];
      punchesByEmail[email].push({
        date: rowDate,
        time: formatTimeValue(row[4]),
        punchType: punchType
      });
      Logger.log(`Added punch: ${email} | ${rowDate} | ${formatTimeValue(row[4])} | ${punchType}`);
    }
  });
  
  Logger.log('');
  Logger.log('=== PUNCHES BY EMAIL KEYS ===');
  Object.keys(punchesByEmail).forEach(key => {
    Logger.log(`Key: "${key}" | Punches: ${punchesByEmail[key].length}`);
  });
  
  Logger.log('');
  Logger.log('=== TEACHER EMAILS ===');
  
  const headers = teachersData[0];
  const emailCol = findColumnIndex(headers, 'Email');
  const nameCol = findColumnIndex(headers, 'Name');
  const statusCol = findColumnIndex(headers, 'Status');
  
  Logger.log('Email column index: ' + emailCol);
  
  teachersData.slice(1).forEach((row, idx) => {
    const status = row[statusCol >= 0 ? statusCol : 3];
    if (status !== 'Active') return;
    
    const email = String(row[emailCol >= 0 ? emailCol : 2] || '').toLowerCase().trim();
    const name = String(row[nameCol >= 0 ? nameCol : 1]);
    const hasPunches = punchesByEmail[email] ? punchesByEmail[email].length : 0;
    
    if (name === 'DANIEL' || hasPunches > 0) {
      Logger.log(`Teacher: ${name} | Email: "${email}" | Has punches: ${hasPunches}`);
    }
  });
  
  Logger.log('');
  Logger.log('=== DANIEL SPECIFIC ===');
  const danielEmail = 'danielbaudy@googlemail.com';
  const danielPunches = punchesByEmail[danielEmail];
  Logger.log('Looking for email: "' + danielEmail + '"');
  Logger.log('Found punches: ' + (danielPunches ? danielPunches.length : 'NONE'));
  
  if (danielPunches) {
    const hours = calculateHoursFromPunches(danielPunches, monthStart, monthEnd);
    Logger.log('Calculated hours: ' + hours);
  }
}
// ========================================
// FREEZE PUNCHES SYSTEM
// ========================================

/**
 * Get the current freeze date (last frozen day, inclusive)
 */
function getFreezeDate() {
  const sheet = SS().getSheetByName(SHEETS.CONFIG);
  if (!sheet) return null;
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'FreezeDate') {
      const val = data[i][1];
      if (!val || val === '') return null;
      return formatDateStr(val);
    }
  }
  return null;
}

/**
 * Check if a specific date is frozen
 */
function isDateFrozen(dateStr) {
  const freezeDate = getFreezeDate();
  if (!freezeDate) return false;
  return dateStr <= freezeDate;
}

/**
 * Check if punches can be edited for a date by a specific user
 */
function canEditPunchesForDate(dateStr, callerEmail) {
  const freezeDate = getFreezeDate();
  const frozen = freezeDate && dateStr <= freezeDate;
  
  if (!frozen) {
    return { canEdit: true, frozen: false, freezeDate: freezeDate };
  }
  
  // Only Super Admins can edit frozen punches
  const callerIsSuperAdmin = callerEmail && isSuperAdmin(callerEmail);
  return { 
    canEdit: callerIsSuperAdmin, 
    frozen: true,
    freezeDate: freezeDate,
    message: callerIsSuperAdmin ? null : 'Fichajes congelados hasta ' + freezeDate + '. Solo Super Admins pueden editar.'
  };
}

/**
 * Freeze all punches before today (admin only)
 * The freeze date will be yesterday (today remains editable)
 */
function freezePunchesBeforeToday(adminEmail) {
  try {
    if (!isSuperAdmin(adminEmail)) {
      return { success: false, message: 'Solo Super Admins pueden congelar fichajes' };
    }
    
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const freezeDate = Utilities.formatDate(yesterday, TZ(), 'yyyy-MM-dd');
    
    const sheet = SS().getSheetByName(SHEETS.CONFIG);
    if (!sheet) return { success: false, message: 'Config sheet not found' };
    
    const data = sheet.getDataRange().getValues();
    let found = false;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === 'FreezeDate') {
        sheet.getRange(i + 1, 2).setValue(freezeDate);
        found = true;
        break;
      }
    }
    
    if (!found) {
      sheet.appendRow(['FreezeDate', freezeDate, 'Última fecha congelada (inclusive)']);
    }
    
    invalidateAllPunchCache();
    
    return { 
      success: true, 
      message: `Fichajes congelados hasta ${freezeDate} (inclusive)`, 
      freezeDate: freezeDate 
    };
  } catch (error) {
    Logger.log('❌ ERROR freezePunchesBeforeToday: ' + error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Clear the freeze date (unfreeze all punches) - admin only
 */
function unfreezeAllPunches(adminEmail) {
  try {
    if (!isAdmin(adminEmail)) {
      return { success: false, message: 'Solo administradores pueden descongelar fichajes' };
    }
    
    const sheet = SS().getSheetByName(SHEETS.CONFIG);
    if (!sheet) return { success: false, message: 'Config sheet not found' };
    
    // Use TextFinder for faster lookup
    const finder = sheet.getRange('A:A').createTextFinder('FreezeDate').matchEntireCell(true);
    const found = finder.findNext();
    
    if (found) {
      sheet.getRange(found.getRow(), 2).setValue('');
    }
    
    invalidateAllPunchCache();
    
    return { success: true, message: 'Todos los fichajes han sido descongelados', freezeDate: null };
  } catch (error) {
    Logger.log('❌ ERROR unfreezeAllPunches: ' + error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Get freeze status for dashboards
 */
function getFreezeStatus() {
  const freezeDate = getFreezeDate();
  return {
    frozen: !!freezeDate,
    freezeDate: freezeDate,
    freezeDateDisplay: freezeDate ? new Date(freezeDate + 'T12:00:00').toLocaleDateString('es-ES', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }) : null
  };
}
// ========================================
// PAID HOURS SYSTEM
// ========================================

/**
 * Setup paid hours sheet - run once
 */
function setupPaidHoursSheet() {
  const ss = SS();
  let sheet = ss.getSheetByName(SHEETS.PAID_HOURS);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.PAID_HOURS);
    sheet.appendRow(['PaidID', 'TeacherName', 'TeacherEmail', 'Hours', 'Date', 'Notes', 'CreatedBy', 'CreatedAt']);
    sheet.getRange(1, 1, 1, 8)
      .setBackground('#092b50')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 180);
    sheet.setColumnWidth(2, 150);
    sheet.setColumnWidth(3, 200);
    sheet.setColumnWidth(6, 250);
    Logger.log('✅ Created Punch_Paid_Hours sheet');
  }
  
  return { success: true, message: 'Paid hours sheet setup complete' };
}

/**
 * Add paid hours record
 */
function addPaidHours(teacherEmail, teacherName, hours, date, notes, adminEmail) {
  try {
    if (!isAdmin(adminEmail)) {
      return { success: false, message: 'Solo administradores pueden registrar horas pagadas' };
    }
    
    if (!hours || hours <= 0) {
      return { success: false, message: 'Las horas deben ser mayor a 0' };
    }
    
    let sheet = SS().getSheetByName(SHEETS.PAID_HOURS);
    if (!sheet) {
      setupPaidHoursSheet();
      sheet = SS().getSheetByName(SHEETS.PAID_HOURS);
    }
    
    const paidId = 'PAID_' + Date.now();
    const createdAt = Utilities.formatDate(NOW(), TZ(), 'yyyy-MM-dd HH:mm:ss');
    const dateStr = date || TODAY_STR();
    
    sheet.appendRow([
      paidId,
      teacherName,
      teacherEmail.toLowerCase().trim(),
      parseFloat(hours),
      dateStr,
      notes || '',
      adminEmail,
      createdAt
    ]);
    
    invalidateCache(CACHE_KEYS.PUNCHES);
    
    return { 
      success: true, 
      message: `${hours}h pagadas registradas para ${teacherName}`,
      paidId: paidId
    };
  } catch (error) {
    Logger.log('❌ ERROR addPaidHours: ' + error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Get all paid hours records
 */
function getAllPaidHours() {
  try {
    const sheet = SS().getSheetByName(SHEETS.PAID_HOURS);
    if (!sheet || sheet.getLastRow() < 2) return [];
    
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
    
    return data
      .filter(row => row[0])
      .map(row => ({
        paidId: String(row[0]),
        teacherName: String(row[1]),
        teacherEmail: String(row[2]),
        hours: parseFloat(row[3]) || 0,
        date: formatDateStr(row[4]),
        notes: String(row[5] || ''),
        createdBy: String(row[6] || ''),
        createdAt: formatDateStr(row[7])
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    Logger.log('❌ ERROR getAllPaidHours: ' + error.message);
    return [];
  }
}

/**
 * Get paid hours for a specific teacher
 */
function getTeacherPaidHours(teacherEmail, year) {
  try {
    const sheet = SS().getSheetByName(SHEETS.PAID_HOURS);
    if (!sheet || sheet.getLastRow() < 2) return { total: 0, records: [] };
    
    const normalizedEmail = teacherEmail.toLowerCase().trim();
    const currentYear = year || new Date().getFullYear();
    const yearStart = `${currentYear}-01-01`;
    const yearEnd = `${currentYear}-12-31`;
    
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
    
    let total = 0;
    const records = [];
    
    data.forEach(row => {
      if (String(row[2] || '').toLowerCase().trim() !== normalizedEmail) return;
      const dateStr = formatDateStr(row[4]);
      if (dateStr < yearStart || dateStr > yearEnd) return;
      
      const hours = parseFloat(row[3]) || 0;
      total += hours;
      records.push({
        paidId: String(row[0]),
        hours: hours,
        date: dateStr,
        notes: String(row[5] || '')
      });
    });
    
    return { 
      total: Math.round(total * 100) / 100, 
      records: records.sort((a, b) => b.date.localeCompare(a.date))
    };
  } catch (error) {
    Logger.log('❌ ERROR getTeacherPaidHours: ' + error.message);
    return { total: 0, records: [] };
  }
}

/**
 * Delete paid hours record
 */
function deletePaidHours(paidId, adminEmail) {
  try {
    if (!isAdmin(adminEmail)) {
      return { success: false, message: 'Solo administradores pueden eliminar horas pagadas' };
    }
    
    const sheet = SS().getSheetByName(SHEETS.PAID_HOURS);
    if (!sheet) return { success: false, message: 'Paid hours sheet not found' };
    
    const rowNum = findRowByColumnValue(SHEETS.PAID_HOURS, 0, paidId);
    
    if (rowNum && rowNum > 1) {
      sheet.deleteRow(rowNum);
      invalidateCache(CACHE_KEYS.PUNCHES);
      return { success: true, message: 'Registro de horas pagadas eliminado' };
    }
    
    return { success: false, message: 'Registro no encontrado' };
  } catch (error) {
    Logger.log('❌ ERROR deletePaidHours: ' + error.message);
    return { success: false, message: error.message };
  }
}
/**
 * Update paid hours record
 */
function updatePaidHours(paidId, hours, date, notes, adminEmail) {
  try {
    if (!isAdmin(adminEmail)) {
      return { success: false, message: 'Solo administradores pueden editar horas pagadas' };
    }
    
    if (!hours || hours <= 0) {
      return { success: false, message: 'Las horas deben ser mayor a 0' };
    }
    
    const sheet = SS().getSheetByName(SHEETS.PAID_HOURS);
    if (!sheet) return { success: false, message: 'Paid hours sheet not found' };
    
    const rowNum = findRowByColumnValue(SHEETS.PAID_HOURS, 0, paidId);
    
    if (rowNum && rowNum > 1) {
      sheet.getRange(rowNum, 4).setValue(parseFloat(hours));
      sheet.getRange(rowNum, 5).setValue(date);
      sheet.getRange(rowNum, 6).setValue(notes || '');
      
      invalidateCache(CACHE_KEYS.PUNCHES);
      
      return { success: true, message: 'Horas pagadas actualizadas correctamente' };
    }
    
    return { success: false, message: 'Registro no encontrado' };
  } catch (error) {
    Logger.log('❌ ERROR updatePaidHours: ' + error.message);
    return { success: false, message: error.message };
  }
}

// ========================================
// ACCURATE WORKING DAYS CALCULATION
// ========================================

/**
 * Pre-compute working days for the year (weekdays minus school holidays)
 * This is shared across all teachers
 */
function precomputeWorkingDays(year, asOfDate, schoolHolidayDates) {
  const today = asOfDate || new Date();
  today.setHours(0, 0, 0, 0);
  
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  
  const allWorkingDays = [];
  const passedWorkingDays = [];
  
  const current = new Date(yearStart);
  current.setHours(0, 0, 0, 0);
  
  while (current <= yearEnd) {
    const dateStr = Utilities.formatDate(current, TZ(), 'yyyy-MM-dd');
    const dayOfWeek = current.getDay();
    
    // Working day = weekday (Mon-Fri) that's not a school holiday
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    const isSchoolHoliday = schoolHolidayDates.has(dateStr);
    
    if (!isWeekend && !isSchoolHoliday) {
      allWorkingDays.push(dateStr);
      if (current <= today) {
        passedWorkingDays.push(dateStr);
      }
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  return {
    allWorkingDays: new Set(allWorkingDays),
    allWorkingDaysCount: allWorkingDays.length,
    passedWorkingDays: new Set(passedWorkingDays),
    passedWorkingDaysCount: passedWorkingDays.length
  };
}

/**
 * Calculate a specific teacher's working day progress
 * 
 * @param precomputed - base working days data
 * @param teacherHolidayDates - Set of dates where teacher has taken holidays
 * @param allocatedDays - total allocated days (Annual + Personal + School)
 */
function getTeacherWorkingDayProgress(precomputed, teacherHolidayDates, allocatedDays) {
  allocatedDays = allocatedDays || 0;
  
  let holidaysTakenOnWorkingDays = 0;
  let holidaysTakenOnPassedDays = 0;
  
  // Count holidays already taken that fall on working days
  if (teacherHolidayDates && teacherHolidayDates.size > 0) {
    teacherHolidayDates.forEach(dateStr => {
      if (precomputed.allWorkingDays.has(dateStr)) {
        holidaysTakenOnWorkingDays++;
        if (precomputed.passedWorkingDays.has(dateStr)) {
          holidaysTakenOnPassedDays++;
        }
      }
    });
  }
  
  // Total working days = base - ALL allocated days (not just taken)
  const totalWorkingDays = precomputed.allWorkingDaysCount - allocatedDays;
  
  // Passed working days = base passed - holidays already taken
  const passedWorkingDays = precomputed.passedWorkingDaysCount - holidaysTakenOnPassedDays;
  
  return {
    totalWorkingDays: Math.max(0, totalWorkingDays),
    passedWorkingDays: Math.max(0, passedWorkingDays),
    remainingWorkingDays: Math.max(0, totalWorkingDays - passedWorkingDays),
    progressRatio: totalWorkingDays > 0 ? passedWorkingDays / totalWorkingDays : 0,
    allocatedDays: allocatedDays,
    holidaysTaken: holidaysTakenOnWorkingDays
  };
}

/**
 * Build a Set of school holiday dates from the sheet
 */
function buildSchoolHolidayDateSet(year) {
  const dates = new Set();
  const data = getSheetData(SHEETS.SCHOOL_HOLIDAYS);
  if (!data) return dates;
  
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  
  data.slice(1).forEach(row => {
    if (!row[0] || !row[1]) return;
    
    const start = new Date(row[0]);
    const end = new Date(row[1]);
    const current = new Date(start);
    
    while (current <= end) {
      const dateStr = formatDateStr(current);
      if (dateStr >= yearStart && dateStr <= yearEnd) {
        dates.add(dateStr);
      }
      current.setDate(current.getDate() + 1);
    }
  });
  
  return dates;
}

/**
 * Build teacher holiday dates from approved requests
 * EXCLUDES Medical type — medical days are handled separately
 * as "medical hours" added to worked hours.
 * Returns: { "email@example.com": Set of date strings }
 */
function buildTeacherHolidayDates(holidayData, year) {
  const byEmail = {};
  if (!holidayData) return byEmail;
  
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  
  holidayData.slice(1).forEach(row => {
    // Only count approved holidays
    if (String(row[6]) !== 'Approved') return;
    
    // EXCLUDE Medical — medical days add hours instead of reducing expected
    const type = String(row[7] || 'Annual');
    if (type === 'Medical') return;
    
    const email = String(row[2] || '').toLowerCase().trim();
    if (!email) return;
    
    if (!byEmail[email]) {
      byEmail[email] = new Set();
    }
    
    const start = new Date(row[3]);
    const end = new Date(row[4]);
    const current = new Date(start);
    
    while (current <= end) {
      const dateStr = formatDateStr(current);
      if (dateStr >= yearStart && dateStr <= yearEnd) {
        byEmail[email].add(dateStr);
      }
      current.setDate(current.getDate() + 1);
    }
  });
  
  return byEmail;
}
// ========================================
// TEACHER PROGRESS SUMMARY
// ========================================

/**
 * Get teacher's progress summary with accurate working days calculation
 * Pre-subtracts allocated holiday days from total working days
 */
function getTeacherProgressSummary(teacherEmail) {
  try {
    const normalizedEmail = teacherEmail.toLowerCase().trim();
    const now = NOW();
    const currentYear = now.getFullYear();
    const yearStart = `${currentYear}-01-01`;
    const yearEnd = `${currentYear}-12-31`;
    
    // Check BOTH teachers and admins sheets
    let expectedYearlyHours = DEFAULTS.EXPECTED_YEARLY_HOURS;
    let annualTotal = DEFAULTS.ANNUAL_DAYS;
    let personalTotal = DEFAULTS.PERSONAL_DAYS;
    let schoolTotal = DEFAULTS.SCHOOL_DAYS;
    let foundUser = false;
    
    // First check Teachers sheet
    const teachersData = getSheetData(SHEETS.TEACHERS);
    if (teachersData) {
      const headers = teachersData[0];
      const cols = {
        email: findColumnIndex(headers, 'Email'),
        expected: findColumnIndex(headers, 'ExpectedYearlyHours'),
        annual: findColumnIndex(headers, 'AnnualDays'),
        personal: findColumnIndex(headers, 'PersonalDays'),
        school: findColumnIndex(headers, 'SchoolDays')
      };
      
      for (let i = 1; i < teachersData.length; i++) {
        if (String(teachersData[i][cols.email >= 0 ? cols.email : 2] || '').toLowerCase().trim() === normalizedEmail) {
          expectedYearlyHours = cols.expected >= 0 ? (parseInt(teachersData[i][cols.expected]) || DEFAULTS.EXPECTED_YEARLY_HOURS) : DEFAULTS.EXPECTED_YEARLY_HOURS;
          annualTotal = cols.annual >= 0 ? (parseInt(teachersData[i][cols.annual]) || DEFAULTS.ANNUAL_DAYS) : DEFAULTS.ANNUAL_DAYS;
          personalTotal = cols.personal >= 0 ? (parseInt(teachersData[i][cols.personal]) || DEFAULTS.PERSONAL_DAYS) : DEFAULTS.PERSONAL_DAYS;
          schoolTotal = cols.school >= 0 ? (parseInt(teachersData[i][cols.school]) || DEFAULTS.SCHOOL_DAYS) : DEFAULTS.SCHOOL_DAYS;
          foundUser = true;
          break;
        }
      }
    }
    
    // If not found in Teachers, check Admins sheet
    if (!foundUser) {
      const adminsData = getSheetData(SHEETS.ADMINS);
      if (adminsData) {
        const headers = adminsData[0];
        const cols = {
          email: findColumnIndex(headers, 'Email'),
          expected: findColumnIndex(headers, 'ExpectedYearlyHours'),
          annual: findColumnIndex(headers, 'AnnualDays'),
          personal: findColumnIndex(headers, 'PersonalDays'),
          school: findColumnIndex(headers, 'SchoolDays')
        };
        
        for (let i = 1; i < adminsData.length; i++) {
          if (String(adminsData[i][cols.email >= 0 ? cols.email : 0] || '').toLowerCase().trim() === normalizedEmail) {
            expectedYearlyHours = cols.expected >= 0 ? (parseInt(adminsData[i][cols.expected]) || ADMIN_DEFAULTS.EXPECTED_YEARLY_HOURS) : ADMIN_DEFAULTS.EXPECTED_YEARLY_HOURS;
            annualTotal = cols.annual >= 0 ? (parseInt(adminsData[i][cols.annual]) || ADMIN_DEFAULTS.ANNUAL_DAYS) : ADMIN_DEFAULTS.ANNUAL_DAYS;
            personalTotal = cols.personal >= 0 ? (parseInt(adminsData[i][cols.personal]) || ADMIN_DEFAULTS.PERSONAL_DAYS) : ADMIN_DEFAULTS.PERSONAL_DAYS;
            schoolTotal = cols.school >= 0 ? (parseInt(adminsData[i][cols.school]) || ADMIN_DEFAULTS.SCHOOL_DAYS) : ADMIN_DEFAULTS.SCHOOL_DAYS;
            foundUser = true;
            break;
          }
        }
      }
    }
    
    // Calculate allocated days
    const annualWorkingDays = Math.max(0, annualTotal - 3);
    const allocatedDays = annualWorkingDays + personalTotal + schoolTotal;
    
    // Build school holiday dates
    const schoolHolidayDates = buildSchoolHolidayDateSet(currentYear);
    
    // Pre-compute base working days
    const baseWorkingDays = precomputeWorkingDays(currentYear, now, schoolHolidayDates);
    
    // Get user's approved holidays (EXCLUDING Medical)
    const holidayData = getSheetData(SHEETS.HOLIDAY_REQUESTS) || [];
    const userHolidayDates = new Set();
    const userMedicalDates = new Set();
    
    holidayData.slice(1).forEach(row => {
      if (String(row[6]) !== 'Approved') return;
      if (String(row[2] || '').toLowerCase().trim() !== normalizedEmail) return;
      
      const type = String(row[7] || 'Annual');
      const start = new Date(row[3]);
      const end = new Date(row[4]);
      const current = new Date(start);
      
      while (current <= end) {
        const dateStr = formatDateStr(current);
        if (dateStr >= yearStart && dateStr <= yearEnd) {
          if (type === 'Medical') {
            userMedicalDates.add(dateStr);
          } else {
            userHolidayDates.add(dateStr);
          }
        }
        current.setDate(current.getDate() + 1);
      }
    });
    
    // Calculate working day progress with allocated days (excludes medical)
    const workingDayProgress = getTeacherWorkingDayProgress(baseWorkingDays, userHolidayDates, allocatedDays);
    
    // Hours per working day
    const hoursPerWorkingDay = workingDayProgress.totalWorkingDays > 0 
      ? expectedYearlyHours / workingDayProgress.totalWorkingDays 
      : 0;
    
    // Medical hours
    const medicalWorkingDays = countMedicalWorkingDaysInRange(userMedicalDates, baseWorkingDays, yearStart, yearEnd);
    const medicalHours = Math.round(medicalWorkingDays * hoursPerWorkingDay * 100) / 100;
    
    // Get total hours worked from punches
    const punchesData = getSheetData(SHEETS.TIME_PUNCHES) || [];
    const userPunches = [];
    
    punchesData.slice(1).forEach(row => {
      const rowEmail = String(row[2] || '').toLowerCase().trim();
      const punchType = String(row[5] || '').toUpperCase().trim();
      const rowDate = formatDateStr(row[3]);
      
      if (rowEmail === normalizedEmail && (punchType === 'IN' || punchType === 'OUT')) {
        if (rowDate >= yearStart && rowDate <= yearEnd) {
          userPunches.push({
            date: rowDate,
            time: formatTimeValue(row[4]),
            punchType: punchType
          });
        }
      }
    });
    
    const totalHoursWorked = calculateHoursFromPunches(userPunches, yearStart, yearEnd);
    
    // Subtract paid hours
    let paidHours = 0;
    const paidHoursSheet = SS().getSheetByName(SHEETS.PAID_HOURS);
    if (paidHoursSheet && paidHoursSheet.getLastRow() > 1) {
      const paidData = paidHoursSheet.getRange(2, 1, paidHoursSheet.getLastRow() - 1, 5).getValues();
      paidData.forEach(row => {
        const email = String(row[2] || '').toLowerCase().trim();
        const dateStr = formatDateStr(row[4]);
        const hours = parseFloat(row[3]) || 0;
        
        if (email === normalizedEmail && dateStr >= yearStart && dateStr <= yearEnd) {
          paidHours += hours;
        }
      });
    }
    
    // MedAppt hours
    const medApptHours = getMedApptHoursInRange(holidayData, normalizedEmail, yearStart, yearEnd);
    
    // Final: punched - paid + medical (sick days) + medAppt
    const totalHours = totalHoursWorked - paidHours + medicalHours + medApptHours;
    
    // Calculate expected hours and progress
    const expectedHoursToDate = expectedYearlyHours * workingDayProgress.progressRatio;
    const progressPercent = expectedHoursToDate > 0 
      ? (totalHours / expectedHoursToDate) * 100 
      : (totalHours > 0 ? 100 : 0);
    
    return {
      success: true,
      totalHours: Math.round(totalHours * 10) / 10,
      totalHoursWorked: Math.round(totalHoursWorked * 10) / 10,
      medicalHours: medicalHours,
      medicalWorkingDays: medicalWorkingDays,
      medApptHours: medApptHours,
      paidHours: Math.round(paidHours * 10) / 10,
      expectedHoursToDate: Math.round(expectedHoursToDate * 10) / 10,
      expectedYearlyHours: expectedYearlyHours,
      progressPercent: Math.round(progressPercent * 10) / 10,
      allocatedDays: allocatedDays,
      totalWorkingDays: workingDayProgress.totalWorkingDays
    };
  } catch (error) {
    Logger.log('❌ ERROR getTeacherProgressSummary: ' + error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Add punch with user-level locking to prevent race conditions
 */
function addPunch(teacherEmail, teacherName, dateStr, timeStr, notes) {
  try {
    if (isFutureDate(dateStr)) return { success: false, message: 'Cannot add punches for future dates' };
    if (!isValidTime(timeStr)) return { success: false, message: 'Invalid time format. Use HH:MM (e.g., 09:30)' };
    
    // Get a user-specific lock
    const lock = LockService.getUserLock();
    
    // Try to acquire lock (wait up to 10 seconds)
    if (!lock.tryLock(10000)) {
      return { success: false, message: 'Sistema ocupado. Por favor intenta de nuevo.' };
    }
    
    try {
      const sheet = SS().getSheetByName(SHEETS.TIME_PUNCHES);
      if (!sheet) throw new Error('Time_Punches sheet not found');
      
      const existingPunches = getPunchesForDay(teacherEmail, dateStr);

      // Prevent duplicate punches within 2 minutes
      const [newH, newM] = timeStr.split(':').map(Number);
      const newTotalMinutes = newH * 60 + newM;
      
      const isDuplicate = existingPunches.some(p => {
        const [existH, existM] = p.time.split(':').map(Number);
        const existTotalMinutes = existH * 60 + existM;
        const diffMinutes = Math.abs(newTotalMinutes - existTotalMinutes);
        return diffMinutes < 2;
      });
      
      if (isDuplicate) {
        return { 
          success: false, 
          message: 'Ya existe un fichaje a esta hora o muy cercano (menos de 2 minutos)' 
        };
      }
      
      const punchType = existingPunches.length % 2 === 0 ? 'IN' : 'OUT';
      
      // More unique ID: timestamp + random
      const punchId = 'PUNCH_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      const createdAt = Utilities.formatDate(NOW(), TZ(), 'yyyy-MM-dd HH:mm:ss');
      
      sheet.appendRow([punchId, teacherName, teacherEmail.toLowerCase().trim(), dateStr, timeStr, punchType, createdAt, '', notes || '']);
      
      // Invalidate cache
      invalidateCache(CACHE_KEYS.PUNCHES);
      
      return {
        success: true,
        message: 'Punched ' + punchType + ' at ' + timeStr,
        punch: { punchId, teacherName, date: dateStr, time: timeStr, punchType, notes: notes || '' }
      };
      
    } finally {
      // Always release the lock
      lock.releaseLock();
    }
    
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return { success: false, message: error.message };
  }
}
function getAdminWorkerByEmail(email) {
  const data = getSheetData(SHEETS.ADMINS);
  if (!data) return null;
  
  const headers = data[0];
  const emailCol = findColumnIndex(headers, 'Email');
  const nameCol = findColumnIndex(headers, 'Name');
  const statusCol = findColumnIndex(headers, 'Status');
  
  const normalizedEmail = email.toLowerCase().trim();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][emailCol >= 0 ? emailCol : 0] || '').toLowerCase().trim() === normalizedEmail && 
        data[i][statusCol >= 0 ? statusCol : 2] === 'Active') {
      return { 
        id: 'A' + String(i).padStart(3, '0'), 
        name: data[i][nameCol >= 0 ? nameCol : 1], 
        email: normalizedEmail,
        isAdmin: true
      };
    }
  }
  return null;
}

function getAllAdminWorkersWithHours(year, month, weekOffset) {
  try {
    weekOffset = weekOffset || 0;
    
    const adminsData = getSheetData(SHEETS.ADMINS);
    const punchesData = getSheetData(SHEETS.TIME_PUNCHES) || [];
    const holidayData = getSheetData(SHEETS.HOLIDAY_REQUESTS) || [];
    
    if (!adminsData) return { admins: [], monthName: '' };
    
    const headers = adminsData[0];
    const cols = {
      email: findColumnIndex(headers, 'Email'),
      name: findColumnIndex(headers, 'Name'),
      status: findColumnIndex(headers, 'Status'),
      annual: findColumnIndex(headers, 'AnnualDays'),
      personal: findColumnIndex(headers, 'PersonalDays'),
      school: findColumnIndex(headers, 'SchoolDays'),
      expected: findColumnIndex(headers, 'ExpectedYearlyHours'),
      medApptHours: findColumnIndex(headers, 'MedApptHours')
    };
    
    const now = NOW();
    
    const monthStart = Utilities.formatDate(new Date(year, month - 1, 1), TZ(), 'yyyy-MM-dd');
    const monthEnd = Utilities.formatDate(new Date(year, month, 0), TZ(), 'yyyy-MM-dd');
    const yearStart = year + '-01-01';
    const yearEnd = year + '-12-31';
    const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    const isCurrentMonth = (year === now.getFullYear() && month === now.getMonth() + 1);
    
    // Calculate week bounds
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + (weekOffset * 7));
    const weekBounds = getWeekBounds(baseDate);
    const weekStart = weekBounds.start;
    const weekEnd = weekBounds.end;
    
    const schoolHolidayDates = buildSchoolHolidayDateSet(year);
    const progressDate = isCurrentMonth ? now : new Date(year, month, 0);
    const baseWorkingDays = precomputeWorkingDays(year, progressDate, schoolHolidayDates);
    const adminHolidayDatesByEmail = buildTeacherHolidayDates(holidayData, year);
    const medicalDatesByEmail = buildMedicalDates(holidayData, year);
    const medApptByEmail = buildMedApptHoursByEmail(holidayData, yearStart, yearEnd);
    
    // Pre-process punches
    const punchesByEmail = {};
    punchesData.slice(1).forEach(row => {
      const email = String(row[2] || '').toLowerCase().trim();
      if (!email) return;
      
      const punchType = String(row[5] || '').toUpperCase().trim();
      const rowDate = formatDateStr(row[3]);
      
      if (punchType === 'IN' || punchType === 'OUT') {
        if (!punchesByEmail[email]) punchesByEmail[email] = [];
        punchesByEmail[email].push({
          date: rowDate,
          time: formatTimeValue(row[4]),
          punchType: punchType
        });
      }
    });
    
    // Pre-process holidays
    const holidaysByEmail = {};
    holidayData.slice(1).forEach(row => {
      const email = String(row[2] || '').toLowerCase().trim();
      if (!email) return;
      
      const days = parseFloat(row[5]) || 0;
      const status = String(row[6]);
      const type = String(row[7] || 'Annual');
      
      if (!holidaysByEmail[email]) {
        holidaysByEmail[email] = { 
          annualUsed: 0, annualPending: 0, 
          personalUsed: 0, personalPending: 0, 
          schoolUsed: 0, 
          medicalUsed: 0, medicalPending: 0,
          medApptUsed: 0, medApptPending: 0,
          permisoUsed: 0, permisoPending: 0
        };
      }
      
      const h = holidaysByEmail[email];
      if (type === 'Annual') {
        if (status === 'Approved') h.annualUsed += days;
        else if (status === 'Pending') h.annualPending += days;
      } else if (type === 'Personal') {
        if (status === 'Approved') h.personalUsed += days;
        else if (status === 'Pending') h.personalPending += days;
      } else if (type === 'School' && status === 'Approved') {
        h.schoolUsed += days;
      } else if (type === 'Medical') {
        if (status === 'Approved') h.medicalUsed += days;
        else if (status === 'Pending') h.medicalPending += days;
      } else if (type === 'MedAppt') {
        if (status === 'Approved') h.medApptUsed += days;
        else if (status === 'Pending') h.medApptPending += days;
      } else if (type === 'Permiso') {
        if (status === 'Approved') h.permisoUsed += days;
        else if (status === 'Pending') h.permisoPending += days;
      }
    });
    
    // Pre-process paid hours
    const paidByEmail = { year: {}, month: {}, week: {} };
    const paidHoursSheet = SS().getSheetByName(SHEETS.PAID_HOURS);
    if (paidHoursSheet && paidHoursSheet.getLastRow() > 1) {
      const paidData = paidHoursSheet.getRange(2, 1, paidHoursSheet.getLastRow() - 1, 5).getValues();
      paidData.forEach(row => {
        const email = String(row[2] || '').toLowerCase().trim();
        const dateStr = formatDateStr(row[4]);
        const hours = parseFloat(row[3]) || 0;
        
        if (dateStr >= yearStart && dateStr <= yearEnd) {
          if (!paidByEmail.year[email]) paidByEmail.year[email] = 0;
          paidByEmail.year[email] += hours;
        }
        if (dateStr >= monthStart && dateStr <= monthEnd) {
          if (!paidByEmail.month[email]) paidByEmail.month[email] = 0;
          paidByEmail.month[email] += hours;
        }
        if (dateStr >= weekStart && dateStr <= weekEnd) {
          if (!paidByEmail.week[email]) paidByEmail.week[email] = 0;
          paidByEmail.week[email] += hours;
        }
      });
    }
    
    let totalProgress = 0, adminsOnTrack = 0, adminsBehind = 0;
    
    const admins = adminsData.slice(1)
      .filter(row => row[cols.status >= 0 ? cols.status : 2] === 'Active')
      .map(row => {
        const email = String(row[cols.email >= 0 ? cols.email : 0] || '').toLowerCase().trim();
        const name = String(row[cols.name >= 0 ? cols.name : 1]);
        
        const annualTotal = cols.annual >= 0 ? (parseInt(row[cols.annual]) || ADMIN_DEFAULTS.ANNUAL_DAYS) : ADMIN_DEFAULTS.ANNUAL_DAYS;
        const personalTotal = cols.personal >= 0 ? (parseInt(row[cols.personal]) || ADMIN_DEFAULTS.PERSONAL_DAYS) : ADMIN_DEFAULTS.PERSONAL_DAYS;
        const schoolTotal = cols.school >= 0 ? (parseInt(row[cols.school]) || ADMIN_DEFAULTS.SCHOOL_DAYS) : ADMIN_DEFAULTS.SCHOOL_DAYS;
        const expectedYearlyHours = cols.expected >= 0 ? (parseInt(row[cols.expected]) || ADMIN_DEFAULTS.EXPECTED_YEARLY_HOURS) : ADMIN_DEFAULTS.EXPECTED_YEARLY_HOURS;
        
        const adminPunches = punchesByEmail[email] || [];
        
        const monthlyHoursWorked = calculateHoursFromPunches(adminPunches, monthStart, monthEnd);
        const weeklyHoursWorked = calculateHoursFromPunches(adminPunches, weekStart, weekEnd);
        const totalHoursWorked = calculateHoursFromPunches(adminPunches, yearStart, monthEnd);
        
        const paidHoursYear = paidByEmail.year[email] || 0;
        const paidHoursMonth = paidByEmail.month[email] || 0;
        const paidHoursWeek = paidByEmail.week[email] || 0;
        
        // Progress calculation
        const annualWorkingDays = Math.max(0, annualTotal - 3);
        const allocatedDays = annualWorkingDays + personalTotal + schoolTotal;
        const adminHolidayDates = adminHolidayDatesByEmail[email] || new Set();
        const workingDayProgress = getTeacherWorkingDayProgress(baseWorkingDays, adminHolidayDates, allocatedDays);
        
        const hoursPerWorkingDay = workingDayProgress.totalWorkingDays > 0 
          ? expectedYearlyHours / workingDayProgress.totalWorkingDays 
          : 0;
        
        // Medical hours
        const adminMedicalDates = medicalDatesByEmail[email] || new Set();
        const medicalWorkingDaysYear = countMedicalWorkingDaysInRange(adminMedicalDates, baseWorkingDays, yearStart, monthEnd);
        const medicalWorkingDaysMonth = countMedicalWorkingDaysInRange(adminMedicalDates, baseWorkingDays, monthStart, monthEnd);
        const medicalWorkingDaysWeek = countMedicalWorkingDaysInRange(adminMedicalDates, baseWorkingDays, weekStart, weekEnd);
        
        const medicalHoursYear = Math.round(medicalWorkingDaysYear * hoursPerWorkingDay * 100) / 100;
        const medicalHoursMonth = Math.round(medicalWorkingDaysMonth * hoursPerWorkingDay * 100) / 100;
        const medicalHoursWeek = Math.round(medicalWorkingDaysWeek * hoursPerWorkingDay * 100) / 100;
        
        // MedAppt hours
        const adminMedAppt = medApptByEmail[email] || { total: 0, records: [] };
        const medApptHoursYear = adminMedAppt.total;
        const medApptHoursMonth = getMedApptHoursFromRecords(adminMedAppt.records, monthStart, monthEnd);
        const medApptHoursWeek = getMedApptHoursFromRecords(adminMedAppt.records, weekStart, weekEnd);
        
        // Final hours = punched - paid + medical + medAppt
        const monthlyHours = monthlyHoursWorked - paidHoursMonth + medicalHoursMonth + medApptHoursMonth;
        const weeklyHours = weeklyHoursWorked - paidHoursWeek + medicalHoursWeek + medApptHoursWeek;
        const totalHours = totalHoursWorked - paidHoursYear + medicalHoursYear + medApptHoursYear;
        
        const expectedHoursToDate = expectedYearlyHours * workingDayProgress.progressRatio;
        const progressPercent = expectedHoursToDate > 0 
          ? (totalHours / expectedHoursToDate) * 100 
          : (totalHours > 0 ? 100 : 0);
        
        const expectedWeeklyHours = Math.round(hoursPerWorkingDay * 5 * 10) / 10;
        
        totalProgress += progressPercent;
        if (progressPercent >= 98) adminsOnTrack++;
        else adminsBehind++;
        
        const holidays = holidaysByEmail[email] || { 
          annualUsed: 0, annualPending: 0, 
          personalUsed: 0, personalPending: 0, 
          schoolUsed: 0, 
          medicalUsed: 0, medicalPending: 0,
          medApptUsed: 0, medApptPending: 0,
          permisoUsed: 0, permisoPending: 0
        };
        
        return {
          id: 'A' + String(adminsData.indexOf(row)).padStart(3, '0'),
          name: name,
          email: email,
          isAdmin: true,
          monthlyHours: monthlyHours,
          weeklyHours: weeklyHours,
          totalHoursWorked: totalHoursWorked,
          totalHours: totalHours,
          paidHours: Math.round(paidHoursYear * 100) / 100,
          paidHoursMonth: Math.round(paidHoursMonth * 100) / 100,
          paidHoursWeek: Math.round(paidHoursWeek * 100) / 100,
          medicalHours: medicalHoursYear,
          medicalHoursMonth: medicalHoursMonth,
          medicalHoursWeek: medicalHoursWeek,
          medicalWorkingDays: medicalWorkingDaysYear,
          expectedWeeklyHours: expectedWeeklyHours,
          expectedYearlyHours: expectedYearlyHours,
          expectedHoursToDate: Math.round(expectedHoursToDate * 10) / 10,
          progressPercent: Math.round(progressPercent * 10) / 10,
          totalWorkingDays: workingDayProgress.totalWorkingDays,
          workingDaysPassed: workingDayProgress.passedWorkingDays,
          workingDaysRemaining: workingDayProgress.remainingWorkingDays,
          hoursPerWorkingDay: Math.round(hoursPerWorkingDay * 100) / 100,
          annualTotal: annualTotal,
          annualUsed: holidays.annualUsed,
          annualPending: holidays.annualPending,
          annualRemaining: annualTotal - holidays.annualUsed - holidays.annualPending,
          personalTotal: personalTotal,
          personalUsed: holidays.personalUsed,
          personalPending: holidays.personalPending,
          personalRemaining: personalTotal - holidays.personalUsed - holidays.personalPending,
          schoolTotal: schoolTotal,
          schoolUsed: holidays.schoolUsed,
          medicalUsed: holidays.medicalUsed,
          medicalPending: holidays.medicalPending,
          permisoUsed: holidays.permisoUsed,
          permisoPending: holidays.permisoPending,
          
          // MedAppt
          medApptTotal: cols.medApptHours >= 0 ? (parseFloat(row[cols.medApptHours]) || ADMIN_DEFAULTS.MEDICAL_APPT_HOURS) : ADMIN_DEFAULTS.MEDICAL_APPT_HOURS,
          medApptUsed: Math.round((holidays.medApptUsed || 0) * 100) / 100,
          medApptPending: Math.round((holidays.medApptPending || 0) * 100) / 100,
          medApptHours: medApptHoursYear,
          medApptHoursMonth: medApptHoursMonth,
          medApptHoursWeek: medApptHoursWeek,
          
          prepTimeYearly: 0,
          prepTimeTotal: 0,
          prepTimeWeeksLogged: 0,
          prepTimeProgress: 0
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    
    return {
      admins: admins,
      monthName: monthName,
      year: year,
      month: month,
      isCurrentMonth: isCurrentMonth,
      avgProgress: admins.length > 0 ? totalProgress / admins.length : 0,
      adminsOnTrack: adminsOnTrack,
      adminsBehind: adminsBehind,
      weekStart: weekStart,
      weekEnd: weekEnd,
      weekOffset: weekOffset
    };
  } catch (error) {
    Logger.log('❌ ERROR getAllAdminWorkersWithHours: ' + error.message);
    return { admins: [], monthName: '', error: error.message };
  }
}

function getAdminWorkerSettings(adminEmail) {
  try {
    const data = getSheetData(SHEETS.ADMINS);
    if (!data) return { success: false, message: 'Admins sheet not found' };
    
    const headers = data[0];
    const normalizedEmail = adminEmail.toLowerCase().trim();
    
    const cols = {
      email: findColumnIndex(headers, 'Email'),
      name: findColumnIndex(headers, 'Name'),
      status: findColumnIndex(headers, 'Status'),
      annual: findColumnIndex(headers, 'AnnualDays'),
      personal: findColumnIndex(headers, 'PersonalDays'),
      school: findColumnIndex(headers, 'SchoolDays'),
      expected: findColumnIndex(headers, 'ExpectedYearlyHours'),
      medApptHours: findColumnIndex(headers, 'MedApptHours')
    };
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][cols.email >= 0 ? cols.email : 0] || '').toLowerCase().trim() === normalizedEmail) {
        return {
          success: true,
          admin: {
            rowNumber: i + 1,
            name: data[i][cols.name >= 0 ? cols.name : 1] || '',
            email: normalizedEmail,
            status: data[i][cols.status >= 0 ? cols.status : 2] || 'Active',
            annualDays: cols.annual >= 0 ? (parseInt(data[i][cols.annual]) || ADMIN_DEFAULTS.ANNUAL_DAYS) : ADMIN_DEFAULTS.ANNUAL_DAYS,
            personalDays: cols.personal >= 0 ? (parseInt(data[i][cols.personal]) || ADMIN_DEFAULTS.PERSONAL_DAYS) : ADMIN_DEFAULTS.PERSONAL_DAYS,
            schoolDays: cols.school >= 0 ? (parseInt(data[i][cols.school]) || ADMIN_DEFAULTS.SCHOOL_DAYS) : ADMIN_DEFAULTS.SCHOOL_DAYS,
            expectedYearlyHours: cols.expected >= 0 ? (parseInt(data[i][cols.expected]) || ADMIN_DEFAULTS.EXPECTED_YEARLY_HOURS) : ADMIN_DEFAULTS.EXPECTED_YEARLY_HOURS,
            medApptHours: cols.medApptHours >= 0 
              ? (parseFloat(data[i][cols.medApptHours]) || ADMIN_DEFAULTS.MEDICAL_APPT_HOURS) 
              : ADMIN_DEFAULTS.MEDICAL_APPT_HOURS,
            prepTimeYearly: 0,
            prepTimeWeekly: 0
          }
        };
      }
    }
    return { success: false, message: 'Admin not found' };
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return { success: false, message: error.message };
  }
}

function updateAdminWorkerSettings(adminEmail, settings) {
  try {
    const sheet = SS().getSheetByName(SHEETS.ADMINS);
    if (!sheet) return { success: false, message: 'Admins sheet not found' };
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const normalizedEmail = adminEmail.toLowerCase().trim();
    
    let emailCol = headers.indexOf('Email');
    if (emailCol === -1) emailCol = 0;
    
    // Ensure columns exist
    const requiredCols = ['AnnualDays', 'PersonalDays', 'SchoolDays', 'ExpectedYearlyHours', 'MedApptHours'];
    let lastCol = sheet.getLastColumn();
    
    requiredCols.forEach(colName => {
      if (headers.indexOf(colName) === -1) {
        lastCol++;
        sheet.getRange(1, lastCol).setValue(colName).setBackground('#092b50').setFontColor('#ffffff').setFontWeight('bold');
      }
    });
    
    const updatedHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const cols = {
      annual: updatedHeaders.indexOf('AnnualDays') + 1,
      personal: updatedHeaders.indexOf('PersonalDays') + 1,
      school: updatedHeaders.indexOf('SchoolDays') + 1,
      expected: updatedHeaders.indexOf('ExpectedYearlyHours') + 1,
      medApptHours: updatedHeaders.indexOf('MedApptHours') + 1
    };
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][emailCol] || '').toLowerCase().trim() === normalizedEmail) {
        const rowNum = i + 1;
        if (settings.annualDays !== undefined && cols.annual > 0) 
          sheet.getRange(rowNum, cols.annual).setValue(parseInt(settings.annualDays) || ADMIN_DEFAULTS.ANNUAL_DAYS);
        if (settings.personalDays !== undefined && cols.personal > 0) 
          sheet.getRange(rowNum, cols.personal).setValue(parseInt(settings.personalDays) || ADMIN_DEFAULTS.PERSONAL_DAYS);
        if (settings.schoolDays !== undefined && cols.school > 0) 
          sheet.getRange(rowNum, cols.school).setValue(parseInt(settings.schoolDays) || ADMIN_DEFAULTS.SCHOOL_DAYS);
        if (settings.expectedYearlyHours !== undefined && cols.expected > 0) 
          sheet.getRange(rowNum, cols.expected).setValue(parseInt(settings.expectedYearlyHours) || ADMIN_DEFAULTS.EXPECTED_YEARLY_HOURS);
        if (settings.medApptHours !== undefined && cols.medApptHours > 0) 
          sheet.getRange(rowNum, cols.medApptHours).setValue(parseFloat(settings.medApptHours) || ADMIN_DEFAULTS.MEDICAL_APPT_HOURS);
        
        invalidateCache(CACHE_KEYS.TEACHERS);
        
        return { success: true, message: 'Configuración actualizada para ' + data[i][1] };
      }
    }
    return { success: false, message: 'Admin not found' };
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return { success: false, message: error.message };
  }
}
// ========================================
// ADMIN WORKERS HOLIDAY STATUS
// ========================================

function getAllAdminWorkersHolidayStatus() {
  try {
    const adminsData = getSheetData(SHEETS.ADMINS);
    const holidayData = getSheetData(SHEETS.HOLIDAY_REQUESTS);
    if (!adminsData) return [];
    
    const headers = adminsData[0];
    const cols = {
      email: findColumnIndex(headers, 'Email'),
      name: findColumnIndex(headers, 'Name'),
      status: findColumnIndex(headers, 'Status'),
      annual: findColumnIndex(headers, 'AnnualDays'),
      personal: findColumnIndex(headers, 'PersonalDays'),
      school: findColumnIndex(headers, 'SchoolDays'),
      medApptHours: findColumnIndex(headers, 'MedApptHours')
    };
    
    const holidayByEmail = {};
    if (holidayData) {
      holidayData.slice(1).forEach(row => {
        const email = String(row[2] || '').toLowerCase().trim();
        const days = parseFloat(row[5]) || 0;
        const status = String(row[6]);
        const type = String(row[7] || 'Annual');
        
        if (!holidayByEmail[email]) {
          holidayByEmail[email] = { 
            annualUsed: 0, annualPending: 0, 
            personalUsed: 0, personalPending: 0, 
            schoolUsed: 0, 
            medicalUsed: 0, medicalPending: 0,
            medApptUsed: 0, medApptPending: 0,
            permisoUsed: 0, permisoPending: 0
          };
        }
        
        const h = holidayByEmail[email];
        if (type === 'Annual') status === 'Approved' ? h.annualUsed += days : status === 'Pending' && (h.annualPending += days);
        else if (type === 'Personal') status === 'Approved' ? h.personalUsed += days : status === 'Pending' && (h.personalPending += days);
        else if (type === 'School' && status === 'Approved') h.schoolUsed += days;
        else if (type === 'Medical') status === 'Approved' ? h.medicalUsed += days : status === 'Pending' && (h.medicalPending += days);
        else if (type === 'MedAppt') {
          status === 'Approved' ? h.medApptUsed += days : status === 'Pending' && (h.medApptPending += days);
        }
        else if (type === 'Permiso') status === 'Approved' ? h.permisoUsed += days : status === 'Pending' && (h.permisoPending += days);
      });
    }
    
    return adminsData.slice(1)
      .filter(row => row[cols.status >= 0 ? cols.status : 2] === 'Active')
      .map(row => {
        const email = String(row[cols.email >= 0 ? cols.email : 0] || '').toLowerCase().trim();
        const annualTotal = cols.annual >= 0 ? (parseInt(row[cols.annual]) || ADMIN_DEFAULTS.ANNUAL_DAYS) : ADMIN_DEFAULTS.ANNUAL_DAYS;
        const personalTotal = cols.personal >= 0 ? (parseInt(row[cols.personal]) || ADMIN_DEFAULTS.PERSONAL_DAYS) : ADMIN_DEFAULTS.PERSONAL_DAYS;
        const schoolTotal = cols.school >= 0 ? (parseInt(row[cols.school]) || ADMIN_DEFAULTS.SCHOOL_DAYS) : ADMIN_DEFAULTS.SCHOOL_DAYS;
        const medApptTotal = cols.medApptHours >= 0 ? (parseFloat(row[cols.medApptHours]) || ADMIN_DEFAULTS.MEDICAL_APPT_HOURS) : ADMIN_DEFAULTS.MEDICAL_APPT_HOURS;
        const usage = holidayByEmail[email] || { 
          annualUsed: 0, annualPending: 0, 
          personalUsed: 0, personalPending: 0, 
          schoolUsed: 0, 
          medicalUsed: 0, medicalPending: 0,
          medApptUsed: 0, medApptPending: 0,
          permisoUsed: 0, permisoPending: 0
        };
        
        return {
          name: String(row[cols.name >= 0 ? cols.name : 1]),
          email,
          isAdmin: true,
          annualTotal, annualUsed: usage.annualUsed, annualPending: usage.annualPending,
          annualRemaining: annualTotal - usage.annualUsed - usage.annualPending,
          personalTotal, personalUsed: usage.personalUsed, personalPending: usage.personalPending,
          personalRemaining: personalTotal - usage.personalUsed - usage.personalPending,
          schoolTotal, schoolUsed: usage.schoolUsed, schoolRemaining: schoolTotal - usage.schoolUsed,
          medicalUsed: usage.medicalUsed, medicalPending: usage.medicalPending,
          permisoUsed: usage.permisoUsed, permisoPending: usage.permisoPending,
          medApptTotal: medApptTotal,
          medApptUsed: Math.round((usage.medApptUsed || 0) * 100) / 100,
          medApptPending: Math.round((usage.medApptPending || 0) * 100) / 100,
          medApptRemaining: Math.round((medApptTotal - (usage.medApptUsed || 0) - (usage.medApptPending || 0)) * 100) / 100,
          puenteDays: DEFAULTS.PUENTE_DAYS
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    Logger.log('❌ ERROR getAllAdminWorkersHolidayStatus: ' + error.message);
    return [];
  }
}
function addNewAdmin(adminData) {
  try {
    if (!adminData.name?.trim()) return { success: false, message: 'Admin name is required' };
    if (!adminData.email?.trim()) return { success: false, message: 'Admin email is required' };
    
    const sheet = SS().getSheetByName(SHEETS.ADMINS);
    if (!sheet) return { success: false, message: 'Admins sheet not found.' };
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    // Check duplicate email
    const emailCol = findColumnIndex(headers, 'Email');
    const normalizedEmail = adminData.email.toLowerCase().trim();
    if (data.slice(1).some(row => String(row[emailCol >= 0 ? emailCol : 0] || '').toLowerCase().trim() === normalizedEmail)) {
      return { success: false, message: 'An admin with this email already exists' };
    }
    
    // Ensure required columns exist
    const requiredCols = ['Email', 'Name', 'Status', 'AnnualDays', 'PersonalDays', 'SchoolDays', 'ExpectedYearlyHours', 'MedApptHours'];
    let lastCol = sheet.getLastColumn();
    
    requiredCols.forEach(colName => {
      if (headers.indexOf(colName) === -1) {
        lastCol++;
        sheet.getRange(1, lastCol).setValue(colName).setBackground('#092b50').setFontColor('#ffffff').setFontWeight('bold');
        headers.push(colName);
        
        // Set default values for existing rows
        const defaultVal = colName === 'MedApptHours' ? ADMIN_DEFAULTS.MEDICAL_APPT_HOURS :
                          colName === 'AnnualDays' ? ADMIN_DEFAULTS.ANNUAL_DAYS :
                          colName === 'PersonalDays' ? ADMIN_DEFAULTS.PERSONAL_DAYS :
                          colName === 'SchoolDays' ? ADMIN_DEFAULTS.SCHOOL_DAYS :
                          colName === 'ExpectedYearlyHours' ? ADMIN_DEFAULTS.EXPECTED_YEARLY_HOURS : '';
        
        if (defaultVal !== '' && sheet.getLastRow() > 1) {
          for (let row = 2; row <= sheet.getLastRow(); row++) {
            sheet.getRange(row, lastCol).setValue(defaultVal);
          }
        }
      }
    });
    
    // Re-read headers after potentially adding columns
    const finalHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    const newRow = finalHeaders.map(header => {
      switch(header) {
        case 'Email': return normalizedEmail;
        case 'Name': return adminData.name.trim().toUpperCase();
        case 'Status': return adminData.status || 'Active';
        case 'AnnualDays': return parseInt(adminData.annualDays) || ADMIN_DEFAULTS.ANNUAL_DAYS;
        case 'PersonalDays': return parseInt(adminData.personalDays) || ADMIN_DEFAULTS.PERSONAL_DAYS;
        case 'SchoolDays': return parseInt(adminData.schoolDays) || ADMIN_DEFAULTS.SCHOOL_DAYS;
        case 'ExpectedYearlyHours': return parseInt(adminData.expectedYearlyHours) || ADMIN_DEFAULTS.EXPECTED_YEARLY_HOURS;
        case 'MedApptHours': return parseFloat(adminData.medApptHours) || ADMIN_DEFAULTS.MEDICAL_APPT_HOURS;
        default: return '';
      }
    });
    
    sheet.appendRow(newRow);
    
    // Invalidate cache
    invalidateCache(CACHE_KEYS.TEACHERS);
    
    return { success: true, message: `Admin "${adminData.name.toUpperCase()}" añadido correctamente!` };
  } catch (error) {
    Logger.log('❌ ERROR: ' + error.message);
    return { success: false, message: error.message };
  }
}
function isSuperAdmin(email) {
  const data = getSheetData(SHEETS.ADMINS);
  if (!data) return false;
  
  const headers = data[0];
  const emailCol = findColumnIndex(headers, 'Email');
  const statusCol = findColumnIndex(headers, 'Status');
  const superAdminCol = findColumnIndex(headers, 'SuperAdmin');
  
  // If SuperAdmin column doesn't exist, no one is super admin
  if (superAdminCol === -1) return false;
  
  const normalizedEmail = email.toLowerCase().trim();
  
  for (let i = 1; i < data.length; i++) {
    const rowEmail = String(data[i][emailCol >= 0 ? emailCol : 0] || '').toLowerCase().trim();
    const rowStatus = data[i][statusCol >= 0 ? statusCol : 2];
    const rowSuperAdmin = data[i][superAdminCol];
    
    if (rowEmail === normalizedEmail && rowStatus === 'Active') {
      return rowSuperAdmin === true || rowSuperAdmin === 'TRUE' || rowSuperAdmin === 'true';
    }
  }
  
  return false;
}

function debugSchoolHolidays2026() {
  const schoolHolidayDates = buildSchoolHolidayDateSet(2026);
  
  Logger.log('Total school holiday dates: ' + schoolHolidayDates.size);
  Logger.log('');
  Logger.log('All school holidays in 2026:');
  
  const sorted = Array.from(schoolHolidayDates).sort();
  sorted.forEach(d => {
    const date = new Date(d);
    const dow = date.getDay();
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow];
    const isWeekend = (dow === 0 || dow === 6);
    Logger.log(`  ${d} (${dayName}) ${isWeekend ? '← WEEKEND' : ''}`);
  });
  
  // Count only weekday holidays
  let weekdayHolidays = 0;
  sorted.forEach(d => {
    const dow = new Date(d).getDay();
    if (dow !== 0 && dow !== 6) weekdayHolidays++;
  });
  
  Logger.log('');
  Logger.log('School holidays on weekdays: ' + weekdayHolidays);
  Logger.log('Expected working days: 261 - ' + weekdayHolidays + ' = ' + (261 - weekdayHolidays));
}
/**
 * Build teacher holiday dates from approved requests
 * EXCLUDES Medical type — medical days are handled separately
 * as "medical hours" added to worked hours.
 * Returns: { "email@example.com": Set of date strings }
 */
function buildTeacherHolidayDates(holidayData, year) {
  const byEmail = {};
  if (!holidayData) return byEmail;
  
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  
  holidayData.slice(1).forEach(row => {
    // Only count approved holidays
    if (String(row[6]) !== 'Approved') return;
    
    // EXCLUDE Medical — medical days add hours instead of reducing expected
    const type = String(row[7] || 'Annual');
    if (type === 'Medical') return;
    
    const email = String(row[2] || '').toLowerCase().trim();
    if (!email) return;
    
    if (!byEmail[email]) {
      byEmail[email] = new Set();
    }
    
    const start = new Date(row[3]);
    const end = new Date(row[4]);
    const current = new Date(start);
    
    while (current <= end) {
      const dateStr = formatDateStr(current);
      if (dateStr >= yearStart && dateStr <= yearEnd) {
        byEmail[email].add(dateStr);
      }
      current.setDate(current.getDate() + 1);
    }
  });
  
  return byEmail;
}
/**
 * Get approved MedAppt hours for a teacher within a date range
 */
function getMedApptHoursInRange(holidayData, email, startDate, endDate) {
  if (!holidayData) return 0;
  
  const normalizedEmail = email.toLowerCase().trim();
  let totalHours = 0;
  
  holidayData.slice(1).forEach(row => {
    if (String(row[2] || '').toLowerCase().trim() !== normalizedEmail) return;
    if (String(row[6]) !== 'Approved') return;
    if (String(row[7]) !== 'MedAppt') return;
    
    const dateStr = formatDateStr(row[3]);
    if (startDate && dateStr < startDate) return;
    if (endDate && dateStr > endDate) return;
    
    // TotalDays column stores hours for MedAppt
    totalHours += parseFloat(row[5]) || 0;
  });
  
  return Math.round(totalHours * 100) / 100;
}

/**
 * Pre-process MedAppt hours by email for all teachers at once
 */
function buildMedApptHoursByEmail(holidayData, yearStart, yearEnd) {
  const byEmail = {};
  if (!holidayData) return byEmail;
  
  holidayData.slice(1).forEach(row => {
    if (String(row[6]) !== 'Approved') return;
    if (String(row[7]) !== 'MedAppt') return;
    
    const email = String(row[2] || '').toLowerCase().trim();
    if (!email) return;
    
    const dateStr = formatDateStr(row[3]);
    if (dateStr < yearStart || dateStr > yearEnd) return;
    
    if (!byEmail[email]) byEmail[email] = { total: 0, records: [] };
    
    const hours = parseFloat(row[5]) || 0;
    byEmail[email].total += hours;
    byEmail[email].records.push({ date: dateStr, hours: hours });
  });
  
  // Round totals
  Object.keys(byEmail).forEach(email => {
    byEmail[email].total = Math.round(byEmail[email].total * 100) / 100;
  });
  
  return byEmail;
}

/**
 * Get MedAppt hours for a specific date range from pre-built data
 */
function getMedApptHoursFromRecords(records, startDate, endDate) {
  if (!records || !records.length) return 0;
  let total = 0;
  records.forEach(r => {
    if (startDate && r.date < startDate) return;
    if (endDate && r.date > endDate) return;
    total += r.hours;
  });
  return Math.round(total * 100) / 100;
}
// ========================================
// MEDICAL DATES HELPERS (MISSING)
// ========================================

/**
 * Build medical leave dates from approved Medical requests.
 * Returns: { "email@example.com": Set of date strings }
 */
function buildMedicalDates(holidayData, year) {
  const byEmail = {};
  if (!holidayData) return byEmail;

  const yearStart = year + '-01-01';
  const yearEnd = year + '-12-31';

  holidayData.slice(1).forEach(row => {
    if (String(row[6]) !== 'Approved') return;
    if (String(row[7] || 'Annual') !== 'Medical') return;

    const email = String(row[2] || '').toLowerCase().trim();
    if (!email) return;

    if (!byEmail[email]) byEmail[email] = new Set();

    const start = new Date(row[3]);
    const end = new Date(row[4]);
    const current = new Date(start);

    while (current <= end) {
      const dateStr = formatDateStr(current);
      if (dateStr >= yearStart && dateStr <= yearEnd) {
        byEmail[email].add(dateStr);
      }
      current.setDate(current.getDate() + 1);
    }
  });

  return byEmail;
}

/**
 * Count how many medical dates fall on base working days within a date range.
 */
function countMedicalWorkingDaysInRange(medicalDates, baseWorkingDays, rangeStart, rangeEnd) {
  if (!medicalDates || medicalDates.size === 0) return 0;

  let count = 0;
  medicalDates.forEach(dateStr => {
    if (dateStr >= rangeStart && dateStr <= rangeEnd && baseWorkingDays.allWorkingDays.has(dateStr)) {
      count++;
    }
  });

  return count;
}