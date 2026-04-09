# Implementation Tasks

## Task 1: HTML Structure — Sidebar, Sections, Tabs, Sub-tabs
- [x] 1.1 Rebuild admin.html with complete sidebar (4 nav items), all 4 content sections, tabs within Horas de Empleados (Profesores, Administración, Horas Pagadas, Congelar Fichajes), sub-tabs within Vacaciones (Solicitudes, Resumen, Vista Calendario, D.R. Empresa, Festivos/Puentes), inner tabs within Solicitudes (Pendientes, Aprobadas), and modal containers
- [x] 1.2 Add any missing CSS classes to admin.css for new elements (sub-tabs pill style, inner tabs, toolbar layout)

## Task 2: Core JS — Init, Navigation, State Management, Utilities
- [x] 2.1 Rewrite admin.js init function with auth check, profile loading, sidebar navigation, tab switching, sub-tab switching, inner-tab switching, and mobile hamburger toggle
- [x] 2.2 Implement state variables (viewMode, monthOffset, weekOffset, currentYear, currentMonth) and navigation functions (prevMonth, nextMonth, prevWeek, nextWeek, toggleViewMode)
- [x] 2.3 Implement hours calculation utilities: calculateDayHours, calculateHoursFromPunches, getWeekBounds, precomputeWorkingDays, getProgressPercent

## Task 3: Horas de Empleados — Stats Grid
- [x] 3.1 Implement loadStatsGrid() that queries profiles, time_punches, and school_holidays to compute and render the 5 stat cards (active teachers, active admins, on-track ratio, working days, period hours)

## Task 4: Profesores Tab — Data Loading and Table Rendering
- [ ] 4.1 Implement loadTeachersTable() that queries profiles (role=teacher, status=Active), time_punches, holiday_requests, and paid_hours to compute monthly/weekly/yearly hours, progress, prep time, medical hours, and render the full teachers table with all columns
- [x] 4.2 Implement teacher search filter and month/week navigator rendering with ACTUAL badge and disabled next button logic

## Task 5: Administración Tab — Data Loading and Table Rendering
- [x] 5.1 Implement loadAdminWorkersTable() with same pattern as teachers but for admin/super_admin roles, without prep time column, and with admin-specific defaults (1500h expected)

## Task 6: Teacher Calendar Modal
- [x] 6.1 Implement openCalendarModal(userId, userName) that renders a monthly calendar grid with punch data, day click handler showing day detail with punch list, and month navigation
- [ ] 6.2 Implement Super Admin punch CRUD in day detail: add punch form, edit punch inline, delete punch with immediate feedback

## Task 7: Edit Teacher / Edit Admin Settings Modals
- [ ] 7.1 Implement openEditTeacherModal(userId) with all settings fields (expected hours, prep time, holiday allocations, med appt hours) and save/deactivate functionality
- [ ] 7.2 Implement openEditAdminModal(userId) with admin-specific fields (no prep time) and save functionality

## Task 8: Add Teacher / Add Admin Modals
- [ ] 8.1 Implement openAddTeacherModal() with form fields, validation, and profile insert
- [ ] 8.2 Implement openAddAdminModal() with form fields, validation, and profile insert

## Task 9: Paid Hours Tab
- [ ] 9.1 Implement loadPaidHoursTab() with registration form (teacher selector, hours, date, notes), history list with search/month filter, and CRUD operations (add, edit modal, delete with confirmation)

## Task 10: Freeze/Unfreeze Tab (Super Admin)
- [ ] 10.1 Implement loadFreezeTab() with freeze status display, freeze/unfreeze/extend buttons, and app_config upsert operations

## Task 11: Vacaciones y Permisos — Stats Grid and Solicitudes Sub-tab
- [ ] 11.1 Implement loadVacacionesStats() computing pending count, annual/personal/school usage percentages with progress bars
- [ ] 11.2 Implement loadPendingRequests() rendering pending requests table with approve/reject buttons and empty state
- [ ] 11.3 Implement loadApprovedRequests() rendering approved requests table with search, type filter, and delete with confirmation

## Task 12: Resumen Sub-tab — Holiday Status Overview
- [ ] 12.1 Implement loadHolidayOverview() rendering the full status table with all holiday types, used/total/pending for each employee, with search filter

## Task 13: Vista Calendario Sub-tab — Holiday Calendar
- [ ] 13.1 Implement loadHolidayCalendar() rendering monthly calendar grid with school holidays, teacher holiday badges, +N más indicator, day click modal, month navigation, and color legend

## Task 14: D.R. Empresa and Festivos/Puentes Sub-tabs
- [ ] 14.1 Implement loadDREmpresa() with assignment form (employee dropdown with optgroups, date picker), assigned days list with search, and edit/delete operations
- [ ] 14.2 Implement loadFestivos() with add form, school holidays list with edit/delete, and validation

## Task 15: Archivo Anual and Export
- [ ] 15.1 Implement loadArchivoAnual() with year selector and archive confirmation dialog
- [ ] 15.2 Implement exportCSV() generating and downloading a CSV file with monthly hours data for all employees

## Task 16: Final Polish — Toast System, Responsive, Modal System
- [ ] 16.1 Ensure toast notifications work for all CRUD operations (success green, error red, 3s auto-dismiss)
- [ ] 16.2 Verify responsive breakpoints (1200px, 768px) for sidebar collapse, stats grid, tables, and calendar
- [ ] 16.3 Push final version to GitHub and verify on GitHub Pages
