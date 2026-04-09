// ========================================
// Admin Module - Supabase version (Full Rewrite)
// ========================================

// --- State ---
var adminProfile = null;
var viewMode = 'monthly'; // 'monthly' or 'weekly'
var monthOffset = 0;      // 0 = current month, -1 = last month, etc.
var weekOffset = 0;       // 0 = current week, -1 = last week, etc.
var currentYear = new Date().getFullYear();
var currentMonth = new Date().getMonth();

// Track which sections have been loaded
var sectionsLoaded = {};

// Cached data for current load
var cachedTeachers = null;
var cachedAdmins = null;
var cachedPunches = null;
var cachedHolidays = null;
var cachedPaidHours = null;
var cachedSchoolHolidays = null;

// ========================================
// TASK 2.1: INIT, NAVIGATION, TABS
// ========================================

async function initAdmin() {
  adminProfile = await requireAuth(['admin', 'super_admin']);
  if (!adminProfile) return;

  // Set admin info in sidebar
  document.getElementById('adminName').textContent = adminProfile.name || 'Admin';
  document.getElementById('adminEmail').textContent = adminProfile.email || '--';

  // Show freeze tab if super_admin
  if (adminProfile.role === 'super_admin') {
    var freezeBtn = document.getElementById('freezeTabBtn');
    if (freezeBtn) freezeBtn.style.display = '';
  }

  // Load initial data
  await loadData();
}

async function loadData(forceRefresh) {
  // Clear caches on refresh
  if (forceRefresh) {
    cachedTeachers = null;
    cachedAdmins = null;
    cachedPunches = null;
    cachedHolidays = null;
    cachedPaidHours = null;
    cachedSchoolHolidays = null;
  }
  updateMonthDisplay();
  updateWeekDisplay();
  await Promise.all([
    loadStatsGrid(),
    loadTeachersTable(),
    loadAdminWorkersTable()
  ]);
}

// --- Sidebar Navigation ---
function showSection(section) {
  document.querySelectorAll('.content-section').forEach(function(s) { s.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });

  var sectionEl = document.getElementById('section-' + section);
  if (sectionEl) sectionEl.classList.add('active');

  var navEl = document.querySelector('.nav-item[data-section="' + section + '"]');
  if (navEl) navEl.classList.add('active');

  // Load section data on first visit
  if (!sectionsLoaded[section]) {
    sectionsLoaded[section] = true;
    if (section === 'teachers') loadData();
    else if (section === 'holidays') {
      if (typeof loadHolidayData === 'function') loadHolidayData();
    }
    else if (section === 'archive') {
      if (typeof loadArchivoAnual === 'function') loadArchivoAnual();
    }
    else if (section === 'settings') {
      if (typeof loadSettings === 'function') loadSettings();
    }
  }

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
}

// --- Tab Switching (Horas de Empleados tabs) ---
function switchTab(btn, tabId) {
  // Deactivate all tabs and tab contents within the teachers section
  var tabBar = btn.parentElement;
  tabBar.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
  btn.classList.add('active');

  // Hide all tab-content siblings
  var section = document.getElementById('section-teachers');
  section.querySelectorAll('.tab-content').forEach(function(tc) { tc.classList.remove('active'); });
  var target = document.getElementById(tabId);
  if (target) target.classList.add('active');

  // Load tab-specific data
  if (tabId === 'teachersListTab') loadTeachersTable();
  else if (tabId === 'adminsListTab') loadAdminWorkersTable();
  else if (tabId === 'paidHoursTab' && typeof loadPaidHoursTab === 'function') loadPaidHoursTab();
  else if (tabId === 'freezeTab' && typeof loadFreezeTab === 'function') loadFreezeTab();
}

// --- Sub-tab Switching (Vacaciones sub-tabs) ---
function switchSubTab(btn, subtabId) {
  var tabBar = btn.parentElement;
  tabBar.querySelectorAll('.sub-tab').forEach(function(t) { t.classList.remove('active'); });
  btn.classList.add('active');

  document.querySelectorAll('.sub-tab-content').forEach(function(tc) { tc.classList.remove('active'); });
  var target = document.getElementById(subtabId);
  if (target) target.classList.add('active');

  // Load sub-tab data
  if (subtabId === 'solicitudesContent' && typeof loadPendingRequests === 'function') loadPendingRequests();
  else if (subtabId === 'resumenContent' && typeof loadHolidayOverview === 'function') loadHolidayOverview();
  else if (subtabId === 'calendarViewContent' && typeof loadHolidayCalendar === 'function') loadHolidayCalendar();
  else if (subtabId === 'drEmpresaContent' && typeof loadDREmpresa === 'function') loadDREmpresa();
  else if (subtabId === 'festivosContent' && typeof loadFestivos === 'function') loadFestivos();
}

