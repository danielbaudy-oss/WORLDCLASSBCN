-- ========================================
-- IMPORT TIME PUNCHES (sample - first batch)
-- Uses subquery to match email to profile ID
-- ========================================

-- Due to the massive size of the punch data (2000+ rows),
-- this should be run via a script. For now, here's the approach:
-- Each punch is inserted by looking up the profile ID from email.

-- Example batch (first 50 punches):
INSERT INTO time_punches (user_id, date, time, punch_type, notes, created_at) 
SELECT p.id, v.date::date, v.time::time, v.punch_type, v.notes, v.created_at::timestamptz
FROM (VALUES
  ('rocio@worldclassbcn.com', '2026-01-05', '08:30', 'IN', '', '2026-01-06 22:19:04'),
  ('rocio@worldclassbcn.com', '2026-01-05', '13:00', 'OUT', '', '2026-01-06 22:21:18'),
  ('rocio@worldclassbcn.com', '2026-01-05', '13:30', 'IN', '', '2026-01-06 22:21:47'),
  ('rocio@worldclassbcn.com', '2026-01-05', '16:00', 'OUT', '', '2026-01-06 22:22:09'),
  ('joan.miret.worldclassbcn@gmail.com', '2026-01-07', '09:00', 'IN', '', '2026-01-07 15:24:21'),
  ('joan.miret.worldclassbcn@gmail.com', '2026-01-07', '15:00', 'OUT', '', '2026-01-07 15:24:41'),
  ('rocio@worldclassbcn.com', '2026-01-07', '08:30', 'IN', '', '2026-01-07 15:28:55'),
  ('joan.miret.worldclassbcn@gmail.com', '2026-01-05', '09:00', 'IN', '', '2026-01-07 15:29:34'),
  ('joan.miret.worldclassbcn@gmail.com', '2026-01-05', '15:00', 'OUT', '', '2026-01-07 15:29:48'),
  ('rocio@worldclassbcn.com', '2026-01-07', '13:00', 'OUT', '', '2026-01-07 22:53:49'),
  ('rocio@worldclassbcn.com', '2026-01-07', '13:30', 'IN', '', '2026-01-07 22:54:10'),
  ('rocio@worldclassbcn.com', '2026-01-07', '16:00', 'OUT', '', '2026-01-07 22:54:35'),
  ('nerea.alarcon.worldclass@gmail.com', '2026-01-05', '09:00', 'IN', '', '2026-01-08 12:12:01'),
  ('nerea.alarcon.worldclass@gmail.com', '2026-01-05', '15:00', 'OUT', '', '2026-01-08 12:12:25'),
  ('nerea.alarcon.worldclass@gmail.com', '2026-01-07', '09:00', 'IN', '', '2026-01-08 12:56:17'),
  ('nerea.alarcon.worldclass@gmail.com', '2026-01-07', '15:00', 'OUT', '', '2026-01-08 12:56:34'),
  ('nerea.alarcon.worldclass@gmail.com', '2026-01-07', '19:00', 'IN', '', '2026-01-08 12:56:51'),
  ('nerea.alarcon.worldclass@gmail.com', '2026-01-07', '21:00', 'OUT', '', '2026-01-08 12:57:06'),
  ('nerea.alarcon.worldclass@gmail.com', '2026-01-08', '09:00', 'IN', '', '2026-01-08 12:59:44'),
  ('nerea.alarcon.worldclass@gmail.com', '2026-01-07', '00:00', 'PREP', 'Week: 2026-01-05 | Hours: 1.5', '2026-01-08 13:58:26')
) AS v(email, date, time, punch_type, notes, created_at)
JOIN profiles p ON p.email = v.email;

-- NOTE: The full punch import has ~2000+ rows. 
-- For the complete import, we should use a script approach.
-- This migration demonstrates the pattern.
-- Run the full import via the Supabase SQL editor in batches.
