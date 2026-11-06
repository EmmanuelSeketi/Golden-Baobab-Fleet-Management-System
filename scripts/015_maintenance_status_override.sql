begin;

alter table public.maintenance_record
  add column if not exists status_override boolean not null default false;

update public.maintenance_record
set status_override = true
where status = 'completed'
  and status_override = false;

commit;
