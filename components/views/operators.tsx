'use client'

import { useEffect, useMemo, useState } from 'react'
import { Camera, Eye, Pencil, Trash2 } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import {
  OPERATOR_STATUS_LABEL,
  hours as fmtHours,
  operatorStatusTone,
  shortDate,
  titleCase,
  money,
} from '@/lib/gbi/format'
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
  base_salary: number | null
  profile_picture_path: string | null
  is_active: boolean
  status: string
}

type MachineLite = {
  id: string
  machine_number: string
  machine_type: string
  assigned_operator_id: string | null
  current_project_id: string | null
}

const LIST_SELECT =
  'id,full_name,nrc_number,phone_number,address,emergency_contact,employment_date,licence_details,certifications,notes,base_salary,profile_picture_path,is_active,status'

const STATUS_OPTIONS = ['working', 'off', 'standby']

export function OperatorsView({ role, userId }: { role: UserRole; userId: string }) {
  const supabase = useSupabase()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Operator | null>(null)
  const [formTarget, setFormTarget] = useState<Operator | null>(null)
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
        .select('id,machine_number,machine_type,assigned_operator_id,current_project_id')
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
    const { error: assignmentError } = await supabase.rpc('sync_operator_machine_assignments', {
      p_operator_id: deleting.id,
      p_machine_ids: [],
    })
    if (assignmentError) {
      setDeleteBusy(false)
      setDeleteError('Could not close this operator’s active assignments. Please try again.')
      return
    }
    const { error } = await supabase
      .from('operator')
      .update({ deleted_at: new Date().toISOString(), updated_by: userId, status: 'off' })
      .eq('id', deleting.id)

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
        title="Operators"
        description="Machine operators, their credentials and current deployment. Operators do not have login accounts."
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
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const assigned = assignedFor(o.id)
                  return (
                    <tr key={o.id} className="clickable-row" onClick={() => setSelected(o)}>
                      <td>
                        <div className="operator-table-cell">
                          {o.profile_picture_path ? (
                            <img
                              src={
                                supabase.storage
                                  .from('operator-profiles')
                                  .getPublicUrl(o.profile_picture_path).data.publicUrl
                              }
                              alt=""
                            />
                          ) : (
                            <span aria-hidden="true">
                              {o.full_name
                                .split(/\s+/)
                                .slice(0, 2)
                                .map((part) => part[0])
                                .join('')
                                .toUpperCase()}
                            </span>
                          )}
                          <b>{o.full_name}</b>
                        </div>
                      </td>
                      <td>{o.nrc_number ?? 'N/A'}</td>
                      <td>
                        {assigned.length > 0 ? (
                          assigned.map((m) => m.machine_number).join(', ')
                        ) : (
                          'N/A'
                        )}
                      </td>
                      <td>{shortDate(o.employment_date)}</td>
                      <td>
                        <StatusBadge tone={operatorStatusTone(o.status)}>
                          {OPERATOR_STATUS_LABEL[o.status] ?? titleCase(o.status)}
                        </StatusBadge>
                      </td>
                      <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                        <RowActions
                          label={`Actions for ${o.full_name}`}
                          actions={[
                            { label: 'View details', icon: Eye, onClick: () => setSelected(o) },
                            ...(canManage
                              ? [
                                  {
                                    label: 'Edit operator',
                                    icon: Pencil,
                                    onClick: () => {
                                      setFormTarget(o)
                                      setFormMode('edit')
                                    },
                                  },
                                  {
                                    label: 'Delete operator',
                                    icon: Trash2,
                                    danger: true,
                                    onClick: () => setDeleting(o),
                                  },
                                ]
                              : []),
                          ]}
                        />
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
        operator={formMode ? null : selected}
        assigned={selected ? assignedFor(selected.id) : []}
        canManage={canManage}
        onEdit={() => {
          setFormTarget(selected)
          setFormMode('edit')
        }}
        onDelete={() => setDeleting(selected)}
        onClose={() => setSelected(null)}
      />

      {canManage && (
        <OperatorFormModal
          open={formMode !== null}
          mode={formMode ?? 'add'}
          operator={formTarget}
          userId={userId}
          operators={operators.data ?? []}
          machines={machines.data ?? []}
          currentMachineIds={formTarget ? assignedFor(formTarget.id).map((m) => m.id) : []}
          onClose={() => {
            setFormMode(null)
            setFormTarget(null)
          }}
          onSaved={() => {
            setFormMode(null)
            setFormTarget(null)
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
  const assignedLabel = assigned.length > 0 ? assigned.map((m) => m.machine_number).join(', ') : 'N/A'
  const profilePictureUrl = operator?.profile_picture_path
    ? supabase.storage.from('operator-profiles').getPublicUrl(operator.profile_picture_path).data.publicUrl
    : null

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
                  Edit
                </button>
                <button className="button button-danger" onClick={onDelete}>
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
          <div className="operator-profile-summary">
            {profilePictureUrl ? (
              <img src={profilePictureUrl} alt={`${operator.full_name} profile`} />
            ) : (
              <span className="operator-avatar-placeholder" aria-hidden="true">
                {operator.full_name
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join('')
                  .toUpperCase()}
              </span>
            )}
            <div>
              <b>{operator.full_name}</b>
              <span>{operator.phone_number ?? 'Operator profile'}</span>
            </div>
          </div>
          <DetailGrid
            items={[
              ['Status', OPERATOR_STATUS_LABEL[operator.status] ?? titleCase(operator.status)],
              ['Assigned machine', assignedLabel],
              ['Employment', operator.is_active ? 'Active' : 'Inactive'],
              ['Phone', operator.phone_number ?? 'N/A'],
              ['Employment date', shortDate(operator.employment_date)],
              ['Base salary', operator.base_salary == null ? 'Not set' : money(operator.base_salary)],
              ['Address', operator.address ?? 'N/A'],
              ['Emergency contact', operator.emergency_contact ?? 'N/A'],
              ['Licence', operator.licence_details ?? 'N/A'],
              ['Certifications', operator.certifications ?? 'N/A'],
              ['Recent hours logged', fmtHours(totalRecent)],
              ['Notes', operator.notes ?? 'N/A'],
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
                  <b className="mono">{a.machine?.machine_number ?? 'N/A'}</b>
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
                  <b className="mono">{h.machine?.machine_number ?? 'N/A'}</b>
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
  operators,
  machines,
  currentMachineIds,
  onClose,
  onSaved,
}: {
  open: boolean
  mode: 'add' | 'edit'
  operator: Operator | null
  userId: string
  operators: Operator[]
  machines: MachineLite[]
  currentMachineIds: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = useSupabase()
  const [form, setForm] = useState<Record<string, string>>({})
  const [isActive, setIsActive] = useState(true)
  const [status, setStatus] = useState('off')
  const [machineIds, setMachineIds] = useState<string[]>([])
  const [profilePicture, setProfilePicture] = useState<Blob | null>(null)
  const [profilePreview, setProfilePreview] = useState('')
  const [removeProfilePicture, setRemoveProfilePicture] = useState(false)
  const [pictureBusy, setPictureBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const currentMachineKey = currentMachineIds.join('|')

  useEffect(() => {
    return () => {
      if (profilePreview.startsWith('blob:')) URL.revokeObjectURL(profilePreview)
    }
  }, [profilePreview])

  useEffect(() => {
    if (!open) return
    if (mode !== 'add' && operator) {
      setForm({
        full_name: operator.full_name ?? '',
        nrc_number: operator.nrc_number ?? '',
        phone_number: operator.phone_number ?? '',
        address: operator.address ?? '',
        emergency_contact: operator.emergency_contact ?? '',
        employment_date: operator.employment_date ?? '',
        licence_details: operator.licence_details ?? '',
        certifications: operator.certifications ?? '',
        base_salary: operator.base_salary == null ? '' : String(operator.base_salary),
      })
      setIsActive(operator.is_active)
      setStatus(operator.status ?? 'off')
      setMachineIds(currentMachineKey ? currentMachineKey.split('|') : [])
    } else {
      setForm({})
      setIsActive(true)
      setStatus('off')
      setMachineIds([])
    }
    setFieldErrors({})
    setFormError('')
    setProfilePicture(null)
    setRemoveProfilePicture(false)
    setProfilePreview(
      operator?.profile_picture_path
        ? supabase.storage.from('operator-profiles').getPublicUrl(operator.profile_picture_path).data.publicUrl
        : '',
    )
  }, [open, mode, operator, currentMachineKey, supabase])

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function chooseProfilePicture(file: File | undefined) {
    if (!file) return
    setPictureBusy(true)
    setFormError('')
    try {
      const compressed = await compressProfilePicture(file)
      setProfilePicture(compressed)
      setProfilePreview(URL.createObjectURL(compressed))
      setRemoveProfilePicture(false)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not process this profile picture.')
    } finally {
      setPictureBusy(false)
    }
  }

  async function submit() {
    if (pictureBusy) return
    const errors: Record<string, string> = {}
    if (!form.full_name?.trim()) errors.full_name = 'Full name is required.'
    const salary = form.base_salary?.trim()
    if (salary && (!Number.isFinite(Number(salary)) || Number(salary) < 0))
      errors.base_salary = 'Base salary must be a non-negative amount.'
    setFieldErrors(errors)
    setFormError('')
    if (Object.keys(errors).length > 0) return

    const text = (k: string) => (form[k]?.trim() ? form[k].trim() : null)
    const base = {
      full_name: form.full_name?.trim() ?? '',
      nrc_number: text('nrc_number'),
      phone_number: text('phone_number'),
      address: text('address'),
      emergency_contact: text('emergency_contact'),
      employment_date: text('employment_date'),
      licence_details: text('licence_details'),
      certifications: text('certifications'),
      base_salary: text('base_salary') == null ? null : Number(form.base_salary),
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
    } else if (mode === 'edit') {
      const res = await supabase.from('operator').update({ ...base, updated_by: userId }).eq('id', opId)
      error = res.error
    }

    let newProfilePath: string | null = null
    let previousProfilePath: string | null = null
    if (!error && opId && (profilePicture || removeProfilePicture)) {
      if (profilePicture) {
        newProfilePath = `${opId}/${crypto.randomUUID()}.webp`
        const { error: uploadError } = await supabase.storage
          .from('operator-profiles')
          .upload(newProfilePath, profilePicture, {
            cacheControl: '31536000',
            contentType: 'image/webp',
            upsert: false,
          })
        error = uploadError
      }
      if (!error) {
        const { error: pictureUpdateError } = await supabase
          .from('operator')
          .update({ profile_picture_path: removeProfilePicture ? null : newProfilePath, updated_by: userId })
          .eq('id', opId)
        error = pictureUpdateError
        if (error && newProfilePath) {
          const { error: cleanupError } = await supabase.storage.from('operator-profiles').remove([newProfilePath])
          if (cleanupError) {
            setFormError('Could not save the profile picture, and its uploaded file could not be removed.')
            setSaving(false)
            return
          }
        } else if (!error) {
          previousProfilePath = operator?.profile_picture_path ?? null
        }
      }
    }

    if (!error && opId) {
      const { error: assignmentError } = await supabase.rpc('sync_operator_machine_assignments', {
        p_operator_id: opId,
        p_machine_ids: isActive ? machineIds : [],
      })
      error = assignmentError
    }
    if (previousProfilePath && previousProfilePath !== newProfilePath) {
      const { error: removeError } = await supabase.storage
        .from('operator-profiles')
        .remove([previousProfilePath])
      if (removeError) {
        setFormError(
          error
            ? 'The operator could not be fully saved, and the previous profile picture could not be removed.'
            : 'The operator was saved, but the previous profile picture could not be removed.',
        )
        setSaving(false)
        return
      }
    }

    if (error) {
      setSaving(false)
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
    setSaving(false)
    onSaved()
  }

  const machineOptions = machines

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      eyebrow="Operators"
      title={mode === 'edit' ? 'Edit Operator' : 'Add Operator'}
      subtitle={
        mode === 'edit'
          ? 'Update this operator’s details, work status and machine assignment.'
            : 'Register a new operator and optionally assign machines.'
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
          <div className="form-error">{formError}</div>
        )}

        <>
            <div className="operator-photo-field full">
              <div className="operator-photo-preview">
                {profilePreview ? <img src={profilePreview} alt="Operator profile preview" /> : <Camera size={22} />}
              </div>
              <div>
                <b>Profile picture</b>
                <span>Compressed to WebP before upload to reduce storage usage.</span>
                <div className="operator-photo-actions">
                  <label className="button button-secondary button-sm">
                    {pictureBusy ? 'Compressing…' : profilePreview ? 'Change picture' : 'Upload picture'}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      disabled={pictureBusy || saving}
                      onChange={(event) => {
                        void chooseProfilePicture(event.target.files?.[0])
                        event.currentTarget.value = ''
                      }}
                    />
                  </label>
                  {profilePreview && (
                    <button
                      type="button"
                      className="button button-secondary button-sm"
                      onClick={() => {
                        setProfilePicture(null)
                        setProfilePreview('')
                        setRemoveProfilePicture(true)
                      }}
                      disabled={saving || pictureBusy}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
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
            <OField
              label="Base salary / month (ZMW)"
              type="number"
              value={form.base_salary ?? ''}
              onChange={(v) => set('base_salary', v)}
              error={fieldErrors.base_salary}
              placeholder="Monthly basic salary"
              min="0"
              step="0.01"
              helper="Used to calculate overtime hourly wage as monthly Base Salary ÷ 208."
            />

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
        </>

        <div className="form-field full">
          <label>Assigned machines</label>
          {machineOptions.length === 0 ? (
            <span className="field-hint">No available machines to assign.</span>
          ) : (
            <>
              {machineIds.map((machineId, index) => (
                <select
                  key={`${machineId}-${index}`}
                  aria-label={`Assigned machine ${index + 1}`}
                  value={machineId}
                  onChange={(event) => {
                    const selectedId = event.target.value
                    setMachineIds((current) =>
                      current
                        .map((id, currentIndex) => (currentIndex === index ? selectedId : id))
                        .filter(Boolean),
                    )
                  }}
                  disabled={!isActive}
                  style={{ marginBottom: 8 }}
                >
                  <option value="">Unassigned</option>
                  {machineOptions
                    .filter((machine) => machine.id === machineId || !machineIds.includes(machine.id))
                    .map((m) => {
                      const assignedOperator = operators.find((candidate) => candidate.id === m.assigned_operator_id)
                      const reassignment =
                        m.assigned_operator_id && m.assigned_operator_id !== operator?.id
                          ? ` (currently assigned to ${assignedOperator?.full_name ?? 'another operator'})`
                          : ''
                      return (
                        <option key={m.id} value={m.id}>
                          {m.machine_number} · {m.machine_type}{reassignment}
                        </option>
                      )
                    })}
                </select>
              ))}
              <select
                aria-label="Add a machine assignment"
                value=""
                onChange={(event) => {
                  if (event.target.value) setMachineIds((current) => [...current, event.target.value])
                }}
                disabled={!isActive}
              >
                <option value="">Select a machine to assign…</option>
                {machineOptions
                  .filter((machine) => !machineIds.includes(machine.id))
                  .map((m) => {
                    const assignedOperator = operators.find((candidate) => candidate.id === m.assigned_operator_id)
                    const reassignment =
                      m.assigned_operator_id && m.assigned_operator_id !== operator?.id
                        ? ` (currently assigned to ${assignedOperator?.full_name ?? 'another operator'})`
                        : ''
                    return (
                      <option key={m.id} value={m.id}>
                        {m.machine_number} · {m.machine_type}{reassignment}
                      </option>
                    )
                  })}
              </select>
            </>
          )}
          {!isActive && <span className="field-hint">Inactive operators are unassigned when saved.</span>}
        </div>

        <>
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
        </>
      </div>
    </Modal>
  )
}

async function compressProfilePicture(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file for the profile picture.')
  const bitmap = await createImageBitmap(file)
  try {
    for (const [maxDimension, quality] of [[512, 0.72], [384, 0.58]] as const) {
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Your browser could not process this image.')
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const compressed = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', quality),
      )
      if (!compressed || compressed.type !== 'image/webp')
        throw new Error('Your browser could not compress this image to WebP.')
      if (compressed.size <= 512 * 1024) return compressed
    }
    throw new Error('This image is too large after compression. Choose a smaller image.')
  } finally {
    bitmap.close()
  }
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
  min,
  step,
  helper,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  type?: string
  placeholder?: string
  error?: string
  full?: boolean
  min?: string
  step?: string
  helper?: string
}) {
  return (
    <div className={`form-field ${full ? 'full' : ''} ${error ? 'invalid' : ''}`}>
      <label>
        {label}
        {required && <span className="req">*</span>}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        min={min}
        step={step}
        onChange={(e) => onChange(e.target.value)}
      />
      {helper && <span className="field-hint">{helper}</span>}
      {error && <span className="field-error">{error}</span>}
    </div>
  )
}
