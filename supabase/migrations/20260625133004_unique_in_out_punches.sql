-- Prevent duplicate IN/OUT punches for the same user at the same date+time.
-- Guards against same-user double-submits (two taps / two devices / Atlas race),
-- which the date-only "already punched" check in the Edge Function can't catch.
-- PREP punches are EXCLUDED: they legitimately share date+time (00:00:00) and are
-- distinguished by week/hours stored in `notes`.
CREATE UNIQUE INDEX IF NOT EXISTS time_punches_unique_in_out
  ON public.time_punches (user_id, date, time, punch_type)
  WHERE punch_type IN ('IN', 'OUT');
