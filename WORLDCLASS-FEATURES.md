# WorldClass BCN — Complete Feature Reference

> Use this document in a new Kiro session to apply relevant features to the MIKAN restaurant app.
> Kiro should read this and decide which features apply to a restaurant context and which are school-specific.

---

## Stack

- **Frontend**: Static HTML/CSS/JS (no framework, no build step)
- **Backend**: Supabase (PostgreSQL + Auth + Row Level Security)
- **Auth**: Google OAuth via Supabase Auth
- **Hosting**: GitHub Pages (production), localhost via `serve` (dev)
- **PWA**: manifest.json for mobile installability

---

## Database Schema

### profiles
Stores all users (employees + admins).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK (FK auth.users) | Supabase auth user ID |
| email | text UNIQUE | |
| name | text | |
| role | text | 'teacher', 'admin', 'super_admin' |
| status | text | 'Active', 'Inactive', 'Pending' |
| annual_days | int (default 31) | Vacation days allocation |
| personal_days | int (default 3) | Personal leave days |
| school_days | int (default 4) | Company leave days |
| expected_yearly_hours | int (default 1000) | Target work hours per year |
| prep_time_yearly | numeric (default 70) | Non-teaching prep hours (school-specific) |
| med_appt_hours | numeric (default 20) | Medical appointment hours allowance |
| created_at | timestamptz | |

### time_punches
Clock in/out records.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK profiles | |
| date | date | |
| time | time | |
| punch_type | text | 'IN', 'OUT', 'PREP' |
| notes | text | |
| latitude | numeric | GPS on punch |
| longitude | numeric | GPS on punch |
| created_at | timestamptz | |
| edited_at | timestamptz | Set when punch is modified |

### holiday_requests
Leave/time-off requests.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK profiles | |
| start_date | date | |
| end_date | date | |
| days | numeric | Number of days (or hours for MedAppt) |
| status | text | 'Pending', 'Approved', 'Rejected' |
| type | text | 'Annual', 'Personal', 'School', 'Medical', 'MedAppt', 'Permiso' |
| reason | text | Required for Permiso type |
| hours | numeric | For MedAppt type |
| processed_by | uuid FK profiles | Admin who approved/rejected |
| processed_at | timestamptz | |
| created_at | timestamptz | |

### school_holidays
Company/public holidays calendar.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| start_date | date | |
| end_date | date | |
| name | text | Holiday name |
| type | text | 'Holiday', 'Puente' |

### paid_hours
Hours deducted from employee totals (e.g., paid but not worked).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK profiles | |
| hours | numeric | |
| date | date | |
| notes | text | |
| created_by | uuid FK profiles | Admin who created |

### app_config
Key-value configuration store.

| Key | Example Value | Purpose |
|-----|---------------|---------|
| SchoolName | WorldClass BCN | App display name |
| AllowPastPunches | true | Allow punching for past days |
| MaxPastDays | 30 | How far back punches are allowed |
| PuenteDays | 9 | Pre-assigned bridge holiday days |
| FreezeDate | 2026-03-31 | Punches on/before this date are locked |

### audit_log
Tamper-proof record of all data changes (auto-populated via triggers).

| Column | Type | Notes |
|--------|------|-------|
| id | bigserial PK | |
| table_name | text | Which table was changed |
| record_id | text | ID of the changed record |
| action | text | 'INSERT', 'UPDATE', 'DELETE' |
| old_data | jsonb | Previous state |
| new_data | jsonb | New state |
| changed_by | uuid | Who made the change |
| changed_at | timestamptz | When |

Triggers are attached to: time_punches, holiday_requests, paid_hours, profiles.

---

## Auth & Roles

- **Google OAuth** via Supabase Auth
- On first login, a DB trigger auto-creates a profile with status='Pending'
- Admin must activate new users (set status to 'Active')
- Three roles: employee (teacher), admin, super_admin
- Role-based routing: employees → employee dashboard, admins → choice of employee or admin dashboard
- RLS policies enforce data access per role

---

## Features

### 1. Employee Time Punch (UNIVERSAL)
- Clock in/out with current time (editable time picker)
- GPS capture on each punch (latitude/longitude stored)
- Alternating IN/OUT detection based on punch count
- Duplicate prevention (within 2 minutes)
- Day navigation (prev/next day)
- Future dates blocked
- Punch edit (change time) — employees within 12 hours, admins always
- Punch delete — same rules as edit
- Daily hours calculation (IN/OUT pairs)
- Visual punch list with type badges

### 2. Freeze Date System (UNIVERSAL)
- Super admin sets a freeze date
- All punches on or before that date become read-only for employees
- Admins/super_admins are never frozen
- Visual lock icon on frozen punches
- Banner warning when viewing a frozen day

### 3. Yearly Progress Tracking (UNIVERSAL)
- Expected yearly hours per employee (configurable per person)
- Progress bar showing actual vs expected hours
- Calculation accounts for:
  - Working days passed (excludes weekends + company holidays)
  - Approved holidays taken (reduces expected working days)
  - Medical leave (adds equivalent hours to total)
  - Medical appointments (adds hours to total)
  - Paid hours (subtracted from total)
- Color-coded status: on-track (≥98%), warning (≥80%), behind (<80%)

### 4. Holiday/Leave Request System (UNIVERSAL)
- Employee submits requests from their dashboard
- Multiple leave types:
  - **Annual** (Vacaciones) — day-based, has limit
  - **Personal** (D.R. Empleado) — day-based, has limit
  - **School/Company** (D.R. Empresa) — day-based, has limit
  - **Medical Leave** (Baja Médica) — day-based, no limit
  - **Medical Appointment** (Visita Médica) — hour-based with time range picker, has limit
  - **Permiso** (Permiso Retribuido) — day-based, no limit, requires reason
