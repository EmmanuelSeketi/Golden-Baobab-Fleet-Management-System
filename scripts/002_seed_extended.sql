-- ============================================================================
-- GOLDEN BAOBAB — EXTENDED DEMO SEED (Phase 2)
-- Run manually in the Supabase SQL Editor.
-- ----------------------------------------------------------------------------
-- PREREQUISITES (must already exist — created by the base seed):
--   * at least one active app_user  (used as the created_by/updated_by actor)
--   * operators .................... NRC-GB-0001 .. NRC-GB-0004
--   * customers .................... CUS-001, CUS-002
--   * projects ..................... 'Mokopane Solar Farm', 'Limpopo Aggregates'
--   * machines ..................... GB-GR-003, GB-DT-002, GB-EX-004, GB-EX-005
--   * contracts .................... GBI-2025-001, GBI-2025-002
--   * billing_rule ................. for GBI-2025-001 only
--
-- INSERT ORDER (each block only runs once its dependencies exist above it):
--   1. machine_assignment          (machine + operator + project)
--   2. contract_machine            (contract + machine)
--   3. project_contract            (project + contract)
--   4. billing_rule  GBI-2025-002  (contract)
--   5. daily_hour_entry            (machine + operator + customer + project)
--   6. overtime_rule / overtime_entry   (overtime_entry derives from #5)
--   7. billing_entry               (derives from #5 via contract coverage + rules)
--   7. invoice                     (groups existing billing_entry rows from #6)
--   8. repair_record               (machine)
--
-- The whole script is one transaction and is safe to re-run: every block is
-- guarded with a NOT EXISTS / ON CONFLICT check against stable business keys.
-- ============================================================================

begin;

-- Fail fast (and roll back) if the ownership actor is missing, otherwise the
-- `cross join actor` in every block would silently insert zero rows.
do $$
begin
  if not exists (select 1 from app_user where is_active) then
    raise exception
      'No active app_user found. Create an Auth user and its app_user row before running this seed.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. MACHINE ASSIGNMENT  (current operator + project per machine)
--    Depends on: machine, operator, project (all from base seed).
-- ----------------------------------------------------------------------------
with actor as (select id from app_user where is_active order by created_at limit 1)
insert into machine_assignment (machine_id, operator_id, project_id, start_date, end_date, created_by)
select m.id, o.id, p.id, (current_date - 60), null, actor.id
from (values
  ('GB-GR-003','NRC-GB-0001','Mokopane Solar Farm'),
  ('GB-EX-004','NRC-GB-0003','Mokopane Solar Farm'),
  ('GB-DT-002','NRC-GB-0002','Limpopo Aggregates'),
  ('GB-EX-005','NRC-GB-0004','Limpopo Aggregates')
) as v(machine_number, nrc, project_name)
join machine  m on m.machine_number = v.machine_number
join operator o on o.nrc_number     = v.nrc
join project  p on p.name           = v.project_name
cross join actor
where not exists (
  select 1 from machine_assignment a
  where a.machine_id = m.id and a.end_date is null
);

-- ----------------------------------------------------------------------------
-- 2. CONTRACT ↔ MACHINE  (which machines each contract covers)
--    Depends on: contract, machine.
-- ----------------------------------------------------------------------------
with actor as (select id from app_user where is_active order by created_at limit 1)
insert into contract_machine (contract_id, machine_id, deployment_start, deployment_end, created_by)
select ct.id, m.id, v.deployment_start::date, null, actor.id
from (values
  ('GBI-2025-001','GB-GR-003','2025-01-06'),
  ('GBI-2025-001','GB-EX-004','2025-01-10'),
  ('GBI-2025-002','GB-DT-002','2025-02-01'),
  ('GBI-2025-002','GB-EX-005','2025-02-05')
) as v(contract_number, machine_number, deployment_start)
join contract ct on ct.contract_number = v.contract_number
join machine  m  on m.machine_number   = v.machine_number
cross join actor
where not exists (
  select 1 from contract_machine cm
  where cm.contract_id = ct.id and cm.machine_id = m.id
);

-- ----------------------------------------------------------------------------
-- 3. PROJECT ↔ CONTRACT  (a project may have multiple contracts)
--    Depends on: project, contract.
-- ----------------------------------------------------------------------------
insert into project_contract (project_id, contract_id, effective_from, effective_to)
select p.id, c.id, v.effective_from::date, v.effective_to::date
from (values
  ('Mokopane Solar Farm','GBI-2025-001','2025-01-06','2025-12-31'),
  ('Limpopo Aggregates','GBI-2025-002','2025-02-01','2025-11-30')
) as v(project_name, contract_number, effective_from, effective_to)
join project p on p.name = v.project_name
join contract c on c.contract_number = v.contract_number
where not exists (
  select 1 from project_contract pc
  where pc.project_id = p.id
    and pc.contract_id = c.id
    and pc.effective_from = v.effective_from::date
);

-- ----------------------------------------------------------------------------
-- 4. BILLING RULE for GBI-2025-002  (base seed only covers GBI-2025-001)
--    Depends on: contract.
-- ----------------------------------------------------------------------------
with actor as (select id from app_user where is_active order by created_at limit 1)
insert into billing_rule (
  contract_id, effective_from, billing_model, standard_hours_per_day,
  standard_rate, overtime_rate, minimum_billable_hours,
  weekend_rate, public_holiday_rate, standby_rate,
  mobilisation_charge, demobilisation_charge, created_by
)
select c.id, '2025-02-01', 'hourly', 8,
  1450, 2175, 1,
  1740, 2900, 600,
  15000, 15000, actor.id
from contract c
cross join actor
where c.contract_number = 'GBI-2025-002'
  and not exists (select 1 from billing_rule b where b.contract_id = c.id);

-- ----------------------------------------------------------------------------
-- 5. DAILY WORKING HOURS  (last 30 days per machine)
--    Depends on: machine, operator, customer, project. The customer/project
--    each entry belongs to is resolved from the contract_machine mapping (#2)
--    joined back to the machine's contract → customer.
--    Meters are anchored so each machine's LAST day ends exactly on its
--    current_hour_meter, and every day increases (never decreases). Sundays
--    are idle (skipped); Saturdays are short; weekdays often run into overtime.
-- ----------------------------------------------------------------------------
with actor as (select id from app_user where is_active order by created_at limit 1),
map as (
  -- machine → operator/customer/project, plus a per-machine offset so the
  -- pseudo-random daily-hours pattern differs between machines.
  select m.id  as machine_id,
         m.current_hour_meter,
         o.id  as operator_id,
         c.id  as customer_id,
         p.id  as project_id,
         v.site_location,
         v.ofs
  from (values
    ('GB-GR-003','NRC-GB-0001','CUS-001','Mokopane Solar Farm','Limpopo, South Africa',   0),
    ('GB-EX-004','NRC-GB-0003','CUS-001','Mokopane Solar Farm','Limpopo, South Africa',   2),
    ('GB-DT-002','NRC-GB-0002','CUS-002','Limpopo Aggregates','Polokwane, South Africa',  1),
    ('GB-EX-005','NRC-GB-0004','CUS-002','Limpopo Aggregates','Polokwane, South Africa',  3)
  ) as v(machine_number, nrc, customer_code, project_name, site_location, ofs)
  join machine  m on m.machine_number = v.machine_number
  join operator o on o.nrc_number     = v.nrc
  join customer c on c.customer_code  = v.customer_code
  join project  p on p.name           = v.project_name
),
days as (
  select generate_series(current_date - 29, current_date, interval '1 day')::date as d
),
raw as (
  select map.*,
         days.d as entry_date,
         (case extract(dow from days.d)
            when 0 then 0                                                   -- Sunday: idle
            when 6 then 4 + ((extract(doy from days.d)::int + map.ofs) % 3) -- Saturday: 4-6h
            else        7 + ((extract(doy from days.d)::int + map.ofs) % 5) -- weekday: 7-11h
          end)::numeric(12,2) as daily_hours
  from map cross join days
),
acc as (
  select raw.*,
         sum(daily_hours) over (partition by machine_id order by entry_date) as cum_incl,
         sum(daily_hours) over (partition by machine_id)                     as total_all
  from raw
)
insert into daily_hour_entry (
  entry_date, machine_id, operator_id, customer_id, project_id, site_location,
  hour_meter_start, hour_meter_end, remarks, flagged_for_review, is_billed,
  created_by, updated_by
)
select
  acc.entry_date, acc.machine_id, acc.operator_id, acc.customer_id, acc.project_id, acc.site_location,
  round(acc.current_hour_meter - acc.total_all + (acc.cum_incl - acc.daily_hours), 2) as hour_meter_start,
  round(acc.current_hour_meter - acc.total_all +  acc.cum_incl,                    2) as hour_meter_end,
  case when acc.daily_hours >= 11 then 'Long shift — verify meter reading' else null end,
  (acc.daily_hours >= 11) as flagged_for_review,
  false as is_billed,
  actor.id, actor.id
from acc
cross join actor
where acc.daily_hours > 0                              -- skip idle Sundays
  and not exists (
    select 1 from daily_hour_entry e
    where e.machine_id = acc.machine_id and e.entry_date = acc.entry_date
  );

-- ----------------------------------------------------------------------------
-- 5a. OVERTIME RULE  (independent rate set)
-- ----------------------------------------------------------------------------
with actor as (select id from app_user where is_active order by created_at limit 1)
insert into overtime_rule (
  name, effective_from, standard_hours_per_day,
  weekday_rate_multiplier, saturday_rate_multiplier, sunday_rate_multiplier,
  public_holiday_rate_multiplier, operator_category, base_hourly_rate, created_by
)
select 'Standard Operator Overtime', '2025-01-01', 8,
       1.5, 1.75, 2.0, 2.5, null, 85, actor.id
from actor
where not exists (select 1 from overtime_rule r where r.name = 'Standard Operator Overtime');

-- ----------------------------------------------------------------------------
-- 5b. OVERTIME ENTRY  (derives from daily_hour_entry rows over 8h)
--     Depends on: daily_hour_entry (#4), overtime_rule (#5a), operator.
-- ----------------------------------------------------------------------------
with r as (
  select id, standard_hours_per_day, weekday_rate_multiplier,
         saturday_rate_multiplier, sunday_rate_multiplier, base_hourly_rate
  from overtime_rule where name = 'Standard Operator Overtime'
)
insert into overtime_entry (
  daily_hour_entry_id, operator_id, overtime_rule_id,
  standard_hours, overtime_hours, overtime_pay, reviewed, created_at
)
select
  e.id, e.operator_id, r.id,
  r.standard_hours_per_day,
  (e.total_hours - r.standard_hours_per_day),
  round(
    (e.total_hours - r.standard_hours_per_day) * r.base_hourly_rate *
    case extract(dow from e.entry_date)
      when 6 then coalesce(r.saturday_rate_multiplier, r.weekday_rate_multiplier)
      when 0 then coalesce(r.sunday_rate_multiplier,   r.weekday_rate_multiplier)
      else        r.weekday_rate_multiplier
    end, 2),
  false, now()
from daily_hour_entry e
cross join r
where e.operator_id is not null
  and e.total_hours > r.standard_hours_per_day
  and not exists (select 1 from overtime_entry oe where oe.daily_hour_entry_id = e.id);

-- ----------------------------------------------------------------------------
-- 6. BILLING ENTRY  (one per billable daily_hour_entry)
--    Depends on: daily_hour_entry (#4), contract_machine (#2), billing_rule.
--    The applicable rule is the one effective on the entry date for the
--    machine's active contract (snapshotted onto the billing_entry).
-- ----------------------------------------------------------------------------
with src as (
  select
    e.id                       as daily_hour_entry_id,
    cm.contract_id,
    br.id                      as billing_rule_id,
    br.standard_hours_per_day  as std_hpd,
    br.standard_rate,
    coalesce(br.overtime_rate, br.standard_rate) as ot_rate,
    e.total_hours
  from daily_hour_entry e
  join contract_machine cm
    on cm.machine_id = e.machine_id
   and cm.deployment_end is null
  join lateral (
    select b.*
    from billing_rule b
    where b.contract_id = cm.contract_id
      and b.effective_from <= e.entry_date
      and (b.effective_to is null or b.effective_to >= e.entry_date)
    order by b.effective_from desc
    limit 1
  ) br on true
)
insert into billing_entry (
  daily_hour_entry_id, contract_id, billing_rule_id,
  normal_hours, overtime_hours, normal_charge, overtime_charge,
  additional_charges, total_charge, created_at
)
select
  src.daily_hour_entry_id, src.contract_id, src.billing_rule_id,
  least(src.total_hours, src.std_hpd)                                   as normal_hours,
  greatest(src.total_hours - src.std_hpd, 0)                            as overtime_hours,
  round(least(src.total_hours, src.std_hpd) * src.standard_rate, 2)     as normal_charge,
  round(greatest(src.total_hours - src.std_hpd, 0) * src.ot_rate, 2)    as overtime_charge,
  0                                                                     as additional_charges,
  round(
    least(src.total_hours, src.std_hpd) * src.standard_rate +
    greatest(src.total_hours - src.std_hpd, 0) * src.ot_rate, 2)        as total_charge,
  now()
from src
where not exists (
  select 1 from billing_entry x where x.daily_hour_entry_id = src.daily_hour_entry_id
);

-- ----------------------------------------------------------------------------
-- 7. INVOICE  (groups existing billing_entry rows per contract)
--    Depends on: billing_entry (#6), contract, customer.
--    Only bills entries older than 10 days, leaving the most recent work
--    unbilled so the app shows a realistic billed-vs-unbilled split. After
--    inserting the invoices we attach their billing_entry rows and flag the
--    underlying daily_hour_entry rows as billed.
-- ----------------------------------------------------------------------------
with actor as (select id from app_user where is_active order by created_at limit 1),
agg as (
  select
    be.contract_id,
    ct.customer_id,
    min(e.entry_date)          as period_start,
    max(e.entry_date)          as period_end,
    round(sum(be.total_charge), 2) as subtotal
  from billing_entry be
  join daily_hour_entry e on e.id = be.daily_hour_entry_id
  join contract ct        on ct.id = be.contract_id
  where be.invoice_id is null
    and e.entry_date <= current_date - 10
  group by be.contract_id, ct.customer_id
)
insert into invoice (
  invoice_number, customer_id, contract_id,
  billing_period_start, billing_period_end, status,
  subtotal, tax_amount, total_amount, payment_terms_days,
  finalized_at, finalized_by, created_by
)
select
  'INV-' || to_char(current_date, 'YYYY') || '-' || substr(md5(agg.contract_id::text), 1, 6),
  agg.customer_id, agg.contract_id,
  agg.period_start, agg.period_end, 'finalized',
  agg.subtotal, round(agg.subtotal * 0.16, 2), round(agg.subtotal * 1.16, 2), 30,
  now(), actor.id, actor.id
from agg
cross join actor
where not exists (
  select 1 from invoice inv
  where inv.contract_id = agg.contract_id
    and inv.billing_period_start = agg.period_start
    and inv.billing_period_end   = agg.period_end
);

-- 7b. Attach the billed billing_entry rows to their invoice.
with tolink as (
  select be.id as billing_entry_id, inv.id as invoice_id
  from billing_entry be
  join daily_hour_entry e on e.id = be.daily_hour_entry_id
  join invoice inv
    on inv.contract_id = be.contract_id
   and e.entry_date between inv.billing_period_start and inv.billing_period_end
  where be.invoice_id is null
    and e.entry_date <= current_date - 10
)
update billing_entry
set invoice_id = tolink.invoice_id
from tolink
where billing_entry.id = tolink.billing_entry_id;

-- 7c. Flag the underlying daily-hour entries as billed.
update daily_hour_entry
set is_billed = true, updated_at = now()
where is_billed = false
  and id in (select daily_hour_entry_id from billing_entry where invoice_id is not null);

-- ----------------------------------------------------------------------------
-- 8. REPAIR RECORD  (fault history per machine)
--    Depends on: machine.
-- ----------------------------------------------------------------------------
with actor as (select id from app_user where is_active order by created_at limit 1)
insert into repair_record (
  machine_id, fault_date, fault_description, mechanic,
  repair_completed, parts_used, cost, downtime_hours, created_by
)
select
  m.id, v.fault_date::date, v.fault_description, v.mechanic,
  v.repair_completed, v.parts_used, v.cost::numeric(12,2), v.downtime_hours::numeric(10,2), actor.id
from (values
  ('GB-GR-003','2026-07-30','Coolant leak from radiator hose','GBI Workshop',      true,  'Radiator hose, clamps',            1250, 4),
  ('GB-DT-002','2026-08-12','Front-left brake caliper seized','Volvo Approved',    true,  'Brake caliper, brake pads',        7400, 8),
  ('GB-EX-005','2026-08-28','Hydraulic pump pressure loss on boom circuit','GBI Workshop', false, 'Awaiting hydraulic pump seal kit', null, 36)
) as v(machine_number, fault_date, fault_description, mechanic, repair_completed, parts_used, cost, downtime_hours)
join machine m on m.machine_number = v.machine_number
cross join actor
where not exists (
  select 1 from repair_record r
  where r.machine_id = m.id and r.fault_date = v.fault_date::date
);

commit;

-- ============================================================================
-- VERIFICATION (optional — run after commit)
-- ============================================================================
-- select 'machine_assignment' t, count(*) from machine_assignment
-- union all select 'contract_machine', count(*) from contract_machine
-- union all select 'billing_rule',     count(*) from billing_rule
-- union all select 'daily_hour_entry', count(*) from daily_hour_entry
-- union all select 'overtime_entry',   count(*) from overtime_entry
-- union all select 'billing_entry',    count(*) from billing_entry
-- union all select 'invoice',          count(*) from invoice
-- union all select 'repair_record',    count(*) from repair_record;
