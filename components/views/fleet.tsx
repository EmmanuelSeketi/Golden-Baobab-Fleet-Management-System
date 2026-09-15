'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { machineStatusTone, meter, money, shortDate, titleCase } from '@/lib/gbi/format'
import { canManageOps, type UserRole } from '@/lib/gbi/roles'
import {
  ConfirmDialog,
  DetailGrid,
  MiniState,
  Modal,
  ModalSection,
  PageHeading,
  RowActions,
  StatusBadge,
  ViewState,
} from '@/components/shared'

type Machine = {
  id: string
  machine_number: string
  asset_number: string | null
  registration_number: string | null
  chassis_number: string | null
  engine_number: string | null
  machine_type: string
  manufacturer: string | null
  brand: string | null
  model: string | null
  year: number | null
  current_hour_meter: number
  service_interval_hours: number | null
  purchase_date: string | null
  purchase_price: number | null
  current_status: string
  assigned_operator_id: string | null
  current_project_id: string | null
  operator: { full_name: string } | null
  project: { name: string; site_location: string | null } | null
}

const LIST_SELECT =
  'id,machine_number,asset_number,registration_number,chassis_number,engine_number,machine_type,manufacturer,brand,model,year,current_hour_meter,service_interval_hours,purchase_date,purchase_price,current_status,assigned_operator_id,current_project_id,operator:assigned_operator_id(full_name),project:current_project_id(name,site_location)'

const MACHINE_STATUSES = [
  'available',
  'working',
  'on_hire',
  'under_maintenance',
  'under_repair',
  'breakdown',
  'parked',
]