- Request shows: type, date range, days/hours, status
- Admin approves/rejects from admin panel
- Approved requests affect progress calculations

### 5. Holiday Summary Dashboard (UNIVERSAL)
- Per-employee view of used vs allocated days for each type
- Pending requests shown separately
- Request history list sorted by date

### 6. Admin Dashboard — Stats Grid (UNIVERSAL)
- Total active employees count
- Total active admins count
- On-track employees count
- Average progress percentage
- Working days passed / total for the year
- Company holidays configured count
- Total period hours (monthly or weekly view)

### 7. Admin Dashboard — Employee Hours Table (UNIVERSAL)
- List of all active employees with:
  - Period hours (current month or week)
  - Yearly total hours
  - Paid hours deducted
  - Progress bar with percentage
  - Expected hours target
  - Calendar button for detailed view
- Monthly/weekly toggle with period navigation
- Search/filter by name

### 8. Admin Dashboard — Calendar Modal (UNIVERSAL)
- Per-employee monthly calendar view
- Shows punch count and hours per day
- Click a day to see detailed punch list
- Super admin can add/edit/delete punches for any employee from this view

### 9. Admin Dashboard — Paid Hours Management (UNIVERSAL)
- Add paid hours for any employee (date, hours, notes)
- List all paid hours with teacher name, date, amount
- Edit/delete existing paid hours
- Filter by month and search by name
- Paid hours are subtracted from employee totals in progress calculations

### 10. Admin Dashboard — Holiday Management (UNIVERSAL)
- **Pending Requests Tab**: List of all pending requests with approve/reject buttons
- **Approved Requests Tab**: List of approved requests with delete option (restores days)
- **Holiday Overview**: Per-employee summary of all leave types (used/remaining/pending)
- **Holiday Calendar**: Visual calendar showing who's off when
- **Company Holidays (Festivos)**: Manage public/company holidays that affect working day calculations
- Filter and search across all views

### 11. Admin Dashboard — Employee Settings (UNIVERSAL)
- Click any employee row to open settings modal
- Edit per-employee:
  - Expected yearly hours
  - Holiday allocations (annual, personal, school days)
  - Medical appointment hours allowance
- Deactivate employee (sets status to Inactive)
- Add new employee (teacher or admin)

### 12. Prep Time Tracking (SCHOOL-SPECIFIC)
- Weekly non-teaching preparation hours
- Auto-calculated weekly allocation from yearly total
- One-click logging per week
- Undo capability
- Missed weeks detection (smart: excludes holiday weeks)
- Bulk logging of missed weeks
- Year progress display

### 13. Employee Calendar (UNIVERSAL)
- Monthly calendar view from employee dashboard
- Color-coded days: punched, school holiday, teacher holiday (by type)
- Click to navigate to that day's punch view

### 14. GPS Compliance (UNIVERSAL)
- Captures latitude/longitude on each punch
- Stored in database for audit purposes
- Graceful fallback if GPS denied

### 15. Audit Log (UNIVERSAL)
- Automatic logging of all INSERT/UPDATE/DELETE operations
- Covers: time_punches, holiday_requests, paid_hours, profiles
- Stores old and new data as JSON
- Records who made the change and when
- Only accessible by admins (via RLS)

### 16. PWA / Mobile Support (UNIVERSAL)
- manifest.json for "Add to Home Screen"
- Mobile-optimized responsive design
- Touch-friendly UI with large tap targets
- Apple mobile web app meta tags

### 17. App Configuration (UNIVERSAL)
- Key-value config store in database
- Configurable: app name, past punch limits, freeze dates, bridge days
- Super admin can modify via admin panel

---

## Dev Environment Setup

### Git Branching
- `main` branch = production (served by GitHub Pages)
- `dev` branch = development (test locally)

### Local Testing
1. Run `serve . -p 3000` in project root
2. Open `http://localhost:3000`
3. Auth redirect auto-detects localhost vs production
4. Add `http://localhost:3000/` to Supabase redirect URLs

### Test Account
- Dedicated test account email for dev testing
- Dev role switcher (floating UI, localhost only) — switches between employee/admin/super_admin instantly
- Uses a Supabase RPC function (`switch_dev_role`) with SECURITY DEFINER to bypass RLS
- Only works for the designated test account email

### Supabase MCP Integration
- HTTP-based MCP server connected to Supabase
- Allows Kiro to run SQL queries directly
- Config: `.kiro/settings/mcp.json` (gitignored)

---

## Row Level Security Summary

| Table | Employee | Admin | Super Admin |
|-------|----------|-------|-------------|
| profiles | Read own | Read/update all | Read/update all |
| time_punches | CRUD own | Read all, insert/delete all | Read all, update/insert/delete all |
| holiday_requests | Read/create own | Read/update all | Read/update all |
| school_holidays | Read | CRUD | CRUD |
| paid_hours | Read own | CRUD | CRUD |
| app_config | Read | Read | Read/write |
| audit_log | — | Read | Read |

---

## Applying to MIKAN Restaurant App

When using this document in a new Kiro session, tell Kiro:

> "Read WORLDCLASS-FEATURES.md and apply the relevant features to this restaurant punch app. 
> Skip school-specific features (prep time tracking). Adapt terminology: 
> 'teacher' → 'employee', 'school holidays' → 'public holidays', etc."

Kiro should be able to identify which features are UNIVERSAL (apply to any punch/time-tracking app) 
vs SCHOOL-SPECIFIC (only relevant to the WorldClass school context).
