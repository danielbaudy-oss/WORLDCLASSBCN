-- ========================================
-- WorldClass BCN - Initial Schema
-- ========================================

-- Profiles (replaces Punch_Teachers + Punch_Admins)
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'teacher' CHECK (role IN ('teacher', 'admin', 'super_admin')),
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Pending')),
  annual_days int NOT NULL DEFAULT 31,
  personal_days int NOT NULL DEFAULT 3,
  school_days int NOT NULL DEFAULT 4,
  expected_yearly_hours int NOT NULL DEFAULT 1000,
  prep_time_yearly numeric NOT NULL DEFAULT 70,
  med_appt_hours numeric NOT NULL DEFAULT 20,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Time Punches
CREATE TABLE time_punches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  time time NOT NULL,
  punch_type text NOT NULL CHECK (punch_type IN ('IN', 'OUT', 'PREP')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);

CREATE INDEX idx_punches_user_date ON time_punches(user_id, date);
CREATE INDEX idx_punches_date ON time_punches(date);

-- Holiday Requests
CREATE TABLE holiday_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days numeric NOT NULL,
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  type text NOT NULL CHECK (type IN ('Annual', 'Personal', 'School', 'Medical', 'MedAppt', 'Permiso')),
  reason text,
  hours numeric,
  processed_by uuid REFERENCES profiles(id),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_holidays_user ON holiday_requests(user_id);
CREATE INDEX idx_holidays_status ON holiday_requests(status);

-- School Holidays
CREATE TABLE school_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date date NOT NULL,
  end_date date NOT NULL,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'Holiday' CHECK (type IN ('Holiday', 'Puente')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Paid Hours
CREATE TABLE paid_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  hours numeric NOT NULL CHECK (hours > 0),
  date date NOT NULL,
  notes text,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_paid_user ON paid_hours(user_id);

-- App Config
CREATE TABLE app_config (
  key text PRIMARY KEY,
  value text,
  description text
);

INSERT INTO app_config (key, value, description) VALUES
  ('SchoolName', 'WorldClass BCN', 'Name displayed in the app'),
  ('AllowPastPunches', 'true', 'Allow teachers to punch for past days'),
  ('MaxPastDays', '30', 'Maximum days in the past allowed'),
  ('PuenteDays', '9', 'Pre-assigned puente days for the year'),
  ('FreezeDate', '', 'Last frozen date (inclusive)');

-- ========================================
-- ROW LEVEL SECURITY
-- ========================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_punches ENABLE ROW LEVEL SECURITY;
ALTER TABLE holiday_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE paid_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Helper: check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin') AND status = 'Active'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if current user is super_admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'super_admin' AND status = 'Active'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- PROFILES policies
CREATE POLICY "Users can read own profile" ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Admins can read all profiles" ON profiles FOR SELECT USING (is_admin());
CREATE POLICY "Admins can update profiles" ON profiles FOR UPDATE USING (is_admin());
CREATE POLICY "Admins can insert profiles" ON profiles FOR INSERT WITH CHECK (is_admin());

-- TIME_PUNCHES policies
CREATE POLICY "Users can read own punches" ON time_punches FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own punches" ON time_punches FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own punches" ON time_punches FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own punches" ON time_punches FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "Admins can read all punches" ON time_punches FOR SELECT USING (is_admin());
CREATE POLICY "Super admins can update all punches" ON time_punches FOR UPDATE USING (is_super_admin());

-- HOLIDAY_REQUESTS policies
CREATE POLICY "Users can read own holidays" ON holiday_requests FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own holidays" ON holiday_requests FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can read all holidays" ON holiday_requests FOR SELECT USING (is_admin());
CREATE POLICY "Admins can update holidays" ON holiday_requests FOR UPDATE USING (is_admin());
CREATE POLICY "Admins can insert holidays" ON holiday_requests FOR INSERT WITH CHECK (is_admin());

-- SCHOOL_HOLIDAYS policies
CREATE POLICY "All authenticated can read school holidays" ON school_holidays FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage school holidays" ON school_holidays FOR ALL USING (is_admin());

-- PAID_HOURS policies
CREATE POLICY "Admins can manage paid hours" ON paid_hours FOR ALL USING (is_admin());
CREATE POLICY "Users can read own paid hours" ON paid_hours FOR SELECT USING (user_id = auth.uid());

-- APP_CONFIG policies
CREATE POLICY "All authenticated can read config" ON app_config FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Super admins can update config" ON app_config FOR UPDATE USING (is_super_admin());
CREATE POLICY "Super admins can insert config" ON app_config FOR INSERT WITH CHECK (is_super_admin());

-- ========================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ========================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, email, name, role, status)
  VALUES (
    NEW.id,
    LOWER(NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'teacher',
    'Pending'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
