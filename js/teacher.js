// Teacher Punch Module - Supabase version
// Replaces google.script.run calls with Supabase client queries

let currentProfile = null;
let selectedDate = new Date();
let currentPunches = [];

// ========================================
// INIT
// ========================================

async function initTeacher() {
  currentProfile = await requireAuth();
  if (!currentProfile) return;

  document.getElementById('teacherName').textContent = currentProfile.name;

  // Show admin button if admin
  if (currentProfile.role === 'admin' || currentProfile.role === 'super_admin') {
    const adminBtn = document.getElementById('adminBtn');
    if (adminBtn) adminBtn.style.display = 'flex';
  }

  await loadDay(selectedDate);
  await loadHolidaySummary();
}

// ========================================
// DATE HELPERS
// ========================================

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

function formatDateDisplay(d) {
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

function isToday(d) {
  const today = new Date();
  return d.toDateString() === today.toDateString();
}

function isFuture(d) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const check = new Date(d);
  check.setHours(0, 0, 0, 0);
  return check > today;
}

// ========================================
// LOAD DAY DATA
// ========================================

async function loadDay(date) {
  selectedDate = date;
  const dateStr = formatDate(date);

  // Update date display
  document.getElementById('dateNumber').textContent = date.getDate();
  document.getElementById('dateText').textContent = formatDateDisplay(date);

  const badge = document.getElementById('dateBadge');
  if (isToday(date)) {
    badge.textContent = 'HOY';
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }

  // Disable future
  const punchSection = document.getElementById('punchSection');
  const futureWarning = document.getElementById('futureWarning');
  if (isFuture(date)) {
    punchSection.style.display = 'none';
    futureWarning.style.display = 'block';
    return;
  }
  punchSection.style.display = 'block';
  futureWarning.style.display = 'none';

  // Check freeze
  const freezeDate = await getConfigValue('FreezeDate');
  const isFrozen = freezeDate && dateStr <= freezeDate;

  const frozenBanner = document.getElementById('frozenBanner');
  if (isFrozen) {
    frozenBanner.style.display = 'flex';
  } else {
    frozenBanner.style.display = 'none';
  }

  // Load punches
  await loadPunches(dateStr, isFrozen);

  // Load prep time status
  await loadPrepTimeStatus(dateStr);

  // Update nav buttons
  document.getElementById('nextDayBtn').disabled = isToday(date);
}

async function loadPunches(dateStr, isFrozen) {
  const { data: punches, error } = await db
    .from('time_punches')
    .select('*')
    .eq('user_id', currentProfile.id)
    .eq('date', dateStr)
    .in('punch_type', ['IN', 'OUT'])
    .order('time', { ascending: true });

  if (error) {
    console.error('Error loading punches:', error);
    return;
  }

  currentPunches = punches || [];
  renderPunches(currentPunches, isFrozen);
  updatePunchButton(currentPunches);
  updateDayHours(currentPunches);
}

// ========================================
// RENDER PUNCHES
// ========================================

