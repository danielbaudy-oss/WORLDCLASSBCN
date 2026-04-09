-- Drop the FK constraint that blocks new user signups
-- The handle_new_user trigger handles linking profiles to auth users
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_pkey CASCADE;
ALTER TABLE profiles ADD PRIMARY KEY (id);
-- No FK to auth.users — the trigger manages the relationship
