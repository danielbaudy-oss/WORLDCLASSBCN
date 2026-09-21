-- Prorate the stored leave allocations for the three staff with a partial contract period.
--
-- WHY: getTeacherProgress() used to multiply allocatedDays by windowFraction implicitly. That is
-- now gone — the settings modal prorates the leave-day fields explicitly when the contract dates
-- are set (prorateAllocationFields in js/admin.js), so the stored values must already BE the
-- person's real entitlement. Without this backfill the three profiles below would have their
-- FULL-year allocation subtracted from a partial-year working-day count, wrecking their %.
--
-- Rules applied (same as prorateAllocationFields):
--   leave DAYS   = full-time default x windowFraction        (Conveni Art. 23, temps treballat)
--   prep HOURS   = 70h x jornada% x windowFraction           (hours scale with jornada too)
-- windowFraction = working days (Mon-Fri minus school_holidays) inside the contract period
--                  / 241 full-year working days.
--
-- Old values are captured automatically by the audit_profiles trigger.
--
--   ALEXANDRA DINU  teacher  start 2026-09-14  68/241 = 0.2822  jornada 1045/1230 = 85.0%
--     was: annual 31, personal 3, school 4, med_appt 20, unpaid 10, prep 59.5
--   Maja Przada     admin    start 2026-09-01  76/241 = 0.3154  (admin: prep unused, untouched)
--     was: annual 31, personal 3, school 4, med_appt 20, unpaid 10
--   SILVIA          teacher  end   2026-06-30  121/241 = 0.5021 jornada 1230/1230 = 100%
--     was: annual 31, personal 3, school 4, med_appt 20, unpaid 10, prep 70

update profiles set
  annual_days = 9, personal_days = 1, school_days = 1,
  med_appt_hours = 6, unpaid_days = 3, prep_time_yearly = 16.8
where id = '779cb4c9-4d95-4444-819c-60118a25e089';  -- ALEXANDRA DINU

update profiles set
  annual_days = 10, personal_days = 1, school_days = 1,
  med_appt_hours = 6, unpaid_days = 3
where id = 'f877ea55-86e5-466d-9464-5da01f7735a2';  -- Maja Przada

update profiles set
  annual_days = 16, personal_days = 2, school_days = 2,
  med_appt_hours = 10, unpaid_days = 5, prep_time_yearly = 35.1
where id = '3f4fe309-894c-4d88-a678-60f2c118a61b';  -- SILVIA (silvia.sanchez, leaver 30 Jun)
