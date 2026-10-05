-- Persist project-generated hire contracts and a snapshot of each generated document.
-- Run after the core schema and migration 005_project_contract_and_assignment_flow.sql.

begin;

create table if not exists public.contract_document_history (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contract(id) on delete restrict,
  project_id uuid not null references public.project(id) on delete restrict,
  customer_id uuid not null references public.customer(id) on delete restrict,
  contract_number text not null,
  customer_name text not null,
  project_name text not null,
  document_date date not null,
  logo_choice text not null default 'gbi'
    check (logo_choice in ('gbi', 'sdlg', 'none')),
  equipment jsonb not null
    check (jsonb_typeof(equipment) = 'array' and jsonb_array_length(equipment) > 0),
  transport jsonb not null
    check (jsonb_typeof(transport) = 'array'),
  created_by uuid references public.app_user(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_contract_document_history_created
  on public.contract_document_history(created_at desc);
create index if not exists idx_contract_document_history_project
  on public.contract_document_history(project_id, created_at desc);
create index if not exists idx_contract_document_history_contract
  on public.contract_document_history(contract_id, created_at desc);

alter table public.contract_document_history enable row level security;
drop policy if exists contract_document_history_select on public.contract_document_history;
create policy contract_document_history_select
  on public.contract_document_history for select to authenticated
  using (auth_role() in ('administrator', 'management', 'accounts_billing'));

revoke all on public.contract_document_history from public, anon;
grant select on public.contract_document_history to authenticated;

create or replace function public.create_project_contract_document(
  p_contract_number text,
  p_project_id uuid,
  p_document_date date,
  p_logo_choice text,
  p_equipment jsonb,
  p_transport jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  project_row public.project%rowtype;
  machine_row public.machine%rowtype;
  contract_id uuid;
  item jsonb;
  normalized_equipment jsonb := '[]'::jsonb;
  line_count integer;
  assigned_count integer;
  period_months integer;
  month_difference integer;
  completed_months integer;
  anniversary_date date;
  item_machine_id uuid;
begin
  if auth_role() not in ('administrator', 'accounts_billing') then
    raise exception 'Not authorized to create contracts';
  end if;
  if nullif(btrim(p_contract_number), '') is null then
    raise exception 'Contract number is required';
  end if;
  if p_document_date is null then
    raise exception 'Document date is required';
  end if;
  if p_logo_choice is null or p_logo_choice not in ('gbi', 'sdlg', 'none') then
    raise exception 'Select a valid contract document logo';
  end if;
  if p_equipment is null or jsonb_typeof(p_equipment) <> 'array'
     or jsonb_array_length(p_equipment) = 0 then
    raise exception 'The selected project must have at least one assigned machine';
  end if;
  if p_transport is null or jsonb_typeof(p_transport) <> 'array' then
    raise exception 'Transport items must be an array';
  end if;

  select * into project_row
  from public.project
  where id = p_project_id
  for share;
  if not found then
    raise exception 'Project does not exist';
  end if;
  if project_row.customer_id is null then
    raise exception 'Link a customer to this project before generating its contract';
  end if;
  if project_row.deployment_start is null or project_row.deployment_end is null then
    raise exception 'Set both project deployment dates before generating its contract';
  end if;
  if project_row.deployment_end < project_row.deployment_start then
    raise exception 'The project deployment end date cannot be before its start date';
  end if;

  perform m.id
  from public.machine m
  where m.current_project_id = p_project_id and m.deleted_at is null
  order by m.id
  for share;

  month_difference :=
    (extract(year from project_row.deployment_end)::integer
      - extract(year from project_row.deployment_start)::integer) * 12
    + extract(month from project_row.deployment_end)::integer
    - extract(month from project_row.deployment_start)::integer;
  anniversary_date :=
    (project_row.deployment_start + make_interval(months => month_difference))::date;
  completed_months :=
    case when project_row.deployment_end < anniversary_date
      then month_difference - 1
      else month_difference
    end;
  anniversary_date :=
    (project_row.deployment_start + make_interval(months => completed_months))::date;
  period_months := greatest(
    1,
    completed_months
      + case when project_row.deployment_end = anniversary_date then 0 else 1 end
  );

  select count(*)::integer into assigned_count
  from public.machine
  where current_project_id = p_project_id and deleted_at is null;
  line_count := jsonb_array_length(p_equipment);
  if assigned_count = 0 then
    raise exception 'The selected project has no currently assigned machines';
  end if;
  if line_count <> assigned_count then
    raise exception 'The contract items do not match the machines currently assigned to this project. Reload the project and try again';
  end if;

  for item in select value from jsonb_array_elements(p_equipment)
  loop
    item_machine_id := nullif(item->>'machine_id', '')::uuid;
    if item_machine_id is null then
      raise exception 'Each contract item must identify its assigned machine';
    end if;
    select * into machine_row
    from public.machine
    where id = item_machine_id
      and current_project_id = p_project_id
      and deleted_at is null;
    if not found then
      raise exception 'Every contract item must be a currently assigned project machine';
    end if;
    if nullif(btrim(item->>'description'), '') is null
       or nullif(btrim(item->>'model'), '') is null then
      raise exception 'Machine description and model are required for each contract item';
    end if;
    if coalesce(nullif(item->>'qty', '')::integer, 0) <> 1 then
      raise exception 'Project machine quantities must be one per assigned machine';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(p_equipment) as other_item(value)
      where other_item.value->>'machine_id' = item_machine_id::text
      group by other_item.value->>'machine_id'
      having count(*) > 1
    ) then
      raise exception 'A project machine may only appear once in the contract items';
    end if;

    normalized_equipment := normalized_equipment || jsonb_build_array(
      jsonb_set(item, '{period}', to_jsonb(period_months::text), true)
    );
  end loop;

  insert into public.contract (
    contract_number, customer_id, status, start_date, end_date,
    payment_terms_days, billing_frequency, created_by
  ) values (
    btrim(p_contract_number), project_row.customer_id, 'draft',
    project_row.deployment_start, project_row.deployment_end,
    30, 'monthly', auth.uid()
  )
  returning id into contract_id;

  insert into public.project_contract (
    project_id, contract_id, effective_from, effective_to, created_by
  ) values (
    project_row.id, contract_id, project_row.deployment_start,
    project_row.deployment_end, auth.uid()
  );

  for item in select value from jsonb_array_elements(normalized_equipment)
  loop
    insert into public.contract_machine (
      contract_id, machine_id, deployment_start, deployment_end, created_by
    ) values (
      contract_id, (item->>'machine_id')::uuid,
      project_row.deployment_start, project_row.deployment_end, auth.uid()
    );
  end loop;

  insert into public.contract_document_history (
    contract_id, project_id, customer_id, contract_number, customer_name,
    project_name, document_date, logo_choice, equipment, transport, created_by
  ) values (
    contract_id, project_row.id, project_row.customer_id, btrim(p_contract_number),
    (select company_name from public.customer where id = project_row.customer_id),
    project_row.name, p_document_date, p_logo_choice, normalized_equipment,
    p_transport, auth.uid()
  );

  return contract_id;
end;
$$;

revoke all on function public.create_project_contract_document(text, uuid, date, text, jsonb, jsonb) from public;
grant execute on function public.create_project_contract_document(text, uuid, date, text, jsonb, jsonb) to authenticated;

commit;
