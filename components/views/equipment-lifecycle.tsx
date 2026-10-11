'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Download, FileText, Pencil, Plus, Trash2 } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { canManageOps, type UserRole } from '@/lib/gbi/roles'
import { shortDate } from '@/lib/gbi/format'
import type { LogoChoice } from '@/lib/gbi/contract-doc'
import {
  buildEquipmentLifecycleDocument,
  LIFECYCLE_DOCUMENTS,
  type EquipmentLifecycleDocumentData,
  type LifecycleDocumentItem,
  type LifecycleDocumentType,
  type LifecycleMeasurement,
  type LifecycleSignatureFields,
} from '@/lib/gbi/equipment-lifecycle-doc'
import { Modal, PageHeading, RowActions, ViewState } from '@/components/shared'

type ProjectOption = {
  id: string
  name: string
  customer: { company_name: string } | null
}

type MachineOption = {
  id: string
  machine_number: string
  machine_type: string
  model: string | null
  current_hour_meter: number | null
}

type MachineReading = {
  currentReading: string
  actualUsed: string
}

type LifecycleForm = LifecycleSignatureFields & {
  projectId: string
  lessee: string
  logo: LogoChoice
  eventDate: string
  measurement: LifecycleMeasurement
  readings: Record<string, MachineReading>
  notes: string
}

type LifecycleHistoryRecord = {
  id: string
  project_id: string
  event_type: LifecycleDocumentType
  event_date: string
  project_name: string
  lessee_name: string
  document_data: EquipmentLifecycleDocumentData
  created_at: string
}

type LifecycleItemInput = {
  machine_id: string
  current_reading: string
  actual_used: string | null
}

const DOCUMENT_TABS: { value: LifecycleDocumentType; label: string }[] = [
  { value: 'entry', label: 'Entry' },
  { value: 'checkpoint', label: 'Checkpoint' },
  { value: 'exit', label: 'Exit' },
]
const PAGE_SIZE = 6

function localDate() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

function initialForm(): LifecycleForm {
  return {
    projectId: '',
    lessee: '',
    logo: 'gbi',
    eventDate: localDate(),
    measurement: 'hours',
    readings: {},
    lessorRepresentativeName: '',
    operatorName: '',
    operatorRole: '',
    lessorWitnessName: '',
    lessorWitnessRole: '',
    lesseeRepresentativeName: '',
    lesseePersonInCharge: '',
    lesseePersonInChargeRole: '',
    lesseeWitnessName: '',
    lesseeWitnessRole: '',
    notes: '',
  }
}

