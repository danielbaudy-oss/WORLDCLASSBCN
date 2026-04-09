// Admin Module - Supabase version
let adminProfile = null;
let allTeachers = [];

// ========================================
// INIT
// ========================================

async function initAdmin() {
  adminProfile = await requireAuth(['admin', 'super_admin']);
  if (!adminProfile) return;

  document.getElementById('adminName').textContent = adminProfile.name;
  document.getElementById('adminEmail').textContent = adminProfile.email;

  await loadDashboard();
}

function goToTeacher() { window.location.href = 'teacher.html'; }

// ========================================
// NAVIGATION
// ========================================

function showSection(section) {
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById('section-' + section).classList.add('active');
  document.querySelector(`.nav-item[data-section="${section}"]`).classList.add('active');

  // Load section data
  if (section === 'dashboard') loadDashboard();
  else if (section === 'teachers') loadTeacherManagement();
  else if (section === 'holidays') loadPendingRequests();
  else if (section === 'school-holidays') loadSchoolHolidays();
  else if (section === 'settings') loadSettings();

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ========================================
// DASHBOARD
// ========================================

async function loadDashboard() {
  // Load all active profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .eq('status', 'Active');

  allTeachers = profiles || [];

  // Load pending requests count
  const { count: pendingCount } = await supabase
    .from('holiday_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'Pending');

  // Load punches for current month
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const monthEnd = new Date(year, month + 1, 0).toISOString().split('T')[0];
  const yearStart = `${year}-01-01`;

  const { data: allPunches } = await supabase
    .from('time_punches')
    .select('user_id, date, time, punch_type')
    .in('punch_type', ['IN', 'OUT'])
    .gte('date', yearStart)
    .lte('date', monthEnd);

  // Calculate stats per teacher
  let totalProgress = 0;
  let onTrack = 0;
  let behind = 0;

  const teacherRows = allTeachers.map(t => {
    const userPunches = (allPunches || []).filter(p => p.user_id === t.id);
    const monthPunches = userPunches.filter(p => p.date >= monthStart && p.date <= monthEnd);
    const yearPunches = userPunches;

    const monthlyHours = calculateHoursFromPunches(monthPunches);
    const yearlyHours = calculateHoursFromPunches(yearPunches);

    const dayOfYear = Math.floor((now - new Date(year, 0, 0)) / (1000 * 60 * 60 * 24));
    const yearProgress = dayOfYear / 365;
    const expectedToDate = t.expected_yearly_hours * yearProgress;
    const percent = expectedToDate > 0 ? (yearlyHours / expectedToDate) * 100 : 0;

    if (percent >= 98) onTrack++;
    else behind++;
    totalProgress += percent;

    return { ...t, monthlyHours, yearlyHours, percent };
  });

  // Update stats
  document.getElementById('statTeachers').textContent = allTeachers.length;
  document.getElementById('statAvgProgress').textContent = allTeachers.length > 0
    ? Math.round(totalProgress / allTeachers.length) + '%' : '--%';
  document.getElementById('statOnTrack').textContent = onTrack;
  document.getElementById('statBehind').textContent = behind;
  document.getElementById('statPending').textContent = pendingCount || 0;

  if (pendingCount > 0) {
    const badge = document.getElementById('pendingBadge');
    badge.textContent = pendingCount;
    badge.style.display = 'inline';
  }

  // Render table
  const tbody = document.getElementById('teachersTableBody');
  if (!teacherRows.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No hay empleados activos</td></tr>';
    return;
  }

  tbody.innerHTML = teacherRows
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(t => {
      const status = t.percent >= 98 ? 'on-track' : t.percent >= 80 ? 'warning' : 'behind';
      return `
        <tr>
          <td>
            <div class="teacher-name">${t.name}</div>
            <div class="teacher-email">${t.email}</div>
          </td>
          <td><span class="hours-badge ${status}">${t.monthlyHours.toFixed(1)}h</span></td>
          <td><span class="hours-badge ${status}">${t.yearlyHours.toFixed(1)}h</span></td>
          <td class="progress-cell">
            <div class="progress-container">
              <div class="progress-bar-wrapper">
                <div class="progress-bar ${status}" style="width:${Math.min(t.percent, 100)}%"></div>
              </div>
              <div class="progress-text">
                <span class="progress-percent ${status}">${Math.round(t.percent)}%</span>
              </div>
            </div>
          </td>
        </tr>`;
    }).join('');
}

function calculateHoursFromPunches(punches) {
  const byDate = {};
  punches.forEach(p => {
    if (!byDate[p.date]) byDate[p.date] = [];
    byDate[p.date].push(p);
  });

  let total = 0;
  Object.values(byDate).forEach(dayPunches => {
    const sorted = dayPunches.sort((a, b) => a.time.localeCompare(b.time));
    for (let i = 0; i < sorted.length - 1; i += 2) {
      if (sorted[i].punch_type === 'IN' && sorted[i + 1]?.punch_type === 'OUT') {
        const inParts = sorted[i].time.split(':').map(Number);
        const outParts = sorted[i + 1].time.split(':').map(Number);
        const diff = (outParts[0] * 60 + outParts[1]) - (inParts[0] * 60 + inParts[1]);
        if (diff > 0) total += diff / 60;
      }
    }
  });
  return Math.round(total * 100) / 100;
}

function filterTeachers() {
  const search = document.getElementById('teacherSearch').value.toLowerCase();
  const rows = document.querySelectorAll('#teachersTableBody tr');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(search) ? '' : 'none';
  });
}

