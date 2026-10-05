-- ============================================================================
-- GBI Fleet — Automatic audit logging (§22)
-- ----------------------------------------------------------------------------
-- Run this once against the Supabase database (SQL Editor or psql).
-- It is idempotent: re-running replaces the function and re-attaches triggers.
--
-- Design notes:
--   * A single SECURITY DEFINER function writes to audit_log, bypassing the
--     table's RLS (which intentionally has no INSERT policy for end users).
--   * auth.uid() still resolves to the real caller inside a SECURITY DEFINER
--     function because it reads the request JWT, not the definer identity.
--     Server/service-role writes have no JWT, so user_id is left NULL.
--   * Semantic actions are derived to match the audit_action enum:
--       INSERT                                   -> 'create'
--       UPDATE deleted_at NULL -> NOT NULL       -> 'archive'
--       UPDATE deleted_at NOT NULL -> NULL       -> 'restore'
--       UPDATE status -> 'approved'              -> 'approve'
--       UPDATE status -> 'void'                  -> 'void'
--       any other UPDATE with real changes       -> 'update'
--   * changed_fields captures only the columns that actually changed
--     ({ "field": { "old": ..., "new": ... } }), skipping updated_at noise.
--   * system_setting is excluded: its primary key is a text `key`, not a uuid
--     `id`, so it does not fit audit_log.entity_id (uuid).
-- ============================================================================

create or replace function gbi_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action  audit_action;
  v_id      uuid;
  v_old     jsonb;
  v_new     jsonb;
  v_changed jsonb := '{}'::jsonb;
  k         text;
begin
  if (tg_op = 'INSERT') then
    v_action := 'create';
    v_id := new.id;
    v_changed := null;

  elsif (tg_op = 'UPDATE') then
    v_id  := new.id;
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);

    if (v_new ? 'deleted_at')
       and (v_old->>'deleted_at') is null
       and (v_new->>'deleted_at') is not null then
      v_action := 'archive';
    elsif (v_new ? 'deleted_at')
       and (v_old->>'deleted_at') is not null
       and (v_new->>'deleted_at') is null then
      v_action := 'restore';
    elsif (v_new ? 'status')
       and (v_old->>'status') is distinct from (v_new->>'status')
       and (v_new->>'status') = 'approved' then
      v_action := 'approve';
    elsif (v_new ? 'status')
       and (v_old->>'status') is distinct from (v_new->>'status')
       and (v_new->>'status') = 'void' then
      v_action := 'void';
    else
      v_action := 'update';
    end if;

    for k in select jsonb_object_keys(v_new) loop
      if (v_old->k) is distinct from (v_new->k) and k <> 'updated_at' then
        v_changed := v_changed || jsonb_build_object(
          k, jsonb_build_object('old', v_old->k, 'new', v_new->k)
        );
      end if;
    end loop;

    -- Nothing meaningful changed (e.g. only updated_at touched) → skip noise.
    if v_changed = '{}'::jsonb then
      return new;
    end if;

  else
    return coalesce(new, old);
  end if;

  insert into audit_log (user_id, entity_type, entity_id, action, changed_fields)
  values (auth.uid(), tg_table_name, v_id, v_action, v_changed);

  return coalesce(new, old);
end;
$$;

-- Attach the trigger to every audited table that has a uuid `id` primary key.
do $$
declare
  t text;
begin
  foreach t in array array[
    'machine', 'operator', 'project', 'project_contract', 'machine_assignment',
    'customer', 'contract', 'contract_machine', 'billing_rule',
    'daily_hour_entry', 'overtime_rule', 'overtime_entry',
    'invoice', 'invoice_adjustment', 'billing_entry',
    'hiring_quotation', 'hiring_quotation_item',
    'maintenance_record', 'repair_record', 'app_user'
  ]
  loop
    execute format('drop trigger if exists trg_audit_%1$s on %1$s;', t);
    execute format(
      'create trigger trg_audit_%1$s after insert or update on %1$s '
      'for each row execute function gbi_audit();', t
    );
  end loop;
end $$;
