-- Separate employment category (profiles.role) from privileged application access.
-- Administrative workers keep role='admin' for hour rules/grouping, but only authorized
-- profiles may access the real admin panel or privileged database operations.

CREATE TABLE IF NOT EXISTS admin_authorizations (
  profile_id uuid PRIMARY KEY REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE CASCADE,
  access_level text NOT NULL CHECK (access_level IN ('admin','super_admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_authorizations ENABLE ROW LEVEL SECURITY;
-- Deliberately no direct client policies: only SECURITY DEFINER helpers inspect this table.

INSERT INTO admin_authorizations (profile_id, access_level) VALUES
  ('09fb4625-04be-456a-a5f6-88cc0ba62f59', 'super_admin'), -- Rocío
  ('a050a494-a18d-4161-a1ec-c0ebe0aeadcb', 'super_admin'), -- 🧪 Test Account (Daniel, dev)
  ('3473266e-6dd2-4142-bee1-cb0a99225032', 'admin'),       -- Silvia / info@
  ('f8846e68-1cf7-45c7-b182-984c84652646', 'admin')        -- Milena / contact@
ON CONFLICT (profile_id) DO UPDATE SET access_level = EXCLUDED.access_level;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_authorizations aa JOIN profiles p ON p.id=aa.profile_id
    WHERE aa.profile_id=auth.uid() AND p.status='Active'
  );
$$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_authorizations aa JOIN profiles p ON p.id=aa.profile_id
    WHERE aa.profile_id=auth.uid() AND aa.access_level='super_admin' AND p.status='Active'
  );
$$;

CREATE OR REPLACE FUNCTION get_admin_access_level()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT aa.access_level FROM admin_authorizations aa JOIN profiles p ON p.id=aa.profile_id
  WHERE aa.profile_id=auth.uid() AND p.status='Active' LIMIT 1;
$$;

DROP POLICY IF EXISTS "Super admin can modify config" ON app_config;
CREATE POLICY "Super admin can modify config" ON app_config
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());
DROP POLICY IF EXISTS "Admins can view all chat logs" ON chat_logs;
CREATE POLICY "Admins can view all chat logs" ON chat_logs FOR SELECT USING (is_admin());
DROP POLICY IF EXISTS "Admins can read all holidays" ON holiday_requests;
CREATE POLICY "Admins can read all holidays" ON holiday_requests FOR SELECT USING (is_admin());
DROP POLICY IF EXISTS "Admins can manage embeddings" ON material_embeddings;
CREATE POLICY "Admins can manage embeddings" ON material_embeddings
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "Admins manage paid hours" ON paid_hours;
CREATE POLICY "Admins manage paid hours" ON paid_hours
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "Admins can read all punches" ON time_punches;
CREATE POLICY "Admins can read all punches" ON time_punches FOR SELECT USING (is_admin());

CREATE OR REPLACE FUNCTION enforce_punch_freeze()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_freeze date;
BEGIN
  IF auth.uid() IS NULL OR is_admin() THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
  END IF;
  SELECT NULLIF(value,'')::date INTO v_freeze FROM app_config WHERE key='FreezeDate';
  IF v_freeze IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.date<=v_freeze THEN RAISE EXCEPTION 'Día congelado: los fichajes hasta el % están bloqueados',v_freeze; END IF;
    RETURN NEW;
  ELSIF TG_OP='UPDATE' THEN
    IF NEW.date<=v_freeze OR OLD.date<=v_freeze THEN RAISE EXCEPTION 'Día congelado: los fichajes hasta el % están bloqueados',v_freeze; END IF;
    RETURN NEW;
  ELSE
    IF OLD.date<=v_freeze THEN RAISE EXCEPTION 'Día congelado: los fichajes hasta el % están bloqueados',v_freeze; END IF;
    RETURN OLD;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION merge_pending_profile(pending_id uuid, dup_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_dup profiles%ROWTYPE; v_cnt int;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Solo administradores autorizados pueden fusionar perfiles'; END IF;
  SELECT * INTO v_dup FROM profiles WHERE id=dup_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil duplicado no encontrado'; END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id=dup_id) THEN RAISE EXCEPTION 'El perfil duplicado pertenece a un usuario real con sesión: revísalo manualmente'; END IF;
  SELECT (SELECT COUNT(*) FROM time_punches WHERE user_id=dup_id)
       + (SELECT COUNT(*) FROM holiday_requests WHERE user_id=dup_id)
       + (SELECT COUNT(*) FROM paid_hours WHERE user_id=dup_id) INTO v_cnt;
  IF v_cnt>0 THEN RAISE EXCEPTION 'El perfil duplicado tiene % registros asociados: revísalo manualmente',v_cnt; END IF;
  UPDATE profiles SET role=v_dup.role,status='Active',annual_days=v_dup.annual_days,
    personal_days=v_dup.personal_days,school_days=v_dup.school_days,
    expected_yearly_hours=v_dup.expected_yearly_hours,prep_time_yearly=v_dup.prep_time_yearly,
    med_appt_hours=v_dup.med_appt_hours,unpaid_days=v_dup.unpaid_days,
    hours_adjustment=v_dup.hours_adjustment WHERE id=pending_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil pendiente no encontrado'; END IF;
  DELETE FROM profiles WHERE id=dup_id; RETURN 'ok';
END;
$$;

CREATE OR REPLACE FUNCTION delete_pending_profile(target_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_cnt int;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Solo administradores autorizados pueden eliminar perfiles'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id=target_id AND status='Pending') THEN RAISE EXCEPTION 'Solo se pueden eliminar perfiles pendientes'; END IF;
  SELECT (SELECT COUNT(*) FROM time_punches WHERE user_id=target_id)
       + (SELECT COUNT(*) FROM holiday_requests WHERE user_id=target_id)
       + (SELECT COUNT(*) FROM paid_hours WHERE user_id=target_id) INTO v_cnt;
  IF v_cnt>0 THEN RAISE EXCEPTION 'El perfil tiene % registros asociados: revísalo manualmente',v_cnt; END IF;
  DELETE FROM profiles WHERE id=target_id;
  DELETE FROM auth.users WHERE id=target_id;
  RETURN 'ok';
END;
$$;

-- Caller can only claim an unlinked profile matching their verified auth email.
CREATE OR REPLACE FUNCTION link_profile_by_email(user_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_verified_email text;
BEGIN
  SELECT lower(email) INTO v_verified_email FROM auth.users WHERE id=auth.uid();
  IF v_verified_email IS NULL OR lower(trim(user_email))<>v_verified_email THEN
    RAISE EXCEPTION 'Email does not match authenticated account';
  END IF;
  UPDATE profiles p SET id=auth.uid()
  WHERE lower(p.email)=v_verified_email AND p.id<>auth.uid()
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=p.id);
END;
$$;
