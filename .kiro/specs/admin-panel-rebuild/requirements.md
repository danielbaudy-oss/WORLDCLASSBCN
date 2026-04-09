# Requirements Document

## Introduction

Rebuild the admin panel (`admin.html`, `js/admin.js`, `css/admin.css`) as a 1:1 port of the original `AdminPunch.html` (Google Apps Script + Google Sheets) to Supabase + GitHub Pages. The original is a 2666-line single-page application with sidebar navigation, tabbed sections, sub-tabs, inner tabs, and modals. This spec covers restoring every UI element and feature using vanilla JS with the Supabase JS client (`db` from `supabase-config.js`), querying the existing Supabase tables: `profiles`, `time_punches`, `holiday_requests`, `school_holidays`, `paid_hours`, `app_config`.

## Glossary

- **Admin_Panel**: The admin-facing single-page application served from `admin.html` with fixed sidebar navigation and a main content area
- **Supabase_Client**: The Supabase JS client instance referenced as `db`, configured in `js/supabase-config.js`
- **Profile**: A record in the `profiles` table representing a teacher or admin worker
- **Teacher**: A Profile with `role = 'teacher'`; has prep time tracking and default 1230 expected yearly hours
- **Admin_Worker**: A Profile with `role = 'admin'` or `role = 'super_admin'`; no prep time, default 1500 expected yearly hours
- **Super_Admin**: A Profile with `role = 'super_admin'`; has elevated privileges (freeze/unfreeze, add/edit/delete punches)
- **Time_Punch**: A record in `time_punches` with `punch_type` IN, OUT, or PREP
- **Holiday_Request**: A record in `holiday_requests` with status Pending, Approved, or Rejected and type Annual, Personal, School, Medical, MedAppt, or Permiso
- **School_Holiday**: A record in `school_holidays` representing a school-wide holiday or puente day
- **Paid_Hours**: A record in `paid_hours` representing compensated hours deducted from a teacher's total
- **Freeze_Date**: The `app_config` key `FreezeDate` whose value is a date string; punches on or before this date are locked for teachers
- **D.R._Empresa**: "Descanso Retribuido Empresa" — company-assigned rest days (type `School` in `holiday_requests`), auto-approved, default 4 per employee
- **D.R._Empleado**: "Descanso Retribuido Empleado" — employee personal rest days (type `Personal` in `holiday_requests`), default 3 per employee
- **Prep_Time**: Non-teaching preparation hours tracked via `PREP` punch type or the `prep_time_yearly` profile field; applies only to Teachers, default 70h/year (~1.5h/week)
- **Progress_Percent**: `(yearlyHoursWorked / expectedHoursToDate) * 100`, where `expectedHoursToDate` is prorated from `expected_yearly_hours` based on working days elapsed
- **Holiday_Types**: Configuration map: Annual (🏖️ Vacaciones), Personal (👤 D.R. Empleado), School (🏢 D.R. Empresa), Medical (🏥 Baja Médica), MedAppt (🏥 Visita Médica), Permiso (📋 Permiso Retribuido)
- **MedAppt_Hours**: Medical appointment hours tracked in hours (not days), default 20h/year per employee

## Requirements

### Requirement 1: Sidebar Navigation with Four Main Sections

**User Story:** As an admin, I want a fixed sidebar with four main navigation sections matching the original AdminPunch.html layout, so that I can access all admin functionality.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display a fixed left sidebar (280px width) with a header showing the app logo (🕐), title "Control de Fichaje", and subtitle "Panel de Administración"
2. THE Admin_Panel SHALL display four navigation items in the sidebar: "📊 Horas de Empleados", "🏖️ Vacaciones y Permisos", "📦 Archivo Anual", and "⚙️ Configuración"
3. WHEN an admin clicks a navigation item, THE Admin_Panel SHALL display the corresponding content section, highlight the active navigation item with the accent color, and hide all other content sections
4. THE Admin_Panel SHALL display a pending requests count badge (red) on the "Vacaciones y Permisos" navigation item WHEN there are pending Holiday_Request records
5. THE Admin_Panel SHALL display the logged-in admin's name and email in a sidebar footer info card
6. THE Admin_Panel SHALL display a "🚪 Cerrar Sesión" button in the sidebar footer that signs the user out via Supabase auth
7. WHEN the viewport width is 768px or less, THE Admin_Panel SHALL hide the sidebar off-screen and display a hamburger menu button (☰) fixed at top-left to toggle the sidebar
8. WHEN the sidebar is open on mobile and the user clicks outside the sidebar, THE Admin_Panel SHALL close the sidebar

