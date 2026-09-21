-- Mid-year joiners were measured against the WHOLE year: the progress calc counted every
-- elapsed working day since Jan 1, even before the person was employed. Alexandra (started
-- 2026-09-14) was expected to have done 908h by Sep 21 after 6 days of work (~2 %).
--
-- contract_start NULL = employed all year (existing behaviour, unchanged for everyone else).
-- When set, the progress calc restricts the working-day window to [contract_start, Dec 31] and
-- prorates both the yearly hour target and the holiday allocation by that window's share of the
-- year ("en proporció al temps treballat", Conveni Art. 23).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contract_start date;

COMMENT ON COLUMN profiles.contract_start IS
  'First day of employment this year. NULL = employed since Jan 1. When set, progress/expected-hours are prorated to the remaining window.';

-- Backfill the two known mid-year joiners (evidence: first punch + profile creation date)
UPDATE profiles SET contract_start = '2026-09-14'
  WHERE name ILIKE 'ALEXANDRA DINU%' AND contract_start IS NULL;
UPDATE profiles SET contract_start = '2026-09-21'
  WHERE email = 'maja.przada.worldclassbcn@gmail.com' AND contract_start IS NULL;
