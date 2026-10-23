-- TRACEABILITY RECORD. ALREADY EXECUTED on production on 2026-10-23 ~16:02 Europe/Madrid via
-- the Supabase SQL tool. Do NOT re-apply: the guarded UPDATE would match 0 rows, but the INSERT
-- would duplicate the 2026-05-04 punches.
--
-- What: Rocío Pimentel (09fb4625-04be-456a-a5f6-88cc0ba62f59) had her latest approved D.R. Empresa
-- (holiday_requests type 'School', id 611cde39-9e2c-431d-bc47-723955a4f75b) moved from Mon
-- 2026-05-04 to Thu 2026-04-02 (Holy Thursday, the day she actually took off). 2026-05-04 then
-- became a normal worked day: 4 punches, 08:30-13:00 + 13:30-16:00 = 7.0 h, in the same format as
-- her other admin-entered days.
-- Why: requested by Daniel (app owner). The School row's created_at/processed_at were backdated to
-- 2026-03-26 10:00 CET so it shows as granted before 2 Apr. The School count stays at 4
-- (allocation 4), so enforce_leave_allocation is not affected.
-- Freeze: 2026-05-04 is before FreezeDate (2026-10-13). Only enforce_punch_freeze_trigger was
-- disabled, inside this one transaction, and it was re-enabled before COMMIT (verified tgenabled='O').
-- audit_time_punches / audit_holiday_requests kept firing. audit_log holds the real change
-- time (2026-10-23 14:02:11 UTC, changed_by null = service write) and was deliberately left as is.

BEGIN;
UPDATE holiday_requests
   SET start_date   = '2026-04-02',
       end_date     = '2026-04-02',
       created_at   = '2026-03-26 10:00:00+01',
       processed_at = '2026-03-26 10:00:00+01',
       processed_by = COALESCE(processed_by, '09fb4625-04be-456a-a5f6-88cc0ba62f59'),
       reason       = COALESCE(reason, '') || ' [Movido desde 2026-05-04]'
 WHERE id = '611cde39-9e2c-431d-bc47-723955a4f75b'
   AND user_id = '09fb4625-04be-456a-a5f6-88cc0ba62f59'
   AND type = 'School' AND status = 'Approved'
   AND start_date = '2026-05-04' AND end_date = '2026-05-04';
ALTER TABLE time_punches DISABLE TRIGGER enforce_punch_freeze_trigger;
INSERT INTO time_punches (user_id, date, time, punch_type, notes) VALUES
  ('09fb4625-04be-456a-a5f6-88cc0ba62f59', '2026-05-04', '08:30', 'IN',  'Añadido por admin (D.R. Empresa movido al 2026-04-02)'),
  ('09fb4625-04be-456a-a5f6-88cc0ba62f59', '2026-05-04', '13:00', 'OUT', 'Añadido por admin (D.R. Empresa movido al 2026-04-02)'),
  ('09fb4625-04be-456a-a5f6-88cc0ba62f59', '2026-05-04', '13:30', 'IN',  'Añadido por admin (D.R. Empresa movido al 2026-04-02)'),
  ('09fb4625-04be-456a-a5f6-88cc0ba62f59', '2026-05-04', '16:00', 'OUT', 'Añadido por admin (D.R. Empresa movido al 2026-04-02)');
ALTER TABLE time_punches ENABLE TRIGGER enforce_punch_freeze_trigger;
COMMIT;
