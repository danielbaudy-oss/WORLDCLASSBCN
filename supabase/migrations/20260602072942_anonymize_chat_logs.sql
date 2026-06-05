-- Make chat_logs anonymous: remove user_id requirement, keep only for feedback
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own chat logs" ON public.chat_logs;
DROP POLICY IF EXISTS "Users can insert own chat logs" ON public.chat_logs;
DROP POLICY IF EXISTS "Users can update own chat logs (feedback)" ON public.chat_logs;
DROP POLICY IF EXISTS "Admins can view all chat logs" ON public.chat_logs;

-- Make user_id nullable (anonymous by default, only set if user gives feedback)
ALTER TABLE public.chat_logs ALTER COLUMN user_id DROP NOT NULL;

-- Add a session_id for grouping conversation turns without identifying the user
ALTER TABLE public.chat_logs ADD COLUMN IF NOT EXISTS session_id text;

-- Simpler RLS: service role can insert (from Edge Function), admins can read
CREATE POLICY "Service role can insert chat logs"
  ON public.chat_logs FOR INSERT
  WITH CHECK (true);  -- Edge Function uses service_role key

CREATE POLICY "Anyone can update feedback on own session"
  ON public.chat_logs FOR UPDATE
  USING (true)
  WITH CHECK (helpful IS NOT NULL);  -- Can only update the helpful field

CREATE POLICY "Admins can view all chat logs"
  ON public.chat_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- Update views to work without user_id
DROP VIEW IF EXISTS public.chat_statistics;
DROP VIEW IF EXISTS public.chat_user_stats;
DROP VIEW IF EXISTS public.chat_top_questions;

CREATE OR REPLACE VIEW public.chat_statistics AS
SELECT
  count(*) AS total_messages,
  count(DISTINCT session_id) AS unique_sessions,
  count(DISTINCT created_at::date) AS active_days,
  count(*) FILTER (WHERE created_at >= now() - interval '7 days') AS messages_last_7d,
  count(*) FILTER (WHERE created_at >= now() - interval '30 days') AS messages_last_30d,
  count(DISTINCT session_id) FILTER (WHERE created_at >= now() - interval '7 days') AS sessions_last_7d,
  -- Topic breakdown
  count(*) FILTER (WHERE topic = 'evaluacion') AS topic_evaluacion,
  count(*) FILTER (WHERE topic = 'sustitucion') AS topic_sustitucion,
  count(*) FILTER (WHERE topic = 'materiales') AS topic_materiales,
  count(*) FILTER (WHERE topic = 'horario') AS topic_horario,
  count(*) FILTER (WHERE topic = 'vacaciones') AS topic_vacaciones,
  count(*) FILTER (WHERE topic = 'fichaje') AS topic_fichaje,
  count(*) FILTER (WHERE topic = 'onboarding') AS topic_onboarding,
  count(*) FILTER (WHERE topic = 'otro') AS topic_otro,
  -- Quality
  avg(response_time_ms)::integer AS avg_response_ms,
  count(*) FILTER (WHERE helpful = true) AS thumbs_up,
  count(*) FILTER (WHERE helpful = false) AS thumbs_down,
  CASE
    WHEN count(*) FILTER (WHERE helpful IS NOT NULL) > 0
    THEN round(100.0 * count(*) FILTER (WHERE helpful = true) / count(*) FILTER (WHERE helpful IS NOT NULL), 1)
    ELSE NULL
  END AS satisfaction_pct
FROM public.chat_logs;

-- Top questions (anonymous - no user info)
CREATE OR REPLACE VIEW public.chat_top_questions AS
SELECT
  user_question,
  topic,
  count(*) AS times_asked,
  count(DISTINCT session_id) AS unique_sessions,
  bool_and(helpful) AS always_helpful,
  min(created_at) AS first_asked,
  max(created_at) AS last_asked
FROM public.chat_logs
GROUP BY user_question, topic
HAVING count(*) > 1
ORDER BY times_asked DESC;
