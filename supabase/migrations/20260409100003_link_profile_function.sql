-- Function to link a profile to an auth user by email
-- Runs with SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION link_profile_by_email(user_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET id = auth.uid()
  WHERE email = user_email
    AND id != auth.uid();
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION link_profile_by_email(text) TO authenticated;
