-- PERF: wrap is_admin()/is_super_admin()/auth.uid() in scalar subqueries so Postgres
-- evaluates them ONCE per query (InitPlan) instead of once per row.
--
-- Regression context: 20260921120000 replaced inline `EXISTS (SELECT 1 FROM profiles WHERE ...)`
-- policy predicates with `is_admin()`. The planner could collapse the old subquery into a
-- one-time filter, but a STABLE SECURITY DEFINER function call stays in the per-row filter.
-- For an admin reading ~11.8k punches the `user_id = auth.uid()` branch fails on nearly every
-- row, so is_admin() ran ~11.8k times, each doing a join.
-- Measured on the admin punch query (1000 rows): 34.0 ms -> 5.1 ms, buffers 4004 -> 1190.
-- Also fixes the pre-existing auth.uid() per-row re-evaluation flagged by the Supabase linter.

-- app_config
DROP POLICY IF EXISTS "Super admin can modify config" ON app_config;
CREATE POLICY "Super admin can modify config" ON app_config
  FOR ALL USING ((SELECT is_super_admin())) WITH CHECK ((SELECT is_super_admin()));

-- audit_log
DROP POLICY IF EXISTS "Admins can read audit log" ON audit_log;
CREATE POLICY "Admins can read audit log" ON audit_log
  FOR SELECT USING ((SELECT is_admin()));

-- chat_logs
DROP POLICY IF EXISTS "Admins can view all chat logs" ON chat_logs;
CREATE POLICY "Admins can view all chat logs" ON chat_logs
  FOR SELECT USING ((SELECT is_admin()));

-- chat_usage
DROP POLICY IF EXISTS "Users can read own chat usage" ON chat_usage;
CREATE POLICY "Users can read own chat usage" ON chat_usage
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- holiday_requests
DROP POLICY IF EXISTS "Admins can delete holidays" ON holiday_requests;
CREATE POLICY "Admins can delete holidays" ON holiday_requests
  FOR DELETE USING ((SELECT is_admin()));
DROP POLICY IF EXISTS "Admins can insert holidays" ON holiday_requests;
CREATE POLICY "Admins can insert holidays" ON holiday_requests
  FOR INSERT WITH CHECK ((SELECT is_admin()));
DROP POLICY IF EXISTS "Users can insert own holidays" ON holiday_requests;
CREATE POLICY "Users can insert own holidays" ON holiday_requests
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Admins can read all holidays" ON holiday_requests;
CREATE POLICY "Admins can read all holidays" ON holiday_requests
  FOR SELECT USING ((SELECT is_admin()));
DROP POLICY IF EXISTS "Users can read own holidays" ON holiday_requests;
CREATE POLICY "Users can read own holidays" ON holiday_requests
  FOR SELECT USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Admins can update holidays" ON holiday_requests;
CREATE POLICY "Admins can update holidays" ON holiday_requests
  FOR UPDATE USING ((SELECT is_admin()));

-- material_embeddings
DROP POLICY IF EXISTS "Admins can manage embeddings" ON material_embeddings;
CREATE POLICY "Admins can manage embeddings" ON material_embeddings
  FOR ALL USING ((SELECT is_admin())) WITH CHECK ((SELECT is_admin()));

-- paid_hours
DROP POLICY IF EXISTS "Admins manage paid hours" ON paid_hours;
CREATE POLICY "Admins manage paid hours" ON paid_hours
  FOR ALL USING ((SELECT is_admin())) WITH CHECK ((SELECT is_admin()));
DROP POLICY IF EXISTS "Employees read own paid hours" ON paid_hours;
CREATE POLICY "Employees read own paid hours" ON paid_hours
  FOR SELECT USING (user_id = (SELECT auth.uid()));

-- profiles
DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;
CREATE POLICY "Admins can insert profiles" ON profiles
  FOR INSERT WITH CHECK ((SELECT is_admin()));
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
CREATE POLICY "Admins can read all profiles" ON profiles
  FOR SELECT USING ((SELECT is_admin()));
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT USING (id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;
CREATE POLICY "Admins can update profiles" ON profiles
  FOR UPDATE USING ((SELECT is_admin()));

-- schedule_changes / schedule_sync
DROP POLICY IF EXISTS "schedule_changes_read" ON schedule_changes;
CREATE POLICY "schedule_changes_read" ON schedule_changes
  FOR SELECT TO authenticated USING ((SELECT is_admin()));
DROP POLICY IF EXISTS "schedule_sync_read" ON schedule_sync;
CREATE POLICY "schedule_sync_read" ON schedule_sync
  FOR SELECT TO authenticated USING ((SELECT is_admin()));

-- school_holidays
DROP POLICY IF EXISTS "Admins can manage school holidays" ON school_holidays;
CREATE POLICY "Admins can manage school holidays" ON school_holidays
  FOR ALL USING ((SELECT is_admin()));
DROP POLICY IF EXISTS "All authenticated can read school holidays" ON school_holidays;
CREATE POLICY "All authenticated can read school holidays" ON school_holidays
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

-- time_punches
-- NOTE: "Super admins can insert/delete all punches" are strictly redundant — is_admin() is
-- already true for super_admins — so they're dropped, not recreated. This also cuts the number
-- of permissive policies evaluated per query. UPDATE stays super-admin-only (intentional).
DROP POLICY IF EXISTS "Super admins can insert all punches" ON time_punches;
DROP POLICY IF EXISTS "Super admins can delete all punches" ON time_punches;

DROP POLICY IF EXISTS "Admins can delete all punches" ON time_punches;
CREATE POLICY "Admins can delete all punches" ON time_punches
  FOR DELETE USING ((SELECT is_admin()));
DROP POLICY IF EXISTS "Users can delete own punches" ON time_punches;
CREATE POLICY "Users can delete own punches" ON time_punches
  FOR DELETE USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Admins can insert all punches" ON time_punches;
CREATE POLICY "Admins can insert all punches" ON time_punches
  FOR INSERT WITH CHECK ((SELECT is_admin()));
DROP POLICY IF EXISTS "Users can insert own punches" ON time_punches;
CREATE POLICY "Users can insert own punches" ON time_punches
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Admins can read all punches" ON time_punches;
CREATE POLICY "Admins can read all punches" ON time_punches
  FOR SELECT USING ((SELECT is_admin()));
DROP POLICY IF EXISTS "Users can read own punches" ON time_punches;
CREATE POLICY "Users can read own punches" ON time_punches
  FOR SELECT USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Super admins can update all punches" ON time_punches;
CREATE POLICY "Super admins can update all punches" ON time_punches
  FOR UPDATE USING ((SELECT is_super_admin()));
DROP POLICY IF EXISTS "Users can update own punches" ON time_punches;
CREATE POLICY "Users can update own punches" ON time_punches
  FOR UPDATE USING (user_id = (SELECT auth.uid()));
