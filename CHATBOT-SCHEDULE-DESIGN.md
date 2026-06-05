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
