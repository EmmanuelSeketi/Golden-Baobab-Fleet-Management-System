-- Add safe edit and delete operations for generated lifecycle documents.
-- Editing preserves document type, project, and machine membership while
-- synchronizing readings and signatures with the linked lifecycle events.
-- Deletion explicitly removes the linked lifecycle events with the snapshot.
-- Run after 010_equipment_lifecycle_document_history.sql.

begin;

alter table public.equipment_lifecycle_document_record
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.update_equipment_lifecycle_document(
  p_document_id uuid,
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
  document_row public.equipment_lifecycle_document_record%rowtype;
  item jsonb;
  current_value numeric;
  actual_value numeric;
  measurement_type text;
  linked_count integer;
  item_count integer;
  affected_count integer;
begin
  if coalesce(auth_role(), '') not in ('administrator', 'operations_manager') then
    raise exception 'Not authorized to update equipment lifecycle documents';
  end if;
  if p_document_id is null or p_event_date is null then
    raise exception 'Document and event date are required';
  end if;
  if p_document_data is null or jsonb_typeof(p_document_data) <> 'object' then
    raise exception 'Document data must be a JSON object';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Document items must be a JSON array';
  end if;

  select * into document_row
  from public.equipment_lifecycle_document_record
  where id = p_document_id
  for update;
  if not found then
    raise exception 'Equipment lifecycle document was not found';
  end if;
  if p_document_data->>'eventType' is distinct from document_row.event_type::text
     or p_document_data->>'projectId' is distinct from document_row.project_id::text
     or p_document_data->>'eventDate' is distinct from p_event_date::text then
    raise exception 'Editing cannot change the saved document type or project';
  end if;
  if p_document_data->>'logo' is null
     or p_document_data->>'logo' not in ('gbi', 'sdlg', 'none') then
    raise exception 'Select a valid document logo';
  end if;
  if jsonb_typeof(p_document_data->'items') is distinct from 'array' then
    raise exception 'Document snapshot must contain its original machine items';
  end if;

  select count(*)::integer into linked_count
  from public.equipment_lifecycle_event_record
  where document_record_id = p_document_id
    and event_type = document_row.event_type;
  item_count := jsonb_array_length(p_items);
  if item_count = 0 or item_count <> linked_count
     or jsonb_array_length(p_document_data->'items') <> linked_count then
    raise exception 'The document machine items cannot be added or removed while editing';
  end if;

  measurement_type := p_document_data->>'measurement';
  if measurement_type is null or measurement_type not in ('hours', 'mileage') then
    raise exception 'Select a valid meter type';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    if nullif(item->>'machine_id', '') is null then
      raise exception 'Each item must identify its original machine';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_items) as other_item(value)
      where other_item.value->>'machine_id' = item->>'machine_id'
      group by other_item.value->>'machine_id'
      having count(*) > 1
    ) then
      raise exception 'A machine may only appear once in the document';
    end if;

    current_value := nullif(item->>'current_reading', '')::numeric;
    actual_value := nullif(item->>'actual_used', '')::numeric;
    if current_value is null or current_value < 0 then
      raise exception 'Each machine requires a non-negative current reading';
    end if;
    if document_row.event_type <> 'entry'
       and (actual_value is null or actual_value < 0) then
      raise exception 'Each machine requires a non-negative actual used reading';
    end if;
    if not exists (
      select 1
      from jsonb_array_elements(p_document_data->'items') as snapshot_item(value)
      where snapshot_item.value->>'machineId' = item->>'machine_id'
        and nullif(snapshot_item.value->>'currentReading', '')::numeric = current_value
        and coalesce(nullif(snapshot_item.value->>'actualUsed', '')::numeric, 0)
            = coalesce(actual_value, 0)
    ) then
      raise exception 'Document snapshot readings do not match the lifecycle event values';
    end if;
    if not exists (
      select 1
      from public.equipment_lifecycle_event_record event
      join public.contract_machine coverage on coverage.id = event.contract_machine_id
      where event.document_record_id = p_document_id
        and event.event_type = document_row.event_type
        and coverage.machine_id = (item->>'machine_id')::uuid
        and (coverage.deployment_start is null or coverage.deployment_start <= p_event_date)
        and (coverage.deployment_end is null or coverage.deployment_end >= p_event_date)
    ) then
      raise exception 'The event date is outside the original machine contract coverage';
    end if;

    update public.equipment_lifecycle_event_record event
    set event_date = p_event_date,
        operating_hours = case when measurement_type = 'hours' then current_value end,
        mileage = case when measurement_type = 'mileage' then current_value end,
        actual_used_hours = case when measurement_type = 'hours' then actual_value end,
        actual_used_mileage = case when measurement_type = 'mileage' then actual_value end,
        notes = nullif(btrim(p_document_data->>'notes'), ''),
        lessor_representative_name = nullif(btrim(p_document_data->>'lessorRepresentativeName'), ''),
        lessor_operator_name = nullif(btrim(p_document_data->>'operatorName'), ''),
        lessor_operator_role = nullif(btrim(p_document_data->>'operatorRole'), ''),
        lessor_witness_name = nullif(btrim(p_document_data->>'lessorWitnessName'), ''),
        lessor_witness_role = nullif(btrim(p_document_data->>'lessorWitnessRole'), ''),
        lessee_representative_name = nullif(btrim(p_document_data->>'lesseeRepresentativeName'), ''),
        lessee_person_in_charge = nullif(btrim(p_document_data->>'lesseePersonInCharge'), ''),
        lessee_person_in_charge_role = nullif(btrim(p_document_data->>'lesseePersonInChargeRole'), ''),
        lessee_witness_name = nullif(btrim(p_document_data->>'lesseeWitnessName'), ''),
        lessee_witness_role = nullif(btrim(p_document_data->>'lesseeWitnessRole'), ''),
        updated_at = now(),
        updated_by = auth.uid()
    from public.contract_machine coverage
    where event.document_record_id = p_document_id
      and event.event_type = document_row.event_type
      and coverage.id = event.contract_machine_id
      and coverage.machine_id = (item->>'machine_id')::uuid;
    get diagnostics affected_count = row_count;
    if affected_count <> 1 then
      raise exception 'Could not uniquely update the lifecycle record for a document machine';
    end if;
  end loop;

  update public.equipment_lifecycle_document_record
  set event_date = p_event_date,
      lessee_name = coalesce(p_document_data->>'lessee', ''),
      document_data = p_document_data,
      updated_at = now()
  where id = p_document_id;

  return p_document_id;
end;
$$;

create or replace function public.delete_equipment_lifecycle_document(
  p_document_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth_role(), '') not in ('administrator', 'operations_manager') then
    raise exception 'Not authorized to delete equipment lifecycle documents';
  end if;
  if p_document_id is null then
    raise exception 'Document id is required';
  end if;
  if not exists (
    select 1 from public.equipment_lifecycle_document_record
    where id = p_document_id
    for update
  ) then
    raise exception 'Equipment lifecycle document was not found';
  end if;

  delete from public.equipment_lifecycle_event_record
  where document_record_id = p_document_id;

  delete from public.equipment_lifecycle_document_record
  where id = p_document_id;

  return p_document_id;
end;
$$;

revoke all on function public.update_equipment_lifecycle_document(uuid, date, jsonb, jsonb)
  from public, anon;
grant execute on function public.update_equipment_lifecycle_document(uuid, date, jsonb, jsonb)
  to authenticated;
revoke all on function public.delete_equipment_lifecycle_document(uuid)
  from public, anon;
grant execute on function public.delete_equipment_lifecycle_document(uuid)
  to authenticated;

commit;
