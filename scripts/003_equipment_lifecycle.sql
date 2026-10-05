begin;

-- Equipment lifecycle audit trail: Entry -> Checkpoint(s) -> Exit.
-- Each record is tied to the exact contract-machine coverage row so an event
-- cannot be recorded for a machine that is not covered by that contract.

create type equipment_lifecycle_event as enum ('entry', 'checkpoint', 'exit');

create table equipment_lifecycle_event_record (
  id uuid primary key default gen_random_uuid(),
  contract_machine_id uuid not null references contract_machine(id) on delete restrict,
  event_type equipment_lifecycle_event not null,
  event_date date not null,
  operating_hours numeric(12,2),
  mileage numeric(12,2),
  actual_used_hours numeric(12,2),
  actual_used_mileage numeric(12,2),
  notes text,
  lessor_representative_name text,
  lessor_operator_name text,
  lessor_operator_role text,
  lessor_witness_name text,
  lessor_witness_role text,
  lessee_representative_name text,
  lessee_person_in_charge text,
  lessee_person_in_charge_role text,
  lessee_witness_name text,
  lessee_witness_role text,
  created_by uuid references app_user(id),
  updated_by uuid references app_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lifecycle_hours_nonnegative check (
    (operating_hours is null or operating_hours >= 0) and
    (actual_used_hours is null or actual_used_hours >= 0)
  ),
  constraint lifecycle_mileage_nonnegative check (
    (mileage is null or mileage >= 0) and
    (actual_used_mileage is null or actual_used_mileage >= 0)
  ),
  constraint lifecycle_measurement_present check (
    operating_hours is not null or mileage is not null
  )
);

create index idx_lifecycle_contract_machine_date
  on equipment_lifecycle_event_record(contract_machine_id, event_date);
create index idx_lifecycle_event_type_date
  on equipment_lifecycle_event_record(event_type, event_date);

alter table equipment_lifecycle_event_record enable row level security;

create policy equipment_lifecycle_select
  on equipment_lifecycle_event_record for select
  using (auth_role() in ('administrator', 'operations_manager', 'management', 'accounts_billing'));

create policy equipment_lifecycle_insert
  on equipment_lifecycle_event_record for insert
  with check (auth_role() in ('administrator', 'operations_manager'));

create policy equipment_lifecycle_update
  on equipment_lifecycle_event_record for update
  using (auth_role() in ('administrator', 'operations_manager'))
  with check (auth_role() in ('administrator', 'operations_manager'));

-- Operations managers do not receive SELECT access to contract_machine. The
-- application supplies a machine visible in Fleet Register and calls this
-- resolver to obtain the active coverage id without exposing commercial rows.
create or replace function resolve_active_contract_machine(
  p_machine_id uuid,
  p_event_date date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_id uuid;
  match_count integer;
begin
  if auth_role() not in ('administrator', 'operations_manager') then
    raise exception 'Not authorized to resolve contract coverage';
  end if;

  select count(*), (array_agg(cm.id))[1]
    into match_count, resolved_id
  from contract_machine cm
  where cm.machine_id = p_machine_id
    and (cm.deployment_start is null or cm.deployment_start <= p_event_date)
    and (cm.deployment_end is null or cm.deployment_end >= p_event_date);

  if match_count = 0 then
    raise exception 'No active contract coverage exists for this machine on %', p_event_date;
  end if;
  if match_count > 1 then
    raise exception 'Multiple active contract coverages exist for this machine on %', p_event_date;
  end if;

  return resolved_id;
end;
$$;

revoke all on function resolve_active_contract_machine(uuid, date) from public;
grant execute on function resolve_active_contract_machine(uuid, date) to authenticated;

-- There is intentionally no DELETE policy. Lifecycle records are an audit
-- trail and must be corrected with a new record, not permanently deleted.

-- The attached forms contain typed/name-and-role signature fields. Actual
-- signature images or signed PDFs should be stored through the existing
-- generic attachment table using entity_type = 'equipment_lifecycle_event_record'
-- and entity_id = this record's id; no signature blobs are stored here.

create unique index uq_lifecycle_entry
  on equipment_lifecycle_event_record(contract_machine_id)
  where event_type = 'entry';
create unique index uq_lifecycle_exit
  on equipment_lifecycle_event_record(contract_machine_id)
  where event_type = 'exit';

-- Validate lifecycle ordering at write time: entry precedes checkpoint/exit,
-- exit follows entry, and checkpoints remain between them when both exist.
create or replace function validate_equipment_lifecycle_order()
returns trigger
language plpgsql
as $$
declare
  entry_date date;
  exit_date date;
begin
  select min(event_date) into entry_date
  from equipment_lifecycle_event_record
  where contract_machine_id = new.contract_machine_id
    and event_type = 'entry' and id <> new.id;

  select min(event_date) into exit_date
  from equipment_lifecycle_event_record
  where contract_machine_id = new.contract_machine_id
    and event_type = 'exit' and id <> new.id;

  if new.event_type = 'checkpoint' and entry_date is not null and new.event_date < entry_date then
    raise exception 'Checkpoint date must be on or after the entry date';
  end if;
  if new.event_type = 'exit' and entry_date is not null and new.event_date < entry_date then
    raise exception 'Exit date must be on or after the entry date';
  end if;
  if new.event_type = 'checkpoint' and exit_date is not null and new.event_date > exit_date then
    raise exception 'Checkpoint date must be on or before the exit date';
  end if;
  if new.event_type = 'entry' and exit_date is not null and new.event_date > exit_date then
    raise exception 'Entry date must be on or before the exit date';
  end if;
  return new;
end;
$$;

create trigger equipment_lifecycle_event_order
  before insert or update on equipment_lifecycle_event_record
  for each row execute function validate_equipment_lifecycle_order();

commit;
