-- Merge a Pending auto-signup profile with a pre-created (typo'd) unlinked profile.
-- Copies role + hour settings from the duplicate onto the real (auth-linked) pending
-- profile, activates it, and deletes the empty duplicate. Guards:
--   - caller must be an active admin/super_admin
--   - the duplicate must NOT be linked to a real auth user
--   - the duplicate must have no punches/holidays/paid_hours
CREATE OR REPLACE FUNCTION merge_pending_profile(pending_id uuid, dup_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dup profiles%ROWTYPE;
  v_cnt int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin','super_admin') AND status = 'Active'
  ) THEN
    RAISE EXCEPTION 'Solo administradores pueden fusionar perfiles';
  END IF;

  SELECT * INTO v_dup FROM profiles WHERE id = dup_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil duplicado no encontrado';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE id = dup_id) THEN
    RAISE EXCEPTION 'El perfil duplicado pertenece a un usuario real con sesión: revísalo manualmente';
  END IF;

  SELECT (SELECT COUNT(*) FROM time_punches WHERE user_id = dup_id)
       + (SELECT COUNT(*) FROM holiday_requests WHERE user_id = dup_id)
       + (SELECT COUNT(*) FROM paid_hours WHERE user_id = dup_id)
  INTO v_cnt;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'El perfil duplicado tiene % registros asociados: revísalo manualmente', v_cnt;
  END IF;

  UPDATE profiles SET
    role = v_dup.role,
    status = 'Active',
    annual_days = v_dup.annual_days,
    personal_days = v_dup.personal_days,
    school_days = v_dup.school_days,
    expected_yearly_hours = v_dup.expected_yearly_hours,
    prep_time_yearly = v_dup.prep_time_yearly,
    med_appt_hours = v_dup.med_appt_hours,
    unpaid_days = v_dup.unpaid_days
  WHERE id = pending_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil pendiente no encontrado';
  END IF;

  DELETE FROM profiles WHERE id = dup_id;
  RETURN 'ok';
END;
$$;
