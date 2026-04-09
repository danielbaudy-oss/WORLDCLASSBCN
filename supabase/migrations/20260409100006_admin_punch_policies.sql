-- Allow admins to insert and delete punches for any user
CREATE POLICY "Admins can insert all punches" ON time_punches FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins can delete all punches" ON time_punches FOR DELETE USING (is_admin());
