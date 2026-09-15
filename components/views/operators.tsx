'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Pencil, Plus, Trash2, Truck } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import {
  OPERATOR_STATUS_LABEL,
  hours as fmtHours,
  operatorStatusTone,
  shortDate,
  titleCase,
} from '@/lib/gbi/format'
import { canManageOps, type UserRole } from '@/lib/gbi/roles'
import {
  ConfirmDialog,
  DetailGrid,
  MiniState,
  Modal,
  ModalSection,
  PageHeading,
  StatusBadge,
  ViewState,
} from '@/components/shared'

type Operator = {
  id: string
  full_name: string
  nrc_number: string | null
  phone_number: string | null
  address: string | null
  emergency_contact: string | null
  employment_date: string | null
  licence_details: string | null
  certifications: string | null
  notes: string | null
  is_active: boolean
  status: string
}

type MachineLite = {
  id: string
  machine_number: string
  machine_type: string
  assigned_operator_id: string | null
}

const LIST_SELECT =
  'id,full_name,nrc_number,phone_number,address,emergency_contact,employment_date,licence_details,certifications,notes,is_active,status'

const STATUS_OPTIONS = ['working', 'off', 'standby']

const today = () => new Date().toISOString().slice(0, 10)

export function OperatorsView({ role, userId }: { role: UserRole; userId: string }) {
  const supabase = useSupabase()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Operator | null>(null)
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null)
  const [deleting, setDeleting] = useState<Operator | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const canManage = canManageOps(role)

  const operators = useQuery<Operator[]>(
    () =>
      supabase
        .from('operator')
        .select(LIST_SELECT)
        .is('deleted_at', null)
        .order('full_name') as unknown as PromiseLike<{ data: Operator[] | null; error: unknown }>,
    [],
  )

  const machines = useQuery<MachineLite[]>(
    () =>
      supabase
        .from('machine')
        .select('id,machine_number,machine_type,assigned_operator_id')
        .is('deleted_at', null)
        .order('machine_number') as unknown as PromiseLike<{ data: MachineLite[] | null; error: unknown }>,
    [],
  )

  const machineByOperator = useMemo(() => {
    const map = new Map<string, MachineLite[]>()
    for (const m of machines.data ?? []) {
      if (!m.assigned_operator_id) continue
      const arr = map.get(m.assigned_operator_id) ?? []
      arr.push(m)
      map.set(m.assigned_operator_id, arr)
    }
    return map
  }, [machines.data])

  const rows = useMemo(() => {
    const all = operators.data ?? []
    if (!query.trim()) return all
    const q = query.toLowerCase()
    return all.filter(
      (o) => o.full_name.toLowerCase().includes(q) || (o.nrc_number ?? '').toLowerCase().includes(q),
    )
  }, [operators.data, query])

  function reloadAll() {
    operators.reload()
    machines.reload()
  }

  function assignedFor(operatorId: string): MachineLite[] {
    return machineByOperator.get(operatorId) ?? []
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    setDeleteError('')
    const { error } = await supabase
      .from('operator')
      .update({ deleted_at: new Date().toISOString(), updated_by: userId, status: 'off' })
      .eq('id', deleting.id)

    if (!error) {
      // Release any machine held by this operator and close open assignment history.
      await supabase
        .from('machine')
        .update({ assigned_operator_id: null, updated_by: userId })
        .eq('assigned_operator_id', deleting.id)
      await supabase
        .from('machine_assignment')
        .update({ end_date: today() })
        .eq('operator_id', deleting.id)
        .is('end_date', null)
    }

    setDeleteBusy(false)
    if (error) {
      setDeleteError(
        /permission|policy|rls|denied/i.test((error as { message?: string }).message ?? '')
          ? 'You do not have permission to remove operators.'
          : 'Could not remove this operator. Please try again.',
      )
      return
    }
    setDeleting(null)
    setSelected(null)
    reloadAll()
  }

  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="People"
        title="Operators"
        description="Machine operators, their credentials and current deployment. Operators do not have login accounts."
        action={
          canManage ? (
            <button
              className="button button-primary"
              onClick={() => {
                setSelected(null)
                setFormMode('add')
              }}
            >
              <Plus size={15} />
              Add Operator
            </button>
          ) : undefined
        }
      />

      <div className="filter-row">
        <div className="toolbar-search">
          <input
            placeholder="Search by name or NRC…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="panel">
        <ViewState
          status={operators.status}
          error={operators.error}
          isEmpty={rows.length === 0}
          title="operators"
          emptyText={query ? 'No operators match your search.' : 'No operators registered yet.'}
          onRetry={operators.reload}
        >
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Operator</th>
                  <th>NRC</th>
                  <th>Assigned machine</th>
                  <th>Employed</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const assigned = assignedFor(o.id)
                  return (
                    <tr key={o.id} className="clickable-row" onClick={() => setSelected(o)}>
                      <td>
                        <div className="machine-cell">
                          <span className="operator-avatar">
                            {o.full_name
                              .split(' ')
                              .slice(0, 2)
                              .map((p) => p[0])
                              .join('')
                              .toUpperCase()}
                          </span>
                          <b>{o.full_name}</b>
                        </div>
                      </td>
                      <td>{o.nrc_number ?? '—'}</td>
                      <td>
                        {assigned.length > 0 ? (
                          <span className="assign-chip">
                            <Truck size={12} />
                            {assigned.map((m) => m.machine_number).join(', ')}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{shortDate(o.employment_date)}</td>
                      <td>
                        <StatusBadge tone={operatorStatusTone(o.status)}>
                          {OPERATOR_STATUS_LABEL[o.status] ?? titleCase(o.status)}
                        </StatusBadge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </ViewState>
      </div>

      <OperatorModal
        operator={selected}
        assigned={selected ? assignedFor(selected.id) : []}
        canManage={canManage}
        onEdit={() => setFormMode('edit')}
        onDelete={() => setDeleting(selected)}
        onClose={() => setSelected(null)}
      />

      {canManage && (
        <OperatorFormModal
          open={formMode !== null}
          mode={formMode ?? 'add'}
          operator={formMode === 'edit' ? selected : null}
          userId={userId}
          machines={machines.data ?? []}
          currentMachineId={formMode === 'edit' && selected ? assignedFor(selected.id)[0]?.id ?? '' : ''}
          onClose={() => setFormMode(null)}
          onSaved={() => {
            setFormMode(null)
            setSelected(null)
            reloadAll()
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Remove operator?"
        confirmLabel="Remove operator"
        busy={deleteBusy}
        onCancel={() => {
          if (deleteBusy) return
          setDeleting(null)
          setDeleteError('')
        }}
        onConfirm={confirmDelete}
        message={
          <>
            <b>{deleting?.full_name}</b> will be archived (soft delete) and unassigned from any machine.
            Their daily hours, overtime and assignment history are preserved and can be restored in the
            database.
            {deleteError && <span className="confirm-error">{deleteError}</span>}
          </>
        }
      />
    </div>
  )
}

type AssignmentRow = {
  id: string
  start_date: string
  end_date: string | null
  machine: { machine_number: string; machine_type: string } | null
  project: { name: string } | null
}
type HourRow = {
  id: string
  entry_date: string
  total_hours: number | null
  machine: { machine_number: string } | null
}

function OperatorModal({
  operator,
  assigned,
  canManage,
  onEdit,
  onDelete,
  onClose,
}: {
  operator: Operator | null
  assigned: MachineLite[]
  canManage: boolean
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const supabase = useSupabase()

  const assignments = useQuery<AssignmentRow[]>(
    () =>
      !operator
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('machine_assignment')
            .select('id,start_date,end_date,machine:machine_id(machine_number,machine_type),project:project_id(name)')
            .eq('operator_id', operator.id)
            .order('start_date', { ascending: false })
            .limit(8) as unknown as PromiseLike<{ data: AssignmentRow[] | null; error: unknown }>),
    [operator?.id],
  )

  const recentHours = useQuery<HourRow[]>(
    () =>
      !operator
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('daily_hour_entry')
            .select('id,entry_date,total_hours,machine:machine_id(machine_number)')
            .eq('operator_id', operator.id)
            .order('entry_date', { ascending: false })
            .limit(10) as unknown as PromiseLike<{ data: HourRow[] | null; error: unknown }>),
    [operator?.id],
  )

  const totalRecent = (recentHours.data ?? []).reduce((s, h) => s + Number(h.total_hours ?? 0), 0)
  const assignedLabel = assigned.length > 0 ? assigned.map((m) => m.machine_number).join(', ') : '—'

  return (
    <Modal
      open={!!operator}
      onClose={onClose}
      eyebrow="Operator profile"
      title={operator?.full_name ?? ''}
      subtitle={operator?.nrc_number ? `NRC ${operator.nrc_number}` : undefined}
      footer={
        operator ? (
          <div className="modal-foot-split">
            <StatusBadge tone={operatorStatusTone(operator.status)}>
              {OPERATOR_STATUS_LABEL[operator.status] ?? titleCase(operator.status)}
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
      {operator && (
        <>
          <DetailGrid
            items={[
              ['Status', OPERATOR_STATUS_LABEL[operator.status] ?? titleCase(operator.status)],
              ['Assigned machine', assignedLabel],
              ['Employment', operator.is_active ? 'Active' : 'Inactive'],
              ['Phone', operator.phone_number ?? '—'],
              ['Employment date', shortDate(operator.employment_date)],
              ['Address', operator.address ?? '—'],
              ['Emergency contact', operator.emergency_contact ?? '—'],
              ['Licence', operator.licence_details ?? '—'],
              ['Certifications', operator.certifications ?? '—'],
              ['Recent hours logged', fmtHours(totalRecent)],
              ['Notes', operator.notes ?? '—'],
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
                  <b>{a.machine?.machine_number ?? '—'}</b>
                  <span>{a.project?.name ?? 'No project'}</span>
                </div>
                <div className="stack-meta">
                  {shortDate(a.start_date)} → {a.end_date ? shortDate(a.end_date) : 'current'}
                </div>
              </div>
            ))}
          </ModalSection>

          <ModalSection title="Recent working hours" count={recentHours.data?.length}>
            <MiniState
              status={recentHours.status}
              error={recentHours.error}
              isEmpty={(recentHours.data ?? []).length === 0}
              emptyText="No hours logged for this operator."
            />
            {(recentHours.data ?? []).map((h) => (
              <div className="stack-row" key={h.id}>
                <div>
                  <b>{h.machine?.machine_number ?? '—'}</b>
                  <span>{shortDate(h.entry_date)}</span>
                </div>
                <div className="stack-meta">{fmtHours(h.total_hours)}</div>
              </div>
            ))}
          </ModalSection>
        </>
      )}
    </Modal>
  )
}

function OperatorFormModal({
  open,
  mode,
  operator,
  userId,
  machines,
  currentMachineId,
  onClose,
  onSaved,
}: {
  open: boolean
  mode: 'add' | 'edit'
  operator: Operator | null
  userId: string
  machines: MachineLite[]
  currentMachineId: string
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = useSupabase()
  const [form, setForm] = useState<Record<string, string>>({})
  const [isActive, setIsActive] = useState(true)
  const [status, setStatus] = useState('off')
  const [machineId, setMachineId] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && operator) {
      setForm({
        full_name: operator.full_name ?? '',
        nrc_number: operator.nrc_number ?? '',
        phone_number: operator.phone_number ?? '',
        address: operator.address ?? '',
        emergency_contact: operator.emergency_contact ?? '',
        employment_date: operator.employment_date ?? '',
        licence_details: operator.licence_details ?? '',
        certifications: operator.certifications ?? '',
      })
      setIsActive(operator.is_active)
      setStatus(operator.status ?? 'off')
      setMachineId(currentMachineId)
    } else {
      setForm({})
      setIsActive(true)
      setStatus('off')
      setMachineId('')
    }
    setFieldErrors({})
    setFormError('')
  }, [open, mode, operator, currentMachineId])

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  // Reassign machine only when the selection changed. Releases whatever the
  // operator currently holds, then attaches the new machine and logs history.
  async function applyMachine(opId: string): Promise<unknown> {
    if (machineId === currentMachineId) return null
    const release = await supabase
      .from('machine')
      .update({ assigned_operator_id: null, updated_by: userId })
      .eq('assigned_operator_id', opId)
    if (release.error) return release.error
    await supabase
      .from('machine_assignment')
      .update({ end_date: today() })
      .eq('operator_id', opId)
      .is('end_date', null)

    if (machineId) {
      const attach = await supabase
        .from('machine')
        .update({ assigned_operator_id: opId, updated_by: userId })
        .eq('id', machineId)
      if (attach.error) return attach.error
      await supabase
        .from('machine_assignment')
        .insert({ machine_id: machineId, operator_id: opId, start_date: today(), created_by: userId })
    }
    return null
  }

  async function submit() {
    const errors: Record<string, string> = {}
    if (!form.full_name?.trim()) errors.full_name = 'Full name is required.'
    setFieldErrors(errors)
    setFormError('')
    if (Object.keys(errors).length > 0) return

    const text = (k: string) => (form[k]?.trim() ? form[k].trim() : null)
    const base = {
      full_name: form.full_name.trim(),
      nrc_number: text('nrc_number'),
      phone_number: text('phone_number'),
      address: text('address'),
      emergency_contact: text('emergency_contact'),
      employment_date: text('employment_date'),
      licence_details: text('licence_details'),
      certifications: text('certifications'),
      is_active: isActive,
      status,
    }

    setSaving(true)
    let opId = operator?.id ?? ''
    let error: unknown = null
    if (mode === 'add') {
      const res = await supabase.from('operator').insert({ ...base, created_by: userId }).select('id').single()
      error = res.error
      opId = (res.data?.id as string) ?? ''
    } else {
      const res = await supabase.from('operator').update({ ...base, updated_by: userId }).eq('id', opId)
      error = res.error
    }

    if (!error && opId) {
      const machineErr = await applyMachine(opId)
      if (machineErr) error = machineErr
    }
    setSaving(false)

    if (error) {
      const code = (error as { code?: string }).code
      if (code === '23505') {
        setFieldErrors({ nrc_number: 'An operator with this NRC number already exists.' })
        return
      }
      if (/permission|policy|rls|denied/i.test((error as { message?: string }).message ?? '')) {
        setFormError('You do not have permission to save operators.')
        return
      }
      setFormError('Could not save this operator. Please check the values and try again.')
      return
    }
    onSaved()
  }

  // Machines that can be picked: unassigned, or already held by this operator.
  const machineOptions = machines.filter(
    (m) => !m.assigned_operator_id || m.assigned_operator_id === operator?.id,
  )

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      eyebrow="Operators"
      title={mode === 'edit' ? 'Edit Operator' : 'Add Operator'}
      subtitle={
        mode === 'edit'
          ? 'Update this operator’s details, work status and machine assignment.'
          : 'Register a new operator and optionally assign a machine.'
      }
      footer={
        <div className="footer-actions">
          <button className="button button-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="button button-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Save Operator'}
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

        <OField
          label="Full name"
          required
          full
          value={form.full_name ?? ''}
          onChange={(v) => set('full_name', v)}
          error={fieldErrors.full_name}
          placeholder="e.g. Chanda Mwale"
        />
        <OField
          label="NRC number"
          value={form.nrc_number ?? ''}
          onChange={(v) => set('nrc_number', v)}
          error={fieldErrors.nrc_number}
          placeholder="e.g. 123456/78/9"
        />
        <OField label="Phone number" value={form.phone_number ?? ''} onChange={(v) => set('phone_number', v)} />

        <div className="form-field">
          <label htmlFor="op-status">Status</label>
          <select id="op-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {OPERATOR_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="op-machine">Assigned machine</label>
          <select id="op-machine" value={machineId} onChange={(e) => setMachineId(e.target.value)}>
            <option value="">— Unassigned —</option>
            {machineOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.machine_number} · {m.machine_type}
              </option>
            ))}
          </select>
        </div>

        <OField
          label="Employment date"
          type="date"
          value={form.employment_date ?? ''}
          onChange={(v) => set('employment_date', v)}
        />
        <OField
          label="Emergency contact"
          value={form.emergency_contact ?? ''}
          onChange={(v) => set('emergency_contact', v)}
        />
        <OField label="Address" full value={form.address ?? ''} onChange={(v) => set('address', v)} />
        <OField
          label="Licence details"
          full
          value={form.licence_details ?? ''}
          onChange={(v) => set('licence_details', v)}
          placeholder="Licence class, number, expiry…"
        />
        <OField
          label="Certifications"
          full
          value={form.certifications ?? ''}
          onChange={(v) => set('certifications', v)}
          placeholder="Safety cards, machine-specific tickets…"
        />

        <div className="form-field checkbox-field full">
          <input
            id="op-active"
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <label htmlFor="op-active">Active (currently employed)</label>
        </div>
      </div>
    </Modal>
  )
}

function OField({
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
