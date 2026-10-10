-- Store compressed operator profile pictures in a dedicated Supabase Storage bucket.
-- Run once in the Supabase SQL Editor; safe to run again.

begin;

alter table public.operator
  add column if not exists profile_picture_path text;

comment on column public.operator.profile_picture_path is
  'Path to the compressed WebP profile picture in the operator-profiles Storage bucket.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'operator-profiles',
  'operator-profiles',
  true,
  524288,
  array['image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists operator_profiles_insert on storage.objects;
create policy operator_profiles_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'operator-profiles'
    and public.auth_role() in ('administrator', 'operations_manager')
  );

drop policy if exists operator_profiles_update on storage.objects;
create policy operator_profiles_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'operator-profiles'
    and public.auth_role() in ('administrator', 'operations_manager')
  )
  with check (
    bucket_id = 'operator-profiles'
    and public.auth_role() in ('administrator', 'operations_manager')
  );

drop policy if exists operator_profiles_delete on storage.objects;
create policy operator_profiles_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'operator-profiles'
    and public.auth_role() in ('administrator', 'operations_manager')
  );

commit;
