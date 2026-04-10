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
  document.getElementById('adminName').textContent = (adminProfile.name || 'Admin').split(' ')[0];
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
  var year = new Date().getFullYear();
  var yearStart = year + '-01-01';
  var yearEnd = year + '-12-31';
  schoolHolidays.forEach(function(h) {
    var current = new Date(h.start_date + 'T12:00:00');
    var end = new Date(h.end_date + 'T12:00:00');
    while (current <= end) {
      var dateStr = formatDate(current);
      if (dateStr >= yearStart && dateStr <= yearEnd) {
        dateSet.add(dateStr);
      }
      current.setDate(current.getDate() + 1);
    }
  });
  return dateSet;
}

// Pre-compute working days for the year (weekdays minus school holidays)
// Matches Code.js precomputeWorkingDays() exactly
// asOfDate: optional cutoff date for "passed" working days (defaults to today)
function precomputeWorkingDaysForYear(schoolHolidayDates, asOfDate) {
  var now = asOfDate ? new Date(asOfDate + 'T23:59:59') : new Date();
  now.setHours(0, 0, 0, 0);
  var year = new Date().getFullYear();
  var yearStart = new Date(year, 0, 1);
  var yearEnd = new Date(year, 11, 31);
  var allWorkingDays = new Set();
  var passedWorkingDays = new Set();
  var allCount = 0;
  var passedCount = 0;
  var current = new Date(yearStart);
  current.setHours(0, 0, 0, 0);
  while (current <= yearEnd) {
    var dayOfWeek = current.getDay();
    var dateStr = formatDate(current);
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !schoolHolidayDates.has(dateStr)) {
      allWorkingDays.add(dateStr);
      allCount++;
      if (current <= now) {
        passedWorkingDays.add(dateStr);
        passedCount++;
      }
    }
    current.setDate(current.getDate() + 1);
  }
  return {
    allWorkingDays: allWorkingDays,
    allCount: allCount,
    passedWorkingDays: passedWorkingDays,
    passedCount: passedCount
  };
}

// Calculate a specific teacher's working day progress
// Matches Code.js getTeacherWorkingDayProgress() exactly
function getTeacherProgress(precomputed, teacherHolidayDates, allocatedDays) {
  allocatedDays = allocatedDays || 0;
  var holidaysTakenOnWorkingDays = 0;
  var holidaysTakenOnPassedDays = 0;
  if (teacherHolidayDates && teacherHolidayDates.size > 0) {
    teacherHolidayDates.forEach(function(dateStr) {
      if (precomputed.allWorkingDays.has(dateStr)) {
        holidaysTakenOnWorkingDays++;
        if (precomputed.passedWorkingDays.has(dateStr)) {
          holidaysTakenOnPassedDays++;
        }
      }
    });
  }
  var totalWorkingDays = precomputed.allCount - allocatedDays;
  var passedWorkingDays = precomputed.passedCount - holidaysTakenOnPassedDays;
  totalWorkingDays = Math.max(0, totalWorkingDays);
  passedWorkingDays = Math.max(0, passedWorkingDays);
  return {
    totalWorkingDays: totalWorkingDays,
    passedWorkingDays: passedWorkingDays,
    progressRatio: totalWorkingDays > 0 ? passedWorkingDays / totalWorkingDays : 0
  };
}

