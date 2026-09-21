-- Deleting only a pending profile leaves its Supabase Auth identity orphaned, so a
-- future OAuth sign-in cannot fire handle_new_user again. Delete both unused records.
CREATE OR REPLACE FUNCTION delete_pending_profile(target_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_cnt int;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Solo administradores autorizados pueden eliminar perfiles'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id=target_id AND status='Pending') THEN
    RAISE EXCEPTION 'Solo se pueden eliminar perfiles pendientes';
  END IF;
  SELECT (SELECT COUNT(*) FROM time_punches WHERE user_id=target_id)
       + (SELECT COUNT(*) FROM holiday_requests WHERE user_id=target_id)
       + (SELECT COUNT(*) FROM paid_hours WHERE user_id=target_id) INTO v_cnt;
  IF v_cnt>0 THEN RAISE EXCEPTION 'El perfil tiene % registros asociados: revísalo manualmente',v_cnt; END IF;
  DELETE FROM profiles WHERE id=target_id;
  DELETE FROM auth.users WHERE id=target_id;
  RETURN 'ok';
END;
$$;
