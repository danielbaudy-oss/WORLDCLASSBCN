# WorldClass BCN - Migration Spec: Google Sheets → Supabase + GitHub Pages

## Overview
Migrate the existing Google Apps Script + Google Sheets time punch app to a modern stack:
- **Frontend**: Static HTML/JS/CSS hosted on GitHub Pages (`danielbaudy-oss.github.io/WORLDCLASSBCN/`)
- **Backend**: Supabase (PostgreSQL + Auth + Row Level Security)
- **Auth**: Google OAuth via Supabase Auth (replaces Google Apps Script session)

## Supabase Project
- Project ref: `ruytavhodexoxkejrgyb`
- URL: `https://ruytavhodexoxkejrgyb.supabase.co`
- Anon key: `sb_publishable_gfNxT6X2meKFQQhS1jHA3Q_BIcTTYJ5`

---

## Database Schema

### Tables

#### `profiles`
Replaces: `Punch_Teachers` + `Punch_Admins` sheets
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK, FK auth.users) | Supabase auth user ID |
| email | text UNIQUE NOT NULL | |
| name | text NOT NULL | |
| role | text NOT NULL | 'teacher', 'admin', 'super_admin' |
| status | text DEFAULT 'Active' | 'Active', 'Inactive' |
| annual_days | int DEFAULT 31 | |
| personal_days | int DEFAULT 3 | D.R. Empleado |
| school_days | int DEFAULT 4 | D.R. Empresa |
| expected_yearly_hours | int DEFAULT 1000 | 1300 for admins |
| prep_time_yearly | numeric DEFAULT 70 | 0 for admins |
| med_appt_hours | numeric DEFAULT 20 | |
| created_at | timestamptz DEFAULT now() | |

#### `time_punches`
Replaces: `Time_Punches` sheet
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK DEFAULT gen_random_uuid() | |
| user_id | uuid FK profiles.id | |
| date | date NOT NULL | |
| time | time NOT NULL | |
| punch_type | text NOT NULL | 'IN', 'OUT', 'PREP' |
| notes | text | |
| created_at | timestamptz DEFAULT now() | |
| edited_at | timestamptz | |

#### `holiday_requests`
Replaces: `Punch_Holiday_Requests` sheet
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK DEFAULT gen_random_uuid() | |
| user_id | uuid FK profiles.id | |
| start_date | date NOT NULL | |
| end_date | date NOT NULL | |
| days | numeric NOT NULL | |
| status | text DEFAULT 'Pending' | 'Pending', 'Approved', 'Rejected' |
| type | text NOT NULL | 'Annual','Personal','School','Medical','MedAppt','Permiso' |
| reason | text | |
| hours | numeric | For MedAppt type |
| processed_by | uuid FK profiles.id | |
| processed_at | timestamptz | |
| created_at | timestamptz DEFAULT now() | |

#### `school_holidays`
Replaces: `Punch_School_Holidays` sheet
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK DEFAULT gen_random_uuid() | |
| start_date | date NOT NULL | |
| end_date | date NOT NULL | |
| name | text NOT NULL | |
| type | text DEFAULT 'Holiday' | 'Holiday', 'Puente' |
| created_at | timestamptz DEFAULT now() | |

#### `paid_hours`
Replaces: `Punch_Paid_Hours` sheet
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK DEFAULT gen_random_uuid() | |
| user_id | uuid FK profiles.id | |
| hours | numeric NOT NULL | |
| date | date NOT NULL | |
| notes | text | |
| created_by | uuid FK profiles.id | |
| created_at | timestamptz DEFAULT now() | |

#### `app_config`
Replaces: `Punch_Config` sheet
| Column | Type | Notes |
|--------|------|-------|
| key | text PK | |
| value | text | |
| description | text | |

---

## Auth Flow
1. User clicks "Login with Google" on the GitHub Pages site
2. Supabase Auth handles Google OAuth
3. On first login, a trigger creates a `profiles` row (status='Pending' until admin activates)
4. Frontend checks `profiles.role` and `profiles.status` to show Teacher or Admin UI
5. RLS policies enforce data access based on auth.uid()

---

## Row Level Security (RLS)

- `profiles`: Users can read their own profile. Admins can read all.
- `time_punches`: Users can CRUD their own punches. Admins can read all.
- `holiday_requests`: Users can read/create their own. Admins can read/update all.
- `school_holidays`: All authenticated users can read. Admins can CRUD.
- `paid_hours`: Admins only.
- `app_config`: All authenticated can read. Super admins can write.

---

## File Structure (GitHub Pages)
```
WORLDCLASSBCN/
├── index.html          (login page)
├── teacher.html        (teacher punch UI)
├── admin.html          (admin dashboard)
├── js/
│   ├── supabase-config.js
│   ├── auth.js
│   ├── teacher.js
│   └── admin.js
├── css/
│   └── styles.css
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql
```

---

## Migration Steps
1. Set up Supabase database schema (tables, RLS, triggers)
2. Configure Google OAuth in Supabase dashboard
3. Build login page with Supabase Auth
4. Port TeacherPunch.html → teacher.html (replace `google.script.run` with Supabase client calls)
5. Port AdminPunch.html → admin.html (same approach)
6. Migrate existing data from Google Sheets to Supabase
7. Deploy to GitHub Pages
