-- Add a parsed date to trials (from Pruebas "Day" free-text) so the digest can show today's trials.
ALTER TABLE public.schedule_trials ADD COLUMN IF NOT EXISTS trial_date date;
CREATE INDEX IF NOT EXISTS schedule_trials_date ON public.schedule_trials (trial_date);

-- Substitutions parsed from the Sustis grid (best-effort; subs are free-text parentheticals).
CREATE TABLE IF NOT EXISTS public.schedule_substitutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL,
  original_teacher text,
  substitute text,
  week_note text,
  level text, module text,
  time_start time, time_end time,
  room text, location text,
  raw text,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS schedule_substitutions_source_key ON public.schedule_substitutions (source_key);
CREATE INDEX IF NOT EXISTS schedule_substitutions_orig ON public.schedule_substitutions (original_teacher);
CREATE INDEX IF NOT EXISTS schedule_substitutions_sub ON public.schedule_substitutions (substitute);

ALTER TABLE public.schedule_substitutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY schedule_substitutions_read ON public.schedule_substitutions FOR SELECT TO authenticated USING (true);
