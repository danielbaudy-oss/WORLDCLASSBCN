-- Schedule feature v1 — structured tables the importer fills from the sheet and Atlas queries.
-- All write access is service-role only (the importer); authenticated users may read schedule
-- data (it's internal, not sensitive). Sync/change logs are admin-read.

CREATE TABLE IF NOT EXISTS public.schedule_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL,
  teacher text, level text, module text,
  hours_per_week numeric,
  days text[],
  time_start time, time_end time,
  room text, location text,
  student_count int,
  course_end text, start_date text,
  status text, rotation boolean DEFAULT false,
  notes text,
  source_tab text,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS schedule_classes_source_key ON public.schedule_classes (source_key);
CREATE INDEX IF NOT EXISTS schedule_classes_teacher ON public.schedule_classes (teacher);
CREATE INDEX IF NOT EXISTS schedule_classes_location ON public.schedule_classes (location);
CREATE INDEX IF NOT EXISTS schedule_classes_days ON public.schedule_classes USING gin (days);

CREATE TABLE IF NOT EXISTS public.schedule_trials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL,
  period_label text, teacher text, level text, new_or_old text,
  hours text, class_time text, location text,
  student_name text, status text, email text,
  signed_up_by text, attended text, signed_up text, comments text,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS schedule_trials_source_key ON public.schedule_trials (source_key);
CREATE INDEX IF NOT EXISTS schedule_trials_teacher ON public.schedule_trials (teacher);

CREATE TABLE IF NOT EXISTS public.schedule_privates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL,
  active boolean,
  student_name text, level text, availability text, schedule_text text,
  location text, teacher text, comments text,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS schedule_privates_source_key ON public.schedule_privates (source_key);
CREATE INDEX IF NOT EXISTS schedule_privates_teacher ON public.schedule_privates (teacher);

CREATE TABLE IF NOT EXISTS public.schedule_tutorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL,
  teacher text, location text, day text, time_slot text,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS schedule_tutorias_source_key ON public.schedule_tutorias (source_key);
CREATE INDEX IF NOT EXISTS schedule_tutorias_teacher ON public.schedule_tutorias (teacher);

CREATE TABLE IF NOT EXISTS public.schedule_sync (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  spreadsheet_id text,
  source_modified_time timestamptz,
  changed boolean,
  stats jsonb,
  warnings jsonb,
  ok boolean
);

CREATE TABLE IF NOT EXISTS public.schedule_changes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sync_id bigint,
  entity text,
  source_key text,
  change_type text,
  field text,
  old_value text,
  new_value text,
  detected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS schedule_changes_detected_at ON public.schedule_changes (detected_at DESC);

ALTER TABLE public.schedule_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_privates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_tutorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY schedule_classes_read ON public.schedule_classes FOR SELECT TO authenticated USING (true);
CREATE POLICY schedule_trials_read ON public.schedule_trials FOR SELECT TO authenticated USING (true);
CREATE POLICY schedule_privates_read ON public.schedule_privates FOR SELECT TO authenticated USING (true);
CREATE POLICY schedule_tutorias_read ON public.schedule_tutorias FOR SELECT TO authenticated USING (true);
CREATE POLICY schedule_sync_read ON public.schedule_sync FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY schedule_changes_read ON public.schedule_changes FOR SELECT TO authenticated USING (is_admin());