### Requirement 2: Horas de Empleados — Stats Grid

**User Story:** As an admin, I want to see a stats overview at the top of the Employee Hours section, so that I can quickly assess workforce status.

#### Acceptance Criteria

1. WHEN the "Horas de Empleados" section loads, THE Admin_Panel SHALL display a stats grid with five cards in a single row: (1) 👩‍🏫 Active Teachers count, (2) 👔 Active Admin Workers count, (3) 🎯 On-Track ratio (teachers at or above 98% progress) with average progress subtext, (4) 📅 Working Days passed/total with school holidays count subtext, (5) ⏱️ Total hours for the selected period (month name or week label)
2. THE Admin_Panel SHALL calculate Progress_Percent for each employee by comparing yearly hours worked against prorated expected hours based on working days elapsed in the year
3. WHEN calculating working days, THE Admin_Panel SHALL exclude weekends (Saturday and Sunday) and all dates covered by School_Holiday records from the total working days count
4. THE Admin_Panel SHALL update the stats grid period hours label dynamically based on the current view mode ("Horas en [month]" for monthly, "Horas esta Semana" for weekly)

### Requirement 3: Horas de Empleados — Tabs (Profesores, Administración, Horas Pagadas, Congelar Fichajes)

**User Story:** As an admin, I want tabs within the Employee Hours section to separate teachers, admin workers, paid hours, and freeze controls, so that each category has its own dedicated view.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display a tab bar below the stats grid with four tabs: "👩‍🏫 Profesores", "👔 Administración", "💰 Horas Pagadas", and "🔒 Congelar Fichajes"
2. WHILE the logged-in user is a Super_Admin, THE Admin_Panel SHALL display the "🔒 Congelar Fichajes" tab; otherwise THE Admin_Panel SHALL hide the tab
3. WHEN a tab is clicked, THE Admin_Panel SHALL show the corresponding tab content panel and hide all other tab content panels within the Employee Hours section
4. THE Admin_Panel SHALL default to the "Profesores" tab as active when the Employee Hours section loads

### Requirement 4: Profesores Tab — Toolbar and Table

**User Story:** As an admin, I want the Profesores tab to show a toolbar with add/search/toggle/navigation controls and a detailed teacher hours table, so that I can manage and review teacher hours.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display a card header toolbar in the Profesores tab containing: (a) title "👥 Todos los Profesores", (b) "➕ Añadir Profesor" button, (c) search input "🔍 Buscar profesores...", (d) view toggle with "📅 Mensual" and "📆 Semanal" buttons, (e) month navigator or week navigator depending on the active view mode
2. WHEN monthly view is active, THE Admin_Panel SHALL display a month navigator with prev/next buttons (‹ ›), the month name and year in Spanish (e.g., "abril de 2026"), and an "ACTUAL" badge when viewing the current month
3. WHEN weekly view is active, THE Admin_Panel SHALL display a week navigator with prev/next buttons (‹ ›), the week number and date range (e.g., "Sem 15: 7 abr - 13 abr"), and an "ACTUAL" badge when viewing the current week
4. THE Admin_Panel SHALL prevent navigation to future months by disabling the next button when viewing the current month
5. THE Admin_Panel SHALL prevent navigation to future weeks by disabling the next button when viewing the current week (weekOffset = 0)
6. THE Admin_Panel SHALL display a teachers table with columns: Profesor, Horas del Mes/Horas Semana (dynamic header), Horas Totales, Pagadas, Médicas, Progreso Anual (progress bar), Horas No Lectivas, Esperado/Año, and Acciones (📅 Calendario button)
7. THE Admin_Panel SHALL display medical hours inline below period hours when a teacher has medical hours for the period, showing "🏥 incl. Xh méd."
8. THE Admin_Panel SHALL display the Prep Time column showing "Xh / Yh" (used/total) with a color-coded badge (green ≥80%, yellow ≥50%, red <50%) and weeks logged count below
9. WHEN the search input value changes, THE Admin_Panel SHALL filter the teachers table rows by name or email match
10. WHEN a teacher row is clicked, THE Admin_Panel SHALL open the Edit Teacher Settings modal for that teacher

