-- ========================================
-- WorldClass BCN - Data Import
-- Run this in Supabase SQL Editor
-- ========================================

-- First, update the trigger to handle existing profiles (match by email on login)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  existing_profile_id uuid;
BEGIN
  -- Check if a profile already exists with this email (pre-imported)
  SELECT id INTO existing_profile_id FROM public.profiles WHERE email = LOWER(NEW.email);
  
  IF existing_profile_id IS NOT NULL THEN
    -- Update the existing profile to use the new auth user ID
    UPDATE public.profiles 
    SET id = NEW.id,
        name = COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', name)
    WHERE email = LOWER(NEW.email);
  ELSE
    -- Create new profile
    INSERT INTO public.profiles (id, email, name, role, status)
    VALUES (
      NEW.id,
      COALESCE(LOWER(NEW.email), NEW.raw_user_meta_data->>'email'),
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(COALESCE(NEW.email, ''), '@', 1)),
      'teacher',
      'Pending'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- IMPORT PROFILES (Teachers + Admins)
-- Temporarily drop FK to auth.users so we can pre-import profiles
-- The handle_new_user trigger will update the ID when they log in
-- ========================================

ALTER TABLE profiles DROP CONSTRAINT profiles_id_fkey;

-- Teachers
INSERT INTO profiles (id, email, name, role, status, annual_days, personal_days, school_days, expected_yearly_hours, prep_time_yearly, med_appt_hours) VALUES
(gen_random_uuid(), 'andres.aguilera.worldclassbcn@gmail.com', 'ANDRÉS', 'teacher', 'Active', 31, 3, 4, 1230, 70, 20),
(gen_random_uuid(), 'andrea.ruiz.worldclassbcn@gmail.com', 'ANDREA', 'teacher', 'Active', 31, 3, 4, 1230, 70, 20),
(gen_random_uuid(), 'bea.cejudo.worldclassbcn@gmail.com', 'BEATRIZ', 'teacher', 'Active', 31, 3, 4, 1230, 70, 20),
(gen_random_uuid(), 'joan.miret.worldclassbcn@gmail.com', 'JOAN', 'teacher', 'Active', 31, 3, 4, 1230, 70, 20),
(gen_random_uuid(), 'lidia.gomez.worldclassbcn@gmail.com', 'LIDIA', 'teacher', 'Active', 31, 3, 4, 1230, 70, 20),
(gen_random_uuid(), 'laia.martinez.worldclass@gmail.com', 'LAIA', 'teacher', 'Active', 31, 3, 4, 1230, 70, 20),
(gen_random_uuid(), 'sergio.nunez.worldclassbcn@gmail.com', 'SERGIO', 'teacher', 'Active', 31, 3, 4, 1230, 70, 20),
(gen_random_uuid(), 'nerea.alarcon.worldclass@gmail.com', 'NEREA', 'teacher', 'Active', 31, 3, 4, 1230, 70, 20),
(gen_random_uuid(), 'raul.nunez.worldclassbcn@gmail.com', 'RAÚL', 'teacher', 'Active', 31, 3, 4, 1230, 70, 20),
(gen_random_uuid(), 'sara.velar.worldclassbcn@gmail.com', 'SARA', 'teacher', 'Active', 31, 3, 4, 1230, 70, 20),
(gen_random_uuid(), 'mar.fernandez.worldclassbcn@gmail.com', 'MAR', 'teacher', 'Active', 31, 3, 4, 1230, 70, 20),
(gen_random_uuid(), 'lourdes.perez.worldclass@gmail.com', 'LOURDES', 'teacher', 'Active', 31, 3, 4, 1230, 70, 20),
(gen_random_uuid(), 'nico.timo.worldclassbcn@gmail.com', 'NICO', 'teacher', 'Active', 31, 3, 4, 984, 56, 20),
(gen_random_uuid(), 'claudia.benitez.worldclassbcn@gmail.com', 'CLAUDIA', 'teacher', 'Active', 31, 3, 4, 1230, 70, 20),
(gen_random_uuid(), 'paula.espinosa.worldclass@gmail.com', 'PAULA', 'teacher', 'Active', 31, 3, 4, 1230, 70, 20),
(gen_random_uuid(), 'berta.rodriguez.worldclassbcn@gmail.com', 'BERTA', 'teacher', 'Active', 31, 3, 4, 615, 35, 20),
(gen_random_uuid(), 'silvia.sanchez.worldclassbcn@gmail.com', 'SILVIA', 'teacher', 'Active', 31, 3, 4, 1230, 70, 20),
(gen_random_uuid(), 'fanny.raya.worldclassbcn@gmail.com', 'FANNY', 'teacher', 'Active', 31, 3, 4, 283, 16, 20),
(gen_random_uuid(), 'kathia.loayza.worldclassbcn@gmail.com', 'KATHIA', 'teacher', 'Active', 31, 3, 4, 492, 28, 20),
(gen_random_uuid(), 'alfonso.serrano.worldclassbcn@gmail.com', 'ALFONSO', 'teacher', 'Active', 31, 3, 4, 492, 28, 20),
(gen_random_uuid(), 'danielbaudy@googlemail.com', 'DANIEL', 'teacher', 'Active', 31, 3, 4, 1000, 50, 20),
(gen_random_uuid(), 'vero.vega.worldclassbcn@gmail.com', 'VERÓNICA', 'teacher', 'Active', 31, 3, 4, 313, 18, 20),
(gen_random_uuid(), 'veronicavc2002@gmail.com', 'VERO', 'teacher', 'Inactive', 31, 3, 4, 313, 18, 20)
ON CONFLICT (email) DO NOTHING;

