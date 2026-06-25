# Chatbot Schedule Feature — Design Doc

## Data Source
- File: `Super excel 25-26.xlsx`
- Key sheets to parse:
  - **Salas Raval** — room/time grid for Raval location
  - **Salas Glories** — room/time grid for Glories location
  - **Privadas** — private 1-on-1 lessons (student attendance per day)
  - **Conv** — conversational workshop classes
  - **Sustis** — substitutions (who covers when someone is absent)
  - **Pruebas** — trial class signups

## Cell Format (Salas Raval/Glories)
Each cell in the grid contains a multi-line string like:
```
SARA A1.2/M5 🥝⚠️
10h L-V 9-10.50
A1.2: 4.05
7p
```
- Line 1: `TEACHER LEVEL/MODULE [status_emojis]`
- Line 2: `hours_per_week DAYS time_start-time_end`
- Line 3: `level: end_date` (DD.MM format)
- Line 4: `student_count` + "p" (personas)

### Day codes
- L = Lunes (Monday)
- M = Martes (Tuesday)  
- X = Miércoles (Wednesday)
- J = Jueves (Thursday)
- V = Viernes (Friday)
- S = Sábado (Saturday)

### Status emojis
- 🥝 = active/confirmed
- ⛔️ = issue/blocked
- ⚠️ = warning/attention needed

## Database Schema

### `classes` table
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| teacher | text NOT NULL | Teacher name (uppercase, matches profiles.name) |
| level | text | e.g., 'A1.2', 'B1.1', 'C1' |
| module | text | e.g., 'M5', 'M3' |
| class_type | text | 'group', 'private', 'conversation', 'trial' |
| hours_per_week | numeric | 10, 20, 4, 6, 9 etc. |
| days | text[] | Array: ['L','M','X','J','V'] |
| time_start | time | e.g., '09:00' |
| time_end | time | e.g., '10:50' |
| room | text | e.g., 'Mallorca', 'Buenos Aires', 'Sala 1' |
| location | text | 'Raval' or 'Glories' |
| student_count | int | |
| course_end_date | date | When this course ends |
| status | text | 'active', 'blocked', 'warning' |
| notes | text | Any extra info |
| created_at | timestamptz | |

### `substitutions` table
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| class_id | uuid FK classes | Which class is being covered |
| original_teacher | text | Who normally teaches it |
| substitute_teacher | text | Who's covering |
| date | date | The specific date of the substitution |
| reason | text | e.g., 'holiday', 'sick' |
| created_at | timestamptz | |

### `trials` table (from Pruebas sheet)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| student_name | text | |
| level | text | |
| date | date | Trial date |
| teacher | text | Who ran the trial |
| location | text | Raval/Glories |
| status | text | 'signed_up', 'attended', 'no_show', 'enrolled' |
| email | text | |
| notes | text | |

## Chatbot Queries