// --- Inner Tab Switching (Solicitudes: Pendientes / Aprobadas) ---
function switchInnerTab(btn, innertabId) {
  var tabBar = btn.parentElement;
  tabBar.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
  btn.classList.add('active');

  document.querySelectorAll('.inner-tab-content').forEach(function(tc) { tc.classList.remove('active'); });
  var target = document.getElementById(innertabId);
  if (target) target.classList.add('active');

  if (innertabId === 'pendientesContent' && typeof loadPendingRequests === 'function') loadPendingRequests();
  else if (innertabId === 'aprobadasContent' && typeof loadApprovedRequests === 'function') loadApprovedRequests();
}

// --- Mobile Sidebar Toggle ---
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// --- Navigate to Teacher page ---
function goToTeacher() {
  window.location.href = 'teacher.html';
}

// --- Modal System ---
function openModal(title, bodyHtml, wide) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  var container = document.getElementById('modalContainer');
  if (wide) {
    container.style.maxWidth = '900px';
  } else {
    container.style.maxWidth = '600px';
  }
  document.getElementById('modalOverlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

// Close modal on backdrop click
document.addEventListener('click', function(e) {
  var overlay = document.getElementById('modalOverlay');
  if (e.target === overlay) closeModal();
});


// ========================================
// TASK 2.2: STATE MANAGEMENT & NAVIGATION
// ========================================

function setHoursViewMode(mode) {
  viewMode = mode;
  if (mode === 'weekly') weekOffset = 0;

  // Update all toggle buttons across both tabs
  document.querySelectorAll('.toggle-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  // Show/hide month and week selectors
  var showMonth = mode === 'monthly';
  ['monthSelector', 'adminMonthSelector'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = showMonth ? '' : 'none';
  });
  ['weekSelector', 'adminWeekSelector'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = showMonth ? 'none' : '';
  });

  // Update period column headers
  var headerText = mode === 'monthly' ? 'Horas Mes' : 'Horas Semana';
  var teacherHeader = document.getElementById('teacherPeriodHeader');
  var adminHeader = document.getElementById('adminPeriodHeader');
  if (teacherHeader) teacherHeader.textContent = headerText;
  if (adminHeader) adminHeader.textContent = headerText;

  updateMonthDisplay();
  updateWeekDisplay();

  // Reload data
  cachedPunches = null;
  Promise.all([loadStatsGrid(), loadTeachersTable(), loadAdminWorkersTable()]);
}

function changeMonth(delta) {
  // Don't allow going to future months
  if (delta > 0 && monthOffset >= 0) return;
  monthOffset += delta;
  if (monthOffset > 0) monthOffset = 0;
  updateMonthDisplay();
  cachedPunches = null;
  Promise.all([loadStatsGrid(), loadTeachersTable(), loadAdminWorkersTable()]);
}

function changeWeek(delta) {
  if (delta > 0 && weekOffset >= 0) return;
  weekOffset += delta;
  if (weekOffset > 0) weekOffset = 0;
  updateWeekDisplay();
  cachedPunches = null;
  Promise.all([loadStatsGrid(), loadTeachersTable(), loadAdminWorkersTable()]);
}

function updateMonthDisplay() {
  var range = getMonthRange();
  var monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var label = monthNames[range.month] + ' de ' + range.year;
  var badge = monthOffset === 0 ? ' <span class="actual-badge">ACTUAL</span>' : '';

  ['monthDisplay', 'adminMonthDisplay'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = label + badge;
  });

  // Disable next button when at current month
  ['nextMonthBtn', 'adminNextMonthBtn'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.disabled = monthOffset >= 0;
  });

  // Update stats period label
  var periodLabel = document.getElementById('statPeriodLabel');
  if (periodLabel) {
    periodLabel.textContent = viewMode === 'monthly'
      ? 'Horas en ' + monthNames[range.month].charAt(0).toUpperCase() + monthNames[range.month].slice(1)
      : 'Horas esta Semana';
  }
}

