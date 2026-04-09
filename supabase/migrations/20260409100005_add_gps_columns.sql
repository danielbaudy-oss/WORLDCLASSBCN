-- Add GPS columns to time_punches for compliance
ALTER TABLE time_punches ADD COLUMN IF NOT EXISTS latitude numeric;
ALTER TABLE time_punches ADD COLUMN IF NOT EXISTS longitude numeric;