// ========================================
// TEACHER MANAGEMENT
// ========================================

async function loadTeacherManagement() {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .order('name');

  const tbody = document.getElementById('teacherManageBody');
  if (!profiles?.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No hay empleados</td></tr>';
    return;
  }

  tbody.innerHTML = profiles.map(p => `
    <tr>
      <td class="teacher-name">${p.name}</td>
      <td class="teacher-email">${p.email}</td>
      <td><span class="type-badge ${p.role}">${p.role}</span></td>
      <td><span class="status-badge ${p.status.toLowerCase()}">${p.status}</span></td>
      <td>
        <button class="view-btn" onclick="editTeacher('${p.id}')">⚙️ Editar</button>
        ${p.status === 'Pending' ? `<button class="action-btn-small approve" onclick="activateUser('${p.id}')">✓ Activar</button>` : ''}
      </td>
    </tr>
  `).join('');
}

async function activateUser(userId) {
  const { error } = await supabase
    .from('profiles')
    .update({ status: 'Active' })
    .eq('id', userId);

  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Usuario activado ✓');
  loadTeacherManagement();
}

async function editTeacher(userId) {
  const { data: teacher } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (!teacher) return;

  openModal('Editar: ' + teacher.name, `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Nombre</label>
        <input class="form-input" id="editName" value="${teacher.name}">
      </div>
      <div class="form-group">
        <label class="form-label">Rol</label>
        <select class="form-select" id="editRole">
          <option value="teacher" ${teacher.role === 'teacher' ? 'selected' : ''}>Profesor</option>
          <option value="admin" ${teacher.role === 'admin' ? 'selected' : ''}>Admin</option>
          <option value="super_admin" ${teacher.role === 'super_admin' ? 'selected' : ''}>Super Admin</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Estado</label>
        <select class="form-select" id="editStatus">
          <option value="Active" ${teacher.status === 'Active' ? 'selected' : ''}>Activo</option>
          <option value="Inactive" ${teacher.status === 'Inactive' ? 'selected' : ''}>Inactivo</option>
          <option value="Pending" ${teacher.status === 'Pending' ? 'selected' : ''}>Pendiente</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Vacaciones (días)</label>
        <input class="form-input" type="number" id="editAnnual" value="${teacher.annual_days}">
      </div>
      <div class="form-group">
        <label class="form-label">D.R. Empleado (días)</label>
        <input class="form-input" type="number" id="editPersonal" value="${teacher.personal_days}">
      </div>
      <div class="form-group">
        <label class="form-label">D.R. Empresa (días)</label>
        <input class="form-input" type="number" id="editSchool" value="${teacher.school_days}">
      </div>
      <div class="form-group">
        <label class="form-label">Horas Anuales Esperadas</label>
        <input class="form-input" type="number" id="editExpected" value="${teacher.expected_yearly_hours}">
      </div>
      <div class="form-group">
        <label class="form-label">Horas No Lectivas (año)</label>
        <input class="form-input" type="number" id="editPrep" value="${teacher.prep_time_yearly}" step="0.5">
      </div>
    </div>
    <button class="submit-btn" onclick="saveTeacherEdit('${userId}')">Guardar Cambios</button>
  `);
}

