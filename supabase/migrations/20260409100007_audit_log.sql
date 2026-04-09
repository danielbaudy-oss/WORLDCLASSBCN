-- Audit log table for compliance (tamper-proof record of all changes)
CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  record_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

-- No RLS on audit_log — only readable via dashboard/SQL, not client API
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read audit log" ON audit_log FOR SELECT USING (is_admin());

-- Audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (table_name, record_id, action, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'INSERT', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (table_name, record_id, action, old_data, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id::text, 'DELETE', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach audit triggers to time_punches
CREATE TRIGGER audit_time_punches
  AFTER INSERT OR UPDATE OR DELETE ON time_punches
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Attach audit triggers to holiday_requests
CREATE TRIGGER audit_holiday_requests
  AFTER INSERT OR UPDATE OR DELETE ON holiday_requests
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Attach audit triggers to paid_hours
CREATE TRIGGER audit_paid_hours
  AFTER INSERT OR UPDATE OR DELETE ON paid_hours
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Attach audit triggers to profiles (track settings changes)
CREATE TRIGGER audit_profiles
  AFTER UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
