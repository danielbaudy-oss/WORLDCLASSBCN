-- Companion to contract_start: last day of employment this year.
-- NULL = employed through Dec 31. When set, working days after it are excluded from the
-- progress window and the yearly hour target / holiday allocation prorate accordingly —
-- so someone who leaves in June isn't measured against a full year.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contract_end date;

COMMENT ON COLUMN profiles.contract_end IS
  'Last day of employment this year. NULL = employed through Dec 31. Prorates expected hours with contract_start.';

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_contract_period_valid;
ALTER TABLE profiles ADD CONSTRAINT profiles_contract_period_valid
  CHECK (contract_start IS NULL OR contract_end IS NULL OR contract_end >= contract_start);