### Teacher asks: "What's my schedule this week?"
```sql
SELECT * FROM classes 
WHERE teacher = :current_user_name 
AND :today <= course_end_date
ORDER BY 
  CASE WHEN 'L' = ANY(days) THEN 1
       WHEN 'M' = ANY(days) THEN 2
       WHEN 'X' = ANY(days) THEN 3
       WHEN 'J' = ANY(days) THEN 4
       WHEN 'V' = ANY(days) THEN 5
       WHEN 'S' = ANY(days) THEN 6 END,
  time_start;
```
Plus check substitutions for this week (classes they're covering for someone else).

### Admin asks: "Are all classes covered this week?"
```sql
-- Find classes where the teacher has an approved holiday this week
-- AND no substitution exists for that date
SELECT c.*, hr.start_date, hr.end_date
FROM classes c
JOIN holiday_requests hr ON UPPER(hr.user_id::text) IN (
  SELECT id FROM profiles WHERE UPPER(name) = c.teacher
)
WHERE hr.status = 'Approved'
AND hr.start_date <= :week_end
AND hr.end_date >= :week_start
AND NOT EXISTS (
  SELECT 1 FROM substitutions s 
  WHERE s.class_id = c.id 
  AND s.date BETWEEN :week_start AND :week_end
);
```

### Teacher asks: "Do I have any trials this week?"
```sql
SELECT * FROM trials
WHERE teacher = :current_user_name
AND date BETWEEN :week_start AND :week_end;
```

## Import Strategy
1. Parse "Salas Raval" grid → extract teacher, room, time, days, level from each cell
2. Parse "Salas Glories" grid → same
3. Parse "Privadas" sheet → extract private class assignments
4. Parse "Conv" sheet → extract conversation classes
5. Parse "Sustis" sheet → extract substitution records
6. Parse "Pruebas" sheet → extract trial signups
7. Insert all into Supabase tables

## Coverage Gap Detection
When a teacher has an approved holiday (from `holiday_requests` table):
- Check which of their classes fall on those days
- Check if a substitution exists in `substitutions` table
- If no sub → flag as "uncovered class"
- The chatbot surfaces this to admins proactively

## Next Steps
1. [ ] Build the parser script (`scripts/import-schedule.js`)
2. [ ] Create the database migration
3. [ ] Import data
4. [ ] Wire chatbot edge function to query schedule
5. [ ] Test with real questions


## Capacity Planning Queries

### Admin asks: "Where do we have space for a new 20h in Glories?"

A 20h/week class needs ~4h/day, Mon-Fri. The query:

1. Get all rooms in Glories
2. For each room, find time slots that are NOT occupied by any active class
3. Look for blocks of 4+ consecutive free half-hour slots (= 2h minimum, ideally 4h)
4. Return: room name, available time window, days available

```sql
-- Conceptual: find rooms with free morning/afternoon blocks
-- The actual implementation builds a "room occupancy grid" and finds gaps
SELECT room, 
       array_agg(DISTINCT unnest(days)) as free_days,
       -- gaps in the time grid
FROM rooms r
WHERE r.location = 'Glories'
AND NOT EXISTS (
  SELECT 1 FROM classes c 
  WHERE c.room = r.name 
  AND c.location = 'Glories'
  AND c.time_start < :slot_end 
  AND c.time_end > :slot_start
)
```

### Admin asks: "Who can teach it?"

Cross-reference available rooms/times with teacher availability:

1. Find teachers whose existing schedule does NOT conflict with the available slot
2. Prefer teachers already at Glories (no commute)
3. Check they're not over their `expected_yearly_hours` capacity

```sql
SELECT p.name, 
       SUM(c.hours_per_week) as current_weekly_hours,
       p.expected_yearly_hours / 47 as max_weekly_hours
FROM profiles p
LEFT JOIN classes c ON UPPER(c.teacher) = UPPER(p.name)
WHERE p.role = 'teacher' AND p.status = 'Active'
GROUP BY p.id, p.name, p.expected_yearly_hours
HAVING SUM(c.hours_per_week) + 20 <= p.expected_yearly_hours / 47
-- Then filter by time conflicts with the available slot
```

### Rooms Table (needed for capacity planning)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | e.g., 'Mallorca', 'Sala 1 PANELES CÓRDOBA' |
| location | text | 'Raval' or 'Glories' |
| capacity | int | Max students (if known) |
| available_days | text[] | Which days the room is usable |
| open_from | time | Earliest available time |
| open_until | time | Latest available time |

This table gets populated from the column headers in "Salas Raval" and "Salas Glories" sheets.


---

## Real Sheet Findings (June 25, 2026) — read live via service account + Sheets API

Source: "ATLAS of Super excel 25-26" (copy), id `14IJWB6FZ79TnVF1jnkREJN9yJNFCot0AWRlNlvOqZNU`,
shared with the service account `worldclass-assistant@worldclass-bcn.iam.gserviceaccount.com`.
Read works via the SAME service-account JWT auth used by `index-materials` (scope added:
`spreadsheets.readonly`). Sheets API is enabled on the `worldclass-bcn` project. This is the
production mechanism — no download needed.

### ⚠️ SECURITY: room credentials live in the sheet
- In `Salas Raval` / `Salas Glories`, **row 2** holds each room's virtual-account email + password
  (e.g. `worldclassvirtualN@gmail.com; <password>`). The importer MUST skip row 2 and NEVER store
  or expose these (same rule as the no-passwords-in-RAG policy).

### Tab inventory (30 tabs)
Canonical for the chatbot (per original design): **Salas Raval** (46×15), **Salas Glories**
(31×15), **Privadas** (349×857), **Conv** (1341×857), **Sustis** (3654×23), **Pruebas**
(5822×22, this is the tab the shared gid 17694604 points to), plus **tutorías** (996×26).
Other tabs are working/planning grids, likely NOT needed for v1: `20`, `10`, `6 MJ`, `9 + 6`,
`4 L&X R`, `4 L&X G`, `4 M&J R`, `4 M&J G`, `4 Sab` (huge, hundreds of cols — per-group
week-by-week tracking), per-teacher tabs (`Connie`, `Ana`, `Silvia`, `Itzi`, `Alazne`, `Giulia`,
`Marina`), `Priv`, `PLANTILLA 24`, `Planificacion cursos`, `Recuento horas`, `Hoja 72`,
`calendario clases`, `info util`.

### Salas Raval layout (confirmed)
- Row 1: room names across columns C+ (Mallorca, Buenos Aires, Granada, La Mancha, La Habana,
  Cusco, Cancún, Ometepe).
- Row 2: room credentials (SKIP — see security note).
- Row 3+: col A = section label ("MAÑANAS LUNES-VIERNES"), col B = time slot ("9-9.30"), each
  room column = a class cell. The class cell sits at the TOP of its time block; the rows below
  (9.30-10, 10-10.30…) are blank — the real duration comes from the cell's own time text.

### Cell format (confirmed, with real-world variation)
```
SARA A2.1/M1 ⚽
10h L-V 9-10.50
A1.2: 4.05
12p  1.9-a2.2 m6
```
- Line 1: TEACHER LEVEL/MODULE + status emoji(s). Emojis seen: ⚽ (active), 💐 (new/start),
  ⚠️ (attention), ⛔️ (blocked). (Design doc guessed 🥝 — actual is ⚽.)
- Line 2: hours + days + time, e.g. `10h L-V 9-10.50`, `20h L-V 11-15`.
- Line 3: `level: end_date` (DD.MM) OR `Start: 8/6/26`. Sometimes blank.
- Line 4: `<count>p` + free-text transition note (e.g. `12p 1.9-a2.2 m6`, `se une con andres 6.7?`).
- Variations: "ROT" (rotation), trailing notes, partially-filled lines → parser must be tolerant.

### Next steps (when production sheet is shared tomorrow)
- Build `index-schedule` Edge Function (admin-gated, like index-materials): reads Salas
  Raval/Glories + Privadas + Conv + Sustis + Pruebas via Sheets API, parses cells (tolerant),
  SKIPS the credentials row, writes to `classes`/`substitutions`/`trials`/`rooms` tables.
- Confirm with Rocío which tabs are authoritative vs scratch (the many planning tabs).

### Note
- The one-off `peek-schedule` Edge Function used for this introspection was neutralized
  (returns 410) immediately after, because it could read the credential row.


---

## Full Tab Analysis (June 25, 2026) — sampled all key tabs live

Goal: know exactly where each kind of data lives so the importer reads ONLY what it needs and
Atlas never scans the sheet. Three structural families emerged:

### Family A — Room × time grids (the GROUP-CLASS source of truth)
- **`Salas Raval`** (46×15): col A = section label ("MAÑANAS LUNES-VIERNES"), col B = time slot
  ("9-9.30"), cols C+ = one column per room (Mallorca, Buenos Aires, Granada, La Mancha,
  La Habana, Cusco, Cancún, Ometepe). Row 1 = room names, **row 2 = room credentials (SKIP)**.
- **`Salas Glories`** (31×15): DIFFERENT — each room spans **two columns** (a `L&X&V` column and
  an `M&J` column; see row 3 day-group header). Room name only in the first of the two (forward-
  fill). col A = time slot directly (no section-label column). Row 2 = credentials (SKIP).
- The cell's OWN line-2 text (`10h L-V 9-10.50`, `4h LX 9:30-11:20`, `9h LMV 9:30-12:30`) is the
  authoritative day/time — so the parser takes days/time from the cell, room from the column.
  → Parser must auto-detect the time column and forward-fill room names. (cell format already
  validated in `scripts/parse-schedule.js`.)

### Family B — Year-long daily attendance grids (very wide, ~857 cols)
- **`Privadas`** (349×857) and **`Conv`** (1341×857): row 2 = weekday headers (lun/mar/…), row 3 =
  dates (1/09, 2/09, … across the whole year), each student row marks "Sí" per attended day.
  `Conv` group rows have a header cell like `CONV Martes 16-18:30 🪻\n3p`.
  → Attendance detail. Heavy. v2 (only import current/future window if needed).
- The format-planning grids share this shape: **`20`, `10`, `6 MJ`, `9 + 6`, `4 L&X R`,
  `4 L&X G`, `4 M&J R`, `4 M&J G`, `4 Sab`** — per-format course planning (session progression
  `A1.1/M1 S1-2`, `S3-4`…). Planning, not "today's schedule". → SKIP for v1.

### Family C — Clean tabular tabs (record per row — easiest, highest value)
- **`Pruebas`** (5822×22) — TRIALS. Headers: Day, Profe, Nivel, N/O, Horas, Time, R/G, Estudiante,
  Status, Email, Who signed up, Did they come?, Signed up?, comments… → map by header. ✅ v1.
- **`Priv`** (1005×28) — PRIVATES (clean!). Headers: Activo(si/no), Nombre estudiante, Nivel,
  Días disponibles, Horario (free text), Raval/Monumental, ¿Quién se las queda? (teacher),
  Comentarios. → map by header; schedule is free text (LLM-friendly). ✅ v1 (better than `Privadas`).
- **`tutorías`** (996×26) — weekly grid: col A = time, cols B-F = Lun-Vie, cell = `teacher (G/R)`
  (e.g. "paula (G)"). Simple. ✅ v1-ish.

### Substitutions — the awkward one
- **`Sustis`** (3654×23): NOT a clean sub log — it's a PARALLEL room×time grid (same layout as
  Salas, incl. Monumental rooms `MON.1-6` split l/x · m/j) where subs are written INSIDE the
  class cell as parentheticals: `SERGIO B1.1 (JOAN semana 1.12) (MAR Y KATHIA semana 9 y 15)`,
  `JOAN (BEA) A2.2`. → Extracting structured subs = parse "(SUB) semana X" from free text →
  **LLM-assisted extraction** is the sane route. v2.

### Per-teacher private trackers (SKIP v1)
- **`Connie`, `Ana`, `Silvia`, `Itzi`, `Alazne`, `Giulia`, `Marina`**: each is one private
  teacher's own attendance grid (`*PRIVADAS`, Alumno, dates). Detail/redundant with `Priv`. v2.
- Also skip: `calendario clases` (year calendar of class/holiday day-codes), `Planificacion
  cursos`, `Recuento horas`, `Hoja 72`, `info util`, `PLANTILLA 24`.

### v1 scope (decided)
Import the high-value, tractable sources: **group classes** (Salas Raval + Salas Glories),
**trials** (Pruebas), **privates** (Priv), **tutorías**. Defer to v2: **Conv** classes,
**Sustis** (LLM-assisted), the wide attendance grids, and per-teacher trackers.
Everything keyed by header/anchor (not column index) + a drift check, so added/moved columns
don't break it.
