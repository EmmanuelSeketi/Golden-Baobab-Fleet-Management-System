-- Project lifecycle, assigned-machine status defaults, and guarded commercial deletes.
-- Run after the core schema, migration 005_project_contract_and_assignment_flow.sql,
-- and migration 008_contract_document_history.sql.

begin;

alter table public.machine
  add column if not exists status_manually_set boolean not null default false;

-- Preserve explicit non-default operational statuses already in use.
update public.machine
set status_manually_set = true
where current_status::text not in ('available', 'on_hire')
  and status_manually_set = false;

create or replace function public.apply_machine_project_status_default()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.current_status::text not in ('available', 'on_hire') then
      new.status_manually_set := true;
    end if;
    if new.current_project_id is not null
       and new.current_status::text = 'available'
       and not new.status_manually_set then
      new.current_status := 'on_hire'::public.machine_status;
    end if;
    return new;
  end if;

  if new.current_status is distinct from old.current_status then
    new.status_manually_set := true;
  elsif new.current_project_id is distinct from old.current_project_id
        and new.current_project_id is not null
        and not old.status_manually_set then
    new.current_status := 'on_hire'::public.machine_status;
    new.status_manually_set := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_apply_machine_project_status_default on public.machine;
create trigger trg_apply_machine_project_status_default
  before insert or update of current_status, current_project_id
  on public.machine
  for each row execute function public.apply_machine_project_status_default();
revoke all on function public.apply_machine_project_status_default() from public;

alter table public.project
  add column if not exists status text not null default 'not_started';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_status_check'
      and conrelid = 'public.project'::regclass
  ) then
    alter table public.project
      add constraint project_status_check
      check (status in ('not_started', 'ongoing', 'completed'));
  end if;
end;
$$;

create or replace function public.complete_elapsed_projects()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_count integer;
begin
  if auth_role() not in ('administrator', 'operations_manager', 'management', 'accounts_billing') then
    raise exception 'Not authorized to update project lifecycle status';
  end if;

  update public.project
  set status = 'completed'
  where deployment_end < current_date
    and status <> 'completed';

  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

revoke all on function public.complete_elapsed_projects() from public;
grant execute on function public.complete_elapsed_projects() to authenticated;

create or replace function public.delete_unused_customer(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth_role() not in ('administrator', 'accounts_billing') then
    raise exception 'Not authorized to delete customers';
  end if;
  if not exists (select 1 from public.customer where id = p_customer_id) then
    raise exception 'Customer does not exist';
  end if;
  if exists (select 1 from public.project where customer_id = p_customer_id)
     or exists (select 1 from public.contract where customer_id = p_customer_id)
     or exists (select 1 from public.invoice where customer_id = p_customer_id)
     or exists (select 1 from public.hiring_quotation where customer_id = p_customer_id)
     or exists (select 1 from public.contract_document_history where customer_id = p_customer_id) then
    raise exception 'Customer is referenced by projects, contracts, quotations, or contract history and cannot be deleted';
  end if;

  delete from public.customer where id = p_customer_id;
end;
$$;

revoke all on function public.delete_unused_customer(uuid) from public;
grant execute on function public.delete_unused_customer(uuid) to authenticated;

create or replace function public.delete_unused_contract(p_contract_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth_role() not in ('administrator', 'accounts_billing') then
    raise exception 'Not authorized to delete contracts';
  end if;
  if not exists (select 1 from public.contract where id = p_contract_id) then
    raise exception 'Contract does not exist';
  end if;
  if exists (select 1 from public.project_contract where contract_id = p_contract_id)
     or exists (select 1 from public.contract_machine where contract_id = p_contract_id)
     or exists (select 1 from public.billing_rule where contract_id = p_contract_id)
     or exists (select 1 from public.billing_entry where contract_id = p_contract_id)
     or exists (select 1 from public.invoice where contract_id = p_contract_id)
     or exists (select 1 from public.hiring_quotation where contract_id = p_contract_id)
     or exists (select 1 from public.contract_document_history where contract_id = p_contract_id) then
    raise exception 'Contract is referenced by projects, machines, billing, invoices, quotations, or document history and cannot be deleted';
  end if;

  delete from public.contract where id = p_contract_id;
end;
$$;

revoke all on function public.delete_unused_contract(uuid) from public;
grant execute on function public.delete_unused_contract(uuid) to authenticated;

commit;