### Requirement 5: Administración Tab — Toolbar and Table

**User Story:** As an admin, I want a separate Administración tab with its own toolbar and table for admin workers, so that I can track admin staff hours separately from teachers.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display a card header toolbar in the Administración tab containing: (a) title "👔 Personal de Administración", (b) "➕ Añadir Admin" button, (c) search input "🔍 Buscar...", (d) view toggle with "📅 Mensual" and "📆 Semanal" buttons, (e) month navigator or week navigator depending on the active view mode
2. THE Admin_Panel SHALL display an admin workers table with columns: Empleado, Horas del Mes/Horas Semana (dynamic header), Horas Totales, Pagadas, Médicas, Progreso Anual (progress bar), Esperado/Año, and Acciones (📅 Calendario button)
3. THE Admin_Panel SHALL NOT display a "Horas No Lectivas" (Prep Time) column in the admin workers table, since Admin_Workers do not have prep time tracking
4. THE Admin_Panel SHALL share the same month/week navigation state and view mode toggle between the Profesores and Administración tabs, so changing the month or toggling weekly/monthly in one tab affects the other
5. WHEN an admin worker row is clicked, THE Admin_Panel SHALL open the Edit Admin Settings modal for that admin worker
6. WHEN the search input value changes, THE Admin_Panel SHALL filter the admin workers table rows by name or email match

### Requirement 6: View Mode Toggle (Monthly/Weekly)

**User Story:** As an admin, I want to toggle between monthly and weekly views for both teacher and admin tables, so that I can review hours at different granularities.

#### Acceptance Criteria

1. WHEN the "📅 Mensual" toggle button is clicked, THE Admin_Panel SHALL show the month navigator, hide the week navigator, and display monthly hours in the period column
2. WHEN the "📆 Semanal" toggle button is clicked, THE Admin_Panel SHALL show the week navigator, hide the month navigator, reset weekOffset to 0, and display weekly hours in the period column
3. THE Admin_Panel SHALL update both the Profesores and Administración tab navigators simultaneously when the view mode changes
4. THE Admin_Panel SHALL reload data for both tables when the view mode changes

### Requirement 7: Teacher Calendar Modal with Day Detail

**User Story:** As an admin, I want to click a teacher's calendar button and see a monthly calendar of their punches, so that I can review and manage individual punch records.

#### Acceptance Criteria

1. WHEN the 📅 Calendario button is clicked for a teacher or admin worker, THE Admin_Panel SHALL open a modal displaying a monthly calendar grid for that employee
2. THE Admin_Panel SHALL display calendar day headers in Spanish (Dom, Lun, Mar, Mié, Jue, Vie, Sáb) and highlight the current day with an accent border and shadow
3. THE Admin_Panel SHALL highlight calendar days that have punch records with the accent background color and display the punch count and total hours (e.g., "3 fichajes", "7.5h") for each day
4. WHEN a calendar day is clicked, THE Admin_Panel SHALL display the day detail view showing: (a) total hours summary in a gradient header card, (b) each punch as a card with type badge (ENTRADA green / SALIDA yellow) and time in large font
5. THE Admin_Panel SHALL provide month navigation (← Anterior / Siguiente →) within the calendar modal and prevent navigation to future months

### Requirement 8: Super Admin Punch Edit/Delete Functionality

**User Story:** As a super admin, I want to add, edit, and delete individual punches from the day detail view, so that I can correct punch records.

#### Acceptance Criteria

1. WHILE the logged-in user is a Super_Admin, THE Admin_Panel SHALL display an "➕ Añadir Fichaje" button at the top of the day detail view
2. WHEN a Super_Admin clicks "Añadir Fichaje", THE Admin_Panel SHALL show an inline form with a time input (defaulting to current time), a punch type selector (Automático/ENTRADA/SALIDA), and Save/Cancel buttons
3. WHEN a Super_Admin saves a new punch, THE Admin_Panel SHALL insert a new Time_Punch record with the specified time and type, then refresh the day detail and calendar views
4. WHILE the logged-in user is a Super_Admin, THE Admin_Panel SHALL display ✏️ Edit and 🗑️ Delete buttons on each punch card in the day detail view
5. WHEN a Super_Admin clicks ✏️ on a punch, THE Admin_Panel SHALL show an inline edit form with a time input pre-filled with the current time and Save/Cancel buttons
6. WHEN a Super_Admin saves an edited punch, THE Admin_Panel SHALL update the Time_Punch record's time and refresh the day detail view
7. WHEN a Super_Admin clicks 🗑️ on a punch, THE Admin_Panel SHALL immediately delete the Time_Punch record (with visual opacity feedback) and refresh the day detail and calendar views
8. WHILE the logged-in user is NOT a Super_Admin, THE Admin_Panel SHALL NOT display add, edit, or delete punch controls in the day detail view

