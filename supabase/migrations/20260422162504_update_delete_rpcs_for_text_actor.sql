-- Update delete_punch_with_reason to write actor name to audit_log
CREATE OR REPLACE FUNCTION delete_punch_with_reason(punch_id uuid, reason text)
RETURNS void AS $$
DECLARE
  deleting_user uuid;
  v_actor text;
  punch_owner uuid;
  is_user_admin boolean;
BEGIN
  deleting_user := auth.uid();
  IF reason IS NULL OR trim(reason) = '' THEN
    RAISE EXCEPTION 'A reason is required to delete a time punch';
  END IF;
  SELECT user_id INTO punch_owner FROM time_punches WHERE id = punch_id;
  IF punch_owner IS NULL THEN
    RAISE EXCEPTION 'Punch not found';
  END IF;
  is_user_admin := is_admin();
  IF punch_owner != deleting_user AND NOT is_user_admin THEN
    RAISE EXCEPTION 'Not authorized to delete this punch';
  END IF;

  SELECT name INTO v_actor FROM profiles WHERE id = deleting_user LIMIT 1;
  IF v_actor IS NULL THEN v_actor := 'auth:' || deleting_user::text; END IF;

  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  SELECT 'time_punches', id::text, 'DELETE', to_jsonb(tp.*),
         jsonb_build_object('deletion_reason', reason), v_actor
  FROM time_punches tp WHERE tp.id = punch_id;

  DELETE FROM time_punches WHERE id = punch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update delete_holiday_with_reason similarly
CREATE OR REPLACE FUNCTION delete_holiday_with_reason(request_id uuid, reason text)
RETURNS void AS $$
DECLARE
  deleting_user uuid;
  v_actor text;
BEGIN
  deleting_user := auth.uid();
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized: only admins can delete holiday requests';
  END IF;
  IF reason IS NULL OR trim(reason) = '' THEN
    RAISE EXCEPTION 'A reason is required to delete a holiday request';
  END IF;

  SELECT name INTO v_actor FROM profiles WHERE id = deleting_user LIMIT 1;
  IF v_actor IS NULL THEN v_actor := 'auth:' || deleting_user::text; END IF;

  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  SELECT 'holiday_requests', id::text, 'DELETE', to_jsonb(hr.*),
         jsonb_build_object('deletion_reason', reason), v_actor
  FROM holiday_requests hr WHERE hr.id = request_id;

  DELETE FROM holiday_requests WHERE id = request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
