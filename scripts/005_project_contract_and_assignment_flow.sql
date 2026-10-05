-- Project/contract relationships and machine assignment history.
-- Run after the core schema, RLS policies, and auth_role() helper exist.

begin;

-- Projects may be operational-only, so customer_id must be nullable.
alter table public.project
  alter column customer_id drop not null;

-- A project may have multiple contracts, and a contract may cover multiple
-- projects. Effective dates preserve the commercial relationship over time.
create table if not exists public.project_contract (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.project(id) on delete restrict,
  contract_id uuid not null references public.contract(id) on delete restrict,
  effective_from date not null,
  effective_to date,
  created_by uuid references public.app_user(id),
  created_at timestamptz not null default now(),
  constraint project_contract_dates_check
    check (effective_to is null or effective_to >= effective_from),
  constraint project_contract_start_unique
    unique (project_id, contract_id, effective_from)
);

create index if not exists idx_project_contract_project_dates
  on public.project_contract(project_id, effective_from, effective_to);
create index if not exists idx_project_contract_contract_dates
  on public.project_contract(contract_id, effective_from, effective_to);

create or replace function public.validate_project_contract()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  project_customer uuid;
  contract_customer uuid;
begin
  select customer_id into contract_customer
  from public.contract where id = new.contract_id;

  select customer_id into project_customer
  from public.project where id = new.project_id;

  if project_customer is null then
    update public.project
    set customer_id = contract_customer
    where id = new.project_id;
    project_customer := contract_customer;
  end if;
  if project_customer <> contract_customer then
    raise exception 'The project and contract must belong to the same customer';
  end if;
  return new;
end;
$$;

create or replace function public.validate_project_customer_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.customer_id is distinct from old.customer_id and exists (
    select 1
    from public.project_contract pc
    join public.contract c on c.id = pc.contract_id
    where pc.project_id = old.id
      and c.customer_id is distinct from new.customer_id
  ) then
    raise exception 'A project customer cannot be changed while linked contracts belong to another customer';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_project_customer_change on public.project;
create trigger trg_validate_project_customer_change
  before update of customer_id on public.project
  for each row execute function public.validate_project_customer_change();
revoke all on function public.validate_project_customer_change() from public;

drop trigger if exists trg_validate_project_contract on public.project_contract;
create trigger trg_validate_project_contract
  before insert or update of project_id, contract_id
  on public.project_contract
  for each row execute function public.validate_project_contract();
revoke all on function public.validate_project_contract() from public;

alter table public.project_contract enable row level security;
drop policy if exists project_contract_select on public.project_contract;
create policy project_contract_select
  on public.project_contract for select to authenticated
  using (auth_role() in ('administrator', 'management', 'accounts_billing'));
drop policy if exists project_contract_write on public.project_contract;
create policy project_contract_write
  on public.project_contract for insert to authenticated
  with check (auth_role() in ('administrator', 'accounts_billing'));
drop policy if exists project_contract_update on public.project_contract;
create policy project_contract_update
  on public.project_contract for update to authenticated
  using (auth_role() in ('administrator', 'accounts_billing'))
  with check (auth_role() in ('administrator', 'accounts_billing'));

-- Ensure existing open assignment history has no duplicates per machine.
do $$
begin
  if exists (
    select 1
    from public.machine_assignment
    where end_date is null
    group by machine_id
    having count(*) > 1
  ) then
    raise exception 'Resolve duplicate open machine_assignment rows before applying migration 005';
  end if;
end;
$$;

create unique index if not exists uq_machine_assignment_one_open_per_machine
  on public.machine_assignment(machine_id)
  where end_date is null;

alter table public.machine_assignment
  drop constraint if exists machine_assignment_dates_check;
alter table public.machine_assignment
  add constraint machine_assignment_dates_check
  check (end_date is null or end_date >= start_date);

-- Backfill an open history row for currently assigned machines that lack one.
insert into public.machine_assignment (
  machine_id, operator_id, project_id, start_date, created_by
)
select m.id, m.assigned_operator_id, m.current_project_id, current_date, m.updated_by
from public.machine m
where (m.assigned_operator_id is not null or m.current_project_id is not null)
  and not exists (
    select 1 from public.machine_assignment a
    where a.machine_id = m.id and a.end_date is null
  );

