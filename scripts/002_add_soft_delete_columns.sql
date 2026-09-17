-- ============================================================================
-- Migration 002 — Soft-delete support + operator status
-- ============================================================================
-- The application implements soft-delete (records are hidden, never physically
-- removed, so operational/commercial history stays intact). The Phase-1 schema
-- did not include the columns this depends on. Every list query filters
-- `where deleted_at is null`, so these columns must exist or those reads fail.
--
-- Safe to run more than once (IF NOT EXISTS guards).
-- ============================================================================

-- Machine soft-delete
alter table machine
  add column if not exists deleted_at timestamptz;

-- Operator soft-delete + status
alter table operator
  add column if not exists deleted_at timestamptz;

alter table operator
  add column if not exists status text not null default 'active';

-- Partial indexes so "active" list queries stay fast as deleted rows accumulate
create index if not exists idx_machine_not_deleted
  on machine(machine_number) where deleted_at is null;

create index if not exists idx_operator_not_deleted
  on operator(full_name) where deleted_at is null;