async function saveTeacherEdit(userId) {
  const { error } = await supabase
    .from('profiles')
    .update({
      name: document.getElementById('editName').value,
      role: document.getElementById('editRole').value,
      status: document.getElementById('editStatus').value,
      annual_days: parseInt(document.getElementById('editAnnual').value) || DEFAULTS.ANNUAL_DAYS,
      personal_days: parseInt(document.getElementById('editPersonal').value) || DEFAULTS.PERSONAL_DAYS,
      school_days: parseInt(document.getElementById('editSchool').value) || DEFAULTS.SCHOOL_DAYS,
      expected_yearly_hours: parseInt(document.getElementById('editExpected').value) || DEFAULTS.EXPECTED_YEARLY_HOURS,
      prep_time_yearly: parseFloat(document.getElementById('editPrep').value) || 0
    })
    .eq('id', userId);

  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  closeModal();
  showToast('Cambios guardados ✓');
  loadTeacherManagement();
}

function openAddTeacherModal() {
  openModal('Añadir Profesor', `
    <p style="color:#64748b;margin-bottom:16px">Los nuevos usuarios se crean automáticamente cuando inician sesión con Google. Aquí puedes pre-registrar un email para que se active automáticamente.</p>
    <div class="info-box" style="margin-bottom:16px">
      <div class="info-box-text">💡 Cuando el usuario inicie sesión con Google por primera vez, su cuenta se creará con estado "Pendiente". Actívala desde la lista de profesores.</div>
    </div>
  `);
}

// ========================================
// HOLIDAY REQUESTS
// ========================================