// Build a Set of holiday dates for a user from approved non-Medical holiday_requests
function buildTeacherHolidayDates(holidays, userId) {
  var dates = new Set();
  if (!holidays) return dates;
  holidays.forEach(function(h) {
    if (h.user_id !== userId) return;
    if (h.status !== 'Approved') return;
    if (h.type === 'Medical') return;
    var current = new Date(h.start_date + 'T12:00:00');
    var end = new Date(h.end_date + 'T12:00:00');
    while (current <= end) {
      dates.add(formatDate(current));
      current.setDate(current.getDate() + 1);
    }
  });
  return dates;
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
        .gte('date', yearStart).lte('date', today).limit(10000);
      cachedPunches = pRes.data || [];
    }

    // Period range
    var periodRange = viewMode === 'monthly' ? getMonthRange() : getWeekRange();
    var cutoffDate = periodRange.end < today ? periodRange.end : today;

    // Pre-compute working days for the year using cutoff date
    var precomputed = precomputeWorkingDaysForYear(schoolHolidayDates, cutoffDate);

    // Load holiday requests for progress calculation
    if (!cachedHolidays) {
      var hRes = await db.from('holiday_requests').select('*').eq('status', 'Approved');
      cachedHolidays = hRes.data || [];
    }

    // Load paid hours
    if (!cachedPaidHours) {
      var phRes = await db.from('paid_hours').select('*');
      cachedPaidHours = phRes.data || [];
    }

    // Compute stats
    var allProfiles = teachers.concat(admins);
    var totalProgress = 0;
    var onTrackCount = 0;
    var totalPeriodHours = 0;
    var teacherProgressCount = 0;
    var teacherProgressSum = 0;
    var teacherOnTrackCount = 0;

    allProfiles.forEach(function(profile) {
      var userPunches = cachedPunches.filter(function(p) { return p.user_id === profile.id; });
      var yearlyHours = calculateHoursFromPunches(userPunches, yearStart, cutoffDate);
      var periodHours = calculateHoursFromPunches(userPunches, periodRange.start, periodRange.end);

      var isAdmin = profile.role === 'admin' || profile.role === 'super_admin';
      var defaults = isAdmin ? ADMIN_DEFAULTS : DEFAULTS;
      var expectedYearly = profile.expected_yearly_hours || defaults.EXPECTED_YEARLY_HOURS;
      var annualDays = profile.annual_days || defaults.ANNUAL_DAYS;
      var personalDays = profile.personal_days || defaults.PERSONAL_DAYS;
      var schoolDays = profile.school_days || defaults.SCHOOL_DAYS;

      // Build teacher holiday dates (approved, non-Medical)
      var teacherHolidayDates = buildTeacherHolidayDates(cachedHolidays, profile.id);
      var allocatedDays = Math.max(0, annualDays - 3) + personalDays + schoolDays;
      var progress = getTeacherProgress(precomputed, teacherHolidayDates, allocatedDays);

      // Medical hours for period
      var hoursPerWorkingDay = progress.totalWorkingDays > 0 ? expectedYearly / progress.totalWorkingDays : 0;
      var userMedical = cachedHolidays.filter(function(h) {
        return h.user_id === profile.id && h.type === 'Medical';
      });
      var periodMedicalHours = 0;
      userMedical.forEach(function(h) {
        var overlapStart = h.start_date > periodRange.start ? h.start_date : periodRange.start;
        var overlapEnd = h.end_date < periodRange.end ? h.end_date : periodRange.end;
        if (overlapStart <= overlapEnd) {
          var days = countWorkingDays(overlapStart, overlapEnd, schoolHolidayDates);
          periodMedicalHours += days * hoursPerWorkingDay;
        }
      });

      // MedAppt hours for period
      var periodMedApptHours = 0;
      cachedHolidays.filter(function(h) {
        return h.user_id === profile.id && h.type === 'MedAppt';
      }).forEach(function(h) {
        var hDate = h.start_date || '';
        if (hDate >= periodRange.start && hDate <= periodRange.end) {
          periodMedApptHours += parseFloat(h.total_days) || 0;
        }
      });

      // Paid hours for period
      var periodPaidHours = 0;
      if (cachedPaidHours) {
        cachedPaidHours.filter(function(ph) { return ph.user_id === profile.id; }).forEach(function(ph) {
          var phDate = ph.date || '';
          if (phDate >= periodRange.start && phDate <= periodRange.end) {
            periodPaidHours += parseFloat(ph.hours) || 0;
          }
        });
      }

      // Period hours matching old code: worked - paid + medical + medAppt
      var adjustedPeriodHours = periodHours - periodPaidHours + periodMedicalHours + periodMedApptHours;

      // Only teachers count toward the period hours stat (matches old app)
      if (!isAdmin) {
        totalPeriodHours += adjustedPeriodHours;
      }

      // Progress: use yearly totals (capped at cutoff date)
      var yearlyMedicalHours = 0;
      userMedical.forEach(function(h) {
        var medStart = h.start_date > yearStart ? h.start_date : yearStart;
        var medEnd = h.end_date < cutoffDate ? h.end_date : cutoffDate;
        if (medStart <= medEnd) {
          var days = countWorkingDays(medStart, medEnd, schoolHolidayDates);
          yearlyMedicalHours += days * hoursPerWorkingDay;
        }
      });
      var yearlyMedApptHours = 0;
      cachedHolidays.filter(function(h) {
        return h.user_id === profile.id && h.type === 'MedAppt';
      }).forEach(function(h) {
        var hDate = h.start_date || '';
        if (hDate >= yearStart && hDate <= cutoffDate) {
          yearlyMedApptHours += parseFloat(h.total_days) || 0;
        }
      });
      var yearlyPaidHours = 0;
      if (cachedPaidHours) {
        cachedPaidHours.filter(function(ph) { return ph.user_id === profile.id; }).forEach(function(ph) {
          yearlyPaidHours += parseFloat(ph.hours) || 0;
        });
      }
      var totalHours = yearlyHours - yearlyPaidHours + yearlyMedicalHours + yearlyMedApptHours;

      var expectedToDate = expectedYearly * progress.progressRatio;
      var percent = expectedToDate > 0 ? (totalHours / expectedToDate) * 100 : 0;

      totalProgress += percent;
      if (percent >= 98) onTrackCount++;

      // Track teacher-only stats for on-track display (matches old app)
      if (!isAdmin) {
        teacherProgressCount++;
        teacherProgressSum += percent;
        if (percent >= 98) teacherOnTrackCount++;
      }
    });

    var avgProgress = allProfiles.length > 0 ? Math.round(totalProgress / allProfiles.length) : 0;

    // Working days stats — year-level (passed/total for the year)
    var passedWorkingDays = precomputed.passedCount;
    var totalWorkingDaysYear = precomputed.allCount;

    // Render stats
    document.getElementById('statTeachers').textContent = teachers.length;
    document.getElementById('statAdmins').textContent = admins.length;
    document.getElementById('statOnTrack').textContent = onTrackCount + '/' + allProfiles.length;
    document.getElementById('statAvgProgress').textContent = 'Progreso promedio: ' + avgProgress + '%';
    document.getElementById('statWorkingDays').textContent = passedWorkingDays + '/' + totalWorkingDaysYear;
    document.getElementById('statSchoolHolidays').textContent = schoolHolidayDates.size + ' festivos configurados';
    document.getElementById('statPeriodHours').textContent = totalPeriodHours.toFixed(1) + 'h';

    // Update period label
    var monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    var periodLabel = document.getElementById('statPeriodLabel');
    if (periodLabel) {
      var monthRange = getMonthRange();
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

    // Cutoff date: for current period use today, for past periods use end of period
    // This matches Code.js: progressDate = isCurrentMonth ? now : new Date(year, month, 0)
    var cutoffDate = periodRange.end < today ? periodRange.end : today;

    // Load all punches for the year (IN/OUT + PREP)
    var pRes = await db.from('time_punches').select('user_id, date, time, punch_type, notes')
      .gte('date', yearStart).lte('date', today).limit(10000);
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

    // Pre-compute working days for the year using cutoff date
    var precomputed = precomputeWorkingDaysForYear(schoolHolidayDates, cutoffDate);

    if (!teachers.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No hay profesores activos</td></tr>';
      return;
    }

    var rows = teachers.map(function(t) {
      var userPunches = cachedPunches.filter(function(p) { return p.user_id === t.id; });
      var userAllPunches = allPunches.filter(function(p) { return p.user_id === t.id; });

      // Period hours (monthly or weekly)
      var periodHours = calculateHoursFromPunches(userPunches, periodRange.start, periodRange.end);

      // Yearly hours (Jan 1 to cutoff date — end of period for past, today for current)
      var yearlyHours = calculateHoursFromPunches(userPunches, yearStart, cutoffDate);

      // Paid hours (yearly)
      var userPaidHours = cachedPaidHours.filter(function(ph) { return ph.user_id === t.id; });
      var paidTotal = userPaidHours.reduce(function(sum, ph) { return sum + (parseFloat(ph.hours) || 0); }, 0);

      // Medical hours: from approved Medical holiday_requests
      // Calculate as working days in the request period * (expected_yearly_hours / totalWorkingDays)
      var userMedical = cachedHolidays.filter(function(h) {
        return h.user_id === t.id && h.type === 'Medical';
      });

      // Progress calculation using Code.js approach
      var expectedYearly = t.expected_yearly_hours || DEFAULTS.EXPECTED_YEARLY_HOURS;
      var annualDays = t.annual_days || DEFAULTS.ANNUAL_DAYS;
      var personalDays = t.personal_days || DEFAULTS.PERSONAL_DAYS;
      var schoolDays = t.school_days || DEFAULTS.SCHOOL_DAYS;

      // Build teacher holiday dates (approved, non-Medical)
      var teacherHolidayDates = buildTeacherHolidayDates(cachedHolidays, t.id);
      var allocatedDays = Math.max(0, annualDays - 3) + personalDays + schoolDays;
      var progress = getTeacherProgress(precomputed, teacherHolidayDates, allocatedDays);

      var hoursPerWorkingDay = progress.totalWorkingDays > 0
        ? expectedYearly / progress.totalWorkingDays
        : 0;
      var medicalHours = 0;
      userMedical.forEach(function(h) {
        // Cap medical range at cutoff date
        var medStart = h.start_date > yearStart ? h.start_date : yearStart;
        var medEnd = h.end_date < cutoffDate ? h.end_date : cutoffDate;
        if (medStart <= medEnd) {
          var days = countWorkingDays(medStart, medEnd, schoolHolidayDates);
          medicalHours += days * hoursPerWorkingDay;
        }
      });
      medicalHours = Math.round(medicalHours * 100) / 100;

      // MedAppt hours: from approved MedAppt holiday_requests (hours stored in total_days field)
      var userMedAppt = cachedHolidays.filter(function(h) {
        return h.user_id === t.id && h.type === 'MedAppt';
      });
      var medApptHours = 0;
      userMedAppt.forEach(function(h) {
        var hDate = h.start_date || '';
        if (hDate >= yearStart && hDate <= cutoffDate) {
          medApptHours += parseFloat(h.total_days) || 0;
        }
      });
      medApptHours = Math.round(medApptHours * 100) / 100;

      // Total hours = worked - paid + medical + medAppt (matches Code.js exactly)
      var totalHours = yearlyHours - paidTotal + medicalHours + medApptHours;

      // Progress percent using Code.js formula
      var expectedToDate = expectedYearly * progress.progressRatio;
      var progressPercent = expectedToDate > 0 ? (totalHours / expectedToDate) * 100 : 0;
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
        '<td>' + totalHours.toFixed(1) + 'h' + (medicalHours > 0 ? '<div style="font-size:10px;color:#991b1b">🏥 ' + medicalHours.toFixed(1) + 'h méd.</div>' : '') + '</td>' +
        '<td>' + paidTotal.toFixed(1) + 'h</td>' +
        '<td class="progress-cell"><div class="progress-container">' +
          '<div class="progress-bar-wrapper"><div class="progress-bar ' + status + '" style="width:' + Math.min(progressPercent, 100) + '%"></div></div>' +
          '<div class="progress-text"><span class="progress-percent ' + status + '">' + progressPercent.toFixed(0) + '%</span><span style="color:#94a3b8;font-size:11px">' + Math.round(expectedToDate) + 'h esp</span></div>' +
        '</div></td>' +
        '<td style="font-size:12px;white-space:nowrap"><span class="' + prepColor + '" style="font-weight:600">' + prepTimeTotal + 'h</span><span style="color:var(--gray-400)"> / ' + prepTimeYearly + 'h</span>' +
          (prepWeeksLogged.size > 0 ? '<div style="font-size:10px;color:var(--gray-400);margin-top:2px">' + prepWeeksLogged.size + ' sem</div>' : '') + '</td>' +
        '<td>' + expectedYearly + 'h</td>' +
        '<td onclick="event.stopPropagation()"><button class="view-btn" onclick="openCalendarModal(\'' + t.id + '\',\'' + t.name.replace(/'/g, "\\'") + '\')">📅 Calendario</button></td>' +
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
    var cutoffDate = periodRange.end < today ? periodRange.end : today;

    // Load punches
    if (!cachedPunches) {
      var pRes = await db.from('time_punches').select('user_id, date, time, punch_type, notes')
        .in('punch_type', ['IN', 'OUT'])
        .gte('date', yearStart).lte('date', today).limit(10000);
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

    // Pre-compute working days for the year using cutoff date
    var precomputed = precomputeWorkingDaysForYear(schoolHolidayDates, cutoffDate);

    if (!admins.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No hay administradores activos</td></tr>';
      return;
    }

    var rows = admins.map(function(a) {
      var userPunches = cachedPunches.filter(function(p) { return p.user_id === a.id; });

      // Period hours
      var periodHours = calculateHoursFromPunches(userPunches, periodRange.start, periodRange.end);

      // Yearly hours (up to cutoff)
      var yearlyHours = calculateHoursFromPunches(userPunches, yearStart, cutoffDate);

      // Paid hours
      var userPaidHours = cachedPaidHours.filter(function(ph) { return ph.user_id === a.id; });
      var paidTotal = userPaidHours.reduce(function(sum, ph) { return sum + (parseFloat(ph.hours) || 0); }, 0);

      // Medical hours
      var userMedical = cachedHolidays.filter(function(h) {
        return h.user_id === a.id && h.type === 'Medical';
      });

      // Progress calculation using Code.js approach
      var expectedYearly = a.expected_yearly_hours || ADMIN_DEFAULTS.EXPECTED_YEARLY_HOURS;
      var annualDays = a.annual_days || ADMIN_DEFAULTS.ANNUAL_DAYS;
      var personalDays = a.personal_days || ADMIN_DEFAULTS.PERSONAL_DAYS;
      var schoolDays = a.school_days || ADMIN_DEFAULTS.SCHOOL_DAYS;

      // Build teacher holiday dates (approved, non-Medical)
      var teacherHolidayDates = buildTeacherHolidayDates(cachedHolidays, a.id);
      var allocatedDays = Math.max(0, annualDays - 3) + personalDays + schoolDays;
      var progress = getTeacherProgress(precomputed, teacherHolidayDates, allocatedDays);

      var hoursPerWorkingDay = progress.totalWorkingDays > 0 ? expectedYearly / progress.totalWorkingDays : 0;
      var medicalHours = 0;
      userMedical.forEach(function(h) {
        var medStart = h.start_date > yearStart ? h.start_date : yearStart;
        var medEnd = h.end_date < cutoffDate ? h.end_date : cutoffDate;
        if (medStart <= medEnd) {
          var days = countWorkingDays(medStart, medEnd, schoolHolidayDates);
          medicalHours += days * hoursPerWorkingDay;
        }
      });
      medicalHours = Math.round(medicalHours * 100) / 100;

      // MedAppt hours
      var userMedAppt = cachedHolidays.filter(function(h) {
        return h.user_id === a.id && h.type === 'MedAppt';
      });
      var medApptHours = 0;
      userMedAppt.forEach(function(h) {
        var hDate = h.start_date || '';
        if (hDate >= yearStart && hDate <= cutoffDate) {
          medApptHours += parseFloat(h.total_days) || 0;
        }
      });
      medApptHours = Math.round(medApptHours * 100) / 100;

      // Total hours = worked - paid + medical + medAppt (matches Code.js)
      var totalHours = yearlyHours - paidTotal + medicalHours + medApptHours;

      // Progress using Code.js formula
      var expectedToDate = expectedYearly * progress.progressRatio;
      var progressPercent = expectedToDate > 0 ? (totalHours / expectedToDate) * 100 : 0;
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
        '<td>' + totalHours.toFixed(1) + 'h' + (medicalHours > 0 ? '<div style="font-size:10px;color:#991b1b">🏥 ' + medicalHours.toFixed(1) + 'h méd.</div>' : '') + '</td>' +
        '<td>' + paidTotal.toFixed(1) + 'h</td>' +
        '<td class="progress-cell"><div class="progress-container">' +
          '<div class="progress-bar-wrapper"><div class="progress-bar ' + status + '" style="width:' + Math.min(progressPercent, 100) + '%"></div></div>' +
          '<div class="progress-text"><span class="progress-percent ' + status + '">' + progressPercent.toFixed(0) + '%</span><span style="color:#94a3b8;font-size:11px">' + Math.round(expectedToDate) + 'h esp</span></div>' +
        '</div></td>' +
        '<td>' + expectedYearly + 'h</td>' +
        '<td onclick="event.stopPropagation()"><button class="view-btn" onclick="openCalendarModal(\'' + a.id + '\',\'' + a.name.replace(/'/g, "\\'") + '\')">📅 Calendario</button></td>' +
      '</tr>';
    });

    tbody.innerHTML = rows.join('');

  } catch (err) {
    console.error('Error loading admin workers table:', err);
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Error al cargar datos</td></tr>';
  }
}

// Stubs removed — real implementations follow below.


// ========================================
// TASK 6.1: CALENDAR MODAL
// ========================================

var calendarUserId = null;
var calendarUserName = '';
var calendarMonthOffset = 0;

async function openCalendarModal(userId, userName) {
  calendarUserId = userId;
  calendarUserName = userName;
  calendarMonthOffset = 0;
  await renderCalendarModal();
}

async function renderCalendarModal() {
  var now = new Date();
  var d = new Date(now.getFullYear(), now.getMonth() + calendarMonthOffset, 1);
  var year = d.getFullYear();
  var month = d.getMonth();
  var monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun

  // Query punches for this user for this month
  var startDate = year + '-' + String(month + 1).padStart(2, '0') + '-01';
  var endDate = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(daysInMonth).padStart(2, '0');

  var { data: punches } = await db.from('time_punches').select('*')
    .eq('user_id', calendarUserId)
    .gte('date', startDate).lte('date', endDate)
    .order('date').order('time');
  punches = punches || [];

  // Group punches by date
  var byDate = {};
  punches.forEach(function(p) {
    if (!byDate[p.date]) byDate[p.date] = [];
    byDate[p.date].push(p);
  });

  var isCurrentMonth = calendarMonthOffset >= 0;
  var prevDisabled = '';
  var nextDisabled = calendarMonthOffset >= 0 ? 'disabled' : '';

  var html = '<div style="margin-bottom:20px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
      '<button class="month-nav-btn" onclick="calendarMonthOffset--;renderCalendarModal()" ' + prevDisabled + '>‹</button>' +
      '<div style="font-size:18px;font-weight:700;color:var(--primary)">' + monthNames[month] + ' ' + year +
        (calendarMonthOffset === 0 ? ' <span class="actual-badge">ACTUAL</span>' : '') + '</div>' +
      '<button class="month-nav-btn" onclick="calendarMonthOffset++;renderCalendarModal()" ' + nextDisabled + '>›</button>' +
    '</div>' +
    '<div class="calendar-grid">';

  // Day headers
  var dayHeaders = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  dayHeaders.forEach(function(dh) {
    html += '<div class="calendar-header-cell">' + dh + '</div>';
  });

  // Empty cells before first day
  for (var e = 0; e < firstDayOfWeek; e++) {
    html += '<div class="calendar-cell empty"></div>';
  }

  var todayStr = formatDate(new Date());

  // Day cells
  for (var day = 1; day <= daysInMonth; day++) {
    var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    var dayPunches = byDate[dateStr] || [];
    var inOutPunches = dayPunches.filter(function(p) { return p.punch_type === 'IN' || p.punch_type === 'OUT'; });
    var hasPunches = inOutPunches.length > 0;
    var hours = hasPunches ? calculateDayHours(inOutPunches) : 0;
    var isToday = dateStr === todayStr;

    var classes = 'calendar-cell';
    if (hasPunches) classes += ' has-punches';
    if (isToday) classes += ' today';

    html += '<div class="' + classes + '" onclick="showDayDetail(\'' + dateStr + '\')">';
    html += '<div class="calendar-day-num">' + day + '</div>';
    if (hasPunches) {
      html += '<div class="calendar-punch-count">' + inOutPunches.length + ' fichajes</div>';
      html += '<div class="calendar-hours">' + hours.toFixed(1) + 'h</div>';
    }
    html += '</div>';
  }

  html += '</div></div>';
  html += '<div id="calendarDayDetail"></div>';

  openModal('📅 ' + calendarUserName, html, true);
}

async function showDayDetail(dateStr) {
  var container = document.getElementById('calendarDayDetail');
  if (!container) return;

  var { data: punches } = await db.from('time_punches').select('*')
    .eq('user_id', calendarUserId)
    .eq('date', dateStr)
    .order('time');
  punches = punches || [];

  var inOutPunches = punches.filter(function(p) { return p.punch_type === 'IN' || p.punch_type === 'OUT'; });
  var hours = calculateDayHours(inOutPunches);

  var dateDisplay = formatDateDisplay(dateStr);
  var isSuperAdmin = adminProfile && adminProfile.role === 'super_admin';

  var html = '<div class="day-hours-summary">' +
    '<div class="day-hours-value">' + hours.toFixed(2) + 'h</div>' +
    '<div class="day-hours-label">' + dateDisplay + '</div>' +
  '</div>';

  // Super admin add punch button
  if (isSuperAdmin) {
    html += '<div style="margin-bottom:15px">' +
      '<button class="action-btn add" onclick="showAddPunchForm(\'' + dateStr + '\')" style="padding:8px 16px;font-size:13px">➕ Añadir Fichaje</button>' +
    '</div>';
    html += '<div id="addPunchFormContainer"></div>';
  }

  if (!punches.length) {
    html += '<div class="empty-state" style="padding:30px"><div class="empty-state-icon">📭</div><div class="empty-state-text">Sin fichajes este día</div></div>';
  } else {
    punches.forEach(function(p) {
      var typeClass = p.punch_type === 'IN' ? 'in' : 'out';
      var typeLabel = p.punch_type === 'IN' ? 'ENTRADA' : (p.punch_type === 'OUT' ? 'SALIDA' : p.punch_type);
      var typeColorClass = p.punch_type === 'IN' ? 'in' : 'out';

      html += '<div class="day-punch-item ' + typeClass + '" id="punch-' + p.id + '">' +
        '<div class="punch-info">' +
          '<span class="punch-type ' + typeColorClass + '">' + typeLabel + '</span>' +
          '<span class="punch-time-display">' + (p.time || '').substring(0, 5) + '</span>' +
        '</div>';

      if (isSuperAdmin) {
        html += '<div style="display:flex;gap:6px">' +
          '<button class="holiday-action-btn edit" onclick="showEditPunchForm(\'' + p.id + '\',\'' + (p.time || '').substring(0, 5) + '\',\'' + dateStr + '\')">✏️</button>' +
          '<button class="holiday-action-btn delete" onclick="deletePunch(\'' + p.id + '\',\'' + dateStr + '\')">🗑️</button>' +
        '</div>';
      }

      html += '</div>';
    });
  }

  container.innerHTML = html;
}


// ========================================
// TASK 6.2: SUPER ADMIN PUNCH CRUD
// ========================================

function showAddPunchForm(dateStr) {
  var container = document.getElementById('addPunchFormContainer');
  if (!container) return;
  var now = new Date();
  var defaultTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

  container.innerHTML = '<div style="background:var(--gray-50);padding:15px;border-radius:10px;margin-bottom:15px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
    '<input type="time" id="newPunchTime" value="' + defaultTime + '" class="form-input" style="width:auto">' +
    '<select id="newPunchType" class="form-select" style="width:auto">' +
      '<option value="auto">Automático</option>' +
      '<option value="IN">ENTRADA</option>' +
      '<option value="OUT">SALIDA</option>' +
    '</select>' +
    '<button class="action-btn primary" onclick="saveNewPunch(\'' + dateStr + '\')" style="padding:8px 16px;font-size:13px">💾 Guardar</button>' +
    '<button class="cancel-btn" onclick="document.getElementById(\'addPunchFormContainer\').innerHTML=\'\'" style="padding:8px 16px;font-size:13px">Cancelar</button>' +
  '</div>';
}

async function saveNewPunch(dateStr) {
  var timeVal = document.getElementById('newPunchTime').value;
  var typeVal = document.getElementById('newPunchType').value;
  if (!timeVal) { showToast('Introduce una hora', 'error'); return; }

  // Auto-detect type based on existing punches
  if (typeVal === 'auto') {
    var { data: existing } = await db.from('time_punches').select('punch_type')
      .eq('user_id', calendarUserId).eq('date', dateStr)
      .in('punch_type', ['IN', 'OUT']).order('time', { ascending: false }).limit(1);
    if (existing && existing.length > 0 && existing[0].punch_type === 'IN') {
      typeVal = 'OUT';
    } else {
      typeVal = 'IN';
    }
  }

  var { error } = await db.from('time_punches').insert({
    user_id: calendarUserId,
    date: dateStr,
    time: timeVal + ':00',
    punch_type: typeVal,
    notes: 'Añadido por admin'
  });

  if (error) { showToast('Error al añadir fichaje: ' + error.message, 'error'); return; }
  showToast('Fichaje añadido', 'success');
  await showDayDetail(dateStr);
  await renderCalendarModal();
}

function showEditPunchForm(punchId, currentTime, dateStr) {
  var el = document.getElementById('punch-' + punchId);
  if (!el) return;
  el.innerHTML = '<div style="display:flex;align-items:center;gap:10px;width:100%">' +
    '<input type="time" id="editPunchTime-' + punchId + '" value="' + currentTime + '" class="form-input" style="width:auto">' +
    '<button class="action-btn primary" onclick="saveEditPunch(\'' + punchId + '\',\'' + dateStr + '\')" style="padding:6px 12px;font-size:12px">💾</button>' +
    '<button class="cancel-btn" onclick="showDayDetail(\'' + dateStr + '\')" style="padding:6px 12px;font-size:12px">✕</button>' +
  '</div>';
}

async function saveEditPunch(punchId, dateStr) {
  var timeVal = document.getElementById('editPunchTime-' + punchId).value;
  if (!timeVal) { showToast('Introduce una hora', 'error'); return; }

  var { error } = await db.from('time_punches').update({
    time: timeVal + ':00',
    edited_at: new Date().toISOString()
  }).eq('id', punchId);

  if (error) { showToast('Error al editar: ' + error.message, 'error'); return; }
  showToast('Fichaje actualizado', 'success');
  await showDayDetail(dateStr);
  await renderCalendarModal();
}

async function deletePunch(punchId, dateStr) {
  var el = document.getElementById('punch-' + punchId);
  if (el) el.style.opacity = '0.4';

  var { error } = await db.from('time_punches').delete().eq('id', punchId);
  if (error) {
    if (el) el.style.opacity = '1';
    showToast('Error al eliminar: ' + error.message, 'error');
    return;
  }
  showToast('Fichaje eliminado', 'success');
  await showDayDetail(dateStr);
  await renderCalendarModal();
}


// ========================================
// TASK 7.1: EDIT TEACHER MODAL
// ========================================

async function openEditTeacherModal(userId) {
  var { data: profile, error } = await db.from('profiles').select('*').eq('id', userId).single();
  if (error || !profile) { showToast('Error al cargar perfil', 'error'); return; }

  var html = '<div style="margin-bottom:20px">' +
    '<div class="teacher-name" style="font-size:20px">' + profile.name + '</div>' +
    '<div class="teacher-email">' + (profile.email || '') + '</div>' +
    '<span class="type-badge teacher" style="margin-top:8px;display:inline-block">Profesor</span>' +
    (profile.status === 'Inactive' ? ' <span class="status-badge inactive">Inactivo</span>' : '') +
  '</div>';

  // Work hours section
  html += '<div class="settings-section">' +
    '<div class="settings-section-title">📊 Objetivo de Horas de Trabajo</div>' +
    '<div class="settings-grid">' +
      '<div class="setting-item highlight">' +
        '<div class="setting-label">Horas Anuales Esperadas</div>' +
        '<input type="number" class="setting-input" id="editExpectedHours" value="' + (profile.expected_yearly_hours || DEFAULTS.EXPECTED_YEARLY_HOURS) + '">' +
      '</div>' +
    '</div>' +
  '</div>';

  // Prep time section
  html += '<div class="settings-section">' +
    '<div class="settings-section-title">📚 Tiempo de Preparación (No Lectivo)</div>' +
    '<div class="settings-grid">' +
      '<div class="setting-item">' +
        '<div class="setting-label">Horas No Lectivas Anual</div>' +
        '<input type="number" class="setting-input" id="editPrepTime" value="' + (profile.prep_time_yearly != null ? profile.prep_time_yearly : DEFAULTS.PREP_TIME_YEARLY) + '">' +
        '<div class="form-hint" style="margin-top:6px">~' + ((profile.prep_time_yearly || DEFAULTS.PREP_TIME_YEARLY) / DEFAULTS.WORKING_WEEKS_PER_YEAR).toFixed(1) + 'h/semana</div>' +
      '</div>' +
    '</div>' +
  '</div>';

  // Holiday allocations
  html += '<div class="settings-section">' +
    '<div class="settings-section-title">🏖️ Asignación de Permisos</div>' +
    '<div class="settings-grid">' +
      '<div class="setting-item">' +
        '<div class="setting-label">Vacaciones (días)</div>' +
        '<input type="number" class="setting-input" id="editAnnualDays" value="' + (profile.annual_days != null ? profile.annual_days : DEFAULTS.ANNUAL_DAYS) + '">' +
      '</div>' +
      '<div class="setting-item">' +
        '<div class="setting-label">D.R. Empleado (días)</div>' +
        '<input type="number" class="setting-input" id="editPersonalDays" value="' + (profile.personal_days != null ? profile.personal_days : DEFAULTS.PERSONAL_DAYS) + '">' +
      '</div>' +
      '<div class="setting-item">' +
        '<div class="setting-label">D.R. Empresa (días)</div>' +
        '<input type="number" class="setting-input" id="editSchoolDays" value="' + (profile.school_days != null ? profile.school_days : DEFAULTS.SCHOOL_DAYS) + '">' +
      '</div>' +
      '<div class="setting-item">' +
        '<div class="setting-label">Visita Médica (horas)</div>' +
        '<input type="number" class="setting-input" id="editMedApptHours" value="' + (profile.med_appt_hours != null ? profile.med_appt_hours : DEFAULTS.MEDICAL_APPT_HOURS) + '">' +
      '</div>' +
    '</div>' +
  '</div>';

  // Save button
  html += '<div class="btn-row">' +
    '<button class="submit-btn" onclick="saveTeacherSettings(\'' + userId + '\')">💾 Guardar Cambios</button>' +
  '</div>';

  // Deactivate button
  html += '<div style="margin-top:20px;padding-top:20px;border-top:2px solid #fee2e2">' +
    '<button class="action-btn" onclick="deactivateProfile(\'' + userId + '\',\'teacher\')" style="width:100%;padding:12px;background:#fff;border:2px solid var(--danger);color:var(--danger);border-radius:10px;font-weight:600;cursor:pointer">🗑️ Desactivar Profesor</button>' +
  '</div>';

  openModal('⚙️ Configuración de Profesor', html);
}

async function saveTeacherSettings(userId) {
  var updates = {
    expected_yearly_hours: parseInt(document.getElementById('editExpectedHours').value) || DEFAULTS.EXPECTED_YEARLY_HOURS,
    prep_time_yearly: parseFloat(document.getElementById('editPrepTime').value) || DEFAULTS.PREP_TIME_YEARLY,
    annual_days: parseInt(document.getElementById('editAnnualDays').value) || DEFAULTS.ANNUAL_DAYS,
    personal_days: parseInt(document.getElementById('editPersonalDays').value) || DEFAULTS.PERSONAL_DAYS,
    school_days: parseInt(document.getElementById('editSchoolDays').value) || DEFAULTS.SCHOOL_DAYS,
    med_appt_hours: parseFloat(document.getElementById('editMedApptHours').value) || DEFAULTS.MEDICAL_APPT_HOURS
  };

  var { error } = await db.from('profiles').update(updates).eq('id', userId);
  if (error) { showToast('Error al guardar: ' + error.message, 'error'); return; }
  showToast('Configuración guardada', 'success');
  closeModal();
  cachedTeachers = null;
  cachedPunches = null;
  await loadTeachersTable();
}

async function deactivateProfile(userId, type) {
  var confirmHtml = '<div style="text-align:center;padding:20px">' +
    '<div style="font-size:48px;margin-bottom:15px">⚠️</div>' +
    '<div style="font-size:18px;font-weight:700;color:var(--danger);margin-bottom:10px">¿Desactivar este perfil?</div>' +
    '<p style="color:var(--gray-500);margin-bottom:20px">El usuario no podrá acceder al sistema. Esta acción se puede revertir.</p>' +
    '<div class="btn-row">' +
      '<button class="submit-btn" style="background:var(--danger)" onclick="confirmDeactivate(\'' + userId + '\',\'' + type + '\')">Sí, Desactivar</button>' +
      '<button class="cancel-btn" onclick="closeModal()">Cancelar</button>' +
    '</div>' +
  '</div>';
  openModal('Confirmar Desactivación', confirmHtml);
}

async function confirmDeactivate(userId, type) {
  var { error } = await db.from('profiles').update({ status: 'Inactive' }).eq('id', userId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Perfil desactivado', 'success');
  closeModal();
  cachedTeachers = null;
  cachedAdmins = null;
  cachedPunches = null;
  if (type === 'teacher') await loadTeachersTable();
  else await loadAdminWorkersTable();
}

// ========================================
// TASK 7.2: EDIT ADMIN MODAL
// ========================================

async function openEditAdminModal(userId) {
  var { data: profile, error } = await db.from('profiles').select('*').eq('id', userId).single();
  if (error || !profile) { showToast('Error al cargar perfil', 'error'); return; }

  var roleBadge = profile.role === 'super_admin' ? '<span class="type-badge super_admin">Super Admin</span>' : '<span class="type-badge admin">Admin</span>';

  var html = '<div style="margin-bottom:20px">' +
    '<div class="teacher-name" style="font-size:20px">' + profile.name + '</div>' +
    '<div class="teacher-email">' + (profile.email || '') + '</div>' +
    roleBadge +
    (profile.status === 'Inactive' ? ' <span class="status-badge inactive">Inactivo</span>' : '') +
  '</div>';

  // Work hours section
  html += '<div class="settings-section">' +
    '<div class="settings-section-title">📊 Objetivo de Horas de Trabajo</div>' +
    '<div class="settings-grid">' +
      '<div class="setting-item highlight">' +
        '<div class="setting-label">Horas Anuales Esperadas</div>' +
        '<input type="number" class="setting-input" id="editAdminExpectedHours" value="' + (profile.expected_yearly_hours || ADMIN_DEFAULTS.EXPECTED_YEARLY_HOURS) + '">' +
      '</div>' +
    '</div>' +
  '</div>';

  // Holiday allocations (no prep time)
  html += '<div class="settings-section">' +
    '<div class="settings-section-title">🏖️ Asignación de Permisos</div>' +
    '<div class="settings-grid">' +
      '<div class="setting-item">' +
        '<div class="setting-label">Vacaciones (días)</div>' +
        '<input type="number" class="setting-input" id="editAdminAnnualDays" value="' + (profile.annual_days != null ? profile.annual_days : ADMIN_DEFAULTS.ANNUAL_DAYS) + '">' +
      '</div>' +
      '<div class="setting-item">' +
        '<div class="setting-label">D.R. Empleado (días)</div>' +
        '<input type="number" class="setting-input" id="editAdminPersonalDays" value="' + (profile.personal_days != null ? profile.personal_days : ADMIN_DEFAULTS.PERSONAL_DAYS) + '">' +
      '</div>' +
      '<div class="setting-item">' +
        '<div class="setting-label">D.R. Empresa (días)</div>' +
        '<input type="number" class="setting-input" id="editAdminSchoolDays" value="' + (profile.school_days != null ? profile.school_days : ADMIN_DEFAULTS.SCHOOL_DAYS) + '">' +
      '</div>' +
      '<div class="setting-item">' +
        '<div class="setting-label">Visita Médica (horas)</div>' +
        '<input type="number" class="setting-input" id="editAdminMedApptHours" value="' + (profile.med_appt_hours != null ? profile.med_appt_hours : ADMIN_DEFAULTS.MEDICAL_APPT_HOURS) + '">' +
      '</div>' +
    '</div>' +
  '</div>';

  // Save button
  html += '<div class="btn-row">' +
    '<button class="submit-btn" onclick="saveAdminSettings(\'' + userId + '\')">💾 Guardar Cambios</button>' +
  '</div>';

  // Deactivate button
  html += '<div style="margin-top:20px;padding-top:20px;border-top:2px solid #fee2e2">' +
    '<button class="action-btn" onclick="deactivateProfile(\'' + userId + '\',\'admin\')" style="width:100%;padding:12px;background:#fff;border:2px solid var(--danger);color:var(--danger);border-radius:10px;font-weight:600;cursor:pointer">🗑️ Desactivar Admin</button>' +
  '</div>';

  openModal('⚙️ Configuración de Admin', html);
}

async function saveAdminSettings(userId) {
  var updates = {
    expected_yearly_hours: parseInt(document.getElementById('editAdminExpectedHours').value) || ADMIN_DEFAULTS.EXPECTED_YEARLY_HOURS,
    annual_days: parseInt(document.getElementById('editAdminAnnualDays').value) || ADMIN_DEFAULTS.ANNUAL_DAYS,
    personal_days: parseInt(document.getElementById('editAdminPersonalDays').value) || ADMIN_DEFAULTS.PERSONAL_DAYS,
    school_days: parseInt(document.getElementById('editAdminSchoolDays').value) || ADMIN_DEFAULTS.SCHOOL_DAYS,
    med_appt_hours: parseFloat(document.getElementById('editAdminMedApptHours').value) || ADMIN_DEFAULTS.MEDICAL_APPT_HOURS
  };

  var { error } = await db.from('profiles').update(updates).eq('id', userId);
  if (error) { showToast('Error al guardar: ' + error.message, 'error'); return; }
  showToast('Configuración guardada', 'success');
  closeModal();
  cachedAdmins = null;
  cachedPunches = null;
  await loadAdminWorkersTable();
}


// ========================================
// TASK 8.1: ADD TEACHER MODAL
// ========================================

function openAddTeacherModal() {
  var html = '<div class="form-group">' +
    '<label class="form-label">Nombre *</label>' +
    '<input type="text" class="form-input" id="addTeacherName" placeholder="Nombre completo" oninput="this.value=this.value.toUpperCase()">' +
  '</div>' +
  '<div class="form-group">' +
    '<label class="form-label">Correo Electrónico</label>' +
    '<input type="email" class="form-input" id="addTeacherEmail" placeholder="email@ejemplo.com">' +
  '</div>' +
  '<div class="settings-section">' +
    '<div class="settings-section-title">📊 Configuración</div>' +
    '<div class="settings-grid">' +
      '<div class="setting-item highlight">' +
        '<div class="setting-label">Horas Anuales Esperadas</div>' +
        '<input type="number" class="setting-input" id="addTeacherExpected" value="1230">' +
      '</div>' +
      '<div class="setting-item">' +
        '<div class="setting-label">Horas No Lectivas Anual</div>' +
        '<input type="number" class="setting-input" id="addTeacherPrep" value="70">' +
      '</div>' +
    '</div>' +
  '</div>' +
  '<div class="settings-section">' +
    '<div class="settings-section-title">🏖️ Asignación de Permisos</div>' +
    '<div class="settings-grid">' +
      '<div class="setting-item">' +
        '<div class="setting-label">Vacaciones (días)</div>' +
        '<input type="number" class="setting-input" id="addTeacherAnnual" value="31">' +
      '</div>' +
      '<div class="setting-item">' +
        '<div class="setting-label">D.R. Empleado (días)</div>' +
        '<input type="number" class="setting-input" id="addTeacherPersonal" value="3">' +
      '</div>' +
      '<div class="setting-item">' +
        '<div class="setting-label">D.R. Empresa (días)</div>' +
        '<input type="number" class="setting-input" id="addTeacherSchool" value="4">' +
      '</div>' +
    '</div>' +
  '</div>' +
  '<div class="btn-row">' +
    '<button class="submit-btn" onclick="saveNewTeacher()">➕ Añadir Profesor</button>' +
    '<button class="cancel-btn" onclick="closeModal()">Cancelar</button>' +
  '</div>';

  openModal('➕ Añadir Profesor', html);
}

async function saveNewTeacher() {
  var name = (document.getElementById('addTeacherName').value || '').trim();
  if (!name) { showToast('El nombre es obligatorio', 'error'); return; }

  var email = (document.getElementById('addTeacherEmail').value || '').trim().toLowerCase();

  // We need a user ID. For profiles without auth, generate a UUID
  var newId = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });

  var { error } = await db.from('profiles').insert({
    id: newId,
    name: name,
    email: email || name.toLowerCase().replace(/\s+/g, '.') + '@worldclassbcn.com',
    role: 'teacher',
    status: 'Active',
    expected_yearly_hours: parseInt(document.getElementById('addTeacherExpected').value) || 1230,
    prep_time_yearly: parseFloat(document.getElementById('addTeacherPrep').value) || 70,
    annual_days: parseInt(document.getElementById('addTeacherAnnual').value) || 31,
    personal_days: parseInt(document.getElementById('addTeacherPersonal').value) || 3,
    school_days: parseInt(document.getElementById('addTeacherSchool').value) || 4
  });

  if (error) { showToast('Error al añadir: ' + error.message, 'error'); return; }
  showToast('Profesor añadido correctamente', 'success');
  closeModal();
  cachedTeachers = null;
  cachedPunches = null;
  await loadTeachersTable();
  await loadStatsGrid();
}

// ========================================
// TASK 8.2: ADD ADMIN MODAL
// ========================================

function openAddAdminModal() {
  var html = '<div class="form-group">' +
    '<label class="form-label">Nombre *</label>' +
    '<input type="text" class="form-input" id="addAdminName" placeholder="Nombre completo" oninput="this.value=this.value.toUpperCase()">' +
  '</div>' +
  '<div class="form-group">' +
    '<label class="form-label">Correo Electrónico *</label>' +
    '<input type="email" class="form-input" id="addAdminEmail" placeholder="email@ejemplo.com">' +
  '</div>' +
  '<div class="settings-section">' +
    '<div class="settings-section-title">📊 Configuración</div>' +
    '<div class="settings-grid">' +
      '<div class="setting-item highlight">' +
        '<div class="setting-label">Horas Anuales Esperadas</div>' +
        '<input type="number" class="setting-input" id="addAdminExpected" value="1500">' +
      '</div>' +
    '</div>' +
  '</div>' +
  '<div class="settings-section">' +
    '<div class="settings-section-title">🏖️ Asignación de Permisos</div>' +
    '<div class="settings-grid">' +
      '<div class="setting-item">' +
        '<div class="setting-label">Vacaciones (días)</div>' +
        '<input type="number" class="setting-input" id="addAdminAnnual" value="31">' +
      '</div>' +
      '<div class="setting-item">' +
        '<div class="setting-label">D.R. Empleado (días)</div>' +
        '<input type="number" class="setting-input" id="addAdminPersonal" value="3">' +
      '</div>' +
      '<div class="setting-item">' +
        '<div class="setting-label">D.R. Empresa (días)</div>' +
        '<input type="number" class="setting-input" id="addAdminSchool" value="4">' +
      '</div>' +
    '</div>' +
  '</div>' +
  '<div class="btn-row">' +
    '<button class="submit-btn" onclick="saveNewAdmin()">➕ Añadir Admin</button>' +
    '<button class="cancel-btn" onclick="closeModal()">Cancelar</button>' +
  '</div>';

  openModal('➕ Añadir Admin', html);
}

async function saveNewAdmin() {
  var name = (document.getElementById('addAdminName').value || '').trim();
  var email = (document.getElementById('addAdminEmail').value || '').trim().toLowerCase();
  if (!name) { showToast('El nombre es obligatorio', 'error'); return; }
  if (!email) { showToast('El correo es obligatorio', 'error'); return; }

  var newId = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });

  var { error } = await db.from('profiles').insert({
    id: newId,
    name: name,
    email: email,
    role: 'admin',
    status: 'Active',
    expected_yearly_hours: parseInt(document.getElementById('addAdminExpected').value) || 1500,
    prep_time_yearly: 0,
    annual_days: parseInt(document.getElementById('addAdminAnnual').value) || 31,
    personal_days: parseInt(document.getElementById('addAdminPersonal').value) || 3,
    school_days: parseInt(document.getElementById('addAdminSchool').value) || 4
  });

  if (error) { showToast('Error al añadir: ' + error.message, 'error'); return; }
  showToast('Admin añadido correctamente', 'success');
  closeModal();
  cachedAdmins = null;
  cachedPunches = null;
  await loadAdminWorkersTable();
  await loadStatsGrid();
}


// ========================================
// TASK 9.1: PAID HOURS TAB
// ========================================

var cachedPaidHoursList = null;

async function loadPaidHoursTab() {
  // Populate teacher selector
  var select = document.getElementById('paidHoursTeacher');
  if (select && select.options.length <= 1) {
    var { data: profiles } = await db.from('profiles').select('id, name, role').eq('status', 'Active').order('name');
    profiles = profiles || [];
    var opts = '<option value="">Seleccionar profesor...</option>';
    profiles.forEach(function(p) {
      opts += '<option value="' + p.id + '">' + p.name + (p.role !== 'teacher' ? ' (Admin)' : '') + '</option>';
    });
    select.innerHTML = opts;
  }

  // Set default date
  var dateInput = document.getElementById('paidHoursDate');
  if (dateInput && !dateInput.value) {
    dateInput.value = formatDate(new Date());
  }

  // Populate month filter
  var monthFilter = document.getElementById('paidHoursMonthFilter');
  if (monthFilter && monthFilter.options.length <= 1) {
    var now = new Date();
    var monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    var opts2 = '<option value="">Todos los meses</option>';
    for (var i = 0; i < 12; i++) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      var val = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      opts2 += '<option value="' + val + '">' + monthNames[d.getMonth()] + ' ' + d.getFullYear() + '</option>';
    }
    monthFilter.innerHTML = opts2;
  }

  await loadPaidHoursList();
}

