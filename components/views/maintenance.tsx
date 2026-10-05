'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Eye, Pencil, Plus } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { maintenanceStatusTone, money, shortDate, titleCase } from '@/lib/gbi/format'
import { canManageOps, type UserRole } from '@/lib/gbi/roles'
import {
  DetailGrid,
  Modal,
  PageHeading,
  RowActions,
  StatusBadge,
  ViewState,
} from '@/components/shared'

type Maintenance = {
  id: string
  service_date: string
  hour_meter_at_service: number | null
  next_service_due_hours: number | null
  next_service_due_date: string | null
  service_type: string | null
  mechanic: string | null
  parts_replaced: string | null
  cost: number | null
  status: string
  machine: { machine_number: string; machine_type: string } | null
  machine_id: string
}

type MachineLite = {
  id: string
  machine_number: string
  machine_type: string
}

const STATUSES = ['all', 'upcoming', 'due', 'overdue', 'completed']
const STATUS_OPTIONS = ['upcoming', 'due', 'overdue', 'completed']
const LIST_SELECT =
  'id,machine_id,service_date,hour_meter_at_service,next_service_due_hours,next_service_due_date,service_type,mechanic,parts_replaced,cost,status,machine:machine_id(machine_number,machine_type)'

const today = () => new Date().toISOString().slice(0, 10)

