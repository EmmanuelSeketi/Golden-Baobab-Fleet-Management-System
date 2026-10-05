-- Saved hiring quotations for the commercial workspace.
-- Run after the core schema, customer/project/contract tables, and auth_role().

begin;

create table if not exists public.hiring_quotation (
  id uuid primary key default gen_random_uuid(),
  quotation_number text not null unique,
  quotation_date date not null,
  customer_id uuid not null references public.customer(id) on delete restrict,
  customer_name text not null,
  project_id uuid not null references public.project(id) on delete restrict,
  project_name text not null,
  contract_id uuid references public.contract(id) on delete restrict,
  contract_number text,
  address text not null default '',
  currency text not null default 'ZMW',
  mobilization_fee numeric(14,2) not null default 10000 check (mobilization_fee >= 0),
  created_by uuid references public.app_user(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_hiring_quotation_date
  on public.hiring_quotation(quotation_date desc, created_at desc);
create index if not exists idx_hiring_quotation_customer
  on public.hiring_quotation(customer_id, quotation_date desc);
create index if not exists idx_hiring_quotation_project
  on public.hiring_quotation(project_id, quotation_date desc);

create table if not exists public.hiring_quotation_item (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.hiring_quotation(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  machine_id uuid references public.machine(id) on delete set null,
  machine_number text not null,
  model text not null,
  specification text not null,
  rental numeric(14,2) check (rental is null or rental >= 0),
  quantity integer not null default 1 check (quantity > 0),
  hours numeric(12,2) check (hours is null or hours >= 0),
  total_price numeric(14,2) check (total_price is null or total_price >= 0),
  created_at timestamptz not null default now(),
  constraint hiring_quotation_item_line_unique unique (quotation_id, line_number),
  constraint hiring_quotation_item_machine_unique unique (quotation_id, machine_id)
);

create index if not exists idx_hiring_quotation_item_quotation
  on public.hiring_quotation_item(quotation_id, line_number);

alter table public.hiring_quotation enable row level security;
alter table public.hiring_quotation_item enable row level security;

drop policy if exists hiring_quotation_select on public.hiring_quotation;
create policy hiring_quotation_select on public.hiring_quotation
  for select to authenticated
  using (auth_role() in ('administrator', 'management', 'accounts_billing'));

drop policy if exists hiring_quotation_item_select on public.hiring_quotation_item;
create policy hiring_quotation_item_select on public.hiring_quotation_item
  for select to authenticated
  using (auth_role() in ('administrator', 'management', 'accounts_billing'));

revoke all on public.hiring_quotation from public, anon;
revoke all on public.hiring_quotation_item from public, anon;
grant select on public.hiring_quotation, public.hiring_quotation_item to authenticated;

create or replace function public.create_hiring_quotation(
  p_quotation_number text,
  p_customer_id uuid,
  p_project_id uuid,
  p_contract_id uuid,
  p_quotation_date date,
  p_address text,
  p_currency text,
  p_mobilization_fee numeric,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  quotation_id uuid;
  customer_name_snapshot text;
  project_name_snapshot text;
  contract_number_snapshot text;
  item jsonb;
  line_no integer := 0;
  item_machine_id uuid;
begin
  if auth_role() not in ('administrator', 'accounts_billing') then
    raise exception 'Not authorized to create hiring quotations';
  end if;
  if nullif(btrim(p_quotation_number), '') is null then
    raise exception 'Quotation number is required';
  end if;
  if p_quotation_date is null or p_mobilization_fee is null or p_mobilization_fee < 0 then
    raise exception 'Quotation date and a non-negative mobilization fee are required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one machine is required on a hiring quotation';
  end if;

  select c.company_name into customer_name_snapshot
  from public.customer c where c.id = p_customer_id;
  if not found then
    raise exception 'Customer does not exist';
  end if;

  select p.name into project_name_snapshot
  from public.project p
  where p.id = p_project_id and p.customer_id = p_customer_id;
  if not found then
    raise exception 'Project does not belong to the selected customer';
  end if;

  if p_contract_id is not null then
    select c.contract_number into contract_number_snapshot
    from public.contract c
    join public.project_contract pc on pc.contract_id = c.id
    where c.id = p_contract_id
      and c.customer_id = p_customer_id
      and pc.project_id = p_project_id
      and c.start_date <= p_quotation_date
      and (c.end_date is null or c.end_date >= p_quotation_date)
      and pc.effective_from <= p_quotation_date
      and (pc.effective_to is null or pc.effective_to >= p_quotation_date);
    if not found then
      raise exception 'Contract is not linked to this customer and project on the quotation date';
    end if;
  end if;

  insert into public.hiring_quotation (
    quotation_number, quotation_date, customer_id, customer_name,
    project_id, project_name, contract_id, contract_number,
    address, currency, mobilization_fee, created_by
  ) values (
    btrim(p_quotation_number), p_quotation_date, p_customer_id, customer_name_snapshot,
    p_project_id, project_name_snapshot, p_contract_id, contract_number_snapshot,
    coalesce(p_address, ''), coalesce(nullif(btrim(p_currency), ''), 'ZMW'),
    p_mobilization_fee, auth.uid()
  )
  returning id into quotation_id;

  for item in select value from jsonb_array_elements(p_items)
  loop
    line_no := line_no + 1;
    item_machine_id := nullif(item->>'machine_id', '')::uuid;
    if item_machine_id is null or not exists (
      select 1 from public.machine m
      where m.id = item_machine_id
        and m.current_project_id = p_project_id
        and m.deleted_at is null
    ) then
      raise exception 'Every quoted machine must be active and assigned to the selected project';
    end if;
    if nullif(btrim(item->>'machine_number'), '') is null
       or nullif(btrim(item->>'model'), '') is null
       or nullif(btrim(item->>'specification'), '') is null then
      raise exception 'Machine number, model, and specification are required for each quote line';
    end if;

    insert into public.hiring_quotation_item (
      quotation_id, line_number, machine_id, machine_number, model, specification,
      rental, quantity, hours, total_price
    ) values (
      quotation_id, line_no, item_machine_id,
      btrim(item->>'machine_number'), btrim(item->>'model'), btrim(item->>'specification'),
      nullif(item->>'rental', '')::numeric,
      coalesce(nullif(item->>'quantity', '')::integer, 1),
      nullif(item->>'hours', '')::numeric,
      nullif(item->>'total_price', '')::numeric
    );
  end loop;

  return quotation_id;
end;
$$;

revoke all on function public.create_hiring_quotation(text, uuid, uuid, uuid, date, text, text, numeric, jsonb) from public;
grant execute on function public.create_hiring_quotation(text, uuid, uuid, uuid, date, text, text, numeric, jsonb) to authenticated;

commit;