function renderPunches(punches, isFrozen) {
  const container = document.getElementById('punchesList');
  const countEl = document.getElementById('punchesCount');

  if (!punches.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-text">Sin fichajes este día</div>
      </div>`;
    countEl.textContent = '0 fichajes';
    return;
  }

  countEl.textContent = punches.length + ' fichajes';
  container.innerHTML = punches.map(p => {
    const typeClass = p.punch_type.toLowerCase();
    const typeLabel = p.punch_type === 'IN' ? 'Entrada' : 'Salida';
    const timeDisplay = p.time.substring(0, 5);
    const frozenClass = isFrozen ? ' frozen' : '';

    return `
      <div class="punch-item ${typeClass}${frozenClass}" data-id="${p.id}">
        <div class="punch-item-left">
          <span class="punch-type-badge ${typeClass}">${typeLabel}</span>
          <span class="punch-time">${timeDisplay}</span>
        </div>
        ${isFrozen ? '<span class="frozen-lock">🔒 Congelado</span>' : `
        <div class="punch-actions">
          <button class="punch-action-btn edit" onclick="openEditPunch('${p.id}', '${timeDisplay}', '${p.notes || ''}')" aria-label="Editar fichaje">✏️</button>
          <button class="punch-action-btn delete" onclick="confirmDeletePunch('${p.id}')" aria-label="Eliminar fichaje">🗑️</button>
        </div>`}
      </div>`;
  }).join('');
}

function updatePunchButton(punches) {
  const btn = document.getElementById('punchBtn');
  const isIn = punches.length % 2 === 0;
  btn.className = 'punch-btn ' + (isIn ? 'in' : 'out');
  btn.textContent = 'Fichar ' + (isIn ? 'Entrada' : 'Salida');
}

function updateDayHours(punches) {
  const hours = calculateDayHours(punches);
  document.getElementById('dayHoursValue').textContent = hours.toFixed(2);
}

function calculateDayHours(punches) {
  if (!punches.length) return 0;
  let total = 0;
  const sorted = [...punches].sort((a, b) => a.time.localeCompare(b.time));

  for (let i = 0; i < sorted.length - 1; i += 2) {
    if (sorted[i].punch_type === 'IN' && sorted[i + 1]?.punch_type === 'OUT') {
      const inParts = sorted[i].time.split(':').map(Number);
      const outParts = sorted[i + 1].time.split(':').map(Number);
      const diff = (outParts[0] * 60 + outParts[1]) - (inParts[0] * 60 + inParts[1]);
      if (diff > 0) total += diff / 60;
    }
  }
  return Math.round(total * 100) / 100;
}

// ========================================
// PUNCH ACTIONS
// ========================================

async function submitPunch() {
  const timeInput = document.getElementById('timeInput');
  const timeStr = timeInput.value;

  if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) {
    showToast('Formato de hora inválido', 'error');
    return;
  }

  const dateStr = formatDate(selectedDate);
  const punchType = currentPunches.length % 2 === 0 ? 'IN' : 'OUT';

  // Check for duplicate time (within 2 minutes)
  const existing = currentPunches.find(p => {
    const diff = Math.abs(timeToMinutes(p.time.substring(0, 5)) - timeToMinutes(timeStr));
    return diff < 2;
  });

  if (existing) {
    showToast('Ya existe un fichaje a esta hora', 'error');
    return;
  }

  const { error } = await db.from('time_punches').insert({
    user_id: currentProfile.id,
    date: dateStr,
    time: timeStr + ':00',
    punch_type: punchType,
    notes: ''
  });

  if (error) {
    showToast('Error: ' + error.message, 'error');
    return;
  }

  showToast(`Fichaje ${punchType === 'IN' ? 'Entrada' : 'Salida'} a las ${timeStr} ✓`);
  await loadDay(selectedDate);
}

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

async function savePunchEdit() {
  const id = document.getElementById('editPunchId').value;
  const newTime = document.getElementById('editTimeInput').value;

  if (!newTime || !/^\d{2}:\d{2}$/.test(newTime)) {
    showToast('Formato de hora inválido', 'error');
    return;
  }

  const { error } = await db
    .from('time_punches')
    .update({ time: newTime + ':00', edited_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', currentProfile.id);

  if (error) {
    showToast('Error: ' + error.message, 'error');
    return;
  }

  closeEditModal();
  showToast('Fichaje actualizado ✓');
  await loadDay(selectedDate);
}

async function deletePunch(id) {
  const { error } = await db
    .from('time_punches')
    .delete()
    .eq('id', id)
    .eq('user_id', currentProfile.id);

  if (error) {
    showToast('Error: ' + error.message, 'error');
    return;
  }

  showToast('Fichaje eliminado');
  await loadDay(selectedDate);
}

// ========================================
// PREP TIME
// ========================================

async function loadPrepTimeStatus(dateStr) {
  if (currentProfile.prep_time_yearly <= 0) {
    document.getElementById('prepTimeSection').style.display = 'none';
    return;
  }

  document.getElementById('prepTimeSection').style.display = 'block';
  const weekStart = getWeekStart(dateStr);
  const weeklyHours = Math.round((currentProfile.prep_time_yearly / DEFAULTS.WORKING_WEEKS_PER_YEAR) * 10) / 10;

  // Check if already logged this week
  const { data } = await db
    .from('time_punches')
    .select('id, notes')
    .eq('user_id', currentProfile.id)
    .eq('punch_type', 'PREP')
    .like('notes', `Week: ${weekStart}%`);

  const logged = data && data.length > 0;
  const wrapper = document.getElementById('prepTimeWrapper');
  const badge = document.getElementById('prepTimeBadge');
  const checkbox = document.getElementById('prepTimeCheckbox');

  wrapper.className = 'prep-time-checkbox-wrapper' + (logged ? ' checked' : '');
  badge.textContent = weeklyHours + 'h';
  checkbox.textContent = logged ? '✓' : '';

  document.getElementById('prepTimeUndo').style.display = logged ? 'inline-flex' : 'none';
}

async function togglePrepTime() {
  const dateStr = formatDate(selectedDate);
  const weekStart = getWeekStart(dateStr);
  const weeklyHours = Math.round((currentProfile.prep_time_yearly / DEFAULTS.WORKING_WEEKS_PER_YEAR) * 10) / 10;

  // Check if already logged
  const { data: existing } = await db
    .from('time_punches')
    .select('id')
    .eq('user_id', currentProfile.id)
    .eq('punch_type', 'PREP')
    .like('notes', `Week: ${weekStart}%`);

  if (existing && existing.length > 0) {
    showToast('Ya registrado esta semana', 'error');
    return;
  }

  const { error } = await db.from('time_punches').insert({
    user_id: currentProfile.id,
    date: dateStr,
    time: '00:00:00',
    punch_type: 'PREP',
    notes: `Week: ${weekStart} | Hours: ${weeklyHours}`
  });

  if (error) {
    showToast('Error: ' + error.message, 'error');
    return;
  }

  showToast(`Horas No Lectivas: ${weeklyHours}h ✓`);
  await loadPrepTimeStatus(dateStr);
}

async function undoPrepTime() {
  const dateStr = formatDate(selectedDate);
  const weekStart = getWeekStart(dateStr);

  const { error } = await db
    .from('time_punches')
    .delete()
    .eq('user_id', currentProfile.id)
    .eq('punch_type', 'PREP')
    .like('notes', `Week: ${weekStart}%`);

  if (error) {
    showToast('Error: ' + error.message, 'error');
    return;
  }

  showToast('Eliminado correctamente');
  await loadPrepTimeStatus(dateStr);
}

function getWeekStart(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  return formatDate(monday);
}

// ========================================
// HOLIDAYS
// ========================================

async function loadHolidaySummary() {
  const { data: holidays, error } = await db
    .from('holiday_requests')
    .select('*')
    .eq('user_id', currentProfile.id);

  if (error) {
    console.error('Error loading holidays:', error);
    return;
  }

  const summary = {
    annualUsed: 0, annualPending: 0,
    personalUsed: 0, personalPending: 0,
    schoolUsed: 0,
    medicalUsed: 0,
    medApptUsed: 0, medApptPending: 0,
    permisoUsed: 0
  };

  (holidays || []).forEach(h => {
    const days = h.days || 0;
    if (h.type === 'Annual') h.status === 'Approved' ? summary.annualUsed += days : summary.annualPending += days;
    else if (h.type === 'Personal') h.status === 'Approved' ? summary.personalUsed += days : summary.personalPending += days;
    else if (h.type === 'School' && h.status === 'Approved') summary.schoolUsed += days;
    else if (h.type === 'Medical' && h.status === 'Approved') summary.medicalUsed += days;
    else if (h.type === 'MedAppt') h.status === 'Approved' ? summary.medApptUsed += days : summary.medApptPending += days;
    else if (h.type === 'Permiso' && h.status === 'Approved') summary.permisoUsed += days;
  });

  const annualRemaining = currentProfile.annual_days - summary.annualUsed - summary.annualPending;
  const personalRemaining = currentProfile.personal_days - summary.personalUsed - summary.personalPending;

  document.getElementById('annualUsed').textContent = summary.annualUsed;
  document.getElementById('annualTotal').textContent = '/' + currentProfile.annual_days;
  document.getElementById('personalUsed').textContent = summary.personalUsed;
  document.getElementById('personalTotal').textContent = '/' + currentProfile.personal_days;
  document.getElementById('medicalUsed').textContent = summary.medicalUsed;
  document.getElementById('schoolUsed').textContent = summary.schoolUsed;

  // Render requests list
  renderHolidayRequests(holidays || []);
}

function renderHolidayRequests(requests) {
  const container = document.getElementById('requestsList');
  const sorted = [...requests].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (!sorted.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">Sin solicitudes</div></div>';
    return;
  }

  container.innerHTML = sorted.map(r => {
    const typeConfig = HOLIDAY_TYPES[r.type] || { emoji: '📅', shortName: r.type, color: 'annual' };
    const statusClass = r.status.toLowerCase();
    const startDate = new Date(r.start_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    const endDate = new Date(r.end_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

    return `
      <div class="request-item ${statusClass}">
        <div class="request-header">
          <span class="request-type">${typeConfig.emoji} ${typeConfig.shortName}</span>
          <span class="request-status ${statusClass}">${r.status === 'Approved' ? '✓ Aprobado' : r.status === 'Pending' ? '⏳ Pendiente' : '✗ Rechazado'}</span>
        </div>
        <div class="request-dates">${startDate} → ${endDate}</div>
        <div class="request-days">${r.days} día${r.days !== 1 ? 's' : ''}</div>
      </div>`;
  }).join('');
}

async function submitHolidayRequest() {
  const type = document.querySelector('.holiday-type-btn.selected')?.dataset.type;
  const startDate = document.getElementById('holidayStartDate').value;
  const endDate = document.getElementById('holidayEndDate').value;
  const reason = document.getElementById('holidayReason')?.value || '';

  if (!type) { showToast('Selecciona un tipo', 'error'); return; }
  if (!startDate || !endDate) { showToast('Selecciona las fechas', 'error'); return; }
  if (endDate < startDate) { showToast('La fecha fin debe ser posterior', 'error'); return; }

  // Calculate working days
  const days = calculateWorkingDays(startDate, endDate);

  const { error } = await db.from('holiday_requests').insert({
    user_id: currentProfile.id,
    start_date: startDate,
    end_date: endDate,
    days: days,
    type: type,
    reason: reason,
    status: 'Pending'
  });

  if (error) {
    showToast('Error: ' + error.message, 'error');
    return;
  }

  showToast('Solicitud enviada ✓');
  await loadHolidaySummary();
  // Reset form
  document.querySelectorAll('.holiday-type-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('holidayStartDate').value = '';
  document.getElementById('holidayEndDate').value = '';
}

function calculateWorkingDays(startDate, endDate) {
  let count = 0;
  const current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

// ========================================
// PROGRESS
// ========================================

async function loadProgress() {
  const year = new Date().getFullYear();
  const yearStart = `${year}-01-01`;
  const today = formatDate(new Date());

  // Get all punches for the year
  const { data: punches } = await db
    .from('time_punches')
    .select('date, time, punch_type')
    .eq('user_id', currentProfile.id)
    .in('punch_type', ['IN', 'OUT'])
    .gte('date', yearStart)
    .lte('date', today);

  const totalHours = calculateTotalHours(punches || []);

  // Load school holidays for accurate working days
  const { data: schoolHolidays } = await db.from('school_holidays').select('*');
  const schoolHolidayDates = new Set();
  (schoolHolidays || []).forEach(function(h) {
    var cur = new Date(h.start_date + 'T12:00:00');
    var end = new Date(h.end_date + 'T12:00:00');
    while (cur <= end) {
      var ds = cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0') + '-' + String(cur.getDate()).padStart(2, '0');
      if (ds >= yearStart && ds <= year + '-12-31') schoolHolidayDates.add(ds);
      cur.setDate(cur.getDate() + 1);
    }
  });

  // Load approved holidays for this user (non-Medical)
  const { data: holidays } = await db.from('holiday_requests').select('*')
    .eq('user_id', currentProfile.id).eq('status', 'Approved');

  // Build teacher holiday dates (exclude Medical)
  var teacherHolidayDates = new Set();
  (holidays || []).forEach(function(h) {
    if (h.type === 'Medical') return;
    var cur = new Date(h.start_date + 'T12:00:00');
    var end = new Date(h.end_date + 'T12:00:00');
    while (cur <= end) {
      var ds = cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0') + '-' + String(cur.getDate()).padStart(2, '0');
      if (ds >= yearStart && ds <= year + '-12-31') teacherHolidayDates.add(ds);
      cur.setDate(cur.getDate() + 1);
    }
  });

  // Precompute working days (same logic as admin.js)
  var now = new Date(); now.setHours(0, 0, 0, 0);
  var ys = new Date(year, 0, 1); var ye = new Date(year, 11, 31);
  var allWD = new Set(), passedWD = new Set(), allCount = 0, passedCount = 0;
  var cur = new Date(ys); cur.setHours(0, 0, 0, 0);
  while (cur <= ye) {
    var dow = cur.getDay();
    var ds = cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0') + '-' + String(cur.getDate()).padStart(2, '0');
    if (dow !== 0 && dow !== 6 && !schoolHolidayDates.has(ds)) {
      allWD.add(ds); allCount++;
      if (cur <= now) { passedWD.add(ds); passedCount++; }
    }
    cur.setDate(cur.getDate() + 1);
  }

  // Teacher progress (same as admin getTeacherProgress)
  var expectedYearly = currentProfile.expected_yearly_hours || DEFAULTS.EXPECTED_YEARLY_HOURS;
  var annualDays = currentProfile.annual_days || DEFAULTS.ANNUAL_DAYS;
  var personalDays = currentProfile.personal_days || DEFAULTS.PERSONAL_DAYS;
  var schoolDays = currentProfile.school_days || DEFAULTS.SCHOOL_DAYS;
  var allocatedDays = Math.max(0, annualDays - 3) + personalDays + schoolDays;

  var holidaysTakenOnPassed = 0;
  teacherHolidayDates.forEach(function(ds) {
    if (allWD.has(ds) && passedWD.has(ds)) holidaysTakenOnPassed++;
  });

  var totalWorkingDays = Math.max(0, allCount - allocatedDays);
  var passedWorkingDays = Math.max(0, passedCount - holidaysTakenOnPassed);
  var progressRatio = totalWorkingDays > 0 ? passedWorkingDays / totalWorkingDays : 0;

  // Medical hours
  var hoursPerWorkingDay = totalWorkingDays > 0 ? expectedYearly / totalWorkingDays : 0;
  var medicalHours = 0;
  (holidays || []).filter(function(h) { return h.type === 'Medical'; }).forEach(function(h) {
    var mStart = h.start_date > yearStart ? h.start_date : yearStart;
    var mEnd = h.end_date < today ? h.end_date : today;
    if (mStart <= mEnd) {
      var c = new Date(mStart + 'T12:00:00'), e = new Date(mEnd + 'T12:00:00'), days = 0;
      while (c <= e) {
        var d = c.getDay();
        var dStr = c.getFullYear() + '-' + String(c.getMonth() + 1).padStart(2, '0') + '-' + String(c.getDate()).padStart(2, '0');
        if (d !== 0 && d !== 6 && !schoolHolidayDates.has(dStr)) days++;
        c.setDate(c.getDate() + 1);
      }
      medicalHours += days * hoursPerWorkingDay;
    }
  });

  // Paid hours
  const { data: paidData } = await db.from('paid_hours').select('hours').eq('user_id', currentProfile.id);
  var paidTotal = (paidData || []).reduce(function(s, p) { return s + (parseFloat(p.hours) || 0); }, 0);

  var adjustedTotal = totalHours - paidTotal + medicalHours;
  var expectedToDate = expectedYearly * progressRatio;
  var percent = expectedToDate > 0 ? (adjustedTotal / expectedToDate) * 100 : 0;

  const progressBar = document.getElementById('progressBar');
  const progressPercent = document.getElementById('progressPercent');
  const progressHours = document.getElementById('progressHours');
  const progressExpected = document.getElementById('progressExpected');

  const status = percent >= 98 ? 'on-track' : percent >= 80 ? 'warning' : 'behind';
  progressBar.style.width = Math.min(percent, 100) + '%';
  progressBar.className = 'progress-bar ' + status;
  progressPercent.textContent = Math.round(percent) + '%';
  progressPercent.className = 'progress-percent ' + status;
  progressHours.textContent = adjustedTotal.toFixed(1) + 'h / ' + expectedYearly + 'h';
  if (progressExpected) progressExpected.textContent = Math.round(expectedToDate) + 'h esperadas';
}

function calculateTotalHours(punches) {
  const byDate = {};
  punches.forEach(p => {
    if (!byDate[p.date]) byDate[p.date] = [];
    byDate[p.date].push(p);
  });

  let total = 0;
  Object.values(byDate).forEach(dayPunches => {
    total += calculateDayHours(dayPunches);
  });
  return total;
}

function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d - start;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// ========================================
// CONFIG HELPER
// ========================================

async function getConfigValue(key) {
  const { data } = await db
    .from('app_config')
    .select('value')
    .eq('key', key)
    .single();
  return data?.value || null;
}

// ========================================
// UI HELPERS
// ========================================

function prevDay() {
  const d = new Date(selectedDate);
  d.setDate(d.getDate() - 1);
  loadDay(d);
}

function nextDay() {
  if (isToday(selectedDate)) return;
  const d = new Date(selectedDate);
  d.setDate(d.getDate() + 1);
  loadDay(d);
}

function openEditPunch(id, time, notes) {
  document.getElementById('editPunchId').value = id;
  document.getElementById('editTimeInput').value = time;
  document.getElementById('editOverlay').classList.add('active');
}

function closeEditModal() {
  document.getElementById('editOverlay').classList.remove('active');
}

function confirmDeletePunch(id) {
  if (confirm('¿Eliminar este fichaje?')) {
    deletePunch(id);
  }
}

function switchTab(tab) {
  document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));

  document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
  document.getElementById(tab + 'Tab').classList.add('active');

  if (tab === 'holidays') loadHolidaySummary();
}

function selectHolidayType(btn, type) {
  document.querySelectorAll('.holiday-type-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected', HOLIDAY_TYPES[type]?.color || '');
}

function setCurrentTime() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('timeInput').value = h + ':' + m;
}

// ========================================
// CALENDAR
// ========================================

var calendarDate = new Date();
var calendarPunchedDays = {};
var calendarSchoolHolidays = {};
var calendarTeacherHolidays = {};

function openCalendar() {
  calendarDate = new Date(selectedDate);
  loadCalendarMonth();
  document.getElementById('calendarOverlay').classList.add('active');
}

function closeCalendar() {
  document.getElementById('calendarOverlay').classList.remove('active');
}

// Close on backdrop click
document.addEventListener('click', function(e) {
  var overlay = document.getElementById('calendarOverlay');
  if (e.target === overlay) closeCalendar();
});

function calendarChangeMonth(dir) {
  if (dir > 0) {
    var next = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1);
    var today = new Date();
    if (next > new Date(today.getFullYear(), today.getMonth() + 1, 0)) return;
  }
  calendarDate.setMonth(calendarDate.getMonth() + dir);
  loadCalendarMonth();
}

async function loadCalendarMonth() {
  var y = calendarDate.getFullYear();
  var m = calendarDate.getMonth() + 1;
  var monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  document.getElementById('calendarMonth').textContent = monthNames[m - 1] + ' ' + y;

  var isCurrentMonth = y === new Date().getFullYear() && m === new Date().getMonth() + 1;
  document.getElementById('calendarNextMonthBtn').disabled = isCurrentMonth;

  var startDate = y + '-' + String(m).padStart(2, '0') + '-01';
  var daysInMonth = new Date(y, m, 0).getDate();
  var endDate = y + '-' + String(m).padStart(2, '0') + '-' + String(daysInMonth).padStart(2, '0');

  // Load punched days
  var { data: punches } = await db.from('time_punches').select('date')
    .eq('user_id', currentProfile.id).in('punch_type', ['IN', 'OUT'])
    .gte('date', startDate).lte('date', endDate);
  calendarPunchedDays = {};
  (punches || []).forEach(function(p) {
    calendarPunchedDays[p.date] = (calendarPunchedDays[p.date] || 0) + 1;
  });

  // Load school holidays
  var { data: schoolHols } = await db.from('school_holidays').select('*');
  calendarSchoolHolidays = {};
  (schoolHols || []).forEach(function(h) {
    var cur = new Date(h.start_date + 'T12:00:00');
    var end = new Date(h.end_date + 'T12:00:00');
    while (cur <= end) {
      calendarSchoolHolidays[formatDate(cur)] = h.name;
      cur.setDate(cur.getDate() + 1);
    }
  });

  // Load teacher holidays
  var { data: holidays } = await db.from('holiday_requests').select('*')
    .eq('user_id', currentProfile.id).eq('status', 'Approved')
    .lte('start_date', endDate).gte('end_date', startDate);
  calendarTeacherHolidays = {};
  (holidays || []).forEach(function(h) {
    var cur = new Date(h.start_date + 'T12:00:00');
    var end = new Date(h.end_date + 'T12:00:00');
    while (cur <= end) {
      var ds = formatDate(cur);
      if (ds >= startDate && ds <= endDate) {
        calendarTeacherHolidays[ds] = h.type;
      }
      cur.setDate(cur.getDate() + 1);
    }
  });

  renderCalendar();
}

function renderCalendar() {
  var y = calendarDate.getFullYear();
  var m = calendarDate.getMonth();
  var first = new Date(y, m, 1);
  var last = new Date(y, m + 1, 0);
  var startDay = first.getDay();
  var todayStr = formatDate(new Date());
  var selStr = formatDate(selectedDate);

  var html = '';
  ['D','L','M','X','J','V','S'].forEach(function(n) {
    html += '<div class="calendar-day-header">' + n + '</div>';
  });
  for (var i = 0; i < startDay; i++) html += '<div class="calendar-day empty"></div>';

  for (var d = 1; d <= last.getDate(); d++) {
    var date = new Date(y, m, d);
    var ds = formatDate(date);
    var isFut = date > new Date();
    var isSchoolHol = calendarSchoolHolidays[ds];
    var teacherHolType = calendarTeacherHolidays[ds];
    var hasP = calendarPunchedDays[ds] > 0;

    var cls = ['calendar-day'];
    if (ds === todayStr) cls.push('today');
    if (ds === selStr) cls.push('selected');
    if (isFut) cls.push('future');

    if (teacherHolType) {
      var holClass = teacherHolType === 'School' ? 'holiday-school-day' : 'holiday-' + teacherHolType.toLowerCase();
      cls.push(holClass);
    } else if (isSchoolHol && !hasP) {
      cls.push('school-holiday');
    } else if (hasP) {
      cls.push('has-punches');
    }

    html += '<div class="' + cls.join(' ') + '"' + (isFut ? '' : ' onclick="calendarSelectDate(' + y + ',' + m + ',' + d + ')"') + '>' + d + '</div>';
  }

  document.getElementById('calendarGrid').innerHTML = html;
}

function calendarSelectDate(y, m, d) {
  var date = new Date(y, m, d);
  closeCalendar();
  loadDay(date);
}

// Set current time on load
document.addEventListener('DOMContentLoaded', () => {
  setCurrentTime();
  initTeacher();
});
