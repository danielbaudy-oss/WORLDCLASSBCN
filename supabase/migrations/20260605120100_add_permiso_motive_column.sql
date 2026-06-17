-- Stores the Convenio Art. 28 motive (a–j) for Permiso Retribuido requests,
-- so each motive's day-contingent can be tracked separately. NULL for non-permiso types.
ALTER TABLE holiday_requests ADD COLUMN IF NOT EXISTS permiso_motive text;