export function FleetView({ role, userId }: { role: UserRole; userId: string }) {
  const supabase = useSupabase()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Machine | null>(null)
  const [formTarget, setFormTarget] = useState<Machine | null>(null)
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null)
  const [deleting, setDeleting] = useState<Machine | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const canManage = canManageOps(role)

  const machines = useQuery<Machine[]>(
    () =>
      supabase
        .from('machine')
        .select(LIST_SELECT)
        .is('deleted_at', null)
        .order('machine_number') as unknown as PromiseLike<{ data: Machine[] | null; error: unknown }>,
    [],
  )

  const rows = useMemo(() => {
    const all = machines.data ?? []
    if (!query.trim()) return all
    const q = query.toLowerCase()
    return all.filter(
      (m) =>
        m.machine_number.toLowerCase().includes(q) ||
        m.machine_type.toLowerCase().includes(q) ||
        (m.manufacturer ?? '').toLowerCase().includes(q),
    )
  }, [machines.data, query])

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    setDeleteError('')
    const { error } = await supabase
      .from('machine')
      .update({ deleted_at: new Date().toISOString(), updated_by: userId })
      .eq('id', deleting.id)
    setDeleteBusy(false)
    if (error) {
      setDeleteError(
        /permission|policy|rls|denied/i.test((error as { message?: string }).message ?? '')
          ? 'You do not have permission to remove machines.'
          : 'Could not remove this machine. Please try again.',
      )
      return
    }
    setDeleting(null)
    setSelected(null)
    machines.reload()
  }

  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="Assets"
        title="Fleet Register"
        description="Every machine with its live hour meter, current status, operator and deployment."
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
              Add Machine
            </button>
          ) : undefined
        }
      />

      <div className="filter-row">
        <div className="toolbar-search">
          <input
            placeholder="Search by number, type or manufacturer…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="panel">
        <ViewState
          status={machines.status}
          error={machines.error}
          isEmpty={rows.length === 0}
          title="fleet register"
          emptyText={query ? 'No machines match your search.' : 'No machines registered yet.'}
          onRetry={machines.reload}
        >
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Type</th>
                  <th>Hour meter</th>
                  <th>Operator</th>
                  <th>Deployment</th>
                  <th>Status</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="clickable-row" onClick={() => setSelected(m)}>
                    <td>
                      <b>{m.machine_number}</b>
                      <div className="muted-cell">{[m.manufacturer, m.model].filter(Boolean).join(' ')}</div>
                    </td>
                    <td>{m.machine_type}</td>
                    <td>{meter(m.current_hour_meter)}</td>
                    <td>{m.operator?.full_name ?? '—'}</td>
                    <td>{m.project?.name ?? '—'}</td>
                    <td>
                      <StatusBadge tone={machineStatusTone(m.current_status)}>
                        {titleCase(m.current_status)}
                      </StatusBadge>
                    </td>
                    <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                      <RowActions
                        label={`Actions for ${m.machine_number}`}
                        actions={[
                          { label: 'View details', icon: Eye, onClick: () => setSelected(m) },
                          ...(canManage
                            ? [
                                {
                                  label: 'Edit machine',
                                  icon: Pencil,
                                  onClick: () => {
                                    setFormTarget(m)
                                    setFormMode('edit')
                                  },
                                },
                                {
                                  label: 'Delete machine',
                                  icon: Trash2,
                                  danger: true,
                                  onClick: () => setDeleting(m),
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

      <MachineModal
        machine={formMode ? null : selected}
        canManage={canManage}
        onEdit={() => {
          setFormTarget(selected)
          setFormMode('edit')
        }}
        onDelete={() => setDeleting(selected)}
        onClose={() => setSelected(null)}
      />

      {canManage && (
        <MachineFormModal
          open={formMode !== null}
          mode={formMode ?? 'add'}
          machine={formTarget}
          userId={userId}
          onClose={() => {
            setFormMode(null)
            setFormTarget(null)
          }}
          onSaved={() => {
            setFormMode(null)
            setFormTarget(null)
            setSelected(null)
            machines.reload()
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Remove machine?"
        confirmLabel="Remove machine"
        busy={deleteBusy}
        onCancel={() => {
          if (deleteBusy) return
          setDeleting(null)
          setDeleteError('')
        }}
        onConfirm={confirmDelete}
        message={
          <>
            <b>{deleting?.machine_number}</b> will be archived (soft delete) and removed from the register.
            Its hours, maintenance, repairs and assignment history are preserved and can be restored in the
            database.
            {deleteError && <span className="confirm-error">{deleteError}</span>}
          </>
        }
      />
    </div>
  )
}

type MaintRow = {
  id: string
  service_date: string
  status: string
  service_type: string | null
  next_service_due_date: string | null
}
type RepairRow = {
  id: string
  fault_date: string
  fault_description: string
  repair_completed: boolean
  cost: number | null
}
type AssignmentRow = {
  id: string
  start_date: string
  end_date: string | null
  operator: { full_name: string } | null
  project: { name: string } | null
}

function MachineModal({
  machine,
  canManage,
  onEdit,
  onDelete,
  onClose,
}: {
  machine: Machine | null
  canManage: boolean
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const supabase = useSupabase()

  const maintenance = useQuery<MaintRow[]>(
    () =>
      !machine
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('maintenance_record')
            .select('id,service_date,status,service_type,next_service_due_date')
            .eq('machine_id', machine.id)
            .order('service_date', { ascending: false })
            .limit(5) as unknown as PromiseLike<{ data: MaintRow[] | null; error: unknown }>),
    [machine?.id],
  )
  const repairs = useQuery<RepairRow[]>(
    () =>
      !machine
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('repair_record')
            .select('id,fault_date,fault_description,repair_completed,cost')
            .eq('machine_id', machine.id)
            .order('fault_date', { ascending: false })
            .limit(5) as unknown as PromiseLike<{ data: RepairRow[] | null; error: unknown }>),
    [machine?.id],
  )
  const assignments = useQuery<AssignmentRow[]>(
    () =>
      !machine
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('machine_assignment')
            .select('id,start_date,end_date,operator:operator_id(full_name),project:project_id(name)')
            .eq('machine_id', machine.id)
            .order('start_date', { ascending: false })
            .limit(6) as unknown as PromiseLike<{ data: AssignmentRow[] | null; error: unknown }>),
    [machine?.id],
  )

  return (
    <Modal
      open={!!machine}
      onClose={onClose}
      eyebrow="Machine detail"
      title={machine?.machine_number ?? ''}
      subtitle={machine ? `${machine.machine_type}${machine.model ? ` · ${machine.model}` : ''}` : ''}
      footer={
        machine ? (
          <div className="modal-foot-split">
            <StatusBadge tone={machineStatusTone(machine.current_status)}>
              {titleCase(machine.current_status)}
            </StatusBadge>
            {canManage && (
              <div className="modal-foot-actions">
                <button className="button button-secondary" onClick={onEdit}>
                  <Pencil size={14} />
                  Edit
                </button>
                <button className="button button-danger" onClick={onDelete}>
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            )}
          </div>
        ) : null
      }
    >
      {machine && (
        <>
          <DetailGrid
            items={[
              ['Asset number', machine.asset_number ?? '—'],
              ['Registration', machine.registration_number ?? '—'],
              ['Chassis number', machine.chassis_number ?? '—'],
              ['Engine number', machine.engine_number ?? '—'],
              ['Manufacturer', machine.manufacturer ?? '—'],
              ['Brand / model', [machine.brand, machine.model].filter(Boolean).join(' ') || '—'],
              ['Year', machine.year ?? '—'],
              ['Hour meter', meter(machine.current_hour_meter)],
              ['Service interval', machine.service_interval_hours ? `${machine.service_interval_hours} h` : '—'],
              ['Current operator', machine.operator?.full_name ?? '—'],
              ['Current project', machine.project?.name ?? '—'],
              ['Site', machine.project?.site_location ?? '—'],
              ['Purchase date', shortDate(machine.purchase_date)],
              ['Purchase price', money(machine.purchase_price)],
            ]}
          />

          <ModalSection title="Assignment history" count={assignments.data?.length}>
            <MiniState
              status={assignments.status}
              error={assignments.error}
              isEmpty={(assignments.data ?? []).length === 0}
              emptyText="No assignment history recorded."
            />
            {(assignments.data ?? []).map((a) => (
              <div className="stack-row" key={a.id}>
                <div>
                  <b>{a.operator?.full_name ?? 'Unassigned'}</b>
                  <span>{a.project?.name ?? 'No project'}</span>
                </div>
                <div className="stack-meta">
                  {shortDate(a.start_date)} → {a.end_date ? shortDate(a.end_date) : 'current'}
                </div>
              </div>
            ))}
          </ModalSection>

          <ModalSection title="Recent maintenance" count={maintenance.data?.length}>
            <MiniState
              status={maintenance.status}
              error={maintenance.error}
              isEmpty={(maintenance.data ?? []).length === 0}
              emptyText="No maintenance records."
            />
            {(maintenance.data ?? []).map((m) => (
              <div className="stack-row" key={m.id}>
                <div>
                  <b>{m.service_type ?? 'Service'}</b>
                  <span>{shortDate(m.service_date)}</span>
                </div>
                <StatusBadge tone={machineStatusTone(machine.current_status)}>{titleCase(m.status)}</StatusBadge>
              </div>
            ))}
          </ModalSection>

          <ModalSection title="Recent repairs" count={repairs.data?.length}>
            <MiniState
              status={repairs.status}
              error={repairs.error}
              isEmpty={(repairs.data ?? []).length === 0}
              emptyText="No repair records."
            />
            {(repairs.data ?? []).map((r) => (
              <div className="stack-row" key={r.id}>
                <div>
                  <b>{r.fault_description}</b>
                  <span>{shortDate(r.fault_date)}</span>
                </div>
                <StatusBadge tone={r.repair_completed ? 'green' : 'amber'}>
                  {r.repair_completed ? 'Completed' : 'Open'}
                </StatusBadge>
              </div>
            ))}
          </ModalSection>
        </>
      )}
    </Modal>
  )
}

type OptionRow = { id: string; label: string }

function MachineFormModal({
  open,
  mode,
  machine,
  userId,
  onClose,
  onSaved,
}: {
  open: boolean
  mode: 'add' | 'edit'
  machine: Machine | null
  userId: string
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = useSupabase()
  const [form, setForm] = useState<Record<string, string>>({ current_status: 'available' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const operators = useQuery<OptionRow[]>(
    () =>
      !open
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .from('operator')
            .select('id,full_name')
            .is('deleted_at', null)
            .eq('is_active', true)
            .order('full_name')
            .then((r) => ({
              data: (r.data ?? []).map((o) => ({ id: o.id as string, label: o.full_name as string })),
              error: r.error,
            })),
    [open],
  )
  const projects = useQuery<OptionRow[]>(
    () =>
      !open
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .from('project')
            .select('id,name')
            .order('name')
            .then((r) => ({
              data: (r.data ?? []).map((p) => ({ id: p.id as string, label: p.name as string })),
              error: r.error,
            })),
    [open],
  )

  const str = (v: unknown) => (v == null ? '' : String(v))

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && machine) {
      setForm({
        machine_number: machine.machine_number ?? '',
        asset_number: str(machine.asset_number),
        registration_number: str(machine.registration_number),
        chassis_number: str(machine.chassis_number),
        engine_number: str(machine.engine_number),
        machine_type: machine.machine_type ?? '',
        manufacturer: str(machine.manufacturer),
        brand: str(machine.brand),
        model: str(machine.model),
        year: str(machine.year),
        purchase_date: str(machine.purchase_date),
        purchase_price: str(machine.purchase_price),
        current_hour_meter: str(machine.current_hour_meter),
        service_interval_hours: str(machine.service_interval_hours),
        current_status: machine.current_status ?? 'available',
        assigned_operator_id: str(machine.assigned_operator_id),
        current_project_id: str(machine.current_project_id),
      })
    } else {
      setForm({ current_status: 'available' })
    }
    setFieldErrors({})
    setFormError('')
  }, [open, mode, machine])

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit() {
    const errors: Record<string, string> = {}
    if (!form.machine_number?.trim()) errors.machine_number = 'Machine number is required.'
    if (!form.machine_type?.trim()) errors.machine_type = 'Machine type is required.'
    if (form.year && !/^\d{4}$/.test(form.year.trim())) errors.year = 'Enter a 4-digit year.'
    setFieldErrors(errors)
    setFormError('')
    if (Object.keys(errors).length > 0) return

    const text = (k: string) => (form[k]?.trim() ? form[k].trim() : null)
    const num = (k: string) => (form[k]?.trim() ? Number(form[k]) : null)

    const payload = {
      machine_number: form.machine_number.trim(),
      asset_number: text('asset_number'),
      registration_number: text('registration_number'),
      chassis_number: text('chassis_number'),
      engine_number: text('engine_number'),
      machine_type: form.machine_type.trim(),
      manufacturer: text('manufacturer'),
      brand: text('brand'),
      model: text('model'),
      year: num('year'),
      purchase_date: text('purchase_date'),
      purchase_price: num('purchase_price'),
      current_hour_meter: num('current_hour_meter') ?? 0,
      service_interval_hours: num('service_interval_hours'),
      current_status: form.current_status || 'available',
      assigned_operator_id: text('assigned_operator_id'),
      current_project_id: text('current_project_id'),
    }

    setSaving(true)
    const { error } =
      mode === 'edit' && machine
        ? await supabase.from('machine').update({ ...payload, updated_by: userId }).eq('id', machine.id)
        : await supabase.from('machine').insert({ ...payload, created_by: userId })
    setSaving(false)

    if (error) {
      const code = (error as { code?: string }).code
      if (code === '23505') {
        setFieldErrors({ machine_number: 'A machine with this number already exists.' })
        return
      }
      if (/permission|policy|rls|denied/i.test(error.message ?? '')) {
        setFormError('You do not have permission to save machines.')
        return
      }
      setFormError('Could not save this machine. Please check the values and try again.')
      return
    }
    onSaved()
  }

  const opts = operators.data ?? []
  const projOpts = projects.data ?? []

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      eyebrow="Fleet register"
      title={mode === 'edit' ? 'Edit Machine' : 'Add Machine'}
      subtitle={
        mode === 'edit'
          ? 'Update this machine’s registration details, status and deployment.'
          : 'Register a new machine. Maintenance, repairs and daily hours are recorded in their own modules once it exists.'
      }
      footer={
        <div className="footer-actions">
          <button className="button button-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="button button-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Save Machine'}
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

        <Field
          label="Machine number"
          required
          value={form.machine_number ?? ''}
          onChange={(v) => set('machine_number', v)}
          error={fieldErrors.machine_number}
          placeholder="e.g. GB-EX-006"
        />
        <Field
          label="Machine type"
          required
          value={form.machine_type ?? ''}
          onChange={(v) => set('machine_type', v)}
          error={fieldErrors.machine_type}
          placeholder="e.g. Excavator"
        />
        <Field label="Asset number" value={form.asset_number ?? ''} onChange={(v) => set('asset_number', v)} />
        <Field
          label="Registration number"
          value={form.registration_number ?? ''}
          onChange={(v) => set('registration_number', v)}
        />
        <Field label="Chassis number" value={form.chassis_number ?? ''} onChange={(v) => set('chassis_number', v)} />
        <Field label="Engine number" value={form.engine_number ?? ''} onChange={(v) => set('engine_number', v)} />
        <Field label="Manufacturer" value={form.manufacturer ?? ''} onChange={(v) => set('manufacturer', v)} />
        <Field label="Brand" value={form.brand ?? ''} onChange={(v) => set('brand', v)} />
        <Field label="Model" value={form.model ?? ''} onChange={(v) => set('model', v)} />
        <Field
          label="Year"
          type="number"
          value={form.year ?? ''}
          onChange={(v) => set('year', v)}
          error={fieldErrors.year}
          placeholder="e.g. 2022"
        />
        <Field
          label="Purchase date"
          type="date"
          value={form.purchase_date ?? ''}
          onChange={(v) => set('purchase_date', v)}
        />
        <Field
          label="Purchase price (ZMW)"
          type="number"
          value={form.purchase_price ?? ''}
          onChange={(v) => set('purchase_price', v)}
        />
        <Field
          label="Current hour meter"
          type="number"
          value={form.current_hour_meter ?? ''}
          onChange={(v) => set('current_hour_meter', v)}
          placeholder="0"
        />
        <Field
          label="Service interval (h)"
          type="number"
          value={form.service_interval_hours ?? ''}
          onChange={(v) => set('service_interval_hours', v)}
        />

        <div className="form-field">
          <label htmlFor="m-status">Status</label>
          <select
            id="m-status"
            value={form.current_status ?? 'available'}
            onChange={(e) => set('current_status', e.target.value)}
          >
            {MACHINE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="m-operator">Assigned operator</label>
          <select
            id="m-operator"
            value={form.assigned_operator_id ?? ''}
            onChange={(e) => set('assigned_operator_id', e.target.value)}
          >
            <option value="">— Unassigned —</option>
            {opts.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="m-project">Current project</label>
          <select
            id="m-project"
            value={form.current_project_id ?? ''}
            onChange={(e) => set('current_project_id', e.target.value)}
          >
            <option value="">— None —</option>
            {projOpts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  )
}

function Field({
  label,
  value,
  onChange,
  required,
  type = 'text',
  placeholder,
  error,
  full,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  type?: string
  placeholder?: string
  error?: string
  full?: boolean
}) {
  return (
    <div className={`form-field ${full ? 'full' : ''} ${error ? 'invalid' : ''}`}>
      <label>
        {label}
        {required && <span className="req">*</span>}
      </label>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {error && <span className="field-error">{error}</span>}
    </div>
  )
}