create or replace function public.record_machine_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_assignment public.machine_assignment%rowtype;
begin
  if tg_op = 'UPDATE'
     and old.assigned_operator_id is not distinct from new.assigned_operator_id
     and old.current_project_id is not distinct from new.current_project_id then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    select * into current_assignment
    from public.machine_assignment
    where machine_id = new.id and end_date is null
    for update;

    if found and current_assignment.start_date < current_date then
      update public.machine_assignment
      set end_date = current_date - 1
      where id = current_assignment.id;
      current_assignment := null;
    end if;

    if found and current_assignment.id is not null then
      update public.machine_assignment
      set operator_id = new.assigned_operator_id,
          project_id = new.current_project_id
      where id = current_assignment.id;
      return new;
    end if;
  end if;

  if new.assigned_operator_id is not null or new.current_project_id is not null then
    insert into public.machine_assignment (
      machine_id, operator_id, project_id, start_date, created_by
    ) values (
      new.id, new.assigned_operator_id, new.current_project_id, current_date, auth.uid()
    );
  end if;

  return new;
end;
$$;

revoke all on function public.record_machine_assignment_change() from public;
drop trigger if exists trg_record_machine_assignment_change on public.machine;
create trigger trg_record_machine_assignment_change
  after insert or update of assigned_operator_id, current_project_id
  on public.machine
  for each row execute function public.record_machine_assignment_change();

-- All edits to the current machine assignment go through this transaction.
-- Operators may have concurrent assignments on different machines; a machine
-- has only one current assignment. A same-day change updates today's row
-- rather than creating a zero-length historical interval.
create or replace function public.set_machine_assignment(
  p_machine_id uuid,
  p_operator_id uuid,
  p_project_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth_role() not in ('administrator', 'operations_manager') then
    raise exception 'Not authorized to change machine assignments';
  end if;

  perform 1 from public.machine
  where id = p_machine_id and deleted_at is null
  for update;

  if not found then
    raise exception 'Machine does not exist or is archived';
  end if;
  if p_operator_id is not null and not exists (
    select 1 from public.operator
    where id = p_operator_id and deleted_at is null and is_active
  ) then
    raise exception 'Operator does not exist, is inactive, or is archived';
  end if;
  if p_project_id is not null and not exists (
    select 1 from public.project where id = p_project_id
  ) then
    raise exception 'Project does not exist';
  end if;

  update public.machine
  set assigned_operator_id = p_operator_id,
      current_project_id = p_project_id,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_machine_id
    and (
      assigned_operator_id is distinct from p_operator_id
      or current_project_id is distinct from p_project_id
    );
end;
$$;

revoke all on function public.set_machine_assignment(uuid, uuid, uuid) from public;
grant execute on function public.set_machine_assignment(uuid, uuid, uuid) to authenticated;

-- Synchronize an operator's selected machine set atomically. Operators may
-- remain assigned to more than one machine; machines are exclusive.
create or replace function public.sync_operator_machine_assignments(
  p_operator_id uuid,
  p_machine_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  machine_row record;
  desired_operator uuid;
begin
  if auth_role() not in ('administrator', 'operations_manager') then
    raise exception 'Not authorized to change operator assignments';
  end if;
  if not exists (
    select 1 from public.operator
    where id = p_operator_id and deleted_at is null
  ) then
    raise exception 'Operator does not exist or is archived';
  end if;
  if coalesce(cardinality(p_machine_ids), 0) > 0 and not exists (
    select 1 from public.operator
    where id = p_operator_id and deleted_at is null and is_active
  ) then
    raise exception 'An inactive operator cannot be assigned to a machine';
  end if;

  for machine_row in
    select id, assigned_operator_id, current_project_id
    from public.machine
    where deleted_at is null
      and (assigned_operator_id = p_operator_id or id = any(coalesce(p_machine_ids, '{}'::uuid[])))
    order by id
    for update
  loop
    desired_operator := case
      when machine_row.id = any(coalesce(p_machine_ids, '{}'::uuid[])) then p_operator_id
      else null
    end;

    perform public.set_machine_assignment(
      machine_row.id, desired_operator, machine_row.current_project_id
    );
  end loop;
end;
$$;

revoke all on function public.sync_operator_machine_assignments(uuid, uuid[]) from public;
grant execute on function public.sync_operator_machine_assignments(uuid, uuid[]) to authenticated;

commit;
