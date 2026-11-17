-- Jornada (contract %) history. Each row: from valid_from on, the person's FULL-YEAR rate is
-- yearly_hours. Days before the earliest row use the earliest row's rate. No rows = the single
-- profiles.expected_yearly_hours rate (behaviour unchanged).
CREATE TABLE IF NOT EXISTS jornada_segments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid NOT NULL REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE CASCADE,
  valid_from   date NOT NULL,
  yearly_hours integer NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jornada_segments_hours_valid CHECK (yearly_hours BETWEEN 1 AND 3000),
  CONSTRAINT jornada_segments_date_valid  CHECK (valid_from >= DATE '2020-01-01'),
  CONSTRAINT jornada_segments_unique_day  UNIQUE (profile_id, valid_from)
);
COMMENT ON TABLE jornada_segments IS
  'Jornada history: from valid_from the full-year rate is yearly_hours. Earliest row also covers earlier days.';

ALTER TABLE jornada_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage jornada segments" ON jornada_segments
  FOR ALL USING ((SELECT is_admin())) WITH CHECK ((SELECT is_admin()));
CREATE POLICY "Employees read own jornada segments" ON jornada_segments
  FOR SELECT USING (profile_id = (SELECT auth.uid()));

CREATE TRIGGER audit_jornada_segments
  AFTER INSERT OR UPDATE OR DELETE ON jornada_segments
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- Atomic replace of a person's jornada history; keeps profiles.expected_yearly_hours = rate in force today.
CREATE OR REPLACE FUNCTION save_jornada_segments(p_profile_id uuid, p_segments jsonb)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date; v_rate int;
BEGIN
  IF NOT (SELECT is_admin()) THEN RAISE EXCEPTION 'Solo administradores pueden cambiar la jornada'; END IF;
  IF p_segments IS NULL OR jsonb_typeof(p_segments) <> 'array' THEN RAISE EXCEPTION 'Formato de tramos inválido'; END IF;
  IF jsonb_array_length(p_segments) = 1 THEN RAISE EXCEPTION 'Un único tramo no es un cambio de jornada'; END IF;
  -- delete rows that are not in the new list (same date AND same hours = unchanged, kept)
  DELETE FROM jornada_segments s WHERE s.profile_id = p_profile_id AND NOT EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_segments) x(valid_from date, yearly_hours int)
    WHERE x.valid_from = s.valid_from AND x.yearly_hours = s.yearly_hours);
  INSERT INTO jornada_segments (profile_id, valid_from, yearly_hours)
    SELECT p_profile_id, x.valid_from, x.yearly_hours
    FROM jsonb_to_recordset(p_segments) x(valid_from date, yearly_hours int)
    WHERE NOT EXISTS (SELECT 1 FROM jornada_segments s
      WHERE s.profile_id = p_profile_id AND s.valid_from = x.valid_from AND s.yearly_hours = x.yearly_hours);
  IF jsonb_array_length(p_segments) > 0 THEN
    SELECT yearly_hours INTO v_rate FROM jornada_segments
      WHERE profile_id = p_profile_id AND valid_from <= v_today ORDER BY valid_from DESC LIMIT 1;
    IF v_rate IS NULL THEN
      SELECT yearly_hours INTO v_rate FROM jornada_segments
        WHERE profile_id = p_profile_id ORDER BY valid_from LIMIT 1;
    END IF;
    UPDATE profiles SET expected_yearly_hours = v_rate WHERE id = p_profile_id;
  END IF;
  RETURN 'ok';
END; $$;
GRANT EXECUTE ON FUNCTION save_jornada_segments(uuid, jsonb) TO authenticated;

-- merge_pending_profile: live body (pg_get_functiondef, 2026-11-17) plus moving the duplicate's jornada history.
CREATE OR REPLACE FUNCTION public.merge_pending_profile(pending_id uuid, dup_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_dup profiles%ROWTYPE; v_cnt int;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Solo administradores autorizados pueden fusionar perfiles'; END IF;
  SELECT * INTO v_dup FROM profiles WHERE id=dup_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil duplicado no encontrado'; END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id=dup_id) THEN RAISE EXCEPTION 'El perfil duplicado pertenece a un usuario real con sesión: revísalo manualmente'; END IF;
  SELECT (SELECT COUNT(*) FROM time_punches WHERE user_id=dup_id)
       + (SELECT COUNT(*) FROM holiday_requests WHERE user_id=dup_id)
       + (SELECT COUNT(*) FROM paid_hours WHERE user_id=dup_id) INTO v_cnt;
  IF v_cnt > 0 THEN RAISE EXCEPTION 'El perfil duplicado tiene % registros asociados: revísalo manualmente', v_cnt; END IF;
  UPDATE profiles SET role=v_dup.role, status='Active', annual_days=v_dup.annual_days,
    personal_days=v_dup.personal_days, school_days=v_dup.school_days,
    expected_yearly_hours=v_dup.expected_yearly_hours, prep_time_yearly=v_dup.prep_time_yearly,
    med_appt_hours=v_dup.med_appt_hours, unpaid_days=v_dup.unpaid_days,
    hours_adjustment=v_dup.hours_adjustment
  WHERE id=pending_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil pendiente no encontrado'; END IF;
  DELETE FROM jornada_segments WHERE profile_id = pending_id;
  UPDATE jornada_segments SET profile_id = pending_id WHERE profile_id = dup_id;
  DELETE FROM profiles WHERE id=dup_id;
  RETURN 'ok';
END;
$function$;