async function loadPaidHoursList() {
  var container = document.getElementById('paidHoursList');
  if (!container) return;

  var { data } = await db.from('paid_hours').select('*, profiles!paid_hours_user_id_fkey(name, email)')
    .order('date', { ascending: false });
  cachedPaidHoursList = data || [];

  renderPaidHoursList(cachedPaidHoursList);
}

function renderPaidHoursList(items) {
  var container = document.getElementById('paidHoursList');
  if (!container) return;

  if (!items || !items.length) {
    container.innerHTML = '<div class="empty-state" style="padding:30px"><div class="empty-state-icon">💰</div><div class="empty-state-text">No hay horas pagadas registradas</div></div>';
    return;
  }

  var html = '';
  items.forEach(function(ph) {
    var teacherName = ph.profiles ? ph.profiles.name : 'Desconocido';
    var dateDisplay = new Date(ph.date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

    html += '<div class="paid-hours-item" id="paid-' + ph.id + '">' +
      '<div class="paid-info">' +
        '<div class="paid-teacher">' + teacherName + '</div>' +
        '<div class="paid-details">' + dateDisplay + (ph.notes ? ' · ' + ph.notes : '') + '</div>' +
      '</div>' +
      '<div class="paid-hours-value">' + parseFloat(ph.hours).toFixed(1) + 'h</div>' +
      '<div class="paid-actions">' +
        '<button class="holiday-action-btn edit" onclick="editPaidHours(\'' + ph.id + '\')">✏️</button>' +
        '<button class="holiday-action-btn delete" onclick="deletePaidHours(\'' + ph.id + '\')">🗑️</button>' +
      '</div>' +
    '</div>';
  });

  container.innerHTML = html;
}

async function submitPaidHours() {
  var userId = document.getElementById('paidHoursTeacher').value;
  var hours = parseFloat(document.getElementById('paidHoursAmount').value);
  var date = document.getElementById('paidHoursDate').value;
  var notes = (document.getElementById('paidHoursNotes').value || '').trim();

  if (!userId) { showToast('Selecciona un profesor', 'error'); return; }
  if (!hours || hours <= 0) { showToast('Introduce horas válidas', 'error'); return; }
  if (!date) { showToast('Selecciona una fecha', 'error'); return; }

  var { error } = await db.from('paid_hours').insert({
    user_id: userId,
    hours: hours,
    date: date,
    notes: notes || null,
    created_by: adminProfile.id
  });

  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Horas pagadas registradas', 'success');

  // Reset form
  document.getElementById('paidHoursAmount').value = '';
  document.getElementById('paidHoursNotes').value = '';

  cachedPaidHours = null;
  await loadPaidHoursList();
}

async function editPaidHours(id) {
  var item = cachedPaidHoursList ? cachedPaidHoursList.find(function(ph) { return ph.id === id; }) : null;
  if (!item) return;

  var teacherName = item.profiles ? item.profiles.name : 'Desconocido';

  var html = '<div class="form-group">' +
    '<label class="form-label">Profesor</label>' +
    '<input type="text" class="form-input" value="' + teacherName + '" disabled>' +
  '</div>' +
  '<div class="form-group">' +
    '<label class="form-label">Horas</label>' +
    '<input type="number" class="form-input large" id="editPaidHoursAmount" value="' + item.hours + '" min="0.5" step="0.5">' +
  '</div>' +
  '<div class="form-group">' +
    '<label class="form-label">Fecha</label>' +
    '<input type="date" class="form-input" id="editPaidHoursDate" value="' + item.date + '">' +
  '</div>' +
  '<div class="form-group">' +
    '<label class="form-label">Notas</label>' +
    '<input type="text" class="form-input" id="editPaidHoursNotes" value="' + (item.notes || '') + '">' +
  '</div>' +
  '<div class="btn-row">' +
    '<button class="submit-btn" onclick="saveEditPaidHours(\'' + id + '\')">💾 Guardar</button>' +
    '<button class="cancel-btn" onclick="closeModal()">Cancelar</button>' +
  '</div>';

  openModal('✏️ Editar Horas Pagadas', html);
}

async function saveEditPaidHours(id) {
  var hours = parseFloat(document.getElementById('editPaidHoursAmount').value);
  var date = document.getElementById('editPaidHoursDate').value;
  var notes = (document.getElementById('editPaidHoursNotes').value || '').trim();

  if (!hours || hours <= 0) { showToast('Introduce horas válidas', 'error'); return; }
  if (!date) { showToast('Selecciona una fecha', 'error'); return; }

  var { error } = await db.from('paid_hours').update({ hours: hours, date: date, notes: notes || null }).eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Horas actualizadas', 'success');
  closeModal();
  cachedPaidHours = null;
  await loadPaidHoursList();
}

async function deletePaidHours(id) {
  var html = '<div style="text-align:center;padding:20px">' +
    '<div style="font-size:48px;margin-bottom:15px">⚠️</div>' +
    '<div style="font-size:18px;font-weight:700;color:var(--danger);margin-bottom:10px">¿Eliminar horas pagadas?</div>' +
    '<p style="color:var(--gray-500);margin-bottom:20px">Esta acción no se puede deshacer.</p>' +
    '<div class="btn-row">' +
      '<button class="submit-btn" style="background:var(--danger)" onclick="confirmDeletePaidHours(\'' + id + '\')">Sí, Eliminar</button>' +
      '<button class="cancel-btn" onclick="closeModal()">Cancelar</button>' +
    '</div>' +
  '</div>';
  openModal('Confirmar Eliminación', html);
}

async function confirmDeletePaidHours(id) {
  var { error } = await db.from('paid_hours').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Horas eliminadas', 'success');
  closeModal();
  cachedPaidHours = null;
  await loadPaidHoursList();
}

function filterPaidHours() {
  if (!cachedPaidHoursList) return;
  var search = (document.getElementById('paidHoursSearch').value || '').toLowerCase();
  var monthVal = document.getElementById('paidHoursMonthFilter').value;

  var filtered = cachedPaidHoursList.filter(function(ph) {
    var name = ph.profiles ? ph.profiles.name.toLowerCase() : '';
    var email = ph.profiles ? (ph.profiles.email || '').toLowerCase() : '';
    var notes = (ph.notes || '').toLowerCase();
    var matchSearch = !search || name.includes(search) || email.includes(search) || notes.includes(search);
    var matchMonth = !monthVal || ph.date.startsWith(monthVal);
    return matchSearch && matchMonth;
  });

  renderPaidHoursList(filtered);
}


// ========================================
// TASK 10.1: FREEZE TAB
// ========================================

async function loadFreezeTab() {
  var { data: config } = await db.from('app_config').select('*').eq('key', 'FreezeDate').single();
  var freezeDate = config && config.value ? config.value : '';

  var freezeCard = document.getElementById('freezeCard');
  var freezeIcon = document.getElementById('freezeIcon');
  var freezeTitle = document.getElementById('freezeTitle');
  var freezeStatusValue = document.getElementById('freezeStatusValue');
  var freezeActions = document.getElementById('freezeActions');

  if (!freezeCard || !freezeActions) return;

  if (freezeDate) {
    freezeCard.classList.add('active');
    freezeIcon.textContent = '🔒';
    freezeTitle.textContent = 'Fichajes Congelados';
    freezeStatusValue.textContent = 'Congelado hasta: ' + new Date(freezeDate + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    freezeStatusValue.classList.add('frozen');
  } else {
    freezeCard.classList.remove('active');
    freezeIcon.textContent = '🔓';
    freezeTitle.textContent = 'Sin Congelación';
    freezeStatusValue.textContent = 'Los profesores pueden editar todos sus fichajes';
    freezeStatusValue.classList.remove('frozen');
  }

  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  var maxDate = formatDate(yesterday);

  freezeActions.innerHTML =
    '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
      '<input type="date" id="freezeDatePicker" class="form-input" value="' + freezeDate + '" max="' + maxDate + '" style="flex:1;min-width:180px;padding:10px;font-size:14px">' +
      '<button class="freeze-btn freeze" onclick="applyFreezeDate()" style="min-width:140px">🔒 Aplicar</button>' +
      (freezeDate ? '<button class="freeze-btn unfreeze" onclick="clearFreezeDate()" style="min-width:140px">🔓 Descongelar</button>' : '') +
    '</div>';
}

async function applyFreezeDate() {
  var dateVal = document.getElementById('freezeDatePicker').value;
  if (!dateVal) { showToast('Selecciona una fecha', 'error'); return; }

  var { error } = await db.from('app_config').upsert({ key: 'FreezeDate', value: dateVal, description: 'Last frozen date (inclusive)' });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  var dateDisplay = new Date(dateVal + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
  showToast('Fichajes congelados hasta ' + dateDisplay, 'success');
  await loadFreezeTab();
}

async function clearFreezeDate() {
  var { error } = await db.from('app_config').upsert({ key: 'FreezeDate', value: '', description: 'Last frozen date (inclusive)' });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Fichajes descongelados', 'success');
  await loadFreezeTab();
}


// ========================================
// TASK 11.1: VACACIONES STATS (loadHolidayData)
// ========================================

async function loadHolidayData() {
  try {
    // Load all holiday requests
    var { data: allRequests } = await db.from('holiday_requests').select('*');
    allRequests = allRequests || [];

    // Load all active profiles
    var { data: profiles } = await db.from('profiles').select('*').eq('status', 'Active');
    profiles = profiles || [];

    // Pending count
    var pendingCount = allRequests.filter(function(r) { return r.status === 'Pending'; }).length;
    document.getElementById('statPendingRequests').textContent = pendingCount;

    // Update pending badges
    var pendingBadge = document.getElementById('pendingBadge');
    if (pendingBadge) {
      pendingBadge.textContent = pendingCount;
      pendingBadge.style.display = pendingCount > 0 ? 'inline' : 'none';
    }
    var solicitudesBadge = document.getElementById('solicitudesBadge');
    if (solicitudesBadge) {
      solicitudesBadge.textContent = pendingCount;
      solicitudesBadge.style.display = pendingCount > 0 ? 'inline' : 'none';
    }
    var pendientesBadge = document.getElementById('pendientesBadge');
    if (pendientesBadge) {
      pendientesBadge.textContent = pendingCount;
      pendientesBadge.style.display = pendingCount > 0 ? 'inline' : 'none';
    }

    // Approved requests
    var approved = allRequests.filter(function(r) { return r.status === 'Approved'; });

    // Annual usage — teachers only (matches old app)
    var teacherProfiles = profiles.filter(function(p) { return p.role === 'teacher'; });
    var totalAnnualDays = teacherProfiles.reduce(function(s, p) { return s + (p.annual_days || DEFAULTS.ANNUAL_DAYS); }, 0);
    var usedAnnualDays = approved.filter(function(r) { return r.type === 'Annual'; }).reduce(function(s, r) { return s + (parseFloat(r.days) || 0); }, 0);
    var annualPercent = totalAnnualDays > 0 ? Math.round((usedAnnualDays / totalAnnualDays) * 100) : 0;
    document.getElementById('statAnnualUsage').textContent = annualPercent + '%';
    document.getElementById('statAnnualDays').textContent = usedAnnualDays + ' de ' + totalAnnualDays + ' días';
    var annualBar = document.getElementById('statAnnualBar');
    if (annualBar) annualBar.style.width = Math.min(annualPercent, 100) + '%';

    // Personal usage — teachers only
    var totalPersonalDays = teacherProfiles.reduce(function(s, p) { return s + (p.personal_days || DEFAULTS.PERSONAL_DAYS); }, 0);
    var usedPersonalDays = approved.filter(function(r) { return r.type === 'Personal'; }).reduce(function(s, r) { return s + (parseFloat(r.days) || 0); }, 0);
    var personalPercent = totalPersonalDays > 0 ? Math.round((usedPersonalDays / totalPersonalDays) * 100) : 0;
    document.getElementById('statPersonalUsage').textContent = personalPercent + '%';
    document.getElementById('statPersonalDays').textContent = usedPersonalDays + ' de ' + totalPersonalDays + ' días';
    var personalBar = document.getElementById('statPersonalBar');
    if (personalBar) personalBar.style.width = Math.min(personalPercent, 100) + '%';

    // School usage — teachers only
    var totalSchoolDays = teacherProfiles.reduce(function(s, p) { return s + (p.school_days || DEFAULTS.SCHOOL_DAYS); }, 0);
    var usedSchoolDays = approved.filter(function(r) { return r.type === 'School'; }).reduce(function(s, r) { return s + (parseFloat(r.days) || 0); }, 0);
    var schoolPercent = totalSchoolDays > 0 ? Math.round((usedSchoolDays / totalSchoolDays) * 100) : 0;
    document.getElementById('statSchoolUsage').textContent = schoolPercent + '%';
    document.getElementById('statSchoolDays').textContent = usedSchoolDays + ' de ' + totalSchoolDays + ' días';
    var schoolBar = document.getElementById('statSchoolBar');
    if (schoolBar) schoolBar.style.width = Math.min(schoolPercent, 100) + '%';

    // Load pending requests by default
    await loadPendingRequests();

  } catch (err) {
    console.error('Error loading holiday data:', err);
  }
}

// ========================================
// TASK 11.2: PENDING REQUESTS
// ========================================

async function loadPendingRequests() {
  var tbody = document.getElementById('pendingRequestsTable');
  if (!tbody) return;

  try {
    var { data } = await db.from('holiday_requests')
      .select('*, profiles!holiday_requests_user_id_fkey(name, email)')
      .eq('status', 'Pending')
      .order('created_at', { ascending: false });
    data = data || [];

    var countLabel = document.getElementById('pendingCountLabel');
    if (countLabel) countLabel.textContent = data.length + ' solicitudes';

    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state" style="padding:40px">' +
        '<div class="empty-state-icon">✅</div>' +
        '<div class="empty-state-text">No hay solicitudes pendientes</div>' +
        '<p style="color:var(--gray-400);margin-top:8px">¡Todo al día!</p>' +
      '</td></tr>';
      return;
    }

    var rows = data.map(function(r) {
      var name = r.profiles ? r.profiles.name : 'Desconocido';
      var email = r.profiles ? r.profiles.email : '';
      var typeInfo = HOLIDAY_TYPES[r.type] || { emoji: '📋', shortName: r.type, color: 'permiso' };
      var startDisplay = new Date(r.start_date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
      var endDisplay = new Date(r.end_date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
      var dateRange = startDisplay + (r.start_date !== r.end_date ? ' hasta ' + endDisplay : '');
      var requestDate = new Date(r.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

      return '<tr>' +
        '<td><div class="teacher-name">' + name + '</div><div class="teacher-email">' + email + '</div></td>' +
        '<td><span class="type-badge ' + typeInfo.color + '">' + typeInfo.emoji + ' ' + typeInfo.shortName + '</span></td>' +
        '<td>' + dateRange + '</td>' +
        '<td>' + r.days + '</td>' +
        '<td>' + (r.reason || '-') + '</td>' +
        '<td>' + requestDate + '</td>' +
        '<td>' +
          '<button class="action-btn-small approve" onclick="approveRequest(\'' + r.id + '\')">✓ Aprobar</button>' +
          '<button class="action-btn-small reject" onclick="rejectRequest(\'' + r.id + '\')">✕ Rechazar</button>' +
        '</td>' +
      '</tr>';
    });

    tbody.innerHTML = rows.join('');

  } catch (err) {
    console.error('Error loading pending requests:', err);
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Error al cargar solicitudes</td></tr>';
  }
}

async function approveRequest(id) {
  var { error } = await db.from('holiday_requests').update({
    status: 'Approved',
    processed_by: adminProfile.id,
    processed_at: new Date().toISOString()
  }).eq('id', id);

  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Solicitud aprobada', 'success');
  await loadPendingRequests();
  await loadHolidayData();
}

async function rejectRequest(id) {
  var { error } = await db.from('holiday_requests').update({
    status: 'Rejected',
    processed_by: adminProfile.id,
    processed_at: new Date().toISOString()
  }).eq('id', id);

  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Solicitud rechazada', 'success');
  await loadPendingRequests();
  await loadHolidayData();
}


// ========================================
// TASK 11.3: APPROVED REQUESTS
// ========================================

var cachedApprovedRequests = null;

async function loadApprovedRequests() {
  var tbody = document.getElementById('approvedRequestsTable');
  if (!tbody) return;

  try {
    var { data } = await db.from('holiday_requests')
      .select('*, profiles!holiday_requests_user_id_fkey(name, email)')
      .eq('status', 'Approved')
      .order('start_date', { ascending: false });
    cachedApprovedRequests = data || [];

    renderApprovedRequests(cachedApprovedRequests);

  } catch (err) {
    console.error('Error loading approved requests:', err);
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Error al cargar</td></tr>';
  }
}

function renderApprovedRequests(items) {
  var tbody = document.getElementById('approvedRequestsTable');
  if (!tbody) return;

  if (!items || !items.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state" style="padding:40px">' +
      '<div class="empty-state-icon">📋</div><div class="empty-state-text">No hay solicitudes aprobadas</div></td></tr>';
    return;
  }

  var rows = items.map(function(r) {
    var name = r.profiles ? r.profiles.name : 'Desconocido';
    var email = r.profiles ? r.profiles.email : '';
    var typeInfo = HOLIDAY_TYPES[r.type] || { emoji: '📋', shortName: r.type, color: 'permiso' };
    var startDisplay = new Date(r.start_date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    var endDisplay = new Date(r.end_date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    var dateRange = startDisplay + (r.start_date !== r.end_date ? ' hasta ' + endDisplay : '');
    var approvedBy = r.processed_by ? 'Admin' : '-';
    var approvedDate = r.processed_at ? new Date(r.processed_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '';

    return '<tr>' +
      '<td><div class="teacher-name">' + name + '</div><div class="teacher-email">' + email + '</div></td>' +
      '<td><span class="type-badge ' + typeInfo.color + '">' + typeInfo.emoji + ' ' + typeInfo.shortName + '</span></td>' +
      '<td>' + dateRange + '</td>' +
      '<td>' + r.days + '</td>' +
      '<td>' + (r.reason || '-') + '</td>' +
      '<td>' + approvedBy + (approvedDate ? ' · ' + approvedDate : '') + '</td>' +
      '<td><button class="action-btn-small reject" onclick="deleteApprovedRequest(\'' + r.id + '\')">🗑️ Eliminar</button></td>' +
    '</tr>';
  });

  tbody.innerHTML = rows.join('');
}

async function deleteApprovedRequest(id) {
  var html = '<div style="text-align:center;padding:20px">' +
    '<div style="font-size:48px;margin-bottom:15px">⚠️</div>' +
    '<div style="font-size:18px;font-weight:700;color:var(--danger);margin-bottom:10px">¿Eliminar solicitud aprobada?</div>' +
    '<p style="color:var(--gray-500);margin-bottom:20px">Los días se restaurarán al saldo del empleado.</p>' +
    '<div class="btn-row">' +
      '<button class="submit-btn" style="background:var(--danger)" onclick="confirmDeleteApproved(\'' + id + '\')">Sí, Eliminar</button>' +
      '<button class="cancel-btn" onclick="closeModal()">Cancelar</button>' +
    '</div>' +
  '</div>';
  openModal('Confirmar Eliminación', html);
}

async function confirmDeleteApproved(id) {
  var { error } = await db.from('holiday_requests').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Solicitud eliminada', 'success');
  closeModal();
  cachedHolidays = null;
  await loadApprovedRequests();
  await loadHolidayData();
}

function filterApprovedRequests() {
  if (!cachedApprovedRequests) return;
  var search = (document.getElementById('approvedSearch').value || '').toLowerCase();
  var typeFilter = document.getElementById('approvedTypeFilter').value;

  var filtered = cachedApprovedRequests.filter(function(r) {
    var name = r.profiles ? r.profiles.name.toLowerCase() : '';
    var email = r.profiles ? (r.profiles.email || '').toLowerCase() : '';
    var matchSearch = !search || name.includes(search) || email.includes(search);
    var matchType = !typeFilter || r.type === typeFilter;
    return matchSearch && matchType;
  });

  renderApprovedRequests(filtered);
}


// ========================================
// TASK 12.1: HOLIDAY OVERVIEW
// ========================================

var cachedOverviewData = null;

async function loadHolidayOverview() {
  var tbody = document.getElementById('holidayOverviewTable');
  if (!tbody) return;

  try {
    // Load all profiles
    var { data: profiles } = await db.from('profiles').select('*').eq('status', 'Active').order('name');
    profiles = profiles || [];

    // Load all holiday requests
    var { data: requests } = await db.from('holiday_requests').select('*');
    requests = requests || [];

    cachedOverviewData = profiles.map(function(p) {
      var userRequests = requests.filter(function(r) { return r.user_id === p.id; });
      var approved = userRequests.filter(function(r) { return r.status === 'Approved'; });
      var pending = userRequests.filter(function(r) { return r.status === 'Pending'; });

      var annualUsed = approved.filter(function(r) { return r.type === 'Annual'; }).reduce(function(s, r) { return s + (parseFloat(r.days) || 0); }, 0);
      var annualPending = pending.filter(function(r) { return r.type === 'Annual'; }).length;
      var personalUsed = approved.filter(function(r) { return r.type === 'Personal'; }).reduce(function(s, r) { return s + (parseFloat(r.days) || 0); }, 0);
      var personalPending = pending.filter(function(r) { return r.type === 'Personal'; }).length;
      var schoolUsed = approved.filter(function(r) { return r.type === 'School'; }).reduce(function(s, r) { return s + (parseFloat(r.days) || 0); }, 0);
      var medicalUsed = approved.filter(function(r) { return r.type === 'Medical'; }).reduce(function(s, r) { return s + (parseFloat(r.days) || 0); }, 0);
      var medicalPending = pending.filter(function(r) { return r.type === 'Medical'; }).length;
      var medApptUsed = approved.filter(function(r) { return r.type === 'MedAppt'; }).reduce(function(s, r) { return s + (parseFloat(r.hours) || 0); }, 0);
      var medApptPending = pending.filter(function(r) { return r.type === 'MedAppt'; }).length;
      var permisoUsed = approved.filter(function(r) { return r.type === 'Permiso'; }).reduce(function(s, r) { return s + (parseFloat(r.days) || 0); }, 0);
      var permisoPending = pending.filter(function(r) { return r.type === 'Permiso'; }).length;
      var totalPending = pending.length;

      return {
        profile: p,
        annualUsed: annualUsed, annualTotal: p.annual_days || DEFAULTS.ANNUAL_DAYS, annualPending: annualPending,
        personalUsed: personalUsed, personalTotal: p.personal_days || DEFAULTS.PERSONAL_DAYS, personalPending: personalPending,
        schoolUsed: schoolUsed, schoolTotal: p.school_days || DEFAULTS.SCHOOL_DAYS,
        medicalUsed: medicalUsed, medicalPending: medicalPending,
        medApptUsed: medApptUsed, medApptTotal: p.med_appt_hours || DEFAULTS.MEDICAL_APPT_HOURS, medApptPending: medApptPending,
        permisoUsed: permisoUsed, permisoPending: permisoPending,
        totalPending: totalPending
      };
    });

    renderHolidayOverview(cachedOverviewData);

  } catch (err) {
    console.error('Error loading holiday overview:', err);
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Error al cargar</td></tr>';
  }
}

function renderHolidayOverview(items) {
  var tbody = document.getElementById('holidayOverviewTable');
  if (!tbody) return;

  if (!items || !items.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No hay empleados activos</td></tr>';
    return;
  }

  var rows = items.map(function(d) {
    var p = d.profile;
    var typeBadge = p.role === 'teacher'
      ? '<span class="type-badge teacher">PROF</span>'
      : '<span class="type-badge admin">ADMIN</span>';

    var pendingBadge = d.totalPending > 0
      ? '<span class="status-badge pending">' + d.totalPending + '</span>'
      : '<span style="color:var(--gray-400)">0</span>';

    function holidayCell(used, total, pending) {
      var html = '<div class="holiday-cell"><span class="holiday-used">' + used + '</span><span class="holiday-total"> / ' + total + '</span>';
      if (pending > 0) html += '<div class="holiday-pending">⏳ ' + pending + ' pend.</div>';
      html += '</div>';
      return html;
    }

    function holidayCellNolimit(used, pending) {
      var html = '<div class="holiday-cell"><span class="holiday-used">' + used + '</span>';
      if (pending > 0) html += '<div class="holiday-pending">⏳ ' + pending + ' pend.</div>';
      html += '</div>';
      return html;
    }

    return '<tr>' +
      '<td style="text-align:left"><div class="teacher-name">' + p.name + '</div><div class="teacher-email">' + (p.email || '') + '</div></td>' +
      '<td>' + typeBadge + '</td>' +
      '<td>' + holidayCell(d.annualUsed, d.annualTotal, d.annualPending) + '</td>' +
      '<td>' + holidayCell(d.personalUsed, d.personalTotal, d.personalPending) + '</td>' +
      '<td>' + holidayCell(d.schoolUsed, d.schoolTotal, 0) + '</td>' +
      '<td>' + holidayCellNolimit(d.medicalUsed, d.medicalPending) + '</td>' +
      '<td>' + holidayCell(d.medApptUsed + 'h', d.medApptTotal + 'h', d.medApptPending) + '</td>' +
      '<td>' + holidayCellNolimit(d.permisoUsed, d.permisoPending) + '</td>' +
      '<td>' + pendingBadge + '</td>' +
    '</tr>';
  });

  tbody.innerHTML = rows.join('');
}

function filterHolidayOverview() {
  if (!cachedOverviewData) return;
  var search = (document.getElementById('overviewSearch').value || '').toLowerCase();

  var filtered = cachedOverviewData.filter(function(d) {
    var name = d.profile.name.toLowerCase();
    var email = (d.profile.email || '').toLowerCase();
    return !search || name.includes(search) || email.includes(search);
  });

  renderHolidayOverview(filtered);
}


// ========================================
// TASK 13.1: HOLIDAY CALENDAR
// ========================================

var calendarViewOffset = 0;

async function loadHolidayCalendar() {
  var grid = document.getElementById('holidayCalendarGrid');
  if (!grid) return;

  var now = new Date();
  var d = new Date(now.getFullYear(), now.getMonth() + calendarViewOffset, 1);
  var year = d.getFullYear();
  var month = d.getMonth();
  var monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var firstDayOfWeek = new Date(year, month, 1).getDay();

  var titleEl = document.getElementById('calendarMonthTitle');
  if (titleEl) {
    titleEl.innerHTML = monthNames[month] + ' ' + year +
      (calendarViewOffset === 0 ? ' <span class="actual-badge">ACTUAL</span>' : '');
  }
  var nextBtn = document.getElementById('calendarNextBtn');
  if (nextBtn) nextBtn.disabled = calendarViewOffset >= 0;

  var startDate = year + '-' + String(month + 1).padStart(2, '0') + '-01';
  var endDate = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(daysInMonth).padStart(2, '0');

  // Load school holidays
  var { data: schoolHolidays } = await db.from('school_holidays').select('*');
  schoolHolidays = schoolHolidays || [];

  // Build school holiday date map
  var schoolHolidayMap = {};
  schoolHolidays.forEach(function(h) {
    var cur = new Date(h.start_date + 'T12:00:00');
    var end = new Date(h.end_date + 'T12:00:00');
    while (cur <= end) {
      schoolHolidayMap[formatDate(cur)] = h.name;
      cur.setDate(cur.getDate() + 1);
    }
  });

  // Load approved holiday requests for this month
  var { data: holidays } = await db.from('holiday_requests')
    .select('*, profiles!holiday_requests_user_id_fkey(name, email)')
    .eq('status', 'Approved')
    .lte('start_date', endDate)
    .gte('end_date', startDate);
  holidays = holidays || [];

  // Build holiday map by date
  var holidayMap = {};
  holidays.forEach(function(h) {
    var cur = new Date(h.start_date + 'T12:00:00');
    var end = new Date(h.end_date + 'T12:00:00');
    while (cur <= end) {
      var ds = formatDate(cur);
      if (ds >= startDate && ds <= endDate) {
        if (!holidayMap[ds]) holidayMap[ds] = [];
        holidayMap[ds].push(h);
      }
      cur.setDate(cur.getDate() + 1);
    }
  });

  var todayStr = formatDate(new Date());

  // Render grid
  var html = '';
  var dayHeaders = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  dayHeaders.forEach(function(dh) {
    html += '<div class="calendar-view-header">' + dh + '</div>';
  });

  for (var e = 0; e < firstDayOfWeek; e++) {
    html += '<div class="calendar-view-cell empty"></div>';
  }

  for (var day = 1; day <= daysInMonth; day++) {
    var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    var isSchoolHoliday = schoolHolidayMap[dateStr];
    var dayHolidays = holidayMap[dateStr] || [];
    var isToday = dateStr === todayStr;

    var classes = 'calendar-view-cell';
    if (isSchoolHoliday) classes += ' school-holiday';
    if (dayHolidays.length > 0) classes += ' has-holidays';
    if (isToday) classes += ' today';

    html += '<div class="' + classes + '" onclick="openCalendarDayDetail(\'' + dateStr + '\')">';
    html += '<div class="calendar-view-day-num">' + day + '</div>';

    if (isSchoolHoliday) {
      html += '<div class="calendar-view-school-name">' + isSchoolHoliday + '</div>';
    }

    if (dayHolidays.length > 0) {
      html += '<div class="calendar-view-teachers">';
      var maxShow = 3;
      for (var i = 0; i < Math.min(dayHolidays.length, maxShow); i++) {
        var h = dayHolidays[i];
        var typeInfo = HOLIDAY_TYPES[h.type] || { color: 'permiso' };
        var teacherName = h.profiles ? h.profiles.name.split(' ')[0] : '?';
        html += '<div class="calendar-view-teacher-badge ' + typeInfo.color + '">' + teacherName + '</div>';
      }
      if (dayHolidays.length > maxShow) {
        html += '<div class="calendar-view-more">+' + (dayHolidays.length - maxShow) + ' más</div>';
      }
      html += '</div>';
    }

    html += '</div>';
  }

  grid.innerHTML = html;
}

function changeCalendarMonth(delta) {
  if (delta > 0 && calendarViewOffset >= 0) return;
  calendarViewOffset += delta;
  if (calendarViewOffset > 0) calendarViewOffset = 0;
  loadHolidayCalendar();
}

function openCalendarDayDetail(dateStr) {
  // Gather data for this day from the DOM-rendered calendar
  // Re-query for the detail modal
  showCalendarDayModal(dateStr);
}

async function showCalendarDayModal(dateStr) {
  var dateDisplay = formatDateDisplay(dateStr);

  // Check school holiday
  var { data: schoolHolidays } = await db.from('school_holidays').select('*');
  schoolHolidays = schoolHolidays || [];
  var schoolHolidayName = null;
  schoolHolidays.forEach(function(h) {
    if (dateStr >= h.start_date && dateStr <= h.end_date) {
      schoolHolidayName = h.name;
    }
  });

  // Load holidays for this day
  var { data: holidays } = await db.from('holiday_requests')
    .select('*, profiles!holiday_requests_user_id_fkey(name, email)')
    .eq('status', 'Approved')
    .lte('start_date', dateStr)
    .gte('end_date', dateStr);
  holidays = holidays || [];

  var html = '<div style="margin-bottom:15px;font-size:16px;color:var(--gray-500)">' + dateDisplay + '</div>';

  if (schoolHolidayName) {
    html += '<div style="background:#fef3c7;padding:12px 16px;border-radius:10px;margin-bottom:15px;color:#92400e;font-weight:600">' +
      '🏫 ' + schoolHolidayName + '</div>';
  }

  if (!holidays.length) {
    html += '<div class="empty-state" style="padding:30px"><div class="empty-state-icon">📅</div><div class="empty-state-text">Nadie de vacaciones este día</div></div>';
  } else {
    holidays.forEach(function(h) {
      var typeInfo = HOLIDAY_TYPES[h.type] || { emoji: '📋', shortName: h.type, color: 'permiso' };
      var name = h.profiles ? h.profiles.name : 'Desconocido';
      var email = h.profiles ? h.profiles.email : '';

      html += '<div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--gray-50);border-radius:10px;margin-bottom:8px">' +
        '<span class="type-badge ' + typeInfo.color + '">' + typeInfo.emoji + ' ' + typeInfo.shortName + '</span>' +
        '<div><div class="teacher-name">' + name + '</div><div class="teacher-email">' + email + '</div>' +
        (h.reason ? '<div style="font-size:12px;color:var(--gray-500);margin-top:2px">' + h.reason + '</div>' : '') +
        '</div></div>';
    });
  }

  openModal('📅 Detalle del Día', html);
}


// ========================================
// TASK 14.1: D.R. EMPRESA
// ========================================

var cachedDREmpresaList = null;

async function loadDREmpresa() {
  // Populate employee dropdown
  var teachersGroup = document.getElementById('drEmpresaTeachers');
  var adminsGroup = document.getElementById('drEmpresaAdmins');

  if (teachersGroup && teachersGroup.children.length === 0) {
    var { data: profiles } = await db.from('profiles').select('id, name, role').eq('status', 'Active').order('name');
    profiles = profiles || [];

    var teacherOpts = '';
    var adminOpts = '';
    profiles.forEach(function(p) {
      var opt = '<option value="' + p.id + '">' + p.name + '</option>';
      if (p.role === 'teacher') teacherOpts += opt;
      else adminOpts += opt;
    });
    if (teachersGroup) teachersGroup.innerHTML = teacherOpts;
    if (adminsGroup) adminsGroup.innerHTML = adminOpts;
  }

  // Set default date
  var dateInput = document.getElementById('drEmpresaDate');
  if (dateInput && !dateInput.value) dateInput.value = formatDate(new Date());

  // Load assigned days
  await loadDREmpresaList();
}

async function loadDREmpresaList() {
  var container = document.getElementById('drEmpresaList');
  if (!container) return;

  var { data } = await db.from('holiday_requests')
    .select('*, profiles!holiday_requests_user_id_fkey(name, email)')
    .eq('type', 'School')
    .eq('status', 'Approved')
    .order('start_date', { ascending: false });
  cachedDREmpresaList = data || [];

  renderDREmpresaList(cachedDREmpresaList);
}

function renderDREmpresaList(items) {
  var container = document.getElementById('drEmpresaList');
  if (!container) return;

  if (!items || !items.length) {
    container.innerHTML = '<div class="empty-state" style="padding:30px"><div class="empty-state-icon">🏢</div><div class="empty-state-text">No hay D.R. Empresa asignados</div></div>';
    return;
  }

  var html = '';
  items.forEach(function(r) {
    var name = r.profiles ? r.profiles.name : 'Desconocido';
    var dateDisplay = new Date(r.start_date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    var createdDate = new Date(r.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

    html += '<div class="assigned-day-item">' +
      '<div class="day-info">' +
        '<div class="day-teacher">' + name + '</div>' +
        '<div class="day-date">📅 ' + dateDisplay + '</div>' +
        '<div class="day-meta">Asignado el ' + createdDate + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px">' +
        '<button class="holiday-action-btn edit" onclick="editDREmpresa(\'' + r.id + '\',\'' + r.start_date + '\')">✏️</button>' +
        '<button class="holiday-action-btn delete" onclick="deleteDREmpresa(\'' + r.id + '\')">🗑️</button>' +
      '</div>' +
    '</div>';
  });

  container.innerHTML = html;
}

async function assignDREmpresa() {
  var userId = document.getElementById('drEmpresaEmployee').value;
  var date = document.getElementById('drEmpresaDate').value;

  if (!userId) { showToast('Selecciona un empleado', 'error'); return; }
  if (!date) { showToast('Selecciona una fecha', 'error'); return; }

  var { error } = await db.from('holiday_requests').insert({
    user_id: userId,
    start_date: date,
    end_date: date,
    days: 1,
    type: 'School',
    status: 'Approved',
    processed_by: adminProfile.id,
    processed_at: new Date().toISOString()
  });

  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('D.R. Empresa asignado', 'success');
  cachedHolidays = null;
  await loadDREmpresaList();
}

function editDREmpresa(id, currentDate) {
  var html = '<div class="form-group">' +
    '<label class="form-label">Nueva Fecha</label>' +
    '<input type="date" class="form-input" id="editDREmpresaDate" value="' + currentDate + '">' +
  '</div>' +
  '<div class="btn-row">' +
    '<button class="submit-btn" onclick="saveEditDREmpresa(\'' + id + '\')">💾 Guardar</button>' +
    '<button class="cancel-btn" onclick="closeModal()">Cancelar</button>' +
  '</div>';
  openModal('✏️ Editar D.R. Empresa', html);
}

async function saveEditDREmpresa(id) {
  var date = document.getElementById('editDREmpresaDate').value;
  if (!date) { showToast('Selecciona una fecha', 'error'); return; }

  var { error } = await db.from('holiday_requests').update({ start_date: date, end_date: date }).eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('D.R. Empresa actualizado', 'success');
  closeModal();
  cachedHolidays = null;
  await loadDREmpresaList();
}

async function deleteDREmpresa(id) {
  var html = '<div style="text-align:center;padding:20px">' +
    '<div style="font-size:48px;margin-bottom:15px">⚠️</div>' +
    '<div style="font-size:18px;font-weight:700;color:var(--danger);margin-bottom:10px">¿Eliminar D.R. Empresa?</div>' +
    '<p style="color:var(--gray-500);margin-bottom:20px">El día se restaurará al saldo del empleado.</p>' +
    '<div class="btn-row">' +
      '<button class="submit-btn" style="background:var(--danger)" onclick="confirmDeleteDREmpresa(\'' + id + '\')">Sí, Eliminar</button>' +
      '<button class="cancel-btn" onclick="closeModal()">Cancelar</button>' +
    '</div>' +
  '</div>';
  openModal('Confirmar Eliminación', html);
}

async function confirmDeleteDREmpresa(id) {
  var { error } = await db.from('holiday_requests').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('D.R. Empresa eliminado', 'success');
  closeModal();
  cachedHolidays = null;
  await loadDREmpresaList();
}

function filterDREmpresa() {
  if (!cachedDREmpresaList) return;
  var search = (document.getElementById('drEmpresaSearch').value || '').toLowerCase();

  var filtered = cachedDREmpresaList.filter(function(r) {
    var name = r.profiles ? r.profiles.name.toLowerCase() : '';
    var email = r.profiles ? (r.profiles.email || '').toLowerCase() : '';
    return !search || name.includes(search) || email.includes(search);
  });

  renderDREmpresaList(filtered);
}


// ========================================
// TASK 14.2: SCHOOL HOLIDAYS (FESTIVOS)
// ========================================

async function loadFestivos() {
  var container = document.getElementById('schoolHolidaysList');
  if (!container) return;

  var { data } = await db.from('school_holidays').select('*').order('start_date');
  data = data || [];

  if (!data.length) {
    container.innerHTML = '<div class="empty-state" style="padding:30px"><div class="empty-state-icon">🗓️</div><div class="empty-state-text">No hay festivos configurados</div></div>';
    return;
  }

  var html = '';
  data.forEach(function(h) {
    var startDisplay = new Date(h.start_date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    var endDisplay = new Date(h.end_date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    var dateRange = startDisplay + (h.start_date !== h.end_date ? ' - ' + endDisplay : '');

    // Count days
    var dayCount = 0;
    var cur = new Date(h.start_date + 'T12:00:00');
    var end = new Date(h.end_date + 'T12:00:00');
    while (cur <= end) { dayCount++; cur.setDate(cur.getDate() + 1); }

    html += '<div class="school-holiday-item">' +
      '<div class="holiday-info">' +
        '<div class="holiday-name">' + h.name + '</div>' +
        '<div class="holiday-dates">' + dateRange + '</div>' +
      '</div>' +
      '<span class="holiday-days">' + dayCount + ' día' + (dayCount > 1 ? 's' : '') + '</span>' +
      '<div class="holiday-actions">' +
        '<button class="holiday-action-btn edit" onclick="editSchoolHoliday(\'' + h.id + '\',\'' + h.name.replace(/'/g, "\\'") + '\',\'' + h.start_date + '\',\'' + h.end_date + '\')">✏️</button>' +
        '<button class="holiday-action-btn delete" onclick="deleteSchoolHoliday(\'' + h.id + '\')">🗑️</button>' +
      '</div>' +
    '</div>';
  });

  container.innerHTML = html;
}

async function addSchoolHoliday() {
  var name = (document.getElementById('schoolHolidayName').value || '').trim();
  var startDate = document.getElementById('schoolHolidayStart').value;
  var endDate = document.getElementById('schoolHolidayEnd').value;

  if (!name) { showToast('Introduce un nombre', 'error'); return; }
  if (!startDate) { showToast('Selecciona fecha de inicio', 'error'); return; }
  if (!endDate) { showToast('Selecciona fecha de fin', 'error'); return; }
  if (endDate < startDate) { showToast('La fecha de fin debe ser posterior a la de inicio', 'error'); return; }

  var { error } = await db.from('school_holidays').insert({
    name: name,
    start_date: startDate,
    end_date: endDate,
    type: 'Holiday'
  });

  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Festivo añadido', 'success');

  // Reset form
  document.getElementById('schoolHolidayName').value = '';
  document.getElementById('schoolHolidayStart').value = '';
  document.getElementById('schoolHolidayEnd').value = '';

  cachedSchoolHolidays = null;
  await loadFestivos();
}

function editSchoolHoliday(id, name, startDate, endDate) {
  var html = '<div class="form-group">' +
    '<label class="form-label">Nombre</label>' +
    '<input type="text" class="form-input" id="editSchoolHolidayName" value="' + name + '">' +
  '</div>' +
  '<div class="form-group">' +
    '<label class="form-label">Fecha Inicio</label>' +
    '<input type="date" class="form-input" id="editSchoolHolidayStart" value="' + startDate + '">' +
  '</div>' +
  '<div class="form-group">' +
    '<label class="form-label">Fecha Fin</label>' +
    '<input type="date" class="form-input" id="editSchoolHolidayEnd" value="' + endDate + '">' +
  '</div>' +
  '<div class="btn-row">' +
    '<button class="submit-btn" onclick="saveEditSchoolHoliday(\'' + id + '\')">💾 Guardar</button>' +
    '<button class="cancel-btn" onclick="closeModal()">Cancelar</button>' +
  '</div>';
  openModal('✏️ Editar Festivo', html);
}

async function saveEditSchoolHoliday(id) {
  var name = (document.getElementById('editSchoolHolidayName').value || '').trim();
  var startDate = document.getElementById('editSchoolHolidayStart').value;
  var endDate = document.getElementById('editSchoolHolidayEnd').value;

  if (!name) { showToast('Introduce un nombre', 'error'); return; }
  if (!startDate || !endDate) { showToast('Selecciona las fechas', 'error'); return; }
  if (endDate < startDate) { showToast('La fecha de fin debe ser posterior a la de inicio', 'error'); return; }

  var { error } = await db.from('school_holidays').update({ name: name, start_date: startDate, end_date: endDate }).eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Festivo actualizado', 'success');
  closeModal();
  cachedSchoolHolidays = null;
  await loadFestivos();
}

async function deleteSchoolHoliday(id) {
  var html = '<div style="text-align:center;padding:20px">' +
    '<div style="font-size:48px;margin-bottom:15px">⚠️</div>' +
    '<div style="font-size:18px;font-weight:700;color:var(--danger);margin-bottom:10px">¿Eliminar festivo?</div>' +
    '<p style="color:var(--gray-500);margin-bottom:20px">Se eliminará de los cálculos de días laborables.</p>' +
    '<div class="btn-row">' +
      '<button class="submit-btn" style="background:var(--danger)" onclick="confirmDeleteSchoolHoliday(\'' + id + '\')">Sí, Eliminar</button>' +
      '<button class="cancel-btn" onclick="closeModal()">Cancelar</button>' +
    '</div>' +
  '</div>';
  openModal('Confirmar Eliminación', html);
}

async function confirmDeleteSchoolHoliday(id) {
  var { error } = await db.from('school_holidays').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Festivo eliminado', 'success');
  closeModal();
  cachedSchoolHolidays = null;
  await loadFestivos();
}


// ========================================
// TASK 15.1: ARCHIVE
// ========================================

async function loadArchivoAnual() {
  var select = document.getElementById('archiveYearSelect');
  if (!select) return;

  var currentYear = new Date().getFullYear();

  // Find years that have data
  var { data: punchYears } = await db.from('time_punches').select('date').order('date').limit(1);
  var { data: holidayYears } = await db.from('holiday_requests').select('start_date').order('start_date').limit(1);

  var earliestYear = currentYear;
  if (punchYears && punchYears.length > 0) {
    var py = parseInt(punchYears[0].date.substring(0, 4));
    if (py < earliestYear) earliestYear = py;
  }
  if (holidayYears && holidayYears.length > 0) {
    var hy = parseInt(holidayYears[0].start_date.substring(0, 4));
    if (hy < earliestYear) earliestYear = hy;
  }

  var opts = '<option value="">Seleccionar año...</option>';
  for (var y = earliestYear; y < currentYear; y++) {
    opts += '<option value="' + y + '">' + y + '</option>';
  }
  select.innerHTML = opts;

  if (earliestYear >= currentYear) {
    select.innerHTML = '<option value="">No hay años anteriores disponibles</option>';
  }
}

async function performArchive() {
  var select = document.getElementById('archiveYearSelect');
  var year = select ? select.value : '';
  if (!year) { showToast('Selecciona un año', 'error'); return; }

  var resultDiv = document.getElementById('archiveResult');

  var html = '<div style="text-align:center;padding:20px">' +
    '<div style="font-size:48px;margin-bottom:15px">📦</div>' +
    '<div style="font-size:18px;font-weight:700;color:var(--primary);margin-bottom:10px">¿Archivar datos de ' + year + '?</div>' +
    '<p style="color:var(--gray-500);margin-bottom:20px">Se moverán los fichajes y solicitudes de vacaciones del año ' + year + ' a tablas de archivo. Esta acción no se puede deshacer fácilmente.</p>' +
    '<div class="btn-row">' +
      '<button class="submit-btn" onclick="confirmArchive(\'' + year + '\')">📦 Confirmar Archivo</button>' +
      '<button class="cancel-btn" onclick="closeModal()">Cancelar</button>' +
    '</div>' +
  '</div>';
  openModal('Confirmar Archivo', html);
}

async function confirmArchive(year) {
  closeModal();
  var resultDiv = document.getElementById('archiveResult');
  if (resultDiv) {
    resultDiv.innerHTML = '<div class="info-box"><div class="info-box-text">' +
      '<strong>ℹ️ Función de archivo</strong><br><br>' +
      'El archivo del año ' + year + ' requiere tablas de archivo en la base de datos (archive_time_punches, archive_holiday_requests). ' +
      'Contacta al administrador del sistema para configurar las tablas de archivo y ejecutar la migración de datos.' +
      '</div></div>';
  }
  showToast('Archivo: funcionalidad pendiente de configuración', 'info');
}

// ========================================
// TASK 15.2: EXPORT CSV
// ========================================

async function exportCSV() {
  if (!cachedTeachers && !cachedAdmins) {
    showToast('No hay datos para exportar. Carga la tabla primero.', 'error');
    return;
  }

  var teachers = cachedTeachers || [];
  var admins = cachedAdmins || [];
  var allProfiles = teachers.concat(admins).sort(function(a, b) {
    if (a.role !== b.role) return a.role === 'teacher' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  if (!allProfiles.length) { showToast('No hay datos para exportar', 'error'); return; }

  var schoolHolidayDates = buildSchoolHolidayDateSet(cachedSchoolHolidays || []);
  var year = new Date().getFullYear();
  var yearStart = year + '-01-01';
  var today = formatDate(new Date());
  var periodRange = viewMode === 'monthly' ? getMonthRange() : getWeekRange();
  var cutoffDate = periodRange.end < today ? periodRange.end : today;
  var precomputed = precomputeWorkingDaysForYear(schoolHolidayDates, cutoffDate);
  var punches = cachedPunches || [];
  var monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var monthRange = getMonthRange();
  var periodLabel = monthNames[monthRange.month] + ' ' + monthRange.year;

  var allPunchRes = await db.from('time_punches').select('user_id, date, time, punch_type, notes')
    .gte('date', yearStart).lte('date', cutoffDate).limit(10000);
  var allPunches = allPunchRes.data || [];
  var allHolidayRes = await db.from('holiday_requests').select('*');
  var allHolidays = allHolidayRes.data || [];
  var approvedHolidays = allHolidays.filter(function(h) { return h.status === 'Approved'; });
  var paidHours = cachedPaidHours || [];

  // Build HTML table
  var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">' +
    '<head><meta charset="utf-8"><style>' +
    'td,th{font-family:Arial;font-size:11px;padding:6px 8px;border:1px solid #e2e8f0}' +
    'th{font-weight:700}' +
    '.title{background:#092b50;color:#fff;font-size:16px;font-weight:700;text-align:center;padding:12px}' +
    '.subtitle{background:#f1f5f9;color:#334155;font-size:12px;padding:8px}' +
    '.header{background:#092b50;color:#fff;text-align:center}' +
    '.header-hours{background:#1e3a5f;color:#fff;text-align:center}' +
    '.header-holidays{background:#3b82f6;color:#fff;text-align:center}' +
    '.prof{background:#f0fdf4}' +
    '.adm{background:#eff6ff}' +
    '.on-track{color:#059669;font-weight:700}' +
    '.warning{color:#d97706;font-weight:700}' +
    '.behind{color:#dc2626;font-weight:700}' +
    '.num{text-align:center}' +
    '.total-row{background:#59d2ff;color:#092b50;font-weight:700}' +
    '</style></head><body>';

  html += '<table><tr><td colspan="19" class="title">📊 INFORME MENSUAL — ' + periodLabel.toUpperCase() + '</td></tr>';
  html += '<tr><td class="subtitle" colspan="2">Exportado: ' + new Date().toLocaleString('es-ES') + '</td>' +
    '<td class="subtitle" colspan="2">Empleados: ' + allProfiles.length + '</td><td colspan="15"></td></tr>';

  // Headers
  html += '<tr>' +
    '<th class="header">Tipo</th><th class="header">Nombre</th><th class="header">Email</th>' +
    '<th class="header-hours">H. Periodo</th><th class="header-hours">H. Totales</th><th class="header-hours">Pagadas</th><th class="header-hours">Médicas</th>' +
    '<th class="header-hours">Progreso</th><th class="header-hours">Esperado</th><th class="header-hours">H.No Lect.</th>' +
    '<th class="header-holidays">Vac.</th><th class="header-holidays">Vac.Tot</th>' +
    '<th class="header-holidays">D.R.Emp</th><th class="header-holidays">D.R.Emp Tot</th>' +
    '<th class="header-holidays">D.R.Empr</th><th class="header-holidays">D.R.Empr Tot</th>' +
    '<th class="header-holidays">Médico</th><th class="header-holidays">Vis.Méd</th><th class="header-holidays">Permiso</th>' +
    '</tr>';

  var totals = { period: 0, total: 0, paid: 0, medical: 0 };

  allProfiles.forEach(function(p) {
    var isAdmin = p.role === 'admin' || p.role === 'super_admin';
    var defaults = isAdmin ? ADMIN_DEFAULTS : DEFAULTS;
    var expectedYearly = p.expected_yearly_hours || defaults.EXPECTED_YEARLY_HOURS;
    var annualDays = p.annual_days || defaults.ANNUAL_DAYS;
    var personalDays = p.personal_days || defaults.PERSONAL_DAYS;
    var schoolDays = p.school_days || defaults.SCHOOL_DAYS;

    var userPunches = punches.filter(function(pu) { return pu.user_id === p.id; });
    var periodHours = calculateHoursFromPunches(userPunches, periodRange.start, periodRange.end);
    var yearlyHours = calculateHoursFromPunches(userPunches, yearStart, cutoffDate);
    var userPaid = paidHours.filter(function(ph) { return ph.user_id === p.id; });
    var paidTotal = userPaid.reduce(function(s, ph) { return s + (parseFloat(ph.hours) || 0); }, 0);

    var teacherHolidayDates = buildTeacherHolidayDates(approvedHolidays, p.id);
    var allocatedDays = Math.max(0, annualDays - 3) + personalDays + schoolDays;
    var progress = getTeacherProgress(precomputed, teacherHolidayDates, allocatedDays);
    var hoursPerWorkingDay = progress.totalWorkingDays > 0 ? expectedYearly / progress.totalWorkingDays : 0;

    var userMedical = approvedHolidays.filter(function(h) { return h.user_id === p.id && h.type === 'Medical'; });
    var medicalHours = 0;
    userMedical.forEach(function(h) {
      var medStart = h.start_date > yearStart ? h.start_date : yearStart;
      var medEnd = h.end_date < cutoffDate ? h.end_date : cutoffDate;
      if (medStart <= medEnd) medicalHours += countWorkingDays(medStart, medEnd, schoolHolidayDates) * hoursPerWorkingDay;
    });

    var totalHours = yearlyHours - paidTotal + medicalHours;
    var expectedToDate = expectedYearly * progress.progressRatio;
    var pct = expectedToDate > 0 ? (totalHours / expectedToDate) * 100 : 0;
    var pctClass = pct >= 98 ? 'on-track' : pct >= 80 ? 'warning' : 'behind';

    var prepTotal = 0;
    allPunches.filter(function(pu) { return pu.user_id === p.id && pu.punch_type === 'PREP'; }).forEach(function(pu) {
      var match = (pu.notes || '').match(/Hours:\s*([\d.]+)/);
      if (match) prepTotal += parseFloat(match[1]);
    });

    var userHols = allHolidays.filter(function(h) { return h.user_id === p.id && h.status === 'Approved'; });
    var au = 0, pu2 = 0, su = 0, md = 0, ma = 0, pe = 0;
    userHols.forEach(function(h) {
      var d = parseFloat(h.days) || 0;
      if (h.type === 'Annual') au += d; else if (h.type === 'Personal') pu2 += d;
      else if (h.type === 'School') su += d; else if (h.type === 'Medical') md += d;
      else if (h.type === 'MedAppt') ma += d; else if (h.type === 'Permiso') pe += d;
    });

    totals.period += periodHours; totals.total += totalHours; totals.paid += paidTotal; totals.medical += medicalHours;
    var rc = isAdmin ? 'adm' : 'prof';

    html += '<tr>' +
      '<td class="' + rc + ' num">' + (isAdmin ? 'Admin' : 'Profesor') + '</td>' +
      '<td class="' + rc + '">' + (p.name || '') + '</td>' +
      '<td class="' + rc + '">' + (p.email || '') + '</td>' +
      '<td class="' + rc + ' num">' + periodHours.toFixed(2) + '</td>' +
      '<td class="' + rc + ' num">' + totalHours.toFixed(2) + '</td>' +
      '<td class="' + rc + ' num">' + paidTotal.toFixed(2) + '</td>' +
      '<td class="' + rc + ' num">' + (medicalHours > 0 ? medicalHours.toFixed(2) : '') + '</td>' +
      '<td class="' + rc + ' num ' + pctClass + '">' + pct.toFixed(1) + '%</td>' +
      '<td class="' + rc + ' num">' + expectedYearly + '</td>' +
      '<td class="' + rc + ' num">' + (prepTotal > 0 ? prepTotal : (isAdmin ? '-' : '0')) + '</td>' +
      '<td class="' + rc + ' num">' + (au || '') + '</td><td class="' + rc + ' num">' + annualDays + '</td>' +
      '<td class="' + rc + ' num">' + (pu2 || '') + '</td><td class="' + rc + ' num">' + personalDays + '</td>' +
      '<td class="' + rc + ' num">' + (su || '') + '</td><td class="' + rc + ' num">' + schoolDays + '</td>' +
      '<td class="' + rc + ' num">' + (md || '') + '</td>' +
      '<td class="' + rc + ' num">' + (ma || '') + '</td>' +
      '<td class="' + rc + ' num">' + (pe || '') + '</td>' +
      '</tr>';
  });

  // Totals row
  html += '<tr>' +
    '<td class="total-row" colspan="3">TOTAL (' + teachers.length + ' Prof + ' + admins.length + ' Admin)</td>' +
    '<td class="total-row num">' + totals.period.toFixed(2) + '</td>' +
    '<td class="total-row num">' + totals.total.toFixed(2) + '</td>' +
    '<td class="total-row num">' + totals.paid.toFixed(2) + '</td>' +
    '<td class="total-row num">' + (totals.medical > 0 ? totals.medical.toFixed(2) : '') + '</td>' +
    '<td class="total-row" colspan="12"></td></tr>';

  html += '</table></body></html>';

  var blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  link.href = url;
  link.download = 'informe_horas_' + monthRange.monthName + '_' + monthRange.year + '.xls';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast('Informe exportado', 'success');
}


// ========================================
// INIT ON DOM READY
// ========================================

document.addEventListener('DOMContentLoaded', initAdmin);
