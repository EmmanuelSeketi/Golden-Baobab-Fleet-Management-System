-- Store compressed machine photos in a dedicated Supabase Storage bucket.
-- Run once in the Supabase SQL Editor; safe to run again.

begin;

alter table public.machine
  add column if not exists machine_image_path text;

comment on column public.machine.machine_image_path is
  'Path to the compressed WebP machine photo in the machine-images Storage bucket.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'machine-images',
  'machine-images',
  true,
  1048576,
  array['image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists machine_images_insert on storage.objects;
create policy machine_images_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'machine-images'
    and public.auth_role() in ('administrator', 'operations_manager')
  );

drop policy if exists machine_images_update on storage.objects;
create policy machine_images_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'machine-images'
    and public.auth_role() in ('administrator', 'operations_manager')
  )
  with check (
    bucket_id = 'machine-images'
    and public.auth_role() in ('administrator', 'operations_manager')
  );

drop policy if exists machine_images_delete on storage.objects;
create policy machine_images_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'machine-images'
    and public.auth_role() in ('administrator', 'operations_manager')
  );

commit;
