-- Deletes a time punch and records the reason in audit_log
CREATE OR REPLACE FUNCTION delete_punch_with_reason(punch_id uuid, reason text)
RETURNS void AS $$
DECLARE
  deleting_user uuid;
  punch_owner uuid;
  is_user_admin boolean;
BEGIN
  deleting_user := auth.uid();
  
  -- Require a reason
  IF reason IS NULL OR trim(reason) = '' THEN
    RAISE EXCEPTION 'A reason is required to delete a time punch';
  END IF;
  
  -- Check if punch exists and get owner
  SELECT user_id INTO punch_owner FROM time_punches WHERE id = punch_id;
  IF punch_owner IS NULL THEN
    RAISE EXCEPTION 'Punch not found';
  END IF;
  
  -- Check permission: either owner OR admin
  is_user_admin := is_admin();
  IF punch_owner != deleting_user AND NOT is_user_admin THEN
    RAISE EXCEPTION 'Not authorized to delete this punch';
  END IF;
  
  -- Record the deletion with reason in audit log
  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  SELECT 
    'time_punches',
    id::text,
    'DELETE',
    to_jsonb(tp.*),
    jsonb_build_object('deletion_reason', reason),
    deleting_user
  FROM time_punches tp
  WHERE tp.id = punch_id;
  
  -- Delete the punch
  DELETE FROM time_punches WHERE id = punch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