function updateWeekDisplay() {
  var range = getWeekRange();
  var badge = weekOffset === 0 ? ' <span class="actual-badge">ACTUAL</span>' : '';

  ['weekDisplay', 'adminWeekDisplay'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = range.weekLabel + badge;
  });

  ['nextWeekBtn', 'adminNextWeekBtn'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.disabled = weekOffset >= 0;
  });

  // Update stats period label for weekly
  if (viewMode === 'weekly') {
    var periodLabel = document.getElementById('statPeriodLabel');
    if (periodLabel) periodLabel.textContent = 'Horas esta Semana';
  }
}

function getMonthRange() {
  var now = new Date();
  var d = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  var year = d.getFullYear();
  var month = d.getMonth();
  var monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var start = formatDate(d);
  var lastDay = new Date(year, month + 1, 0);
  var end = formatDate(lastDay);
  return { start: start, end: end, year: year, month: month, monthName: monthNames[month] };
}

function getWeekRange() {
  var now = new Date();
  // Get current Monday
  var day = now.getDay();
  var diff = day === 0 ? -6 : 1 - day;
  var monday = new Date(now);
  monday.setDate(now.getDate() + diff + (weekOffset * 7));
  var sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  var start = formatDate(monday);
  var end = formatDate(sunday);

  // Week number (ISO)
  var tempDate = new Date(monday);
  tempDate.setHours(0, 0, 0, 0);
  tempDate.setDate(tempDate.getDate() + 3 - ((tempDate.getDay() + 6) % 7));
  var week1 = new Date(tempDate.getFullYear(), 0, 4);
  var weekNum = 1 + Math.round(((tempDate - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);

  var monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var weekLabel = 'Sem ' + weekNum + ': ' + monday.getDate() + ' ' + monthNames[monday.getMonth()] + ' - ' + sunday.getDate() + ' ' + monthNames[sunday.getMonth()];

  return { start: start, end: end, weekLabel: weekLabel };
}


// ========================================
// TASK 2.3: HOURS CALCULATION UTILITIES
// ========================================

function calculateDayHours(punches) {
  if (!punches || !punches.length) return 0;
  // Filter to IN/OUT only, sort by time
  var sorted = punches
    .filter(function(p) { return p.punch_type === 'IN' || p.punch_type === 'OUT'; })
    .sort(function(a, b) { return (a.time || '').localeCompare(b.time || ''); });

  var total = 0;
  for (var i = 0; i < sorted.length - 1; i += 2) {
    if (sorted[i].punch_type === 'IN' && sorted[i + 1] && sorted[i + 1].punch_type === 'OUT') {
      var inParts = sorted[i].time.split(':').map(Number);
      var outParts = sorted[i + 1].time.split(':').map(Number);
      var diff = (outParts[0] * 60 + outParts[1]) - (inParts[0] * 60 + inParts[1]);
      if (diff > 0) total += diff / 60;
    }
  }
  return Math.round(total * 100) / 100;
}

function calculateHoursFromPunches(punches, startDate, endDate) {
  if (!punches || !punches.length) return 0;
  // Filter punches to date range
  var filtered = punches.filter(function(p) {
    return p.date >= startDate && p.date <= endDate && (p.punch_type === 'IN' || p.punch_type === 'OUT');
  });

  // Group by date
  var byDate = {};
  filtered.forEach(function(p) {
    if (!byDate[p.date]) byDate[p.date] = [];
    byDate[p.date].push(p);
  });

  var total = 0;
  Object.values(byDate).forEach(function(dayPunches) {
    total += calculateDayHours(dayPunches);
  });
  return Math.round(total * 100) / 100;
}

function getWeekBounds(date) {
  var d = new Date(date);
  var day = d.getDay();
  var diffToMonday = day === 0 ? -6 : 1 - day;
  var monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  var sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: formatDate(monday), end: formatDate(sunday) };
}

function formatDate(d) {
  if (typeof d === 'string') return d;
  var year = d.getFullYear();
  var month = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

function formatDateDisplay(d) {
  if (typeof d === 'string') d = new Date(d + 'T12:00:00');
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function getProgressStatus(percent) {
  if (percent >= 98) return 'on-track';
  if (percent >= 80) return 'warning';
  return 'behind';
}

// Count working days between two dates, excluding weekends and school holidays
function countWorkingDays(startDate, endDate, schoolHolidayDates) {
  var count = 0;
  var current = new Date(startDate + 'T12:00:00');
  var end = new Date(endDate + 'T12:00:00');
  while (current <= end) {
    var day = current.getDay();
    var dateStr = formatDate(current);
    if (day !== 0 && day !== 6) {
      if (!schoolHolidayDates || !schoolHolidayDates.has(dateStr)) {
        count++;
      }
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

// Build a Set of all school holiday dates from school_holidays records
function buildSchoolHolidayDateSet(schoolHolidays) {
  var dateSet = new Set();
  if (!schoolHolidays) return dateSet;
  schoolHolidays.forEach(function(h) {
    var current = new Date(h.start_date + 'T12:00:00');
    var end = new Date(h.end_date + 'T12:00:00');
    while (current <= end) {
      dateSet.add(formatDate(current));
      current.setDate(current.getDate() + 1);
    }
  });
  return dateSet;
}


// ========================================
// TASK 3.1: STATS GRID
// ========================================

async function loadStatsGrid(teacherData, adminData) {
  try {
    // Use passed data or load fresh
    var teachers = teacherData;
    var admins = adminData;

    if (!teachers || !admins) {
      // Load profiles
      var res1 = await db.from('profiles').select('*').eq('role', 'teacher').eq('status', 'Active');
      teachers = res1.data || [];
      var res2 = await db.from('profiles').select('*').in('role', ['admin', 'super_admin']).eq('status', 'Active');
      admins = res2.data || [];
    }

    // Load school holidays
    if (!cachedSchoolHolidays) {
      var shRes = await db.from('school_holidays').select('*');
      cachedSchoolHolidays = shRes.data || [];
    }
    var schoolHolidayDates = buildSchoolHolidayDateSet(cachedSchoolHolidays);

    // Load punches for the year
    var year = new Date().getFullYear();
    var yearStart = year + '-01-01';
    var today = formatDate(new Date());

    if (!cachedPunches) {
      var pRes = await db.from('time_punches').select('user_id, date, time, punch_type, notes')
        .in('punch_type', ['IN', 'OUT'])
        .gte('date', yearStart).lte('date', today);
      cachedPunches = pRes.data || [];
    }

    // Period range
    var periodRange = viewMode === 'monthly' ? getMonthRange() : getWeekRange();

    // Compute stats
    var allProfiles = teachers.concat(admins);
    var totalProgress = 0;
    var onTrackCount = 0;
    var totalPeriodHours = 0;

    // Working days for progress calculation
    var totalWorkingDaysYear = countWorkingDays(yearStart, today, schoolHolidayDates);
    var totalWorkingDaysInYear = countWorkingDays(yearStart, year + '-12-31', schoolHolidayDates);

    allProfiles.forEach(function(profile) {
      var userPunches = cachedPunches.filter(function(p) { return p.user_id === profile.id; });
      var yearlyHours = calculateHoursFromPunches(userPunches, yearStart, today);
      var periodHours = calculateHoursFromPunches(userPunches, periodRange.start, periodRange.end);
      totalPeriodHours += periodHours;

      var expectedYearly = profile.expected_yearly_hours || DEFAULTS.EXPECTED_YEARLY_HOURS;
      var expectedToDate = totalWorkingDaysInYear > 0
        ? (expectedYearly * totalWorkingDaysYear / totalWorkingDaysInYear)
        : 0;
      var percent = expectedToDate > 0 ? (yearlyHours / expectedToDate) * 100 : 0;

      totalProgress += percent;
      if (percent >= 98) onTrackCount++;
    });

    var avgProgress = allProfiles.length > 0 ? Math.round(totalProgress / allProfiles.length) : 0;

    // Working days stats
    var monthRange = getMonthRange();
    var totalWorkingDaysMonth = countWorkingDays(monthRange.start, monthRange.end, schoolHolidayDates);
    var passedWorkingDays = countWorkingDays(monthRange.start, today < monthRange.end ? today : monthRange.end, schoolHolidayDates);

    // Render stats
    document.getElementById('statTeachers').textContent = teachers.length;
    document.getElementById('statAdmins').textContent = admins.length;
    document.getElementById('statOnTrack').textContent = onTrackCount + '/' + allProfiles.length;
    document.getElementById('statAvgProgress').textContent = 'Progreso medio: ' + avgProgress + '%';
    document.getElementById('statWorkingDays').textContent = passedWorkingDays + '/' + totalWorkingDaysMonth;
    document.getElementById('statSchoolHolidays').textContent = cachedSchoolHolidays.length + ' festivos excluidos';
    document.getElementById('statPeriodHours').textContent = totalPeriodHours.toFixed(1) + 'h';

    // Update period label
    var monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    var periodLabel = document.getElementById('statPeriodLabel');
    if (periodLabel) {
      periodLabel.textContent = viewMode === 'monthly'
        ? 'Horas en ' + monthNames[monthRange.month].charAt(0).toUpperCase() + monthNames[monthRange.month].slice(1)
        : 'Horas esta Semana';
    }

    // Update pending badge
    var pendRes = await db.from('holiday_requests').select('*', { count: 'exact', head: true }).eq('status', 'Pending');
    var pendingCount = pendRes.count || 0;
    var badge = document.getElementById('pendingBadge');
    if (badge) {
      badge.textContent = pendingCount;
      badge.style.display = pendingCount > 0 ? 'inline' : 'none';
    }

  } catch (err) {
    console.error('Error loading stats grid:', err);
  }
}


// ========================================
// TASK 4.1: TEACHERS TABLE
// ========================================

async function loadTeachersTable() {
  var tbody = document.getElementById('teachersTableBody');
  if (!tbody) return;

  try {
    // Load teachers
    var tRes = await db.from('profiles').select('*').eq('role', 'teacher').eq('status', 'Active').order('name');
    var teachers = tRes.data || [];
    cachedTeachers = teachers;

    // Load school holidays
    if (!cachedSchoolHolidays) {
      var shRes = await db.from('school_holidays').select('*');
      cachedSchoolHolidays = shRes.data || [];
    }
    var schoolHolidayDates = buildSchoolHolidayDateSet(cachedSchoolHolidays);

    // Date ranges
    var year = new Date().getFullYear();
    var yearStart = year + '-01-01';
    var today = formatDate(new Date());
    var periodRange = viewMode === 'monthly' ? getMonthRange() : getWeekRange();

    // Load all punches for the year (IN/OUT + PREP)
    var pRes = await db.from('time_punches').select('user_id, date, time, punch_type, notes')
      .gte('date', yearStart).lte('date', today);
    var allPunches = pRes.data || [];
    cachedPunches = allPunches.filter(function(p) { return p.punch_type === 'IN' || p.punch_type === 'OUT'; });

    // Load holiday requests (approved Medical for medical hours)
    if (!cachedHolidays) {
      var hRes = await db.from('holiday_requests').select('*').eq('status', 'Approved');
      cachedHolidays = hRes.data || [];
    }

    // Load paid hours
    if (!cachedPaidHours) {
      var phRes = await db.from('paid_hours').select('*');
      cachedPaidHours = phRes.data || [];
    }

    // Working days for progress
    var totalWorkingDaysYear = countWorkingDays(yearStart, today, schoolHolidayDates);
    var totalWorkingDaysInYear = countWorkingDays(yearStart, year + '-12-31', schoolHolidayDates);

    if (!teachers.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No hay profesores activos</td></tr>';
      return;
    }

    var rows = teachers.map(function(t) {
      var userPunches = cachedPunches.filter(function(p) { return p.user_id === t.id; });
      var userAllPunches = allPunches.filter(function(p) { return p.user_id === t.id; });

      // Period hours (monthly or weekly)
      var periodHours = calculateHoursFromPunches(userPunches, periodRange.start, periodRange.end);

      // Yearly hours (Jan 1 to today)
      var yearlyHours = calculateHoursFromPunches(userPunches, yearStart, today);

      // Paid hours (yearly)
      var userPaidHours = cachedPaidHours.filter(function(ph) { return ph.user_id === t.id; });
      var paidTotal = userPaidHours.reduce(function(sum, ph) { return sum + (parseFloat(ph.hours) || 0); }, 0);

      // Medical hours: from approved Medical holiday_requests
      // Calculate as working days in the request period * (expected_yearly_hours / totalWorkingDaysInYear)
      var userMedical = cachedHolidays.filter(function(h) {
        return h.user_id === t.id && h.type === 'Medical';
      });
      var hoursPerWorkingDay = totalWorkingDaysInYear > 0
        ? (t.expected_yearly_hours || DEFAULTS.EXPECTED_YEARLY_HOURS) / totalWorkingDaysInYear
        : 0;
      var medicalHours = 0;
      userMedical.forEach(function(h) {
        var days = countWorkingDays(h.start_date, h.end_date, schoolHolidayDates);
        medicalHours += days * hoursPerWorkingDay;
      });
      medicalHours = Math.round(medicalHours * 10) / 10;

      // Progress percent
      var expectedYearly = t.expected_yearly_hours || DEFAULTS.EXPECTED_YEARLY_HOURS;
      var expectedToDate = totalWorkingDaysInYear > 0
        ? (expectedYearly * totalWorkingDaysYear / totalWorkingDaysInYear)
        : 0;
      var progressPercent = expectedToDate > 0 ? ((yearlyHours + paidTotal + medicalHours) / expectedToDate) * 100 : 0;
      progressPercent = Math.round(progressPercent * 10) / 10;

      // Prep time: from PREP punches
      var prepPunches = userAllPunches.filter(function(p) { return p.punch_type === 'PREP'; });
      var prepTimeTotal = 0;
      var prepWeeksLogged = new Set();
      prepPunches.forEach(function(p) {
        var match = (p.notes || '').match(/Hours:\s*([\d.]+)/);
        if (match) prepTimeTotal += parseFloat(match[1]);
        var weekMatch = (p.notes || '').match(/Week:\s*(\S+)/);
        if (weekMatch) prepWeeksLogged.add(weekMatch[1]);
      });
      prepTimeTotal = Math.round(prepTimeTotal * 10) / 10;
      var prepTimeYearly = t.prep_time_yearly || DEFAULTS.PREP_TIME_YEARLY;
      var prepPercent = prepTimeYearly > 0 ? (prepTimeTotal / prepTimeYearly) * 100 : 0;
      var prepColor = prepPercent >= 80 ? 'on-track' : prepPercent >= 50 ? 'warning' : 'behind';

      var status = getProgressStatus(progressPercent);

      // Medical hours display for period
      var periodMedicalHours = 0;
      userMedical.forEach(function(h) {
        // Check if medical request overlaps with period
        var overlapStart = h.start_date > periodRange.start ? h.start_date : periodRange.start;
        var overlapEnd = h.end_date < periodRange.end ? h.end_date : periodRange.end;
        if (overlapStart <= overlapEnd) {
          var days = countWorkingDays(overlapStart, overlapEnd, schoolHolidayDates);
          periodMedicalHours += days * hoursPerWorkingDay;
        }
      });
      periodMedicalHours = Math.round(periodMedicalHours * 10) / 10;

      var medicalInline = periodMedicalHours > 0
        ? '<div style="font-size:11px;color:var(--gray-500);margin-top:2px">🏥 incl. ' + periodMedicalHours.toFixed(1) + 'h méd.</div>'
        : '';

      return '<tr onclick="if(typeof openEditTeacherModal===\'function\')openEditTeacherModal(\'' + t.id + '\')" style="cursor:pointer">' +
        '<td><div class="teacher-name">' + t.name + '</div><div class="teacher-email">' + (t.email || '') + '</div></td>' +
        '<td><span class="hours-badge">' + periodHours.toFixed(1) + 'h</span>' + medicalInline + '</td>' +
        '<td>' + (yearlyHours + paidTotal + medicalHours).toFixed(1) + 'h</td>' +
        '<td>' + paidTotal.toFixed(1) + 'h</td>' +
        '<td>' + medicalHours.toFixed(1) + 'h</td>' +
        '<td class="progress-cell"><div class="progress-container">' +
          '<div class="progress-bar-wrapper"><div class="progress-bar ' + status + '" style="width:' + Math.min(progressPercent, 100) + '%"></div></div>' +
          '<div class="progress-text"><span class="progress-percent ' + status + '">' + progressPercent.toFixed(1) + '%</span></div>' +
        '</div></td>' +
        '<td><span class="hours-badge ' + prepColor + '">' + prepTimeTotal + 'h / ' + prepTimeYearly + 'h</span>' +
          '<div style="font-size:11px;color:var(--gray-500);margin-top:2px">' + prepWeeksLogged.size + ' semanas</div></td>' +
        '<td>' + expectedYearly + 'h</td>' +
        '<td><button class="action-btn secondary" onclick="event.stopPropagation();if(typeof openCalendarModal===\'function\')openCalendarModal(\'' + t.id + '\',\'' + t.name.replace(/'/g, "\\'") + '\')" style="padding:6px 12px;font-size:12px">📅</button></td>' +
      '</tr>';
    });

    tbody.innerHTML = rows.join('');

  } catch (err) {
    console.error('Error loading teachers table:', err);
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Error al cargar datos</td></tr>';
  }
}


// ========================================
// TASK 4.2: TEACHER SEARCH & NAVIGATOR
// ========================================

function filterTeachers(query) {
  var search = (query || '').toLowerCase();
  var rows = document.querySelectorAll('#teachersTableBody tr');
  rows.forEach(function(row) {
    var text = row.textContent.toLowerCase();
    row.style.display = text.includes(search) ? '' : 'none';
  });
}

function filterAdmins(query) {
  var search = (query || '').toLowerCase();
  var rows = document.querySelectorAll('#adminTableBody tr');
  rows.forEach(function(row) {
    var text = row.textContent.toLowerCase();
    row.style.display = text.includes(search) ? '' : 'none';
  });
}

// ========================================
// TASK 5.1: ADMIN WORKERS TABLE
// ========================================

async function loadAdminWorkersTable() {
  var tbody = document.getElementById('adminTableBody');
  if (!tbody) return;

  try {
    // Load admin workers
    var aRes = await db.from('profiles').select('*').in('role', ['admin', 'super_admin']).eq('status', 'Active').order('name');
    var admins = aRes.data || [];
    cachedAdmins = admins;

    // Load school holidays
    if (!cachedSchoolHolidays) {
      var shRes = await db.from('school_holidays').select('*');
      cachedSchoolHolidays = shRes.data || [];
    }
    var schoolHolidayDates = buildSchoolHolidayDateSet(cachedSchoolHolidays);

    // Date ranges
    var year = new Date().getFullYear();
    var yearStart = year + '-01-01';
    var today = formatDate(new Date());
    var periodRange = viewMode === 'monthly' ? getMonthRange() : getWeekRange();

    // Load punches
    if (!cachedPunches) {
      var pRes = await db.from('time_punches').select('user_id, date, time, punch_type, notes')
        .in('punch_type', ['IN', 'OUT'])
        .gte('date', yearStart).lte('date', today);
      cachedPunches = pRes.data || [];
    }

    // Load holidays
    if (!cachedHolidays) {
      var hRes = await db.from('holiday_requests').select('*').eq('status', 'Approved');
      cachedHolidays = hRes.data || [];
    }

    // Load paid hours
    if (!cachedPaidHours) {
      var phRes = await db.from('paid_hours').select('*');
      cachedPaidHours = phRes.data || [];
    }

    // Working days
    var totalWorkingDaysYear = countWorkingDays(yearStart, today, schoolHolidayDates);
    var totalWorkingDaysInYear = countWorkingDays(yearStart, year + '-12-31', schoolHolidayDates);

    if (!admins.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No hay administradores activos</td></tr>';
      return;
    }

    var rows = admins.map(function(a) {
      var userPunches = cachedPunches.filter(function(p) { return p.user_id === a.id; });

      // Period hours
      var periodHours = calculateHoursFromPunches(userPunches, periodRange.start, periodRange.end);

      // Yearly hours
      var yearlyHours = calculateHoursFromPunches(userPunches, yearStart, today);

      // Paid hours
      var userPaidHours = cachedPaidHours.filter(function(ph) { return ph.user_id === a.id; });
      var paidTotal = userPaidHours.reduce(function(sum, ph) { return sum + (parseFloat(ph.hours) || 0); }, 0);

      // Medical hours
      var userMedical = cachedHolidays.filter(function(h) {
        return h.user_id === a.id && h.type === 'Medical';
      });
      var expectedYearly = a.expected_yearly_hours || ADMIN_DEFAULTS.EXPECTED_YEARLY_HOURS;
      var hoursPerWorkingDay = totalWorkingDaysInYear > 0 ? expectedYearly / totalWorkingDaysInYear : 0;
      var medicalHours = 0;
      userMedical.forEach(function(h) {
        var days = countWorkingDays(h.start_date, h.end_date, schoolHolidayDates);
        medicalHours += days * hoursPerWorkingDay;
      });
      medicalHours = Math.round(medicalHours * 10) / 10;

      // Progress
      var expectedToDate = totalWorkingDaysInYear > 0
        ? (expectedYearly * totalWorkingDaysYear / totalWorkingDaysInYear)
        : 0;
      var progressPercent = expectedToDate > 0 ? ((yearlyHours + paidTotal + medicalHours) / expectedToDate) * 100 : 0;
      progressPercent = Math.round(progressPercent * 10) / 10;

      var status = getProgressStatus(progressPercent);

      // Period medical hours
      var periodMedicalHours = 0;
      userMedical.forEach(function(h) {
        var overlapStart = h.start_date > periodRange.start ? h.start_date : periodRange.start;
        var overlapEnd = h.end_date < periodRange.end ? h.end_date : periodRange.end;
        if (overlapStart <= overlapEnd) {
          var days = countWorkingDays(overlapStart, overlapEnd, schoolHolidayDates);
          periodMedicalHours += days * hoursPerWorkingDay;
        }
      });
      periodMedicalHours = Math.round(periodMedicalHours * 10) / 10;

      var medicalInline = periodMedicalHours > 0
        ? '<div style="font-size:11px;color:var(--gray-500);margin-top:2px">🏥 incl. ' + periodMedicalHours.toFixed(1) + 'h méd.</div>'
        : '';

      return '<tr onclick="if(typeof openEditAdminModal===\'function\')openEditAdminModal(\'' + a.id + '\')" style="cursor:pointer">' +
        '<td><div class="teacher-name">' + a.name + '</div><div class="teacher-email">' + (a.email || '') + '</div></td>' +
        '<td><span class="hours-badge">' + periodHours.toFixed(1) + 'h</span>' + medicalInline + '</td>' +
        '<td>' + (yearlyHours + paidTotal + medicalHours).toFixed(1) + 'h</td>' +
        '<td>' + paidTotal.toFixed(1) + 'h</td>' +
        '<td>' + medicalHours.toFixed(1) + 'h</td>' +
        '<td class="progress-cell"><div class="progress-container">' +
          '<div class="progress-bar-wrapper"><div class="progress-bar ' + status + '" style="width:' + Math.min(progressPercent, 100) + '%"></div></div>' +
          '<div class="progress-text"><span class="progress-percent ' + status + '">' + progressPercent.toFixed(1) + '%</span></div>' +
        '</div></td>' +
        '<td>' + expectedYearly + 'h</td>' +
        '<td><button class="action-btn secondary" onclick="event.stopPropagation();if(typeof openCalendarModal===\'function\')openCalendarModal(\'' + a.id + '\',\'' + a.name.replace(/'/g, "\\'") + '\')" style="padding:6px 12px;font-size:12px">📅</button></td>' +
      '</tr>';
    });

    tbody.innerHTML = rows.join('');

  } catch (err) {
    console.error('Error loading admin workers table:', err);
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Error al cargar datos</td></tr>';
  }
}

// ========================================
// PLACEHOLDER STUBS (for future tasks)
// ========================================

// These will be implemented in later tasks.
// Having stubs prevents errors when HTML onclick handlers fire.

function exportCSV() { showToast('Exportar CSV - próximamente', 'info'); }
function openAddTeacherModal() { showToast('Añadir profesor - próximamente', 'info'); }
function openAddAdminModal() { showToast('Añadir admin - próximamente', 'info'); }
function submitPaidHours() { showToast('Horas pagadas - próximamente', 'info'); }
function loadHolidayData() { /* stub */ }
function assignDREmpresa() { showToast('Asignar D.R. Empresa - próximamente', 'info'); }
function addSchoolHoliday() { showToast('Añadir festivo - próximamente', 'info'); }
function performArchive() { showToast('Archivar - próximamente', 'info'); }
function changeCalendarMonth() { /* stub */ }
function filterApprovedRequests() { /* stub */ }
function filterHolidayOverview() { /* stub */ }
function filterDREmpresa() { /* stub */ }
function filterPaidHours() { /* stub */ }

// ========================================
// INIT ON DOM READY
// ========================================

document.addEventListener('DOMContentLoaded', initAdmin);
