-- Save generated lifecycle documents as history snapshots and atomically record
-- one lifecycle event for every machine currently assigned to the project.
-- Run after 003_equipment_lifecycle.sql and the project/machine assignment schema.

begin;

create table if not exists public.equipment_lifecycle_document_record (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.project(id) on delete restrict,
  event_type public.equipment_lifecycle_event not null,
  event_date date not null,
  project_name text not null,
  lessee_name text not null default '',
  document_data jsonb not null
    check (jsonb_typeof(document_data) = 'object'),
  created_by uuid references public.app_user(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_equipment_lifecycle_document_created
  on public.equipment_lifecycle_document_record(created_at desc);
create index if not exists idx_equipment_lifecycle_document_project
  on public.equipment_lifecycle_document_record(project_id, created_at desc);

alter table public.equipment_lifecycle_document_record enable row level security;
drop policy if exists equipment_lifecycle_document_select
  on public.equipment_lifecycle_document_record;
create policy equipment_lifecycle_document_select
  on public.equipment_lifecycle_document_record for select to authenticated
  using (auth_role() in ('administrator', 'operations_manager', 'management', 'accounts_billing'));

revoke all on public.equipment_lifecycle_document_record from public, anon;
grant select on public.equipment_lifecycle_document_record to authenticated;

alter table public.equipment_lifecycle_event_record
  add column if not exists document_record_id uuid
  references public.equipment_lifecycle_document_record(id) on delete restrict;
create index if not exists idx_equipment_lifecycle_event_document
  on public.equipment_lifecycle_event_record(document_record_id);

-- PostgreSQL does not provide min(uuid); aggregate the matching UUIDs and use
-- the sole match after verifying that exactly one active coverage exists.
create or replace function public.resolve_active_contract_machine(
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

  select count(*)::integer, (array_agg(cm.id))[1]
    into match_count, resolved_id
  from public.contract_machine cm
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

revoke all on function public.resolve_active_contract_machine(uuid, date) from public;
grant execute on function public.resolve_active_contract_machine(uuid, date) to authenticated;

create or replace function public.create_equipment_lifecycle_document(
  p_project_id uuid,
  p_event_type public.equipment_lifecycle_event,
  p_event_date date,
  p_document_data jsonb,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  project_row public.project%rowtype;
  item jsonb;
  machine_row public.machine%rowtype;
  coverage_id uuid;
  coverage_count integer;
  assigned_count integer;
  item_count integer;
  document_id uuid;
  measurement_type text;
  current_value numeric;
  actual_value numeric;
begin
  if auth_role() not in ('administrator', 'operations_manager') then
    raise exception 'Not authorized to create equipment lifecycle documents';
  end if;
  if p_event_type is null or p_event_date is null then
    raise exception 'Document event date is required';
  end if;
  if p_document_data is null or jsonb_typeof(p_document_data) <> 'object' then
    raise exception 'Document data must be a JSON object';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Document items must be a JSON array';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'The project must have at least one assigned machine';
  end if;
  if p_document_data->>'eventType' is distinct from p_event_type::text
     or p_document_data->>'eventDate' is distinct from p_event_date::text then
    raise exception 'Document snapshot does not match the event type and date';
  end if;
  if p_document_data->>'logo' is null
     or p_document_data->>'logo' not in ('gbi', 'sdlg', 'none') then
    raise exception 'Select a valid document logo';
  end if;

  select * into project_row
  from public.project
  where id = p_project_id;
  if not found then
    raise exception 'Project does not exist';
  end if;
  if p_document_data->>'projectId' <> p_project_id::text then
    raise exception 'Document snapshot does not match the selected project';
  end if;

  select count(*)::integer into assigned_count
  from public.machine
  where current_project_id = p_project_id and deleted_at is null;
  item_count := jsonb_array_length(p_items);
  if assigned_count = 0 then
    raise exception 'The selected project has no currently assigned machines';
  end if;
  if item_count <> assigned_count then
    raise exception 'The document items do not match all machines currently assigned to this project. Reload and try again';
  end if;
  if jsonb_typeof(p_document_data->'items') <> 'array' then
    raise exception 'The document snapshot must contain the project machine items';
  end if;
  if jsonb_array_length(p_document_data->'items') <> assigned_count then
    raise exception 'The document snapshot must include every assigned project machine';
  end if;

  measurement_type := p_document_data->>'measurement';
  if measurement_type is null or measurement_type not in ('hours', 'mileage') then
    raise exception 'Select a valid meter type';
  end if;

  insert into public.equipment_lifecycle_document_record (
    project_id, event_type, event_date, project_name, lessee_name, document_data, created_by
  ) values (
    p_project_id,
    p_event_type,
    p_event_date,
    coalesce(nullif(btrim(p_document_data->>'project'), ''), project_row.name),
    coalesce(p_document_data->>'lessee', ''),
    p_document_data,
    auth.uid()
  )
  returning id into document_id;

  for item in select value from jsonb_array_elements(p_items)
  loop
    if nullif(item->>'machine_id', '') is null then
      raise exception 'Each document item must identify its assigned machine';
    end if;

    select * into machine_row
    from public.machine
    where id = (item->>'machine_id')::uuid
      and current_project_id = p_project_id
      and deleted_at is null;
    if not found then
      raise exception 'Every document item must be a currently assigned project machine';
    end if;

    if exists (
      select 1 from jsonb_array_elements(p_items) as other_item(value)
      where other_item.value->>'machine_id' = item->>'machine_id'
      group by other_item.value->>'machine_id'
      having count(*) > 1
    ) then
      raise exception 'A project machine may only appear once in the document items';
    end if;
    if not exists (
      select 1
      from jsonb_array_elements(p_document_data->'items') as snapshot_item(value)
      where snapshot_item.value->>'machineId' = item->>'machine_id'
        and snapshot_item.value->>'currentReading' = item->>'current_reading'
        and coalesce(snapshot_item.value->>'actualUsed', '') =
            coalesce(item->>'actual_used', '')
    ) then
      raise exception 'Document snapshot readings do not match the lifecycle records';
    end if;

    select count(*)::integer, (array_agg(cm.id))[1]
      into coverage_count, coverage_id
    from public.contract_machine cm
    where cm.machine_id = machine_row.id
      and (cm.deployment_start is null or cm.deployment_start <= p_event_date)
      and (cm.deployment_end is null or cm.deployment_end >= p_event_date);
    if coverage_count = 0 then
      raise exception 'No active contract coverage exists for machine % on %',
        machine_row.machine_number, p_event_date;
    end if;
    if coverage_count > 1 then
      raise exception 'Multiple active contract coverages exist for machine % on %',
        machine_row.machine_number, p_event_date;
    end if;

    current_value := nullif(item->>'current_reading', '')::numeric;
    actual_value := nullif(item->>'actual_used', '')::numeric;
    if current_value is null or current_value < 0 then
      raise exception 'A non-negative current meter reading is required for machine %',
        machine_row.machine_number;
    end if;
    if p_event_type <> 'entry' and (actual_value is null or actual_value < 0) then
      raise exception 'A non-negative actual used reading is required for machine %',
        machine_row.machine_number;
    end if;

    insert into public.equipment_lifecycle_event_record (
      contract_machine_id,
      document_record_id,
      event_type,
      event_date,
      operating_hours,
      mileage,
      actual_used_hours,
      actual_used_mileage,
      notes,
      lessor_representative_name,
      lessor_operator_name,
      lessor_operator_role,
      lessor_witness_name,
      lessor_witness_role,
      lessee_representative_name,
      lessee_person_in_charge,
      lessee_person_in_charge_role,
      lessee_witness_name,
      lessee_witness_role,
      created_by
    ) values (
      coverage_id,
      document_id,
      p_event_type,
      p_event_date,
      case when measurement_type = 'hours' then current_value end,
      case when measurement_type = 'mileage' then current_value end,
      case when measurement_type = 'hours' then actual_value end,
      case when measurement_type = 'mileage' then actual_value end,
      nullif(btrim(p_document_data->>'notes'), ''),
      nullif(btrim(p_document_data->>'lessorRepresentativeName'), ''),
      nullif(btrim(p_document_data->>'operatorName'), ''),
      nullif(btrim(p_document_data->>'operatorRole'), ''),
      nullif(btrim(p_document_data->>'lessorWitnessName'), ''),
      nullif(btrim(p_document_data->>'lessorWitnessRole'), ''),
      nullif(btrim(p_document_data->>'lesseeRepresentativeName'), ''),
      nullif(btrim(p_document_data->>'lesseePersonInCharge'), ''),
      nullif(btrim(p_document_data->>'lesseePersonInChargeRole'), ''),
      nullif(btrim(p_document_data->>'lesseeWitnessName'), ''),
      nullif(btrim(p_document_data->>'lesseeWitnessRole'), ''),
      auth.uid()
    );
  end loop;

  return document_id;
end;
$$;

revoke all on function public.create_equipment_lifecycle_document(
  uuid, public.equipment_lifecycle_event, date, jsonb, jsonb
) from public, anon;
grant execute on function public.create_equipment_lifecycle_document(
  uuid, public.equipment_lifecycle_event, date, jsonb, jsonb
) to authenticated;

commit;
