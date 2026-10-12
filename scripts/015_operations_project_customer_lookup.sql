-- Let operations managers select customer names when linking a project without
-- granting direct read access to customer contact or billing information.

create or replace function public.list_project_customer_options()
returns table (id uuid, company_name text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.company_name
  from public.customer c
  where public.auth_role() = 'operations_manager'
  order by c.company_name;
$$;

revoke all on function public.list_project_customer_options() from public;
grant execute on function public.list_project_customer_options() to authenticated;