export function EquipmentLifecycleView({ role, userId }: { role: UserRole; userId: string }) {
  const supabase = useSupabase()
  const canCreate = canManageOps(role)
  const [eventType, setEventType] = useState<LifecycleDocumentType>('entry')
  const [form, setForm] = useState<LifecycleForm>(initialForm)
  const [editingRecord, setEditingRecord] = useState<LifecycleHistoryRecord | null>(null)
  const [deletingRecord, setDeletingRecord] = useState<LifecycleHistoryRecord | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [downloadError, setDownloadError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [page, setPage] = useState(1)

  const projects = useQuery<ProjectOption[]>(
    () =>
      supabase
        .from('project')
        .select('id,name,customer:customer_id(company_name)')
        .order('name') as unknown as PromiseLike<{ data: ProjectOption[] | null; error: unknown }>,
    [],
  )

  const machines = useQuery<MachineOption[]>(
    () =>
      !form.projectId
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('machine')
            .select('id,machine_number,machine_type,model,current_hour_meter')
            .eq('current_project_id', form.projectId)
            .is('deleted_at', null)
            .order('machine_number') as unknown as PromiseLike<{
            data: MachineOption[] | null
            error: unknown
          }>),
    [form.projectId],
  )

  const history = useQuery<LifecycleHistoryRecord[]>(
    () =>
      supabase
        .from('equipment_lifecycle_document_record')
        .select('id,project_id,event_type,event_date,project_name,lessee_name,document_data,created_at')
        .order('created_at', { ascending: false }) as unknown as PromiseLike<{
        data: LifecycleHistoryRecord[] | null
        error: unknown
      }>,
    [],
  )

  const selectedProject = (projects.data ?? []).find((project) => project.id === form.projectId) ?? null
  const selectedDocument = LIFECYCLE_DOCUMENTS[eventType]
  const historyRows = history.data ?? []
  const pageCount = Math.max(1, Math.ceil(historyRows.length / PAGE_SIZE))
  const pageStart = (page - 1) * PAGE_SIZE
  const pagedHistory = historyRows.slice(pageStart, pageStart + PAGE_SIZE)
  const documentItems: LifecycleDocumentItem[] = editingRecord
    ? editingRecord.document_data.items
    : (machines.data ?? []).map((machine) => ({
        machineId: machine.id,
        machineNumber: machine.machine_number,
        equipment: machine.machine_type,
        model: machine.model ?? '',
        currentReading: '',
        actualUsed: '',
      }))

  useEffect(() => {
    if (machines.status !== 'ready' || editingRecord) return
    setForm((current) => {
      const readings: Record<string, MachineReading> = {}
      for (const machine of machines.data ?? []) {
        const previous = current.readings[machine.id]
        readings[machine.id] = {
          currentReading:
            previous?.currentReading ??
            (current.measurement === 'hours' && machine.current_hour_meter != null
              ? String(machine.current_hour_meter)
              : ''),
          actualUsed: previous?.actualUsed ?? '',
        }
      }
      return { ...current, readings }
    })
  }, [editingRecord, machines.data, machines.status])

  useEffect(() => {
    setPage(1)
  }, [historyRows.length])

  const canGenerate = useMemo(() => {
    const assigned = documentItems
    return (
      canCreate &&
      !busy &&
      (editingRecord !== null || machines.status === 'ready') &&
      Boolean(editingRecord || selectedProject) &&
      assigned.length > 0 &&
      Boolean(form.eventDate) &&
      assigned.every((machine) => {
        const reading = form.readings[machine.machineId]
        return (
          reading?.currentReading.trim() !== '' &&
          (eventType === 'entry' || reading?.actualUsed.trim() !== '')
        )
      })
    )
  }, [busy, canCreate, documentItems, editingRecord, eventType, form, machines.status, selectedProject])

  function setField<K extends keyof LifecycleForm>(key: K, value: LifecycleForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function setReading(machineId: string, key: keyof MachineReading, value: string) {
    setForm((current) => ({
      ...current,
      readings: {
        ...current.readings,
        [machineId]: { ...current.readings[machineId], [key]: value },
      },
    }))
  }

  function startNewDocument() {
    setError('')
    setDownloadError('')
    setEditingRecord(null)
    setForm(initialForm())
    setModalOpen(true)
  }

  function startEditingDocument(record: LifecycleHistoryRecord) {
    setError('')
    setDownloadError('')
    setEditingRecord(record)
    setEventType(record.event_type)
    setForm({
      projectId: record.document_data.projectId,
      lessee: record.document_data.lessee,
      logo: record.document_data.logo ?? 'gbi',
      eventDate: record.document_data.eventDate,
      measurement: record.document_data.measurement,
      readings: Object.fromEntries(
        record.document_data.items.map((item) => [
          item.machineId,
          { currentReading: item.currentReading, actualUsed: item.actualUsed },
        ]),
      ),
      lessorRepresentativeName: record.document_data.lessorRepresentativeName,
      operatorName: record.document_data.operatorName,
      operatorRole: record.document_data.operatorRole,
      lessorWitnessName: record.document_data.lessorWitnessName,
      lessorWitnessRole: record.document_data.lessorWitnessRole,
      lesseeRepresentativeName: record.document_data.lesseeRepresentativeName,
      lesseePersonInCharge: record.document_data.lesseePersonInCharge,
      lesseePersonInChargeRole: record.document_data.lesseePersonInChargeRole,
      lesseeWitnessName: record.document_data.lesseeWitnessName,
      lesseeWitnessRole: record.document_data.lesseeWitnessRole,
      notes: record.document_data.notes,
    })
    setModalOpen(true)
  }

  async function generate() {
    if (!canGenerate || (!selectedProject && !editingRecord)) return
    setError('')
    setBusy(true)
    try {
      const items: LifecycleDocumentItem[] = documentItems.map((machine) => {
        const reading = form.readings[machine.machineId]
        const currentReading = Number(reading.currentReading)
        const actualUsed = reading.actualUsed.trim() ? Number(reading.actualUsed) : null
        if (!Number.isFinite(currentReading) || currentReading < 0) {
          throw new Error(`Enter a valid non-negative reading for ${machine.machineNumber}.`)
        }
        if (actualUsed !== null && (!Number.isFinite(actualUsed) || actualUsed < 0)) {
          throw new Error(`Enter a valid non-negative actual used value for ${machine.machineNumber}.`)
        }
        return {
          ...machine,
          currentReading: String(currentReading),
          actualUsed: actualUsed === null ? '' : String(actualUsed),
        }
      })

      const projectId = editingRecord?.project_id ?? selectedProject!.id
      const projectName = editingRecord?.project_name ?? selectedProject!.name
      const documentData: EquipmentLifecycleDocumentData = {
        eventType,
        logo: form.logo,
        projectId,
        project: projectName,
        lessee: form.lessee,
        eventDate: form.eventDate,
        measurement: form.measurement,
        items,
        lessorRepresentativeName: form.lessorRepresentativeName,
        operatorName: form.operatorName,
        operatorRole: form.operatorRole,
        lessorWitnessName: form.lessorWitnessName,
        lessorWitnessRole: form.lessorWitnessRole,
        lesseeRepresentativeName: form.lesseeRepresentativeName,
        lesseePersonInCharge: form.lesseePersonInCharge,
        lesseePersonInChargeRole: form.lesseePersonInChargeRole,
        lesseeWitnessName: form.lesseeWitnessName,
        lesseeWitnessRole: form.lesseeWitnessRole,
        notes: form.notes,
      }

      const docx = await buildEquipmentLifecycleDocument(documentData)
      const lifecycleItems: LifecycleItemInput[] = items.map((item) => ({
        machine_id: item.machineId,
        current_reading: item.currentReading,
        actual_used: item.actualUsed || null,
      }))
      const { error: saveError } = editingRecord
        ? await supabase.rpc('update_equipment_lifecycle_document', {
            p_document_id: editingRecord.id,
            p_event_date: form.eventDate,
            p_document_data: documentData,
            p_items: lifecycleItems,
          })
        : await supabase.rpc('create_equipment_lifecycle_document', {
            p_project_id: projectId,
            p_event_type: eventType,
            p_event_date: form.eventDate,
            p_document_data: documentData,
            p_items: lifecycleItems,
          })
      if (saveError) throw new Error(saveError.message)

      downloadBlob(docx, documentData)
      setModalOpen(false)
      setEditingRecord(null)
      history.reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the lifecycle document.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteHistoryRecord() {
    if (!deletingRecord) return
    setDeleteError('')
    setDeleting(true)
    try {
      const { error: removeError } = await supabase.rpc('delete_equipment_lifecycle_document', {
        p_document_id: deletingRecord.id,
      })
      if (removeError) throw new Error(removeError.message)
      setDeletingRecord(null)
      history.reload()
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : 'Could not delete the lifecycle document.')
    } finally {
      setDeleting(false)
    }
  }

  async function downloadHistoryRecord(record: LifecycleHistoryRecord) {
    setDownloadError('')
    try {
      const docx = await buildEquipmentLifecycleDocument(record.document_data)
      downloadBlob(docx, record.document_data)
    } catch (caught) {
      setDownloadError(caught instanceof Error ? caught.message : 'Could not download the saved document.')
    }
  }

  return (
    <div className="page-wrap">
      <PageHeading
        title="Equipment Lifecycle"
        action={
          canCreate ? (
            <button className="button button-primary" onClick={startNewDocument}>
              <Plus size={15} /> New document
            </button>
          ) : undefined
        }
      />

      <div className="seg-tabs lifecycle-tabs" role="tablist" aria-label="Equipment lifecycle document type">
        {DOCUMENT_TABS.map((tab) => (
          <button
            key={tab.value}
            id={`lifecycle-tab-${tab.value}`}
            type="button"
            role="tab"
            aria-selected={eventType === tab.value}
            className={eventType === tab.value ? 'active' : ''}
            onClick={() => {
              setEventType(tab.value)
              setError('')
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {downloadError && <div className="form-error" role="alert"><AlertTriangle size={15} />{downloadError}</div>}
      {!canCreate && (
        <div className="form-info" role="status">
          You can review and download saved lifecycle documents. Only Administrators and Operations Managers can create new documents.
        </div>
      )}

      <div className="panel">
        <ViewState
          status={history.status}
          error={history.error}
          isEmpty={historyRows.length === 0}
          title="equipment lifecycle history"
          emptyText="No equipment lifecycle documents have been generated yet."
          onRetry={history.reload}
        >
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Date</th>
                  <th>Project</th>
                  <th>Lessee</th>
                  <th>Items</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedHistory.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <b>{LIFECYCLE_DOCUMENTS[record.event_type].title}</b>
                      <div className="muted-cell">{LIFECYCLE_DOCUMENTS[record.event_type].chinese}</div>
                    </td>
                    <td>{shortDate(record.event_date)}</td>
                    <td>{record.project_name}</td>
                    <td>{record.lessee_name || 'N/A'}</td>
                    <td>{record.document_data.items.length} machine(s)</td>
                    <td className="col-actions" onClick={(event) => event.stopPropagation()}>
                      <RowActions
                        label={`Actions for ${LIFECYCLE_DOCUMENTS[record.event_type].title}`}
                        actions={[
                          {
                            label: 'Download document',
                            icon: Download,
                            onClick: () => void downloadHistoryRecord(record),
                          },
                          ...(canCreate
                            ? [
                                {
                                  label: 'Edit document',
                                  icon: Pencil,
                                  onClick: () => startEditingDocument(record),
                                },
                                {
                                  label: 'Delete document',
                                  icon: Trash2,
                                  danger: true,
                                  onClick: () => {
                                    setDeleteError('')
                                    setDeletingRecord(record)
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
            {historyRows.length > PAGE_SIZE && (
              <div className="mh-pagination" aria-label="Equipment lifecycle history pagination">
                <span>Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, historyRows.length)} of {historyRows.length}</span>
                <div>
                  <button className="button button-secondary button-small" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
                    Previous
                  </button>
                  <span>Page {page} of {pageCount}</span>
                  <button className="button button-secondary button-small" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount}>
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </ViewState>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => {
          if (!busy) setModalOpen(false)
        }}
        eyebrow={`Equipment lifecycle · ${eventType}`}
        title={`${editingRecord ? 'Edit' : 'New'} ${selectedDocument.title}`}
        subtitle={editingRecord
          ? 'Update the saved document and its linked lifecycle readings.'
          : 'Select a project. Every machine currently assigned to it is included as an item.'}
        footer={
          <div className="modal-foot-actions" style={{ marginLeft: 'auto' }}>
            <button className="button button-secondary" onClick={() => setModalOpen(false)} disabled={busy}>Cancel</button>
            <button className="button button-primary" onClick={() => void generate()} disabled={!canGenerate}>
              <FileText size={14} />
              {busy ? 'Saving document…' : editingRecord ? 'Save changes' : selectedDocument.action}
            </button>
          </div>
        }
      >
        {error && <div className="form-error" role="alert"><AlertTriangle size={15} />{error}</div>}
        <div className="form-grid">
          <label className="field">
            <span>Header logo</span>
            <select value={form.logo} onChange={(event) => setField('logo', event.target.value as LogoChoice)} disabled={busy}>
              <option value="gbi">GBI Group</option>
              <option value="sdlg">SDLG</option>
              <option value="none">No logo</option>
            </select>
          </label>
          <label className="field">
            <span>Event date</span>
            <input type="date" value={form.eventDate} onChange={(event) => setField('eventDate', event.target.value)} disabled={busy} />
          </label>
          <label className="field">
            <span>Meter type</span>
            <select
              value={form.measurement}
              onChange={(event) => {
                const measurement = event.target.value as LifecycleMeasurement
                setForm((current) => ({
                  ...current,
                  measurement,
                  readings: Object.fromEntries(documentItems.map((machine) => {
                    const hourMeter = machines.data?.find((row) => row.id === machine.machineId)?.current_hour_meter
                    return [
                      machine.machineId,
                      {
                        currentReading: measurement === 'hours' && !editingRecord && hourMeter != null
                          ? String(hourMeter)
                          : '',
                        actualUsed: '',
                      },
                    ]
                  })),
                }))
              }}
              disabled={busy}
            >
              <option value="hours">Operating hours</option>
              <option value="mileage">Mileage</option>
            </select>
          </label>
          <label className="field field-full">
            <span>Project</span>
            <select
              value={form.projectId}
              onChange={(event) => {
                const projectId = event.target.value
                const project = (projects.data ?? []).find((row) => row.id === projectId)
                setForm((current) => ({
                  ...current,
                  projectId,
                  lessee: project?.customer?.company_name ?? '',
                  readings: {},
                }))
              }}
              disabled={busy || editingRecord !== null || projects.status !== 'ready'}
            >
              <option value="">Select a project</option>
              {(projects.data ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}{project.customer?.company_name ? ` · ${project.customer.company_name}` : ''}
                </option>
              ))}
            </select>
            {projects.status === 'error' && <span className="field-error">{projects.error}</span>}
          </label>
          <label className="field field-full">
            <span>Lessee</span>
            <input value={form.lessee} onChange={(event) => setField('lessee', event.target.value)} disabled={busy} placeholder="Project customer" />
          </label>
        </div>

        <div className="lifecycle-modal-section">
          <div className="lifecycle-modal-section-head">
            <h3>Document items</h3>
            <span>
              {editingRecord
                ? `${documentItems.length} machine(s)`
                : machines.status === 'ready'
                  ? `${documentItems.length} machine(s)`
                  : ''}
            </span>
          </div>
          {!editingRecord && machines.status === 'loading' && form.projectId && <p className="form-hint">Loading assigned machines…</p>}
          {!editingRecord && machines.status === 'error' && <p className="field-error">{machines.error}</p>}
          {!editingRecord && machines.status === 'ready' && form.projectId && (machines.data ?? []).length === 0 && (
            <p className="form-hint">No active machines are assigned to this project.</p>
          )}
          {documentItems.map((machine, index) => {
            const reading = form.readings[machine.machineId] ?? { currentReading: '', actualUsed: '' }
            return (
              <div className="lifecycle-item-card" key={machine.machineId}>
                <div className="lifecycle-item-heading">
                  <b>Item {index + 1} · {machine.machineNumber}</b>
                  <span>{machine.equipment}{machine.model ? ` · ${machine.model}` : ''}</span>
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span>{eventType === 'entry' ? 'Starting' : 'Current'} {form.measurement}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={reading.currentReading}
                      onChange={(event) => setReading(machine.machineId, 'currentReading', event.target.value)}
                      disabled={busy}
                    />
                  </label>
                  {eventType !== 'entry' && (
                    <label className="field">
                      <span>Actual used {form.measurement}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={reading.actualUsed}
                        onChange={(event) => setReading(machine.machineId, 'actualUsed', event.target.value)}
                        disabled={busy}
                      />
                    </label>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="lifecycle-modal-section">
          <div className="lifecycle-modal-section-head"><h3>Signatories</h3></div>
          <div className="form-grid">
            <label className="field"><span>Lessor representative</span><input value={form.lessorRepresentativeName} onChange={(event) => setField('lessorRepresentativeName', event.target.value)} disabled={busy} /></label>
            <label className="field"><span>Operator name</span><input value={form.operatorName} onChange={(event) => setField('operatorName', event.target.value)} disabled={busy} /></label>
            <label className="field"><span>Operator capacity / role</span><input value={form.operatorRole} onChange={(event) => setField('operatorRole', event.target.value)} disabled={busy} /></label>
            <label className="field"><span>Lessor witness</span><input value={form.lessorWitnessName} onChange={(event) => setField('lessorWitnessName', event.target.value)} disabled={busy} /></label>
            <label className="field"><span>Lessor witness capacity / role</span><input value={form.lessorWitnessRole} onChange={(event) => setField('lessorWitnessRole', event.target.value)} disabled={busy} /></label>
            <label className="field"><span>Lessee representative</span><input value={form.lesseeRepresentativeName} onChange={(event) => setField('lesseeRepresentativeName', event.target.value)} disabled={busy} /></label>
            <label className="field"><span>Person in charge</span><input value={form.lesseePersonInCharge} onChange={(event) => setField('lesseePersonInCharge', event.target.value)} disabled={busy} /></label>
            <label className="field"><span>Person in charge capacity / role</span><input value={form.lesseePersonInChargeRole} onChange={(event) => setField('lesseePersonInChargeRole', event.target.value)} disabled={busy} /></label>
            <label className="field"><span>Lessee witness</span><input value={form.lesseeWitnessName} onChange={(event) => setField('lesseeWitnessName', event.target.value)} disabled={busy} /></label>
            <label className="field"><span>Lessee witness capacity / role</span><input value={form.lesseeWitnessRole} onChange={(event) => setField('lesseeWitnessRole', event.target.value)} disabled={busy} /></label>
            <label className="field field-full"><span>Notes (optional)</span><textarea value={form.notes} onChange={(event) => setField('notes', event.target.value)} disabled={busy} /></label>
          </div>
        </div>
      </Modal>

      <Modal
        open={deletingRecord !== null}
        onClose={() => {
          if (!deleting) setDeletingRecord(null)
        }}
        eyebrow="Delete lifecycle document"
        title="Delete this document?"
        subtitle="This permanently deletes the saved document and its linked lifecycle event records."
        footer={
          <div className="modal-foot-actions" style={{ marginLeft: 'auto' }}>
            <button className="button button-secondary" onClick={() => setDeletingRecord(null)} disabled={deleting}>Cancel</button>
            <button className="button button-danger" onClick={() => void deleteHistoryRecord()} disabled={deleting}>
              <Trash2 size={14} /> {deleting ? 'Deleting…' : 'Delete document'}
            </button>
          </div>
        }
      >
        {deleteError && <div className="form-error" role="alert"><AlertTriangle size={15} />{deleteError}</div>}
        {deletingRecord && (
          <p>
            {LIFECYCLE_DOCUMENTS[deletingRecord.event_type].title} for {deletingRecord.project_name}, dated {shortDate(deletingRecord.event_date)}, will be permanently removed along with its linked lifecycle records.
          </p>
        )}
      </Modal>
    </div>
  )
}

function downloadBlob(blob: Blob, data: EquipmentLifecycleDocumentData) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const safeProject = data.project.replace(/[^a-z0-9-_]+/gi, '-')
  link.download = `GBI-${data.eventType}-${safeProject}-${data.eventDate}.docx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
