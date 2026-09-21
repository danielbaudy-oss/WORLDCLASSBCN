-- 1) Hidden adjustment to the effective yearly target. The NOMINAL expected_yearly_hours
--    keeps being shown everywhere (overview + edit modal); all progress/medical calcs use
--    expected_yearly_hours + hours_adjustment. Default 0 = no change for anyone else.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hours_adjustment numeric NOT NULL DEFAULT 0;

-- Rocío: everything computed/shown at 1500; only the progress % measured against 1450
UPDATE profiles SET hours_adjustment = -50 WHERE id = '09fb4625-04be-456a-a5f6-88cc0ba62f59';

-- 2) Delete a Pending auto-signup profile without activating it (admin-only, no records).
CREATE OR REPLACE FUNCTION delete_pending_profile(target_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cnt int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin','super_admin') AND status = 'Active'
  ) THEN
    RAISE EXCEPTION 'Solo administradores pueden eliminar perfiles';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = target_id AND status = 'Pending') THEN
    RAISE EXCEPTION 'Solo se pueden eliminar perfiles pendientes';
  END IF;
  SELECT (SELECT COUNT(*) FROM time_punches WHERE user_id = target_id)
       + (SELECT COUNT(*) FROM holiday_requests WHERE user_id = target_id)
       + (SELECT COUNT(*) FROM paid_hours WHERE user_id = target_id)
  INTO v_cnt;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'El perfil tiene % registros asociados: revísalo manualmente', v_cnt;
  END IF;
  DELETE FROM profiles WHERE id = target_id;
  DELETE FROM auth.users WHERE id = target_id;
  RETURN 'ok';
END;
$$;
