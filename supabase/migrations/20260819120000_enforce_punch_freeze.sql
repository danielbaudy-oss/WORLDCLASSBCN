-- Server-side freeze enforcement: teachers cannot INSERT/UPDATE/DELETE punches on days
-- on or before app_config.FreezeDate. Previously the freeze was cosmetic (frontend only).
-- Exempt: active admins/super_admins (by design) and service-role writes (auth.uid() IS NULL:
-- imports + Edge Functions, which enforce the freeze themselves).

CREATE OR REPLACE FUNCTION enforce_punch_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_freeze date;
BEGIN
  -- Service-role / no-JWT writes bypass (data imports, Atlas Edge Function)
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- Active admins / super_admins are never frozen
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin') AND status = 'Active'
  ) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT NULLIF(value, '')::date INTO v_freeze FROM app_config WHERE key = 'FreezeDate';
  IF v_freeze IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.date <= v_freeze THEN
      RAISE EXCEPTION 'Día congelado: los fichajes hasta el % están bloqueados', v_freeze;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.date <= v_freeze OR OLD.date <= v_freeze THEN
      RAISE EXCEPTION 'Día congelado: los fichajes hasta el % están bloqueados', v_freeze;
    END IF;
    RETURN NEW;
  ELSE
    IF OLD.date <= v_freeze THEN
      RAISE EXCEPTION 'Día congelado: los fichajes hasta el % están bloqueados', v_freeze;
    END IF;
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS enforce_punch_freeze_trigger ON time_punches;
CREATE TRIGGER enforce_punch_freeze_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON time_punches
  FOR EACH ROW EXECUTE FUNCTION enforce_punch_freeze();