### Requirement 9: Edit Teacher Settings Modal

**User Story:** As an admin, I want to edit a teacher's configuration (hours, prep time, holiday allocations), so that I can adjust individual teacher settings.

#### Acceptance Criteria

1. WHEN the Edit Teacher modal opens, THE Admin_Panel SHALL display sections: (a) "📊 Objetivo de Horas de Trabajo" with expected yearly hours input, (b) "📚 Tiempo de Preparación (No Lectivo)" with prep time yearly input and weekly hint, (c) "🏖️ Asignación de Permisos" with inputs for Vacaciones, D.R. Empleado, D.R. Empresa, and Visita Médica hours
2. THE Admin_Panel SHALL pre-fill all fields with the teacher's current values from the Profile record
3. WHEN the admin saves changes, THE Admin_Panel SHALL update the Profile record with the new values and refresh the teachers table
4. THE Admin_Panel SHALL display a "🗑️ Desactivar Profesor" button at the bottom of the modal with a red border, which opens a delete confirmation dialog

### Requirement 10: Edit Admin Worker Settings Modal

**User Story:** As an admin, I want to edit an admin worker's configuration (hours, holiday allocations), so that I can adjust individual admin settings.

#### Acceptance Criteria

1. WHEN the Edit Admin modal opens, THE Admin_Panel SHALL display sections: (a) "📊 Objetivo de Horas de Trabajo" with expected yearly hours input, (b) "🏖️ Asignación de Permisos" with inputs for Vacaciones, D.R. Empleado, D.R. Empresa, and Visita Médica hours
2. THE Admin_Panel SHALL NOT display a Prep Time section in the Edit Admin modal, since Admin_Workers do not have prep time
3. WHEN the admin saves changes, THE Admin_Panel SHALL update the Profile record and refresh the admin workers table

### Requirement 11: Add New Teacher Modal

**User Story:** As an admin, I want to add new teachers with pre-configured defaults, so that new teaching staff can be registered.

#### Acceptance Criteria

1. WHEN an admin clicks "➕ Añadir Profesor", THE Admin_Panel SHALL open a modal with fields: Nombre (required, auto-uppercase), Correo Electrónico (optional), Horas Anuales Esperadas (default 1230), Estado (Activo/Inactivo), Horas No Lectivas Anual (default 70), and holiday allocations: Vacaciones (default 31), D.R. Empleado (default 3), D.R. Empresa (default 4)
2. IF the name field is empty when submitting, THEN THE Admin_Panel SHALL display a validation error toast and prevent submission
3. WHEN the form is submitted with valid data, THE Admin_Panel SHALL insert a new Profile record with `role = 'teacher'` and the provided values, then refresh the teachers table

### Requirement 12: Add New Admin Worker Modal

**User Story:** As an admin, I want to add new admin workers, so that new administrative staff can be registered.

#### Acceptance Criteria

1. WHEN an admin clicks "➕ Añadir Admin", THE Admin_Panel SHALL open a modal with fields: Nombre (required, auto-uppercase), Correo Electrónico (required), Horas Anuales Esperadas (default 1500), Estado (Activo/Inactivo), and holiday allocations: Vacaciones (default 31), D.R. Empleado (default 3), D.R. Empresa (default 4)
2. IF the name or email field is empty when submitting, THEN THE Admin_Panel SHALL display a validation error toast and prevent submission
3. WHEN the form is submitted with valid data, THE Admin_Panel SHALL insert a new Profile record with `role = 'admin'` and the provided values, then refresh the admin workers table


### Requirement 13: Paid Hours Management Tab

**User Story:** As an admin, I want to add, edit, and delete paid hours for employees, so that I can track compensated hours that offset worked hours.

#### Acceptance Criteria

