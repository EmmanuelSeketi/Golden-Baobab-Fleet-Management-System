begin;

alter table public.machine
  add column if not exists name text;

update public.machine
set name = coalesce(
  nullif(btrim(concat_ws(' ', nullif(btrim(brand), ''), nullif(btrim(model), ''))), ''),
  nullif(btrim(concat_ws(' ', nullif(btrim(machine_type), ''), nullif(btrim(machine_number), ''))), ''),
  machine_number
)
where name is null or btrim(name) = '';

alter table public.machine
  alter column name set not null;

create index if not exists idx_machine_name on public.machine(name);

commit;
