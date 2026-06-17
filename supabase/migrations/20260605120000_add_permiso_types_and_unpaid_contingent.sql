-- Add "Permiso No Retribuido" (Convenio Art. 29) as a new holiday_requests type.
-- "Permiso" is repurposed as the hours-based "Permiso Retribuido" (Art. 28) — no schema change
-- needed for that, it stores hours in the `days` column like MedAppt.
ALTER TABLE holiday_requests DROP CONSTRAINT IF EXISTS holiday_requests_type_check;
ALTER TABLE holiday_requests ADD CONSTRAINT holiday_requests_type_check
  CHECK (type = ANY (ARRAY['Annual','Personal','School','Medical','MedAppt','Permiso','PermisoNoRet']));

-- Annual contingent (quota) for unpaid leave, per the convenio (Art. 29 max ~10 working days/year).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS unpaid_days integer NOT NULL DEFAULT 10;