1. WHEN the "💰 Horas Pagadas" tab is selected, THE Admin_Panel SHALL display a two-column grid layout: (left) a registration form card, (right) a history list card
2. THE Admin_Panel SHALL display the registration form with: an info box explaining paid hours, a teacher selector dropdown, hours input (min 0.5, step 0.5), date input (defaulting to today), optional notes input, and a "💰 Registrar Horas Pagadas" submit button
3. IF the paid hours form is submitted without selecting a teacher, without entering hours greater than zero, or without a date, THEN THE Admin_Panel SHALL display a validation error and prevent submission
4. WHEN an admin submits the paid hours form with valid data, THE Admin_Panel SHALL insert a new Paid_Hours record with the selected teacher's `user_id`, hours, date, notes, and the admin's `id` as `created_by`
5. THE Admin_Panel SHALL display the history card with a search input and a month filter dropdown (last 12 months), and a scrollable list of paid hours records
6. THE Admin_Panel SHALL display each paid hours record as a green card showing: teacher name, date, notes, "Registrado por" info, hours amount in large font, and ✏️ Edit / 🗑️ Delete action buttons
7. WHEN an admin clicks ✏️ on a paid hours record, THE Admin_Panel SHALL open a modal with pre-filled fields (teacher name disabled, hours, date, notes) and save changes on confirmation
8. WHEN an admin clicks 🗑️ on a paid hours record, THE Admin_Panel SHALL display a delete confirmation modal and delete the record upon confirmation
9. WHEN the search input or month filter changes, THE Admin_Panel SHALL filter the paid hours list by teacher name/email/notes and month

### Requirement 14: Freeze/Unfreeze Punches Tab (Super Admin)

**User Story:** As a super admin, I want to freeze and unfreeze time punches from a dedicated tab, so that past punch records cannot be modified by teachers.

#### Acceptance Criteria

1. WHILE the logged-in user is a Super_Admin, THE Admin_Panel SHALL display the "🔒 Congelar Fichajes" tab in the Employee Hours section
2. WHEN the freeze tab loads, THE Admin_Panel SHALL display a two-column grid: (left) a freeze control card, (right) an information card
3. THE Admin_Panel SHALL display the freeze control card with: a status icon (🔒/🔓), title, subtitle, current freeze status (date or "No hay fichajes congelados"), and action buttons
4. WHEN the system is not frozen, THE Admin_Panel SHALL display a "🔒 Congelar hasta ayer" button
5. WHEN the system is frozen, THE Admin_Panel SHALL display a "🔓 Descongelar todo" button
6. IF the current Freeze_Date is before yesterday, THEN THE Admin_Panel SHALL display an "🔒 Extender hasta ayer" button alongside the unfreeze button
7. WHEN a Super_Admin clicks "Congelar hasta ayer" or "Extender hasta ayer", THE Admin_Panel SHALL upsert the `app_config` record with key `FreezeDate` and value set to yesterday's date
8. WHEN a Super_Admin clicks "Descongelar todo", THE Admin_Panel SHALL upsert the `app_config` record with key `FreezeDate` and an empty string value
9. THE Admin_Panel SHALL display an info section in the freeze control card explaining: frozen punches are locked for teachers, admins can still edit them, and recommending weekly freezing

### Requirement 15: Vacaciones y Permisos — Stats Grid and Sub-tabs

**User Story:** As an admin, I want the Vacaciones y Permisos section to show holiday stats and organized sub-tabs, so that I can efficiently manage all holiday-related data.

#### Acceptance Criteria

1. WHEN the "Vacaciones y Permisos" section loads, THE Admin_Panel SHALL display a stats grid with four cards: (1) ⏳ Pending requests count with attention indicator, (2) 🏖️ Vacaciones usage percentage with progress bar and "X de Y días" subtext, (3) 👤 D.R. Empleado usage percentage with progress bar and "X de Y días" subtext, (4) 🏢 D.R. Empresa assignment percentage with progress bar and "X de Y días" subtext
2. THE Admin_Panel SHALL display five sub-tabs below the stats grid: "📋 Solicitudes" (with pending count badge), "📊 Resumen", "📅 Vista Calendario", "🏢 D.R. Empresa", and "🗓️ Festivos/Puentes"
3. THE Admin_Panel SHALL use a pill-style sub-tab bar (gray background, white active tab with shadow) distinct from the main section tabs
4. THE Admin_Panel SHALL default to the "Solicitudes" sub-tab as active when the Vacaciones section loads

