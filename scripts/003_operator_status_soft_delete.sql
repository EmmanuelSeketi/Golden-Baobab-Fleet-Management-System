-- ============================================================================
-- 003 — Operator work status + soft delete for operator & machine
-- ----------------------------------------------------------------------------
-- Run this ONCE in the Supabase SQL Editor, before using the updated app.
-- It is idempotent: safe to run more than once.
--
-- Why UPDATE-based soft delete (not DELETE):
--   The RLS policies grant administrator + operations_manager INSERT and
--   UPDATE on operator/machine, but NO delete policy exists — a hard DELETE
--   is rejected. Soft delete flips `deleted_at`, which the UPDATE policy
--   already allows, and preserves history (assignments, hours, audit).
-- ============================================================================

do $$
begin
  -- Operator work status: Working / Off / Standby (distinct from employment
  -- flag `is_active`). Defaults to 'off' so existing rows stay valid.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'operator' and column_name = 'status'
  ) then
    alter table public.operator add column status text not null default 'off';
  end if;

  if not exists (select 1 from pg_constraint where conname = 'operator_status_check') then
    alter table public.operator
      add constraint operator_status_check check (status in ('working', 'off', 'standby'));
  end if;

  -- Soft-delete markers (null = live row).
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'operator' and column_name = 'deleted_at'
  ) then
    alter table public.operator add column deleted_at timestamptz;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'machine' and column_name = 'deleted_at'
  ) then
    alter table public.machine add column deleted_at timestamptz;
  end if;
end $$;

-- Partial indexes so "live only" lookups stay fast.
create index if not exists idx_operator_live on public.operator (full_name) where deleted_at is null;
create index if not exists idx_machine_live on public.machine (machine_number) where deleted_at is null;

-- Seed a sensible starting status: operators currently holding a live machine
-- are 'working'; everyone else keeps the 'off' default.
update public.operator o
set status = 'working'
where o.status = 'off'
  and o.deleted_at is null
  and exists (
    select 1 from public.machine m
    where m.assigned_operator_id = o.id and m.deleted_at is null
  );
