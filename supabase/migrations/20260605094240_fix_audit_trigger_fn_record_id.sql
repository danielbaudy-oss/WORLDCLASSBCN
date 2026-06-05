-- The audit trigger function hard-coded NEW.id / OLD.id, which fails on tables
-- whose primary key is not "id" (e.g. app_config keyed on "key"). This blocked
-- ALL updates to app_config (FreezeDate, MaxPastDays, PuenteDays, etc.) with:
--   ERROR: record "new" has no field "id"
-- Derive record_id dynamically from the row JSON, preferring id then key.
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'auth'
AS $function$
DECLARE
  v_uid   UUID;
  v_actor TEXT;
  v_rec   TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NOT NULL THEN
    SELECT name INTO v_actor FROM public.profiles WHERE id = v_uid LIMIT 1;
    IF v_actor IS NULL THEN v_actor := 'auth:' || v_uid::text; END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_rec := COALESCE(to_jsonb(NEW)->>'id', to_jsonb(NEW)->>'key', '');
    INSERT INTO audit_log (table_name, record_id, action, new_data, changed_by, changed_at)
    VALUES (TG_TABLE_NAME, v_rec, 'INSERT', to_jsonb(NEW), v_actor, NOW());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_rec := COALESCE(to_jsonb(NEW)->>'id', to_jsonb(NEW)->>'key', '');
    INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_by, changed_at)
    VALUES (TG_TABLE_NAME, v_rec, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), v_actor, NOW());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_rec := COALESCE(to_jsonb(OLD)->>'id', to_jsonb(OLD)->>'key', '');
    INSERT INTO audit_log (table_name, record_id, action, old_data, changed_by, changed_at)
    VALUES (TG_TABLE_NAME, v_rec, 'DELETE', to_jsonb(OLD), v_actor, NOW());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;
