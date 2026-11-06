-- Golden Baobab / GBI Group demo seed
-- Run manually in Supabase SQL Editor after creating at least one Auth user.
-- Apply scripts/015_maintenance_status_override.sql before running this seed.
-- This script is idempotent for the business identifiers below.

begin;

-- Use the first active application user as the audit/ownership actor.
with actor as (select id from app_user where is_active = true order by created_at limit 1)
insert into operator (full_name, nrc_number, phone_number, employment_date, licence_details, certifications, is_active, created_by, updated_by)
select v.full_name, v.nrc_number, v.phone_number, v.employment_date::date, v.licence_details, v.certifications, true, actor.id, actor.id
from (values
  ('Mandla Ndlovu','NRC-GB-0001','+27 71 482 1902','2022-02-14',concat('Code C - valid through ', extract(year from current_date)::int + 2),'Heavy equipment; site safety'),
  ('Thabo Mokoena','NRC-GB-0002','+27 82 314 8871','2021-08-09',concat('Code C - valid through ', extract(year from current_date)::int + 2),'Heavy equipment; first aid'),
  ('Sipho Dlamini','NRC-GB-0003','+27 76 229 4401','2023-01-16',concat('Code C - valid through ', extract(year from current_date)::int + 2),'Heavy equipment'),
  ('Lerato Molefe','NRC-GB-0004','+27 79 654 2230','2024-03-04',concat('Code C - valid through ', extract(year from current_date)::int + 2),'Site safety; first aid')
) as v(full_name,nrc_number,phone_number,employment_date,licence_details,certifications)
cross join actor
where not exists (select 1 from operator o where o.nrc_number = v.nrc_number);

update operator
set licence_details = concat('Code C - valid through ', extract(year from current_date)::int + 2)
where nrc_number in ('NRC-GB-0001','NRC-GB-0002','NRC-GB-0003','NRC-GB-0004');

with actor as (select id from app_user where is_active = true order by created_at limit 1)
insert into customer (company_name, customer_code, contact_name, phone, email, currency, created_by, updated_by)
select v.company_name, v.customer_code, v.contact_name, v.phone, v.email, 'ZAR', actor.id, actor.id
from (values
  ('Mokopane Solar Farm','CUS-001','Naledi Maseko','+27 11 200 1000','accounts@mokopanesolar.example'),
  ('Limpopo Aggregates','CUS-002','Johan Pretorius','+27 11 200 2000','billing@limpopoaggregates.example')
) as v(company_name,customer_code,contact_name,phone,email)
cross join actor
where not exists (select 1 from customer c where c.customer_code = v.customer_code);

update customer set currency = 'ZAR' where customer_code in ('CUS-001','CUS-002');

with actor as (select id from app_user where is_active = true order by created_at limit 1)
insert into project (name, customer_id, site_location, deployment_start, deployment_end, created_by)
select v.name, c.id, v.site_location, v.deployment_start::date, v.deployment_end::date, actor.id
from (values
  ('Mokopane Solar Farm','CUS-001','Limpopo, South Africa',current_date - 90,current_date + 180),
  ('Limpopo Aggregates','CUS-002','Polokwane, South Africa',current_date - 60,current_date + 150)
) as v(name,customer_code,site_location,deployment_start,deployment_end)
join customer c on c.customer_code = v.customer_code
cross join actor
where not exists (select 1 from project p where p.name = v.name);

update project p
set deployment_start = v.deployment_start,
    deployment_end = v.deployment_end
from (values
  ('Mokopane Solar Farm',current_date - 90,current_date + 180),
  ('Limpopo Aggregates',current_date - 60,current_date + 150)
) as v(name,deployment_start,deployment_end)
where p.name = v.name;

with actor as (select id from app_user where is_active = true order by created_at limit 1)
insert into machine (machine_number, asset_number, machine_type, manufacturer, brand, model, year, current_hour_meter, service_interval_hours, current_status, created_by, updated_by)
select v.machine_number, v.asset_number, v.machine_type, v.manufacturer, v.brand, v.model, v.year, v.current_hour_meter, v.service_interval_hours, v.current_status::machine_status, actor.id, actor.id
from (values
  ('GB-GR-003','AST-003','Grader','Caterpillar','CAT','140K',2021,1842.5,500,'on_hire'),
  ('GB-DT-002','AST-002','Dump truck','Volvo','Volvo','A30G',2020,2310.0,500,'on_hire'),
  ('GB-EX-004','AST-004','Excavator','Komatsu','Komatsu','PC210',2022,1298.0,500,'available'),
  ('GB-EX-005','AST-005','Excavator','Caterpillar','CAT','320',2023,742.0,500,'under_maintenance')
) as v(machine_number,asset_number,machine_type,manufacturer,brand,model,year,current_hour_meter,service_interval_hours,current_status)
cross join actor
where not exists (select 1 from machine m where m.machine_number = v.machine_number);

