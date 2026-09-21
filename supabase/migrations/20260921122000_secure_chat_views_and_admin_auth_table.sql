-- Views must obey the caller's RLS rather than the view owner's privileges.
ALTER VIEW chat_statistics SET (security_invoker = true);
ALTER VIEW chat_top_questions SET (security_invoker = true);

-- Explicit no-access policy documents the locked-table intent and satisfies the linter.
-- SECURITY DEFINER authorization helpers still read the table as its owner.
DROP POLICY IF EXISTS "No direct client access" ON admin_authorizations;
CREATE POLICY "No direct client access" ON admin_authorizations
  FOR SELECT USING (false);
