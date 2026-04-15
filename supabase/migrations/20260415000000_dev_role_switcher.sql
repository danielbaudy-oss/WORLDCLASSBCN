-- Dev role switcher function
-- Allows the test account to switch its own role (bypasses RLS)
-- Only works for the specific test account email

CREATE OR REPLACE FUNCTION switch_dev_role(new_role text)
RETURNS void AS $$
DECLARE
  caller_email text;
BEGIN
  -- Get the caller's email
  SELECT email INTO caller_email FROM profiles WHERE id = auth.uid();
  
  -- Only allow for the test account
  IF caller_email != 'danielbaudy@googlemail.com' THEN
    RAISE EXCEPTION 'Not authorized: dev role switch is only for the test account';
  END IF;
  
  -- Validate role
  IF new_role NOT IN ('teacher', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Invalid role: %', new_role;
  END IF;
  
  -- Update the role
  UPDATE profiles SET role = new_role WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