with actor as (select id from app_user where is_active = true order by created_at limit 1)
insert into contract (contract_number, customer_id, status, start_date, end_date, payment_terms_days, billing_frequency, created_by, updated_by)
select v.contract_number, c.id, 'active', v.start_date::date, v.end_date::date, 30, 'monthly', actor.id, actor.id
from (values
  ('GBI-2025-001','CUS-001',current_date - 90,current_date + 180),
  ('GBI-2025-002','CUS-002',current_date - 60,current_date + 150)
) v(contract_number,customer_code,start_date,end_date)
join customer c on c.customer_code = v.customer_code cross join actor
where not exists (select 1 from contract x where x.contract_number = v.contract_number);

update contract c
set status = 'active',
    start_date = v.start_date,
    end_date = v.end_date
from (values
  ('GBI-2025-001',current_date - 90,current_date + 180),
  ('GBI-2025-002',current_date - 60,current_date + 150)
) as v(contract_number,start_date,end_date)
where c.contract_number = v.contract_number;

with actor as (select id from app_user where is_active = true order by created_at limit 1)
insert into billing_rule (contract_id,effective_from,billing_model,standard_hours_per_day,standard_rate,overtime_rate,minimum_billable_hours,created_by)
select c.id,c.start_date,'hourly',8,1250,1875,1,actor.id from contract c cross join actor where c.contract_number = 'GBI-2025-001' and not exists (select 1 from billing_rule b where b.contract_id=c.id);

update billing_rule b
set effective_from = c.start_date
from contract c
where c.contract_number = 'GBI-2025-001'
  and b.contract_id = c.id
  and b.billing_model = 'hourly'
  and b.standard_rate = 1250
  and b.overtime_rate = 1875;

with actor as (select id from app_user where is_active = true order by created_at limit 1)
insert into maintenance_record (machine_id,service_date,hour_meter_at_service,next_service_due_hours,next_service_due_date,service_type,mechanic,cost,status,status_override,created_by)
select m.id,v.service_date::date,v.meter,v.due_hours,v.due_date::date,v.service_type,v.mechanic,v.cost,v.status::maintenance_status,true,actor.id
from (values
  ('GB-GR-003',current_date - 90,1342.5,1842.5,current_date - 1,'500-hour service','GBI Workshop',18500,'completed'),
  ('GB-DT-002',current_date - 60,2060.0,2560.0,current_date + 45,'500-hour service','Volvo Approved',9200,'completed')
) v(machine_number,service_date,meter,due_hours,due_date,service_type,mechanic,cost,status)
join machine m on m.machine_number=v.machine_number cross join actor
where not exists (
  select 1 from maintenance_record r
  where r.machine_id = m.id
    and r.service_type = v.service_type
    and r.mechanic = v.mechanic
);

update maintenance_record r
set service_date = v.service_date,
    hour_meter_at_service = v.meter,
    next_service_due_hours = v.due_hours,
    next_service_due_date = v.due_date,
    status = v.status::maintenance_status,
    status_override = true
from (values
  ('GB-GR-003','500-hour service','GBI Workshop',current_date - 90,1342.5,1842.5,current_date - 1,'completed'),
  ('GB-DT-002','500-hour service','Volvo Approved',current_date - 60,2060.0,2560.0,current_date + 45,'completed')
) as v(machine_number,service_type,mechanic,service_date,meter,due_hours,due_date,status)
join machine m on m.machine_number = v.machine_number
where r.machine_id = m.id
  and r.service_type = v.service_type
  and r.mechanic = v.mechanic;

insert into system_setting(key,value) values ('daily_hour_photo_retention_days','60') on conflict (key) do update set value=excluded.value;

commit;

-- Auth note: create the login through Supabase Auth first, then run:
-- insert into app_user (id, full_name, role) values ('AUTH_USER_UUID','Operations Manager','operations_manager') on conflict (id) do update set full_name=excluded.full_name, role=excluded.role;
