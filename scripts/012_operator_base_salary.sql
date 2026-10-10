-- Store each operator's current monthly basic salary for overtime payroll.
-- Run once in the Supabase SQL Editor; safe to run again.

begin;

alter table public.operator
  add column if not exists base_salary numeric(14,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'operator_base_salary_nonnegative'
      and conrelid = 'public.operator'::regclass
  ) then
    alter table public.operator
      add constraint operator_base_salary_nonnegative
      check (base_salary is null or base_salary >= 0);
  end if;
end;
$$;

comment on column public.operator.base_salary is
  'Current monthly basic salary; overtime hourly wage is base_salary / 208.';

commit;
