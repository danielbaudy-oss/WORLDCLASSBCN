-- Drop the FK constraint that blocks new user signups
-- The handle_new_user trigger handles linking profiles to auth users
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Make child table FKs cascade on UPDATE so the trigger can change profile IDs
ALTER TABLE time_punches DROP CONSTRAINT IF EXISTS time_punches_user_id_fkey;
ALTER TABLE time_punches ADD CONSTRAINT time_punches_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE holiday_requests DROP CONSTRAINT IF EXISTS holiday_requests_user_id_fkey;
ALTER TABLE holiday_requests ADD CONSTRAINT holiday_requests_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE holiday_requests DROP CONSTRAINT IF EXISTS holiday_requests_processed_by_fkey;
ALTER TABLE holiday_requests ADD CONSTRAINT holiday_requests_processed_by_fkey 
  FOREIGN KEY (processed_by) REFERENCES profiles(id) ON UPDATE CASCADE;

ALTER TABLE paid_hours DROP CONSTRAINT IF EXISTS paid_hours_user_id_fkey;
ALTER TABLE paid_hours ADD CONSTRAINT paid_hours_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE paid_hours DROP CONSTRAINT IF EXISTS paid_hours_created_by_fkey;
ALTER TABLE paid_hours ADD CONSTRAINT paid_hours_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON UPDATE CASCADE;
