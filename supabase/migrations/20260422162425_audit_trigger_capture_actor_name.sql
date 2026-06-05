-- Capture the authenticated user on every audit entry and resolve their name
-- via profiles.id = auth.users.id.
CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER AS $fn$
DECLARE
  v_uid   UUID;
  v_actor TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NOT NULL THEN
    SELECT name INTO v_actor FROM public.profiles WHERE id = v_uid LIMIT 1;
    IF v_actor IS NULL THEN v_actor := 'auth:' || v_uid::text; END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (table_name, record_id, action, new_data, changed_by, changed_at)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'INSERT', to_jsonb(NEW), v_actor, NOW());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_by, changed_at)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), v_actor, NOW());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (table_name, record_id, action, old_data, changed_by, changed_at)
    VALUES (TG_TABLE_NAME, OLD.id::text, 'DELETE', to_jsonb(OLD), v_actor, NOW());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, auth;

-- Re-point the existing triggers to the new function name
DROP TRIGGER IF EXISTS audit_time_punches ON time_punches;
DROP TRIGGER IF EXISTS audit_holiday_requests ON holiday_requests;
DROP TRIGGER IF EXISTS audit_paid_hours ON paid_hours;
DROP TRIGGER IF EXISTS audit_profiles ON profiles;

CREATE TRIGGER audit_time_punches
  AFTER INSERT OR UPDATE OR DELETE ON time_punches
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_holiday_requests
  AFTER INSERT OR UPDATE OR DELETE ON holiday_requests
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_paid_hours
  AFTER INSERT OR UPDATE OR DELETE ON paid_hours
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_profiles
  AFTER UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
