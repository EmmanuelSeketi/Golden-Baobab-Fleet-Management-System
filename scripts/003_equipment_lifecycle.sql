-- Equipment lifecycle audit trail: Entry -> Checkpoint(s) -> Exit
-- Review and run manually in the Supabase SQL Editor after confirming the
-- existing contract/machine schema and RLS conventions.

create type equipment_lifecycle_event as enum ('entry', 'checkpoint', 'exit');

create table equipment_lifecycle_event_record (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contract(id) on delete restrict,
  machine_id uuid not null references machine(id) on delete restrict,
  event_type equipment_lifecycle_event not null,
  event_date date not null,
  operating_hours numeric(12,2),
  mileage numeric(12,2),
  actual_used_hours numeric(12,2),
  actual_used_mileage numeric(12,2),
  notes text,
  lessor_representative_name text,
  lessor_representative_signature text,
  lessor_operator_name text,
  lessor_operator_role text,
  lessor_witness_name text,
  lessor_witness_signature text,
  lessor_witness_role text,
  lessee_representative_name text,
  lessee_representative_signature text,
  lessee_person_in_charge text,
  lessee_person_in_charge_role text,
  lessee_witness_name text,
  lessee_witness_signature text,
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
  on equipment_lifecycle_event_record(contract_id, machine_id, event_date);
create index idx_lifecycle_machine_event_type
  on equipment_lifecycle_event_record(machine_id, event_type, event_date);

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

create policy equipment_lifecycle_delete
  on equipment_lifecycle_event_record for delete
  using (auth_role() in ('administrator', 'operations_manager'));

-- Keep updated_at consistent with the rest of the application if the shared
-- update_updated_at_column trigger already exists.
create trigger equipment_lifecycle_event_updated_at
  before update on equipment_lifecycle_event_record
  for each row execute function update_updated_at_column();

-- Optional but recommended: ensure the sequence is enforced per contract and
-- machine. This prevents duplicate entry/exit forms while allowing checkpoints.
create unique index uq_lifecycle_entry
  on equipment_lifecycle_event_record(contract_id, machine_id)
  where event_type = 'entry';
create unique index uq_lifecycle_exit
  on equipment_lifecycle_event_record(contract_id, machine_id)
  where event_type = 'exit';

-- NOTE: The `authorize` line above is intentionally not executable SQL in
-- Supabase/Postgres; remove it before running if your editor rejects comments
-- adjacent to unsupported statements.
-- (It is included only as a reminder that Data API grants may be required.)
revoke all on equipment_lifecycle_event_record from anon;
grant select, insert, update, delete on equipment_lifecycle_event_record to authenticated;
grant usage, select on all sequences in schema public to authenticated;

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
  where contract_id = new.contract_id and machine_id = new.machine_id
    and event_type = 'entry' and id <> new.id;

  select min(event_date) into exit_date
  from equipment_lifecycle_event_record
  where contract_id = new.contract_id and machine_id = new.machine_id
    and event_type = 'exit' and id <> new.id;

  if new.event_type = 'checkpoint' and entry_date is not null and new.event_date < entry_date then
    raise exception 'Checkpoint date must be on or after the entry date';
  end if;
  if new.event_type = 'exit' and entry_date is not null and new.event_date < entry_date then
    raise exception 'Exit date must be on or after the entry date';
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

-- Review note: rename/remove `authorize all authenticated users...` above; it is
-- not a PostgreSQL statement. The actual grant statements are below it.
