-- Allow admins to delete holiday requests
CREATE POLICY "Admins can delete holidays" ON holiday_requests 
FOR DELETE USING (is_admin());

-- Add deletion_reason column to audit log (optional, but we'll capture it via notes instead)
-- The audit_log already captures who deleted what via the trigger
-- We just need a way to pass the reason

-- Create a function that deletes a holiday request with a reason
-- The reason gets recorded in the audit_log's new_data field as metadata
CREATE OR REPLACE FUNCTION delete_holiday_with_reason(request_id uuid, reason text)
RETURNS void AS $$
DECLARE
  deleting_user uuid;
BEGIN
  deleting_user := auth.uid();
  
  -- Check admin permission
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized: only admins can delete holiday requests';
  END IF;
  
  -- Require a reason
  IF reason IS NULL OR trim(reason) = '' THEN
    RAISE EXCEPTION 'A reason is required to delete a holiday request';
  END IF;
  
  -- Manually write the audit log entry with the reason included
  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  SELECT 
    'holiday_requests',
    id::text,
    'DELETE',
    to_jsonb(hr.*),
    jsonb_build_object('deletion_reason', reason),
    deleting_user
  FROM holiday_requests hr
  WHERE hr.id = request_id;
  
  -- Delete the request (this will fire the normal trigger too, but that's OK)
  DELETE FROM holiday_requests WHERE id = request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
