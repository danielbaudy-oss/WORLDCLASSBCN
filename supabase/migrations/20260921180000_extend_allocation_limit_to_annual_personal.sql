-- Extend the leave-allocation enforcement from School to Annual (Vacaciones) and Personal
-- (D.R. Empleado). One trigger, three types, each checked against its own profiles column.
-- Supersedes 20260921170000 (School only): renames enforce_school_days_limit ->
-- enforce_leave_allocation_limit and repoints the trigger. Still BEFORE INSERT/UPDATE, so it
-- cannot be bypassed via the app, Atlas, or a direct API call.
--
-- Existing over-allocations (a leaver whose vacation predates a prorated allocation; a person who
-- was manually granted more than their cap before this rule existed) are NOT disturbed: the trigger
-- only blocks NEW rows or day-count increases, and always allows a date move on an already-approved
-- row of the same type.
--
-- Frontend (js/admin.js): assignDREmpresa pre-checks School; approveRequest pre-checks all three via
-- the ALLOCATION_LIMITS map; both translate the LIMITE_PERMISO marker into a readable toast.
create or replace function enforce_leave_allocation_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_alloc   integer;
  v_used    numeric;
  v_name    text;
  v_label   text;
begin
  if new.status <> 'Approved' or new.type not in ('Annual','Personal','School') then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'Approved' and old.type = new.type
     and coalesce(new.days,0) <= coalesce(old.days,0) then
    return new;
  end if;

  select name,
         case new.type
           when 'Annual'   then coalesce(annual_days, 31)
           when 'Personal' then coalesce(personal_days, 3)
           when 'School'   then coalesce(school_days, 4)
         end
    into v_name, v_alloc
    from profiles where id = new.user_id;

  if v_alloc is null then
    v_alloc := case new.type when 'Annual' then 31 when 'Personal' then 3 else 4 end;
  end if;

  v_label := case new.type
               when 'Annual'   then 'Vacaciones'
               when 'Personal' then 'D.R. Empleado'
               when 'School'   then 'D.R. Empresa'
             end;

  select coalesce(sum(days),0) into v_used
    from holiday_requests
   where user_id = new.user_id
     and type = new.type
     and status = 'Approved'
     and id <> new.id;

  if v_used + coalesce(new.days,0) > v_alloc then
    raise exception
      'LIMITE_PERMISO: % ya tiene % de % dias de % asignados. No se pueden asignar mas (limite: % dias).',
      coalesce(v_name,'El empleado'), v_used, v_alloc, v_label, v_alloc
      using errcode = 'check_violation';
  end if;

  return new;
end;
$fn$;

drop trigger if exists enforce_school_days on holiday_requests;
create trigger enforce_leave_allocation
  before insert or update on holiday_requests
  for each row execute function enforce_leave_allocation_limit();

drop function if exists enforce_school_days_limit();
