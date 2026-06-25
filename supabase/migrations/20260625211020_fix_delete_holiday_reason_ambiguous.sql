-- Fix "column reference \"reason\" is ambiguous" when deleting a holiday request.
-- In the INSERT...SELECT FROM holiday_requests, the bare `reason` matched both the function
-- parameter and the holiday_requests.reason column. Copy the parameter into a local variable
-- and use that in the SELECT. Parameter name kept as `reason` so the frontend rpc call
-- ({ request_id, reason }) is unchanged.
CREATE OR REPLACE FUNCTION public.delete_holiday_with_reason(request_id uuid, reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  deleting_user uuid;
  v_actor text;
  v_reason text := reason;
BEGIN
  deleting_user := auth.uid();
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized: only admins can delete holiday requests';
  END IF;
  IF v_reason IS NULL OR trim(v_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required to delete a holiday request';
  END IF;

  SELECT name INTO v_actor FROM profiles WHERE id = deleting_user LIMIT 1;
  IF v_actor IS NULL THEN v_actor := 'auth:' || deleting_user::text; END IF;

  INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  SELECT 'holiday_requests', hr.id::text, 'DELETE', to_jsonb(hr.*),
         jsonb_build_object('deletion_reason', v_reason), v_actor
  FROM holiday_requests hr WHERE hr.id = request_id;

  DELETE FROM holiday_requests WHERE id = request_id;
END;
$function$;
