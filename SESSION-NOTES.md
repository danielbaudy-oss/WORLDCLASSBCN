# WorldClass BCN — Session Notes (April 2026)

## What Was Built

Migrated the WorldClass BCN school punch clock from Google Apps Script + Google Sheets to Supabase PostgreSQL + GitHub Pages. The app is live at `https://danielbaudy-oss.github.io/WORLDCLASSBCN/`.

## Architecture

- **Database**: Supabase PostgreSQL (free plan, EU-hosted)
- **Frontend**: Static HTML/JS/CSS on GitHub Pages
- **Auth**: Google OAuth via Supabase Auth
- **Files**: `teacher.html` (employee view), `admin.html` (admin panel), `index.html` (login)
- **JS**: `js/teacher.js`, `js/admin.js`, `js/auth.js`, `js/supabase-config.js`
- **CSS**: `css/styles.css` (teacher), `css/admin.css` (admin)

## Database Tables

- `profiles` — employees (teachers + admins), linked to `auth.users` by email on first login
- `time_punches` — IN/OUT/PREP punches with GPS (latitude/longitude columns)
- `holiday_requests` — vacation/leave requests (Annual, Personal, School, Medical, MedAppt, Permiso)
- `school_holidays` — school closures/puente days
- `paid_hours` — compensated hours deducted from totals
- `app_config` — settings (FreezeDate, PuenteDays, etc.)
- `audit_log` — automatic audit trail via PostgreSQL triggers on all tables

## Key Features Implemented

### Teacher App (teacher.html)
- Punch IN/OUT with GPS capture
- Calendar view with color-coded holidays, school holidays, punch indicators
- Progress bar matching admin calculations (working days, school holidays, allocated days, medical hours, paid hours)
- Smart prep time (Horas No Lectivas): catch-up for missed weeks, skips holiday/vacation weeks, year progress display
- Holiday request form with 5 types: Vacaciones, D.R. Empleado, Baja Médica, Visita Médica (hour-based with time range), Permiso (requires reason)
- Tu Saldo summary with dark theme card
- Puente days info card
- 12-hour edit/delete window for own punches (admins always, frozen overrides)
- Admins skip freeze, teachers see read-only punches when frozen
- No scroll jitter (fixed body, container scrolls)
- Circular holiday type selector with labels
- First name only in header ("Hola Daniel")
- Proper name capitalization (DANIEL → Daniel)

### Admin Panel (admin.html)
- Stats grid: teachers, admins, on-track ratio, working days, period hours
- Teacher/Admin tables with progress bars, prep time, paid hours
- Monthly/weekly view toggle with period-aware calculations (cutoff date for past periods)
- Calendar modal per employee with punch CRUD (add/edit/delete)
- Edit teacher/admin settings modals
- Add teacher/admin modals
- Paid hours CRUD
- Freeze tab with date picker UX
- Vacaciones section: stats, pending/approved requests, resumen overview, calendar view, D.R. Empresa assignment, Festivos/Puentes management
- XLS export with colors (monthly hours report)
- Audit report export (single XLS with two sheets: Fichajes + Auditoría)
- Compliance document (worldclass-compliance.html)

## Hours Calculation Logic

- `totalHours = yearlyHoursWorked - paidHours + medicalHours + medApptHours`
- Progress: `(totalHours / expectedToDate) * 100` where `expectedToDate = expectedYearly * progressRatio`
- Working days exclude weekends + school holidays
- Allocated days: `max(0, annualDays - 3) + personalDays + schoolDays`
- School holidays filtered to current year only
- Period cutoff: today for current month/week, end of period for past months/weeks
- Holiday days count as natural/calendar days (including weekends)

## Auth Flow

- Google OAuth with `prompt: select_account` (forces account chooser)
- `handle_new_user` trigger: creates Pending profile for new emails, does NOT cascade-update existing profiles (was causing signup failures)
- `link_profile_by_email` RPC: called from `getProfile()` in auth.js to link existing profile ID to auth user ID
- FK constraints on child tables use `ON UPDATE CASCADE` so punch/holiday records follow the profile ID change
- WhatsApp in-app browser doesn't support OAuth — users must open in Safari/Chrome directly

## Database Fixes Applied (run manually in SQL Editor)