### Requirement 16: Solicitudes Sub-tab — Inner Tabs (Pendientes / Aprobadas)

**User Story:** As an admin, I want the Solicitudes sub-tab to have inner tabs for pending and approved requests, so that I can process and review requests separately.

#### Acceptance Criteria

1. WHEN the "📋 Solicitudes" sub-tab is selected, THE Admin_Panel SHALL display two inner tabs: "⏳ Pendientes" (with count badge) and "✅ Aprobadas"
2. THE Admin_Panel SHALL default to the "Pendientes" inner tab as active

### Requirement 17: Pendientes Inner Tab — Pending Requests Table

**User Story:** As an admin, I want to see and process pending holiday requests in a table, so that I can approve or reject them efficiently.

#### Acceptance Criteria

1. WHEN the "Pendientes" inner tab is active, THE Admin_Panel SHALL display a card with title "⏳ Solicitudes Pendientes" and a count of requests awaiting approval
2. THE Admin_Panel SHALL display pending requests in a table with columns: Profesor (name + email), Tipo (color-coded badge), Fechas (start date + "hasta" end date), Días, Motivo, Solicitado (request date), and Acciones (✓ Aprobar / ✕ Rechazar buttons)
3. WHEN an admin clicks "✓ Aprobar", THE Admin_Panel SHALL update the Holiday_Request status to "Approved", set `processed_by` to the admin's id, set `processed_at` to the current timestamp, and refresh the requests view and stats
4. WHEN an admin clicks "✕ Rechazar", THE Admin_Panel SHALL update the Holiday_Request status to "Rejected", set `processed_by` to the admin's id, set `processed_at` to the current timestamp, and refresh the requests view and stats
5. WHEN there are no pending requests, THE Admin_Panel SHALL display an empty state with ✅ icon and "No hay solicitudes pendientes" / "¡Todo al día!" message

### Requirement 18: Aprobadas Inner Tab — Approved Requests Table

**User Story:** As an admin, I want to view and manage approved requests with search and filter controls, so that I can review past approvals and delete if needed.

#### Acceptance Criteria

1. WHEN the "Aprobadas" inner tab is active, THE Admin_Panel SHALL display a card with title "✅ Solicitudes Aprobadas", a search input "🔍 Buscar por profesor...", and a type filter dropdown (Todos los Tipos, Vacaciones, D.R. Empleado, Médico, Permiso)
2. THE Admin_Panel SHALL display approved requests in a table with columns: Profesor (name + email), Tipo (color-coded badge), Fechas, Días, Motivo, Aprobado Por, and Acciones (🗑️ Eliminar button)
3. WHEN an admin clicks "🗑️ Eliminar" on an approved request, THE Admin_Panel SHALL display a confirmation dialog warning that days will be restored to the employee's balance, and delete the Holiday_Request record upon confirmation
4. WHEN the search input or type filter changes, THE Admin_Panel SHALL filter the approved requests table by teacher name/email and holiday type
5. THE Admin_Panel SHALL display a warning box below the table: "⚠️ Nota Importante: Eliminar una solicitud aprobada restaurará los días al saldo del profesor"

### Requirement 19: Resumen Sub-tab — Holiday Status Overview Table

**User Story:** As an admin, I want to see each employee's holiday usage across all types in one table, so that I can monitor leave balances.

#### Acceptance Criteria

1. WHEN the "📊 Resumen" sub-tab is selected, THE Admin_Panel SHALL display a table with columns: Empleado (name + email), Tipo (PROF/ADMIN badge), Vacaciones (used/total + pending), D.R. Empleado (used/total + pending), D.R. Empresa (used/total), Médico (used + pending), Visita Méd. (used hours/total hours + pending), Permiso (used + pending), and Pendiente (total pending count badge)
2. THE Admin_Panel SHALL include both Teacher and Admin_Worker profiles in the overview table, sorted alphabetically by name
3. THE Admin_Panel SHALL display pending counts in yellow below the used/total values for each type
4. THE Admin_Panel SHALL provide a search input "🔍 Buscar empleados..." to filter the overview table by employee name or email

### Requirement 20: Vista Calendario Sub-tab — Holiday Calendar View

**User Story:** As an admin, I want a monthly calendar showing who is on holiday each day, so that I can see staffing at a glance.

