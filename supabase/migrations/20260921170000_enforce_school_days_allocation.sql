-- Enforce the D.R. Empresa (type='School') allocation at the database level so it cannot be
-- bypassed through the app, Atlas, or a direct API call. A person's APPROVED School days may not
-- exceed profiles.school_days (default 4). Fires on the two ways a School day becomes approved:
-- inserting a row already Approved (assignDREmpresa), or flipping an existing row to Approved.
--
-- BEFORE trigger so the write is rejected before it lands. The audit trigger is AFTER, so a blocked
-- attempt leaves no audit row — intended: nothing happened.
--
-- Frontend (js/admin.js assignDREmpresa + approveRequest) does a friendly pre-check and also
-- translates the LIMITE_DR_EMPRESA marker into a readable toast, but this trigger is the boundary.
create or replace function enforce_school_days_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_alloc   integer;
  v_used    numeric;
  v_name    text;
begin
  -- Only care about School rows that are (becoming) Approved.
  if new.type <> 'School' or new.status <> 'Approved' then
    return new;
  end if;

  -- On UPDATE, if it was already an approved School day and the day count didn't grow, this is a
  -- no-op reclassification/date move — let it through so editing dates never trips the cap.
  if tg_op = 'UPDATE'
     and old.type = 'School' and old.status = 'Approved'
     and coalesce(new.days,0) <= coalesce(old.days,0) then
    return new;
  end if;

  select coalesce(school_days, 4), name
    into v_alloc, v_name
    from profiles where id = new.user_id;
  if v_alloc is null then v_alloc := 4; end if;

  -- Sum this person's already-approved School days, excluding the row being updated.
  select coalesce(sum(days),0) into v_used
    from holiday_requests
   where user_id = new.user_id
     and type = 'School'
     and status = 'Approved'
     and id <> new.id;

  if v_used + coalesce(new.days,0) > v_alloc then
    raise exception
      'LIMITE_DR_EMPRESA: % ya tiene % de % dias de D.R. Empresa asignados. No se pueden asignar mas (limite: % dias).',
      coalesce(v_name,'El empleado'), v_used, v_alloc, v_alloc
      using errcode = 'check_violation';
  end if;

  return new;
end;
$fn$;

drop trigger if exists enforce_school_days on holiday_requests;
create trigger enforce_school_days
  before insert or update on holiday_requests
  for each row execute function enforce_school_days_limit();
