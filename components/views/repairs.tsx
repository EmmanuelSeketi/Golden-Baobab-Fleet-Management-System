'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Eye, Pencil, Plus } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { money, shortDate } from '@/lib/gbi/format'
import { canManageOps, type UserRole } from '@/lib/gbi/roles'
import {
  DetailGrid,
  Modal,
  PageHeading,
  RowActions,
  StatusBadge,
  ViewState,
} from '@/components/shared'

type Repair = {
  id: string
  fault_date: string
  fault_description: string
  mechanic: string | null
  repair_completed: boolean
  parts_used: string | null
  cost: number | null
  downtime_hours: number | null
  machine: { machine_number: string; machine_type: string } | null
  machine_id: string
}

type MachineLite = {
  id: string
  machine_number: string
  machine_type: string
}

const FILTERS = ['all', 'open', 'completed'] as const
const LIST_SELECT =
  'id,machine_id,fault_date,fault_description,mechanic,repair_completed,parts_used,cost,downtime_hours,machine:machine_id(machine_number,machine_type)'

const today = () => new Date().toISOString().slice(0, 10)

export function RepairsView({ role, userId }: { role: UserRole; userId: string }) {
  const supabase = useSupabase()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all')
  const [selected, setSelected] = useState<Repair | null>(null)
  const [formTarget, setFormTarget] = useState<Repair | null>(null)
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null)
  const canManage = canManageOps(role)

  const records = useQuery<Repair[]>(
    () =>
      supabase
        .from('repair_record')
        .select(LIST_SELECT)
        .order('fault_date', { ascending: false }) as unknown as PromiseLike<{
        data: Repair[] | null
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
    if (filter === 'all') return all
    return all.filter((r) => (filter === 'completed' ? r.repair_completed : !r.repair_completed))
  }, [records.data, filter])

  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="Assets"
        title="Repairs"
        description="Breakdown and fault records with downtime, parts used and repair status."
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
              Log Repair
            </button>
          ) : undefined
        }
      />

      <div className="filter-row">
        {FILTERS.map((f) => (
          <button key={f} className={`chip ${filter === f ? 'chip-active' : ''}`} onClick={() => setFilter(f)}>
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="panel">
        <ViewState
          status={records.status}
          error={records.error}
          isEmpty={rows.length === 0}
          title="repairs"
          emptyText={filter === 'all' ? 'No repair records yet.' : `No ${filter} repairs.`}
          onRetry={records.reload}
        >
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Fault date</th>
                  <th>Description</th>
                  <th>Downtime</th>
                  <th>Cost</th>
                  <th>Status</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="clickable-row" onClick={() => setSelected(r)}>
                    <td>
                      <b>{r.machine?.machine_number ?? '—'}</b>
                      <div className="muted-cell">{r.machine?.machine_type ?? ''}</div>
                    </td>
                    <td>{shortDate(r.fault_date)}</td>
                    <td className="truncate-cell">{r.fault_description}</td>
                    <td>{r.downtime_hours != null ? `${r.downtime_hours} h` : '—'}</td>
                    <td>{money(r.cost)}</td>
                    <td>
                      <StatusBadge tone={r.repair_completed ? 'green' : 'amber'}>
                        {r.repair_completed ? 'Completed' : 'Open'}
                      </StatusBadge>
                    </td>
                    <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                      <RowActions
                        label={`Actions for repair on ${r.machine?.machine_number ?? 'machine'}`}
                        actions={[
                          { label: 'View details', icon: Eye, onClick: () => setSelected(r) },
                          ...(canManage
                            ? [
                                {
                                  label: 'Edit repair',
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
        eyebrow="Repair record"
        title={selected?.machine?.machine_number ?? ''}
        subtitle={selected ? shortDate(selected.fault_date) : ''}
        footer={
          selected ? (
            <div className="modal-foot-split">
              <StatusBadge tone={selected.repair_completed ? 'green' : 'amber'}>
                {selected.repair_completed ? 'Completed' : 'Open'}
              </StatusBadge>
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
              ['Machine', selected.machine?.machine_number ?? '—'],
              ['Machine type', selected.machine?.machine_type ?? '—'],
              ['Fault date', shortDate(selected.fault_date)],
              ['Mechanic', selected.mechanic ?? '—'],
              ['Downtime', selected.downtime_hours != null ? `${selected.downtime_hours} h` : '—'],
              ['Cost', money(selected.cost)],
              ['Parts used', selected.parts_used ?? '—'],
              ['Fault description', selected.fault_description],
            ]}
          />
        )}
      </Modal>

      {canManage && (
        <RepairFormModal
          open={formMode !== null}
          mode={formMode ?? 'add'}
          repair={formTarget}
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

function RepairFormModal({
  open,
  mode,
  repair,
  userId,
  machines,
  onClose,
  onSaved,
}: {
  open: boolean
  mode: 'add' | 'edit'
  repair: Repair | null
  userId: string
  machines: MachineLite[]
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = useSupabase()
  const [form, setForm] = useState<Record<string, string>>({})
  const [machineId, setMachineId] = useState('')
  const [completed, setCompleted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && repair) {
      setForm({
        fault_date: repair.fault_date ?? '',
        fault_description: repair.fault_description ?? '',
        mechanic: repair.mechanic ?? '',
        parts_used: repair.parts_used ?? '',
        cost: repair.cost != null ? String(repair.cost) : '',
        downtime_hours: repair.downtime_hours != null ? String(repair.downtime_hours) : '',
      })
      setMachineId(repair.machine_id ?? '')
      setCompleted(repair.repair_completed)
    } else {
      setForm({ fault_date: today() })
      setMachineId('')
      setCompleted(false)
    }
    setFieldErrors({})
    setFormError('')
  }, [open, mode, repair])

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit() {
    const errors: Record<string, string> = {}
    if (!machineId) errors.machine_id = 'Select a machine.'
    if (!form.fault_date) errors.fault_date = 'Fault date is required.'
    if (!form.fault_description?.trim()) errors.fault_description = 'Describe the fault.'
    setFieldErrors(errors)
    setFormError('')
    if (Object.keys(errors).length > 0) return

    const num = (k: string) => (form[k]?.trim() ? Number(form[k]) : null)
    const text = (k: string) => (form[k]?.trim() ? form[k].trim() : null)
    const base = {
      machine_id: machineId,
      fault_date: form.fault_date,
      fault_description: form.fault_description.trim(),
      mechanic: text('mechanic'),
      parts_used: text('parts_used'),
      cost: num('cost'),
      downtime_hours: num('downtime_hours'),
      repair_completed: completed,
    }

    setSaving(true)
    const res =
      mode === 'add'
        ? await supabase.from('repair_record').insert({ ...base, created_by: userId })
        : await supabase.from('repair_record').update(base).eq('id', repair!.id)
    setSaving(false)

    if (res.error) {
      if (/permission|policy|rls|denied/i.test((res.error as { message?: string }).message ?? '')) {
        setFormError('You do not have permission to save repair records.')
        return
      }
      setFormError('Could not save this repair. Please check the values and try again.')
      return
    }
    onSaved()
  }

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      eyebrow="Repairs"
      title={mode === 'edit' ? 'Edit Repair' : 'Log Repair'}
      subtitle={
        mode === 'edit'
          ? 'Update this breakdown / fault record.'
          : 'Record a new machine breakdown or fault.'
      }
      footer={
        <div className="footer-actions">
          <button className="button button-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="button button-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Save Repair'}
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
          <label htmlFor="rp-machine">
            Machine<span className="req">*</span>
          </label>
          <select id="rp-machine" value={machineId} onChange={(e) => setMachineId(e.target.value)}>
            <option value="">— Select machine —</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.machine_number} · {m.machine_type}
              </option>
            ))}
          </select>
          {fieldErrors.machine_id && <span className="field-error">{fieldErrors.machine_id}</span>}
        </div>

        <RField
          label="Fault date"
          type="date"
          required
          value={form.fault_date ?? ''}
          onChange={(v) => set('fault_date', v)}
          error={fieldErrors.fault_date}
        />

        <RField
          label="Fault description"
          full
          textarea
          required
          value={form.fault_description ?? ''}
          onChange={(v) => set('fault_description', v)}
          error={fieldErrors.fault_description}
          placeholder="What failed and how it was noticed…"
        />

        <RField label="Mechanic" value={form.mechanic ?? ''} onChange={(v) => set('mechanic', v)} placeholder="e.g. GBI Workshop" />
        <RField
          label="Downtime (hours)"
          type="number"
          value={form.downtime_hours ?? ''}
          onChange={(v) => set('downtime_hours', v)}
          placeholder="e.g. 8"
        />
        <RField
          label="Cost"
          type="number"
          value={form.cost ?? ''}
          onChange={(v) => set('cost', v)}
          placeholder="Total repair cost"
        />
        <RField
          label="Parts used"
          full
          textarea
          value={form.parts_used ?? ''}
          onChange={(v) => set('parts_used', v)}
          placeholder="Parts and consumables replaced…"
        />

        <div className="form-field checkbox-field full">
          <input
            id="rp-completed"
            type="checkbox"
            checked={completed}
            onChange={(e) => setCompleted(e.target.checked)}
          />
          <label htmlFor="rp-completed">Repair completed</label>
        </div>
      </div>
    </Modal>
  )
}

function RField({
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
