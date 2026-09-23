begin;

-- Singleton table holding the company-wide "normal working hours" rule used to
-- flag abnormal daily working hours. Only one row ever exists (id is forced to
-- true), so the app just reads/updates that single row.
create table if not exists operating_hours_setting (
  id boolean primary key default true,
  normal_working_hours numeric(5,2) not null default 8 check (normal_working_hours > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references app_user(id),
  constraint operating_hours_setting_singleton check (id)
);

insert into operating_hours_setting (id, normal_working_hours)
values (true, 8)
on conflict (id) do nothing;

alter table operating_hours_setting enable row level security;

-- Everyone who can see daily hours can read the rule.
create policy operating_hours_setting_select
  on operating_hours_setting for select
  using (auth_role() in ('administrator', 'operations_manager', 'management', 'accounts_billing'));

-- Only administrators and operations managers can change the rule.
create policy operating_hours_setting_update
  on operating_hours_setting for update
  using (auth_role() in ('administrator', 'operations_manager'))
  with check (auth_role() in ('administrator', 'operations_manager'));

commit;
