'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  DatabaseBackup,
  Download,
  Info,
  Pencil,
  Settings2,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { dateTime, titleCase } from '@/lib/gbi/format'
import { ROLE_LABEL, type AppUser, type UserRole } from '@/lib/gbi/roles'
import { DetailGrid, Modal, PageHeading, StatusBadge, ViewState } from '@/components/shared'

const ROLES: UserRole[] = ['administrator', 'operations_manager', 'management', 'accounts_billing']

type Tab = 'users' | 'system' | 'backup'

export function SettingsView({ userId }: { userId: string }) {
  const [tab, setTab] = useState<Tab>('users')

  return (
    <div className="page-wrap">
      <PageHeading
        title="Settings & Backup"
        description="Manage user roles, system configuration and data exports. Administrator access only."
      />

      <div className="filter-row">
        <div className="seg-tabs">
          <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>
            <Users size={14} />
            Users & roles
          </button>
          <button className={tab === 'system' ? 'active' : ''} onClick={() => setTab('system')}>
            <Settings2 size={14} />
            System settings
          </button>
          <button className={tab === 'backup' ? 'active' : ''} onClick={() => setTab('backup')}>
            <DatabaseBackup size={14} />
            Backup & export
          </button>
        </div>
      </div>

      {tab === 'users' && <UsersPanel currentUserId={userId} />}
      {tab === 'system' && <SystemPanel userId={userId} />}
      {tab === 'backup' && <BackupPanel />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Users & roles
// ---------------------------------------------------------------------------

type UserRow = AppUser & { created_at: string; updated_at: string }

function UsersPanel({ currentUserId }: { currentUserId: string }) {
  const supabase = useSupabase()
  const [editing, setEditing] = useState<UserRow | null>(null)

  const users = useQuery<UserRow[]>(
    () =>
      supabase
        .from('app_user')
        .select('id,full_name,role,is_active,created_at,updated_at')
        .order('full_name') as unknown as PromiseLike<{ data: UserRow[] | null; error: unknown }>,
    [],
  )

  return (
    <>
      <div className="info-banner">
        <Info size={15} />
        <span>
          New users are created when they first sign in through Supabase authentication. Assign their role and
          activate or deactivate their access here.
        </span>
      </div>

      <div className="panel">
        <ViewState
          status={users.status}
          error={users.error}
          isEmpty={(users.data ?? []).length === 0}
          title="users"
          emptyText="No users provisioned yet."
          onRetry={users.reload}
        >
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Added</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(users.data ?? []).map((u) => (
                  <tr key={u.id}>
                    <td>
                      <b>{u.full_name}</b>
                      {u.id === currentUserId && <span className="flag-chip">You</span>}
                    </td>
                    <td>{ROLE_LABEL[u.role]}</td>
                    <td>
                      <StatusBadge tone={u.is_active ? 'green' : 'red'}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </StatusBadge>
                    </td>
                    <td>{dateTime(u.created_at)}</td>
                    <td className="col-actions">
                      <button className="button button-secondary button-sm" onClick={() => setEditing(u)}>
                        <Pencil size={13} />
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ViewState>
      </div>

      <UserEditModal
        user={editing}
        isSelf={editing?.id === currentUserId}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          users.reload()
        }}
      />
    </>
  )
}

function UserEditModal({
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  user: UserRow | null
  isSelf: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = useSupabase()
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<UserRole>('operations_manager')
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    setFullName(user.full_name)
    setRole(user.role)
    setIsActive(user.is_active)
    setError('')
  }, [user])

  if (!user) return null

  async function submit() {
    if (!fullName.trim()) return setError('Full name is required.')
    if (isSelf && (!isActive || role !== 'administrator')) {
      return setError('You cannot remove your own administrator access or deactivate yourself.')
    }
    setSaving(true)
    setError('')
    const { error: upErr } = await supabase
      .from('app_user')
      .update({ full_name: fullName.trim(), role, is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', user!.id)
    setSaving(false)
    if (upErr) {
      setError(
        /permission|policy|rls|denied/i.test((upErr as { message?: string }).message ?? '')
          ? 'You do not have permission to manage users.'
          : 'Could not save this user. Please try again.',
      )
      return
    }
    onSaved()
  }

  return (
    <Modal
      open={!!user}
      onClose={saving ? () => {} : onClose}
      eyebrow="User management"
      title={user.full_name}
      subtitle="Assign role and access status."
      footer={
        <div className="footer-actions">
          <button className="button button-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="button button-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      }
    >
      <div className="form-grid">
        {error && (
          <div className="form-error">
            <AlertTriangle size={15} />
            {error}
          </div>
        )}
        <div className="form-field full">
          <label>
            Full name<span className="req">*</span>
          </label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="form-field">
          <label htmlFor="u-role">Role</label>
          <select id="u-role" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="u-status">Access</label>
          <select id="u-status" value={isActive ? 'active' : 'inactive'} onChange={(e) => setIsActive(e.target.value === 'active')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// System settings
// ---------------------------------------------------------------------------

type SettingRow = { key: string; value: unknown; updated_at: string }

// Friendly labels/descriptions for known settings; unknown keys still editable.
const SETTING_META: Record<string, { label: string; help: string; unit?: string }> = {
  daily_hour_photo_retention_days: {
    label: 'Daily-hour photo retention',
    help: 'How long uploaded hour-meter photos are kept before they can be purged.',
    unit: 'days',
  },
}

function SystemPanel({ userId }: { userId: string }) {
  const supabase = useSupabase()
  const [editing, setEditing] = useState<SettingRow | null>(null)

  const settings = useQuery<SettingRow[]>(
    () =>
      supabase.from('system_setting').select('key,value,updated_at').order('key') as unknown as PromiseLike<{
        data: SettingRow[] | null
        error: unknown
      }>,
    [],
  )

  return (
    <>
      <div className="panel">
        <ViewState
          status={settings.status}
          error={settings.error}
          isEmpty={(settings.data ?? []).length === 0}
          title="system settings"
          emptyText="No system settings configured."
          onRetry={settings.reload}
        >
          <div className="settings-list">
            {(settings.data ?? []).map((s) => {
              const meta = SETTING_META[s.key]
              return (
                <div className="settings-row" key={s.key}>
                  <div>
                    <b>{meta?.label ?? s.key}</b>
                    <span>{meta?.help ?? 'Custom configuration value.'}</span>
                    <code className="settings-key">{s.key}</code>
                  </div>
                  <div className="settings-value">
                    <b>
                      {formatValue(s.value)}
                      {meta?.unit ? ` ${meta.unit}` : ''}
                    </b>
                    <button className="button button-secondary button-sm" onClick={() => setEditing(s)}>
                      <Pencil size={13} />
                      Edit
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </ViewState>
      </div>

      <SettingEditModal
        setting={editing}
        userId={userId}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          settings.reload()
        }}
      />
    </>
  )
}

function formatValue(v: unknown): string {
  if (v == null) return 'N/A'
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v)
}

function SettingEditModal({
  setting,
  userId,
  onClose,
  onSaved,
}: {
  setting: SettingRow | null
  userId: string
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = useSupabase()
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!setting) return
    setValue(formatValue(setting.value))
    setError('')
  }, [setting])

  if (!setting) return null
  const meta = SETTING_META[setting.key]

  async function submit() {
    if (!value.trim()) return setError('A value is required.')
    // Preserve the JSON type of the existing value: numeric stays numeric,
    // booleans stay boolean, otherwise store as a JSON string.
    let payload: unknown = value.trim()
    if (typeof setting!.value === 'number') {
      const n = Number(value)
      if (Number.isNaN(n)) return setError('This setting expects a number.')
      payload = n
    } else if (typeof setting!.value === 'boolean') {
      payload = value.trim().toLowerCase() === 'true'
    }

    setSaving(true)
    setError('')
    const { error: upErr } = await supabase
      .from('system_setting')
      .update({ value: payload, updated_by: userId, updated_at: new Date().toISOString() })
      .eq('key', setting!.key)
    setSaving(false)
    if (upErr) {
      setError(
        /permission|policy|rls|denied/i.test((upErr as { message?: string }).message ?? '')
          ? 'You do not have permission to change system settings.'
          : 'Could not save this setting. Please try again.',
      )
      return
    }
    onSaved()
  }

  return (
    <Modal
      open={!!setting}
      onClose={saving ? () => {} : onClose}
      eyebrow="System setting"
      title={meta?.label ?? setting.key}
      subtitle={meta?.help}
      footer={
        <div className="footer-actions">
          <button className="button button-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="button button-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Save setting'}
          </button>
        </div>
      }
    >
      <div className="form-grid">
        {error && (
          <div className="form-error">
            <AlertTriangle size={15} />
            {error}
          </div>
        )}
        <div className="form-field full">
          <label>
            Value{meta?.unit ? ` (${meta.unit})` : ''}
          </label>
          <input value={value} onChange={(e) => setValue(e.target.value)} />
          <span className="field-hint">
            Key: <code>{setting.key}</code>
          </span>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Backup & export
// ---------------------------------------------------------------------------

const EXPORT_TABLES = [
  'machine',
  'operator',
  'customer',
  'contract',
  'contract_machine',
  'project_contract',
  'hiring_quotation',
  'hiring_quotation_item',
  'billing_rule',
  'daily_hour_entry',
  'overtime_rule',
  'overtime_entry',
  'invoice',
  'billing_entry',
  'invoice_adjustment',
  'maintenance_record',
  'repair_record',
]

function BackupPanel() {
  const supabase = useSupabase()
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [lastExport, setLastExport] = useState<string | null>(null)

  async function exportAll() {
    setRunning(true)
    setError('')
    setProgress('Starting…')
    const snapshot: Record<string, unknown[]> = {}
    try {
      for (const table of EXPORT_TABLES) {
        setProgress(`Exporting ${table}…`)
        const { data, error: qErr } = await supabase.from(table).select('*')
        if (qErr) throw qErr
        snapshot[table] = data ?? []
      }
      const payload = {
        exported_at: new Date().toISOString(),
        source: 'GBI Fleet Operations',
        tables: snapshot,
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gbi-fleet-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setLastExport(new Date().toISOString())
      setProgress('')
    } catch {
      setError('Could not complete the export. Some tables may be restricted for your role.')
      setProgress('')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="panel panel-pad">
      <div className="backup-head">
        <div className="backup-icon">
          <DatabaseBackup size={22} />
        </div>
        <div>
          <h2>Data export</h2>
          <p>
            Download a JSON snapshot of all operational and commercial records. Use this for off-site backups and
            record-keeping.
          </p>
        </div>
      </div>

      {error && (
        <div className="form-error" style={{ marginTop: 14 }}>
          <AlertTriangle size={15} />
          {error}
        </div>
      )}

      <DetailGrid
        items={[
          ['Tables included', `${EXPORT_TABLES.length}`],
          ['Format', 'JSON snapshot'],
          ['Last export', lastExport ? dateTime(lastExport) : 'Not exported this session'],
          ['Scope', 'All records your role can read'],
        ]}
      />

      <div className="backup-actions">
        <button className="button button-primary" onClick={exportAll} disabled={running}>
          <Download size={15} />
          {running ? progress || 'Exporting…' : 'Export all data (JSON)'}
        </button>
      </div>

      <div className="info-banner" style={{ marginTop: 16 }}>
        <ShieldCheck size={15} />
        <span>
          <b>Restoring data</b> is performed from the Supabase dashboard using point-in-time recovery or a database
          restore, which safely rebuilds tables and relationships. This export is your portable copy for audits and
          off-site retention.
        </span>
      </div>
    </div>
  )
}