export function MaintenanceView({ role, userId }: { role: UserRole; userId: string }) {
  const supabase = useSupabase()
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState<Maintenance | null>(null)
  const [formTarget, setFormTarget] = useState<Maintenance | null>(null)
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null)
  const canManage = canManageOps(role)

  const records = useQuery<Maintenance[]>(
    () =>
      supabase
        .from('maintenance_record')
        .select(LIST_SELECT)
        .order('service_date', { ascending: false }) as unknown as PromiseLike<{
        data: Maintenance[] | null
        error: unknown
      }>,
    [],
  )

  const machines = useQuery<MachineLite[]>(
    () =>
      supabase
        .from('machine')
        .select('id,machine_number,machine_type')
        .is('deleted_at', null)
        .order('machine_number') as unknown as PromiseLike<{ data: MachineLite[] | null; error: unknown }>,
    [],
  )

  const rows = useMemo(() => {
    const all = records.data ?? []
    return filter === 'all' ? all : all.filter((r) => r.status === filter)
  }, [records.data, filter])

  return (
    <div className="page-wrap">
      <PageHeading
        title="Maintenance"
        description="Scheduled and completed servicing, with the next service due by hours or date."
        action={
          canManage ? (
            <button
              className="button button-primary"
              onClick={() => {
                setSelected(null)
                setFormTarget(null)
                setFormMode('add')
              }}
            >
              <Plus size={15} />
              Schedule Service
            </button>
          ) : undefined
        }
      />

      <div className="filter-row">
        {STATUSES.map((s) => (
          <button
            key={s}
            className={`chip ${filter === s ? 'chip-active' : ''}`}
            onClick={() => setFilter(s)}
          >
            {titleCase(s)}
          </button>
        ))}
      </div>

      <div className="panel">
        <ViewState
          status={records.status}
          error={records.error}
          isEmpty={rows.length === 0}
          title="maintenance"
          emptyText={filter === 'all' ? 'No maintenance records yet.' : `No ${filter} maintenance records.`}
          onRetry={records.reload}
        >
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Service date</th>
                  <th>Type</th>
                  <th>Mechanic</th>
                  <th>Next due</th>
                  <th>Status</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="clickable-row" onClick={() => setSelected(r)}>
                    <td>
                      <b className="mono">{r.machine?.machine_number ?? 'N/A'}</b>
                      <div className="muted-cell">{r.machine?.machine_type ?? ''}</div>
                    </td>
                    <td>{shortDate(r.service_date)}</td>
                    <td>{r.service_type ?? 'N/A'}</td>
                    <td>{r.mechanic ?? 'N/A'}</td>
                    <td>{shortDate(r.next_service_due_date)}</td>
                    <td>
                      <StatusBadge tone={maintenanceStatusTone(r.status)}>{titleCase(r.status)}</StatusBadge>
                    </td>
                    <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                      <RowActions
                        label={`Actions for service on ${r.machine?.machine_number ?? 'machine'}`}
                        actions={[
                          { label: 'View details', icon: Eye, onClick: () => setSelected(r) },
                          ...(canManage
                            ? [
                                {
                                  label: 'Edit service',
                                  icon: Pencil,
                                  onClick: () => {
                                    setFormTarget(r)
                                    setFormMode('edit')
                                  },
                                },
                              ]
                            : []),
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ViewState>
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        eyebrow="Maintenance record"
        title={selected?.machine?.machine_number ?? ''}
        subtitle={selected ? `${selected.service_type ?? 'Service'} · ${shortDate(selected.service_date)}` : ''}
        footer={
          selected ? (
            <div className="modal-foot-split">
              <StatusBadge tone={maintenanceStatusTone(selected.status)}>{titleCase(selected.status)}</StatusBadge>
              {canManage && (
                <div className="modal-foot-actions">
                  <button
                    className="button button-secondary"
                    onClick={() => {
                      setFormTarget(selected)
                      setFormMode('edit')
                    }}
                  >
                    <Pencil size={14} />
                    Edit
                  </button>
                </div>
              )}
            </div>
          ) : null
        }
      >
        {selected && (
          <DetailGrid
            items={[
              ['Machine', selected.machine?.machine_number ?? 'N/A'],
              ['Machine type', selected.machine?.machine_type ?? 'N/A'],
              ['Service date', shortDate(selected.service_date)],
              ['Service type', selected.service_type ?? 'N/A'],
              ['Mechanic', selected.mechanic ?? 'N/A'],
              ['Meter at service', selected.hour_meter_at_service ? `${selected.hour_meter_at_service} h` : 'N/A'],
              ['Next due (hours)', selected.next_service_due_hours ? `${selected.next_service_due_hours} h` : 'N/A'],
              ['Next due (date)', shortDate(selected.next_service_due_date)],
              ['Cost', money(selected.cost)],
              ['Parts replaced', selected.parts_replaced ?? 'N/A'],
            ]}
          />
        )}
      </Modal>

      {canManage && (
        <MaintenanceFormModal
          open={formMode !== null}
          mode={formMode ?? 'add'}
          record={formTarget}
          userId={userId}
          machines={machines.data ?? []}
          onClose={() => {
            setFormMode(null)
            setFormTarget(null)
          }}
          onSaved={() => {
            setFormMode(null)
            setFormTarget(null)
            setSelected(null)
            records.reload()
          }}
        />
      )}
    </div>
  )
}

function MaintenanceFormModal({
  open,
  mode,
  record,
  userId,
  machines,
  onClose,
  onSaved,
}: {
  open: boolean
  mode: 'add' | 'edit'
  record: Maintenance | null
  userId: string
  machines: MachineLite[]
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = useSupabase()
  const [form, setForm] = useState<Record<string, string>>({})
  const [machineId, setMachineId] = useState('')
  const [status, setStatus] = useState('upcoming')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && record) {
      setForm({
        service_date: record.service_date ?? '',
        service_type: record.service_type ?? '',
        mechanic: record.mechanic ?? '',
        hour_meter_at_service: record.hour_meter_at_service != null ? String(record.hour_meter_at_service) : '',
        next_service_due_hours: record.next_service_due_hours != null ? String(record.next_service_due_hours) : '',
        next_service_due_date: record.next_service_due_date ?? '',
        parts_replaced: record.parts_replaced ?? '',
        cost: record.cost != null ? String(record.cost) : '',
      })
      setMachineId(record.machine_id ?? '')
      setStatus(record.status ?? 'upcoming')
    } else {
      setForm({ service_date: today() })
      setMachineId('')
      setStatus('upcoming')
    }
    setFieldErrors({})
    setFormError('')
  }, [open, mode, record])

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit() {
    const errors: Record<string, string> = {}
    if (!machineId) errors.machine_id = 'Select a machine.'
    if (!form.service_date) errors.service_date = 'Service date is required.'
    setFieldErrors(errors)
    setFormError('')
    if (Object.keys(errors).length > 0) return

    const num = (k: string) => (form[k]?.trim() ? Number(form[k]) : null)
    const text = (k: string) => (form[k]?.trim() ? form[k].trim() : null)
    const base = {
      machine_id: machineId,
      service_date: form.service_date,
      service_type: text('service_type'),
      mechanic: text('mechanic'),
      hour_meter_at_service: num('hour_meter_at_service'),
      next_service_due_hours: num('next_service_due_hours'),
      next_service_due_date: text('next_service_due_date'),
      parts_replaced: text('parts_replaced'),
      cost: num('cost'),
      status,
    }

    setSaving(true)
    const res =
      mode === 'add'
        ? await supabase.from('maintenance_record').insert({ ...base, created_by: userId })
        : await supabase.from('maintenance_record').update(base).eq('id', record!.id)
    setSaving(false)

    if (res.error) {
      if (/permission|policy|rls|denied/i.test((res.error as { message?: string }).message ?? '')) {
        setFormError('You do not have permission to save maintenance records.')
        return
      }
      setFormError('Could not save this service. Please check the values and try again.')
      return
    }
    onSaved()
  }

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      eyebrow="Maintenance"
      title={mode === 'edit' ? 'Edit Service' : 'Schedule Service'}
      subtitle={
        mode === 'edit'
          ? 'Update this servicing record.'
          : 'Record a scheduled or completed service.'
      }
      footer={
        <div className="footer-actions">
          <button className="button button-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="button button-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Save Service'}
          </button>
        </div>
      }
    >
      <div className="form-grid">
        {formError && (
          <div className="form-error">
            <AlertTriangle size={15} />
            {formError}
          </div>
        )}

        <div className={`form-field ${fieldErrors.machine_id ? 'invalid' : ''}`}>
          <label htmlFor="mt-machine">
            Machine<span className="req">*</span>
          </label>
          <select id="mt-machine" value={machineId} onChange={(e) => setMachineId(e.target.value)}>
            <option value="">Select machine</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.machine_number} · {m.machine_type}
              </option>
            ))}
          </select>
          {fieldErrors.machine_id && <span className="field-error">{fieldErrors.machine_id}</span>}
        </div>

        <MField
          label="Service date"
          type="date"
          required
          value={form.service_date ?? ''}
          onChange={(v) => set('service_date', v)}
          error={fieldErrors.service_date}
        />

        <MField
          label="Service type"
          value={form.service_type ?? ''}
          onChange={(v) => set('service_type', v)}
          placeholder="e.g. 250h service, oil change"
        />

        <div className="form-field">
          <label htmlFor="mt-status">Status</label>
          <select id="mt-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </select>
        </div>

        <MField label="Mechanic" value={form.mechanic ?? ''} onChange={(v) => set('mechanic', v)} placeholder="e.g. GBI Workshop" />
        <MField
          label="Meter at service (hours)"
          type="number"
          value={form.hour_meter_at_service ?? ''}
          onChange={(v) => set('hour_meter_at_service', v)}
          placeholder="Hour-meter reading"
        />
        <MField
          label="Next due (hours)"
          type="number"
          value={form.next_service_due_hours ?? ''}
          onChange={(v) => set('next_service_due_hours', v)}
          placeholder="e.g. 500"
        />
        <MField
          label="Next due (date)"
          type="date"
          value={form.next_service_due_date ?? ''}
          onChange={(v) => set('next_service_due_date', v)}
        />
        <MField
          label="Cost"
          type="number"
          value={form.cost ?? ''}
          onChange={(v) => set('cost', v)}
          placeholder="Total service cost"
        />
        <MField
          label="Parts replaced"
          full
          textarea
          value={form.parts_replaced ?? ''}
          onChange={(v) => set('parts_replaced', v)}
          placeholder="Filters, oil, belts…"
        />
      </div>
    </Modal>
  )
}

function MField({
  label,
  value,
  onChange,
  required,
  type = 'text',
  placeholder,
  error,
  full,
  textarea,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  type?: string
  placeholder?: string
  error?: string
  full?: boolean
  textarea?: boolean
}) {
  return (
    <div className={`form-field ${full ? 'full' : ''} ${error ? 'invalid' : ''}`}>
      <label>
        {label}
        {required && <span className="req">*</span>}
      </label>
      {textarea ? (
        <textarea
          value={value}
          placeholder={placeholder}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type={type}
          inputMode={type === 'number' ? 'decimal' : undefined}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {error && <span className="field-error">{error}</span>}
    </div>
  )
}