-- Admins (update existing Rocío, insert others)
UPDATE profiles SET role = 'super_admin', status = 'Active', expected_yearly_hours = 1500
WHERE email = 'rocio@worldclassbcn.com';

INSERT INTO profiles (id, email, name, role, status, annual_days, personal_days, school_days, expected_yearly_hours, prep_time_yearly, med_appt_hours) VALUES
(gen_random_uuid(), 'info@worldclassbcn.com', 'Silvia', 'admin', 'Active', 31, 3, 4, 1300, 0, 20),
(gen_random_uuid(), 'contact@worldclassbcn.com', 'Milena', 'admin', 'Active', 31, 3, 4, 1500, 0, 20),
(gen_random_uuid(), 'jurgen@worldclassbcn.com', 'Jurgen', 'admin', 'Active', 31, 3, 4, 1530, 0, 20),
(gen_random_uuid(), 'judka9893@gmail.com', 'Kamila', 'admin', 'Active', 31, 3, 4, 1530, 0, 20),
(gen_random_uuid(), 'martyna.wawrzen.worldclassbcn@gmail.com', 'Martyna', 'admin', 'Active', 31, 3, 4, 1530, 0, 20),
(gen_random_uuid(), 'silviakulikowska@gmail.com', 'Silvi', 'admin', 'Active', 31, 3, 4, 1530, 0, 20),
(gen_random_uuid(), 'milens.werner@gmail.com', 'Mile', 'admin', 'Active', 31, 3, 4, 1530, 0, 20)
ON CONFLICT (email) DO NOTHING;

-- ========================================
-- IMPORT SCHOOL HOLIDAYS
-- ========================================

INSERT INTO school_holidays (start_date, end_date, name, type) VALUES
('2025-12-23', '2026-01-04', 'Vacaciones de Navidad', 'Holiday'),
('2026-01-06', '2026-01-06', 'Día de Reyes', 'Holiday'),
('2026-04-02', '2026-04-06', 'Semana Santa', 'Holiday'),
('2026-05-01', '2026-05-01', 'Día del Trabajo', 'Holiday'),
('2026-06-24', '2026-06-24', 'Sant Joan', 'Holiday'),
('2026-09-11', '2026-09-11', 'Diada de Catalunya', 'Holiday'),
('2026-09-24', '2026-09-24', 'La Mercè', 'Holiday'),
('2026-10-12', '2026-10-12', 'Día de la Hispanidad', 'Holiday'),
('2026-12-07', '2026-12-08', 'Puente de Diciembre', 'Holiday'),
('2026-12-23', '2027-01-03', 'Vacaciones de Navidad', 'Holiday');

-- ========================================
-- IMPORT APP CONFIG
-- ========================================

UPDATE app_config SET value = '2026-03-29' WHERE key = 'FreezeDate';

-- Re-add FK constraint (but allow existing orphan rows)
-- We'll use a deferred approach: the trigger updates the ID on login
ALTER TABLE profiles ADD CONSTRAINT profiles_id_fkey 
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