async function loadPendingRequests() {
  const { data: requests } = await supabase
    .from('holiday_requests')
    .select('*, profiles!holiday_requests_user_id_fkey(name, email)')
    .eq('status', 'Pending')
    .order('created_at', { ascending: false });

  const container = document.getElementById('pendingRequestsList');

  if (!requests?.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-text">No hay solicitudes pendientes</div></div>';
    return;
  }

  container.innerHTML = requests.map(r => {
    const typeConfig = HOLIDAY_TYPES[r.type] || { emoji: '📅', shortName: r.type };
    const startDate = new Date(r.start_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    const endDate = new Date(r.end_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px;border-bottom:1px solid #e2e8f0">
        <div>
          <div style="font-weight:600;color:#092b50">${r.profiles?.name || 'Unknown'}</div>
          <div style="font-size:13px;color:#64748b">${typeConfig.emoji} ${typeConfig.shortName} · ${startDate} → ${endDate} · ${r.days} día(s)</div>
          ${r.reason ? `<div style="font-size:12px;color:#94a3b8;margin-top:4px">📝 ${r.reason}</div>` : ''}
        </div>
        <div style="display:flex;gap:8px">
          <button class="action-btn-small approve" onclick="processRequest('${r.id}', 'Approved')">✓ Aprobar</button>
          <button class="action-btn-small reject" onclick="processRequest('${r.id}', 'Rejected')">✗ Rechazar</button>
        </div>
      </div>`;
  }).join('');
}

async function processRequest(requestId, action) {
  const { error } = await supabase
    .from('holiday_requests')
    .update({
      status: action,
      processed_by: adminProfile.id,
      processed_at: new Date().toISOString()
    })
    .eq('id', requestId);

  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast(action === 'Approved' ? 'Solicitud aprobada ✓' : 'Solicitud rechazada');
  loadPendingRequests();
  loadDashboard();
}

// ========================================
// SCHOOL HOLIDAYS
// ========================================

async function loadSchoolHolidays() {
  const { data: holidays } = await supabase
    .from('school_holidays')
    .select('*')
    .order('start_date');

  const container = document.getElementById('schoolHolidaysList');

  if (!holidays?.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📅</div><div class="empty-state-text">No hay festivos configurados</div></div>';
    return;
  }

  container.innerHTML = holidays.map(h => {
    const start = new Date(h.start_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    const end = new Date(h.end_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    const days = Math.floor((new Date(h.end_date) - new Date(h.start_date)) / (1000 * 60 * 60 * 24)) + 1;

    return `
      <div class="school-holiday-item">
        <div class="holiday-info">
          <div class="holiday-name">${h.type === 'Puente' ? '🌉' : '🏖️'} ${h.name}</div>
          <div class="holiday-dates">${start} → ${end}</div>
        </div>
        <span class="holiday-days">${days} día(s)</span>
        <div class="holiday-actions">
          <button class="holiday-action-btn delete" onclick="deleteSchoolHoliday('${h.id}')">🗑️</button>
        </div>
      </div>`;
  }).join('');
}

function openAddSchoolHolidayModal() {
  openModal('Añadir Festivo/Puente', `
    <div class="form-group">
      <label class="form-label">Nombre</label>
      <input class="form-input" id="shName" placeholder="Ej: Navidad">
    </div>
    <div class="form-group">
      <label class="form-label">Tipo</label>
      <select class="form-select" id="shType">
        <option value="Holiday">Festivo</option>
        <option value="Puente">Puente</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Fecha Inicio</label>
      <input type="date" class="form-input" id="shStart">
    </div>
    <div class="form-group">
      <label class="form-label">Fecha Fin</label>
      <input type="date" class="form-input" id="shEnd">
    </div>
    <button class="submit-btn" onclick="addSchoolHoliday()">Añadir</button>
  `);
}

async function addSchoolHoliday() {
  const name = document.getElementById('shName').value;
  const type = document.getElementById('shType').value;
  const startDate = document.getElementById('shStart').value;
  const endDate = document.getElementById('shEnd').value;

  if (!name || !startDate || !endDate) { showToast('Rellena todos los campos', 'error'); return; }

  const { error } = await supabase.from('school_holidays').insert({ name, type, start_date: startDate, end_date: endDate });

  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  closeModal();
  showToast('Festivo añadido ✓');
  loadSchoolHolidays();
}

async function deleteSchoolHoliday(id) {
  if (!confirm('¿Eliminar este festivo?')) return;
  const { error } = await supabase.from('school_holidays').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Festivo eliminado');
  loadSchoolHolidays();
}

// ========================================
// SETTINGS
// ========================================

async function loadSettings() {
  const { data } = await supabase
    .from('app_config')
    .select('*')
    .eq('key', 'FreezeDate')
    .single();

  const freezeDate = data?.value;
  const el = document.getElementById('freezeStatusText');

  if (freezeDate) {
    el.textContent = 'Congelado hasta ' + new Date(freezeDate + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    el.style.color = '#1e40af';
  } else {
    el.textContent = 'Sin congelar';
    el.style.color = '#059669';
  }
}

async function freezePunches() {
  if (adminProfile.role !== 'super_admin') {
    showToast('Solo Super Admins pueden congelar', 'error');
    return;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const freezeDate = yesterday.toISOString().split('T')[0];

  const { error } = await supabase
    .from('app_config')
    .upsert({ key: 'FreezeDate', value: freezeDate });

  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Fichajes congelados hasta ' + freezeDate);
  loadSettings();
}

async function unfreezePunches() {
  const { error } = await supabase
    .from('app_config')
    .upsert({ key: 'FreezeDate', value: '' });

  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Fichajes descongelados ✓');
  loadSettings();
}

// ========================================
// MODAL
// ========================================

function openModal(title, bodyHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalOverlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

// Init
document.addEventListener('DOMContentLoaded', initAdmin);