#### Acceptance Criteria

1. WHEN the "📅 Vista Calendario" sub-tab is selected, THE Admin_Panel SHALL display a monthly calendar grid with a color legend for holiday types: Festivo/Puente (yellow), Vacaciones (blue), D.R. Empleado (purple), Médico (red), D.R. Empresa (green), and Permiso (teal)
2. THE Admin_Panel SHALL display calendar day cells (min-height 100px) showing: day number, school holiday name (if any, with yellow background), and teacher holiday badges (color-coded by type, showing teacher name)
3. WHEN a calendar day has more than three teachers on holiday, THE Admin_Panel SHALL show the first three badges and a "+N más" indicator
4. WHEN a calendar day cell is clicked, THE Admin_Panel SHALL open a modal showing: the day's school holiday (if any, in a yellow banner), and a list of all employees on holiday with their names, emails, reasons, and color-coded type badges
5. THE Admin_Panel SHALL provide month navigation (‹ ›) for the calendar view with month name display and "ACTUAL" badge for the current month
6. THE Admin_Panel SHALL highlight school holidays with a yellow gradient background and the current day with an accent border

### Requirement 21: D.R. Empresa Sub-tab — Company Rest Days Assignment

**User Story:** As an admin, I want to assign company rest days to specific employees, so that I can manage D.R. Empresa allocations.

#### Acceptance Criteria

1. WHEN the "🏢 D.R. Empresa" sub-tab is selected, THE Admin_Panel SHALL display a two-column grid: (left) an assignment form card and (right) an information card, followed by a full-width assigned days list card
2. THE Admin_Panel SHALL display the assignment form with: an employee dropdown (grouped by "👩‍🏫 Profesores" and "👔 Administración" optgroups), a date picker, and a "✅ Asignar D.R. Empresa" submit button
3. WHEN an admin submits the assignment form, THE Admin_Panel SHALL insert a Holiday_Request record with type "School", status "Approved", the selected employee's `user_id`, and the admin's id as `processed_by`
4. THE Admin_Panel SHALL display the information card explaining: D.R. Empresa are company-assigned days, auto-approved, each employee has 4 days/year (configurable), and puente days are configured separately
5. THE Admin_Panel SHALL display the assigned days list card with a search input and each assigned day as a blue card showing: teacher name, date, "Asignado por" info with date, and ✏️ Edit / 🗑️ Delete buttons
6. WHEN an admin clicks ✏️ on an assigned day, THE Admin_Panel SHALL open a modal to change the date
7. WHEN an admin clicks 🗑️ on an assigned day, THE Admin_Panel SHALL display a confirmation dialog and delete the Holiday_Request record upon confirmation
8. WHEN the search input changes, THE Admin_Panel SHALL filter assigned days by teacher name or email

### Requirement 22: Festivos/Puentes Sub-tab — School Holidays Management

**User Story:** As an admin, I want to add, edit, and delete school holidays and puente days, so that these are excluded from working day calculations and holiday requests.

#### Acceptance Criteria

1. WHEN the "🗓️ Festivos/Puentes" sub-tab is selected, THE Admin_Panel SHALL display an info banner explaining that holidays and puente days apply to all employees and are excluded automatically from vacation requests
2. THE Admin_Panel SHALL display a two-column grid: (left) an add form card with name, start date, and end date inputs and "➕ Añadir Festivo/Puente" button, (right) a list card showing existing school holidays
3. IF the end date is before the start date, THEN THE Admin_Panel SHALL display a validation error and prevent submission
4. THE Admin_Panel SHALL display each school holiday as a yellow card showing: name, date range, day count, and ✏️ Edit / 🗑️ Delete buttons
5. WHEN an admin clicks ✏️ on a school holiday, THE Admin_Panel SHALL open a modal with pre-filled name, start date, and end date fields
6. WHEN an admin clicks 🗑️ on a school holiday, THE Admin_Panel SHALL display a confirmation dialog and delete the record upon confirmation

### Requirement 23: Archivo Anual Section

**User Story:** As an admin, I want to archive past year data, so that the system maintains performance with historical data managed separately.

#### Acceptance Criteria