- Dropped `profiles_id_fkey` (FK to auth.users was blocking signups)
- Added `ON UPDATE CASCADE` to all child table FKs (time_punches, holiday_requests, paid_hours)
- Created `link_profile_by_email` RPC function
- Created `audit_log` table with triggers on time_punches, holiday_requests, paid_hours, profiles
- Added `latitude`/`longitude` columns to time_punches
- Updated `handle_new_user` trigger to NOT cascade-update (just insert new or do nothing)
- Admin punch insert/delete RLS policies

## Import Script

- `scripts/import-all-punches.js` — reads CSV, maps emails to profile IDs, imports with original `created_at` timestamps
- CSV filename: `WorldCLassBCNpunch V1.03ES - Time_Punches (1).csv`
- Timestamps adjusted for Spain timezone (UTC+2 CEST / UTC+1 CET)
- Clears all existing punches before re-import (full replace)

## Known Issues / Gotchas

- GitHub Pages CDN can take 1-2 minutes to update after push
- Chrome mobile address bar hide/show causes slight jitter on scrollable pages (fixed body approach helps)
- WhatsApp/Instagram in-app browsers break Google OAuth
- Old Google Sheet had LOU/LOURDES duplicate (same email) — Supabase correctly deduplicates
- PREP punch week detection: old system used varying week-start dates, new system normalizes to Monday
- `formatDate` in teacher.js was using `toISOString()` (UTC) causing off-by-one dates in Spain timezone — fixed to use local date

## Useful SQL Queries

```sql
-- Check profile linking
SELECT p.email, p.status, p.id = a.id as ids_match
FROM profiles p LEFT JOIN auth.users a ON a.email = p.email
WHERE p.email = 'someone@example.com';

-- Find PREP duplicates (same user, same ISO week)
SELECT p.name, date_trunc('week', t.date) as week_start, count(*)
FROM time_punches t JOIN profiles p ON p.id = t.user_id
WHERE t.punch_type = 'PREP'
GROUP BY p.name, date_trunc('week', t.date) HAVING count(*) > 1;

-- Clean PREP duplicates (keep oldest per week)
DELETE FROM time_punches t1 WHERE t1.punch_type = 'PREP'
AND EXISTS (SELECT 1 FROM time_punches t2
  WHERE t2.user_id = t1.user_id AND t2.punch_type = 'PREP'
  AND date_trunc('week', t2.date) = date_trunc('week', t1.date)
  AND t2.id < t1.id);

-- Find duplicate IN/OUT punches (same user, date, time, type)
SELECT count(*) FROM time_punches t1
WHERE EXISTS (SELECT 1 FROM time_punches t2
  WHERE t2.user_id = t1.user_id AND t2.date = t1.date
  AND t2.time = t1.time AND t2.punch_type = t1.punch_type AND t2.id < t1.id);

-- Recalculate holiday days to natural days
UPDATE holiday_requests SET days = (end_date - start_date + 1)
WHERE type IN ('Annual', 'Personal', 'Medical', 'Permiso') AND type != 'MedAppt';

-- Latest punches
SELECT p.name, t.date, t.time, t.punch_type, t.latitude, t.longitude, t.created_at
FROM time_punches t JOIN profiles p ON p.id = t.user_id
ORDER BY t.created_at DESC LIMIT 10;
```

## Files Overview

- `teacher.html` — employee punch app (mobile-first)
- `admin.html` — admin panel (desktop sidebar layout)
- `index.html` — login page with Google OAuth
- `js/teacher.js` — teacher app logic (~1100 lines)
- `js/admin.js` — admin panel logic (~3100 lines)
- `js/auth.js` — auth helpers (getSession, getProfile, signIn, signOut, link_profile_by_email)
- `js/supabase-config.js` — Supabase client + DEFAULTS/ADMIN_DEFAULTS/HOLIDAY_TYPES
- `css/styles.css` — teacher app styles
- `css/admin.css` — admin panel styles
- `manifest.json` — PWA manifest for home screen icon
- `e.png` — app icon with white background
- `worldclass-compliance.html` — legal compliance document (printable as PDF)
- `scripts/import-all-punches.js` — data import script
- `supabase/migrations/` — all database migrations
