-- Chat logs table for Atlas usage statistics
CREATE TABLE IF NOT EXISTS public.chat_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  user_question text NOT NULL,
  bot_response text NOT NULL,
  sources_used text[], -- file names from material_embeddings that were matched
  topic text, -- auto-categorized: 'evaluacion', 'sustitucion', 'materiales', 'horario', 'vacaciones', 'fichaje', 'onboarding', 'otro'
  response_time_ms integer, -- how long the API took
  helpful boolean, -- user feedback (thumbs up/down), nullable until rated
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast querying by date and user
CREATE INDEX idx_chat_logs_created_at ON public.chat_logs(created_at DESC);
CREATE INDEX idx_chat_logs_user_id ON public.chat_logs(user_id);
CREATE INDEX idx_chat_logs_topic ON public.chat_logs(topic);

-- RLS: teachers see only their own, admins see all
ALTER TABLE public.chat_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chat logs"
  ON public.chat_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chat logs"
  ON public.chat_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chat logs (feedback)"
  ON public.chat_logs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all chat logs"
  ON public.chat_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- View for admin statistics dashboard
CREATE OR REPLACE VIEW public.chat_statistics AS
SELECT
  -- Overall stats
  count(*) AS total_messages,
  count(DISTINCT user_id) AS unique_users,
  count(DISTINCT message_date) AS active_days,
  -- Per-period
  count(*) FILTER (WHERE created_at >= now() - interval '7 days') AS messages_last_7d,
  count(*) FILTER (WHERE created_at >= now() - interval '30 days') AS messages_last_30d,
  count(DISTINCT user_id) FILTER (WHERE created_at >= now() - interval '7 days') AS users_last_7d,
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
FROM public.chat_logs
CROSS JOIN LATERAL (SELECT created_at::date AS message_date) AS d;

-- Per-user stats view
CREATE OR REPLACE VIEW public.chat_user_stats AS
SELECT
  cl.user_id,
  p.name AS user_name,
  count(*) AS total_questions,
  count(*) FILTER (WHERE cl.created_at >= now() - interval '7 days') AS questions_last_7d,
  max(cl.created_at) AS last_active,
  mode() WITHIN GROUP (ORDER BY cl.topic) AS most_asked_topic,
  count(*) FILTER (WHERE cl.helpful = true) AS thumbs_up,
  count(*) FILTER (WHERE cl.helpful = false) AS thumbs_down
FROM public.chat_logs cl
JOIN public.profiles p ON p.id = cl.user_id
GROUP BY cl.user_id, p.name;

-- Top questions view (for FAQ curation)
CREATE OR REPLACE VIEW public.chat_top_questions AS
SELECT
  user_question,
  topic,
  count(*) AS times_asked,
  count(DISTINCT user_id) AS unique_askers,
  bool_and(helpful) AS always_helpful,
  min(created_at) AS first_asked,
  max(created_at) AS last_asked
FROM public.chat_logs
GROUP BY user_question, topic
HAVING count(*) > 1
ORDER BY times_asked DESC;