1. WHEN the "📦 Archivo Anual" section loads, THE Admin_Panel SHALL display a card with title "🗄️ Archivar Datos", an info box explaining what archiving does, a year selector dropdown populated with years that have data prior to the current year, and a warning box advising to back up data before proceeding
2. WHEN an admin selects a year and clicks "📦 Archivar Año", THE Admin_Panel SHALL display a confirmation dialog warning that data will be archived
3. WHEN archiving completes successfully, THE Admin_Panel SHALL display a success result card showing the count of punches and holiday requests archived

### Requirement 24: Data Export

**User Story:** As an admin, I want to export monthly report data, so that I can keep records outside the application.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display a "📥 Exportar" button and a "🔄 Actualizar" button in the Employee Hours section page header
2. WHEN an admin clicks "📥 Exportar", THE Admin_Panel SHALL generate a CSV file containing all employees' hours data for the currently selected month and year, including: name, monthly hours, yearly hours, paid hours, progress percentage, and expected yearly hours
3. THE Admin_Panel SHALL trigger a browser download of the generated CSV file

### Requirement 25: Toast Notifications

**User Story:** As an admin, I want visual feedback for actions, so that I know when operations succeed or fail.

#### Acceptance Criteria

1. WHEN any create, update, or delete operation succeeds, THE Admin_Panel SHALL display a success toast notification at the bottom center of the screen for 3 seconds with a green background
2. WHEN any operation fails, THE Admin_Panel SHALL display an error toast notification with the error message at the bottom center of the screen for 3 seconds with a red background
3. THE Admin_Panel SHALL animate toasts with a slide-up entrance and fade-out exit

### Requirement 26: Hours Calculation from Punches

**User Story:** As an admin, I want hours to be accurately calculated from IN/OUT punch pairs, so that the dashboard reflects correct worked hours.

#### Acceptance Criteria

1. THE Admin_Panel SHALL calculate daily hours by pairing consecutive IN and OUT punches sorted by time, summing the time differences in hours
2. THE Admin_Panel SHALL calculate monthly hours by summing daily hours for all days within the selected month
3. THE Admin_Panel SHALL calculate yearly hours by summing daily hours for all days from January 1 to the current date of the selected year
4. THE Admin_Panel SHALL calculate weekly hours by summing daily hours for all days within the selected week (Monday to Sunday)
5. IF a day has an odd number of punches (unpaired IN without OUT), THEN THE Admin_Panel SHALL calculate hours only from complete IN/OUT pairs and ignore the unpaired punch

### Requirement 27: Modal System

**User Story:** As an admin, I want a unified modal system for all dialogs, so that the UI is consistent across all interactions.

#### Acceptance Criteria

1. THE Admin_Panel SHALL use a single modal overlay container with a dark semi-transparent backdrop (rgba overlay) for all modal dialogs
2. THE Admin_Panel SHALL display modals with a gradient header (color varies by modal type), a title, a close button (✕), and a scrollable body
3. WHEN the modal backdrop is clicked (outside the modal content), THE Admin_Panel SHALL close the modal
4. THE Admin_Panel SHALL use wider modals (max-width 900px) for calendar and edit teacher modals, and standard width (max-width 600px) for other modals

### Requirement 28: Delete Confirmation Dialogs

**User Story:** As an admin, I want confirmation dialogs before destructive actions, so that I don't accidentally delete data.

#### Acceptance Criteria

1. WHEN a delete action is triggered (school holiday, assigned day, approved request, teacher deactivation, paid hours), THE Admin_Panel SHALL display a confirmation modal with a red gradient header, ⚠️ warning icon, descriptive message, and Cancel/🗑️ Eliminar buttons
2. THE Admin_Panel SHALL include context-specific warning text (e.g., "Esto restaurará X días al saldo del profesor" for approved request deletion)
3. WHEN the user confirms deletion, THE Admin_Panel SHALL execute the delete operation and refresh the relevant data views

### Requirement 29: Responsive Design

**User Story:** As an admin, I want the panel to work on mobile devices, so that I can manage the system from any device.

#### Acceptance Criteria

1. WHEN the viewport width is 1200px or less, THE Admin_Panel SHALL reduce the stats grid to 3 columns and adjust form grids to single column
2. WHEN the viewport width is 768px or less, THE Admin_Panel SHALL collapse the sidebar, reduce stats grid to 2 columns, stack card header actions vertically, make tables horizontally scrollable, and reduce tab padding/font sizes
3. THE Admin_Panel SHALL ensure calendar view cells reduce to 60px min-height and smaller font sizes on mobile
