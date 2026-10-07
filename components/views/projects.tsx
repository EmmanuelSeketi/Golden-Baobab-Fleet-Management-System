'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Building2, Eye, MapPin, Pencil, Plus } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { hours as fmtHours, shortDate, titleCase } from '@/lib/gbi/format'
import { canAccess, canManageProjects, type UserRole } from '@/lib/gbi/roles'
import {
  DetailGrid,
  MiniState,
  Modal,
  ModalSection,
  PageHeading,
  RowActions,
  StatusBadge,
  ViewState,
} from '@/components/shared'

type Project = {
  id: string
  name: string
  customer_id: string | null
  site_location: string | null
  deployment_start: string | null
  deployment_end: string | null
  status: 'not_started' | 'ongoing' | 'completed'
  created_at: string
  customer: { company_name: string } | null
}

type CustomerPick = { id: string; company_name: string }

const SELECT =
  'id,name,customer_id,site_location,deployment_start,deployment_end,status,created_at,customer:customer_id(company_name)'
const SELECT_WITHOUT_STATUS =
  'id,name,customer_id,site_location,deployment_start,deployment_end,created_at,customer:customer_id(company_name)'

function projectStatusLabel(status: Project['status']): string {
  return status === 'not_started' ? 'Not started' : status === 'ongoing' ? 'Ongoing' : 'Completed'
}

function statusFromDates(project: Pick<Project, 'deployment_start' | 'deployment_end'>): Project['status'] {
  const today = new Date().toISOString().slice(0, 10)
  if (project.deployment_end && project.deployment_end < today) return 'completed'
  if (project.deployment_start && project.deployment_start <= today) return 'ongoing'
  return 'not_started'
}

function currentProjectStatus(project: Project): Project['status'] {
  if (project.deployment_end && project.deployment_end < new Date().toISOString().slice(0, 10)) {
    return 'completed'
  }
  return project.status
}

function isMissingStatusColumn(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('message' in error)) return false
  const message = String(error.message)
  return /status/i.test(message) && /(column|schema cache|does not exist|could not find)/i.test(message)
}

export function ProjectsView({ role, userId }: { role: UserRole; userId: string }) {
  const supabase = useSupabase()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Project | null>(null)
  const [form, setForm] = useState<{ mode: 'add' | 'edit'; row: Project | null } | null>(null)
  const [statusColumnAvailable, setStatusColumnAvailable] = useState<boolean | null>(null)
  const canManage = canManageProjects(role)
  const canViewCustomers = canAccess('Customers & Contracts', role)

  const projects = useQuery<Project[]>(
    async () => {
      const select = canViewCustomers ? SELECT : SELECT.replace(',customer:customer_id(company_name)', '')
      const result = await supabase
        .from('project')
        .select(select)
        .order('name') as unknown as { data: Project[] | null; error: unknown }

      if (!result.error) {
        setStatusColumnAvailable(true)
        return {
          ...result,
          data: !canViewCustomers && result.data
            ? result.data.map((project) => ({ ...project, customer: null }))
            : result.data,
        }
      }
      if (!isMissingStatusColumn(result.error)) {
        setStatusColumnAvailable(null)
        return result
      }

      const fallbackSelect = canViewCustomers
        ? SELECT_WITHOUT_STATUS
        : SELECT_WITHOUT_STATUS.replace(',customer:customer_id(company_name)', '')
      const fallback = await supabase
        .from('project')
        .select(fallbackSelect)
        .order('name') as unknown as { data: Omit<Project, 'status'>[] | null; error: unknown }
      if (fallback.error || !fallback.data) {
        setStatusColumnAvailable(null)
        return { data: null, error: fallback.error ?? new Error('The project query returned no data.') }
      }

      setStatusColumnAvailable(false)
      return {
        data: fallback.data.map((project) => ({
          ...project,
          customer: canViewCustomers ? project.customer : null,
          status: statusFromDates(project),
        })),
        error: null,
      }
    },
    [],
  )

  const rows = useMemo(() => {
    const all = projects.data ?? []
    if (!query.trim()) return all
    const q = query.toLowerCase()
    return all.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.site_location ?? '').toLowerCase().includes(q) ||
        (p.customer?.company_name ?? '').toLowerCase().includes(q),
    )
  }, [projects.data, query])

  return (
    <div className="page-wrap">
      <PageHeading
        title="Projects & Sites"
        description="Operational sites that machines and daily working hours are recorded against, optionally linked to a customer for billing."
        action={
          canManage ? (
            <button className="button button-primary" onClick={() => setForm({ mode: 'add', row: null })}>
              <Plus size={15} />
              New project
            </button>
          ) : undefined
        }
      />

      <div className="filter-row">
        <div className="toolbar-search">
          <input
            placeholder="Search project, site or customer…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="panel">
        <ViewState
          status={projects.status}
          error={projects.error}
          isEmpty={rows.length === 0}
          title="projects"
          emptyText={query ? 'No projects match your search.' : 'No projects recorded yet.'}
          onRetry={projects.reload}
        >
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Customer</th>
                  <th>Site location</th>
                  <th>Deployment</th>
                  <th>Status</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="clickable-row" onClick={() => setSelected(p)}>
                    <td>
                      <b>{p.name}</b>
                    </td>
                    <td>{p.customer?.company_name ?? 'N/A'}</td>
                    <td>{p.site_location ?? 'N/A'}</td>
                    <td>
                      {p.deployment_start ? shortDate(p.deployment_start) : 'N/A'} →{' '}
                      {p.deployment_end ? shortDate(p.deployment_end) : 'open'}
                    </td>
                    <td>
                      <StatusBadge tone={currentProjectStatus(p) === 'completed' ? 'green' : currentProjectStatus(p) === 'ongoing' ? 'blue' : 'neutral'}>
                        {projectStatusLabel(currentProjectStatus(p))}
                      </StatusBadge>
                    </td>
                    <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                      <RowActions
                        label={`Actions for ${p.name}`}
                        actions={[
                          { label: 'View details', icon: Eye, onClick: () => setSelected(p) },
                          ...(canManage
                            ? [
                                {
                                  label: 'Edit project',
                                  icon: Pencil,
                                  onClick: () => setForm({ mode: 'edit', row: p }),
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

      <ProjectDetailModal
        project={selected}
        canManage={canManage}
        canViewContracts={canAccess('Customers & Contracts', role)}
        onEdit={() => selected && setForm({ mode: 'edit', row: selected })}
        onClose={() => setSelected(null)}
      />

      {canManage && (
        <ProjectFormModal
          state={form}
          userId={userId}
          statusColumnAvailable={statusColumnAvailable === true}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            setSelected(null)
            projects.reload()
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail modal : project facts plus its recent daily-hour activity
// ---------------------------------------------------------------------------

type RecentEntry = {
  id: string
  entry_date: string
  total_hours: number | null
  machine: { machine_number: string } | null
}

type ProjectContract = {
  id: string
  effective_from: string
  effective_to: string | null
  contract: { contract_number: string; status: string } | null
}

function ProjectDetailModal({
  project,
  canManage,
  canViewContracts,
  onEdit,
  onClose,
}: {
  project: Project | null
  canManage: boolean
  canViewContracts: boolean
  onEdit: () => void
  onClose: () => void
}) {
  const supabase = useSupabase()

  const recent = useQuery<RecentEntry[]>(
    () =>
      !project
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('daily_hour_entry')
            .select('id,entry_date,total_hours,machine:machine_id(machine_number)')
            .eq('project_id', project.id)
            .order('entry_date', { ascending: false })
            .limit(8) as unknown as PromiseLike<{ data: RecentEntry[] | null; error: unknown }>),
    [project?.id],
  )
  const contracts = useQuery<ProjectContract[]>(
    () =>
      !project || !canViewContracts
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('project_contract')
            .select('id,effective_from,effective_to,contract:contract_id(contract_number,status)')
            .eq('project_id', project.id)
            .order('effective_from', { ascending: false }) as unknown as PromiseLike<{
            data: ProjectContract[] | null
            error: unknown
          }>),
    [project?.id, canViewContracts],
  )

  return (
    <Modal
      open={!!project}
      onClose={onClose}
      eyebrow="Project detail"
      title={project?.name ?? ''}
      subtitle={project?.customer?.company_name ?? 'No linked customer'}
      footer={
        project && canManage ? (
          <div className="footer-actions">
            <button className="button button-secondary" onClick={onEdit}>
              <Pencil size={14} />
              Edit project
            </button>
          </div>
        ) : null
      }
    >
      {project && (
        <>
          <DetailGrid
            items={[
              ['Customer', project.customer?.company_name ?? 'Not linked'],
              ['Site location', project.site_location ?? 'N/A'],
              ['Deployment start', project.deployment_start ? shortDate(project.deployment_start) : 'N/A'],
              ['Deployment end', project.deployment_end ? shortDate(project.deployment_end) : 'Open-ended'],
              ['Status', projectStatusLabel(currentProjectStatus(project))],
              ['Created', shortDate(project.created_at)],
            ]}
          />

          <ModalSection title="Recent daily hours" count={recent.data?.length}>
            <MiniState
              status={recent.status}
              error={recent.error}
              isEmpty={(recent.data ?? []).length === 0}
              emptyText="No working hours recorded against this project yet."
            />
            {(recent.data ?? []).map((r) => (
              <div className="stack-row" key={r.id}>
                <div>
                  <b className="mono">{r.machine?.machine_number ?? 'N/A'}</b>
                  <span>{shortDate(r.entry_date)}</span>
                </div>
                <div className="stack-meta">{fmtHours(r.total_hours)}</div>
              </div>
            ))}
          </ModalSection>

          {canViewContracts && (
            <ModalSection title="Contract history" count={contracts.data?.length}>
              <MiniState
                status={contracts.status}
                error={contracts.error}
                isEmpty={(contracts.data ?? []).length === 0}
                emptyText="No contracts linked to this project."
              />
              {(contracts.data ?? []).map((link) => (
                <div className="stack-row" key={link.id}>
                  <div>
                    <b>{link.contract?.contract_number ?? 'N/A'}</b>
                    <span>{link.contract?.status ? titleCase(link.contract.status) : ''}</span>
                  </div>
                  <div className="stack-meta">
                    {shortDate(link.effective_from)} → {link.effective_to ? shortDate(link.effective_to) : 'current'}
                  </div>
                </div>
              ))}
            </ModalSection>
          )}
        </>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Add / edit form
// ---------------------------------------------------------------------------

function ProjectFormModal({
  state,
  userId,
  statusColumnAvailable,
  onClose,
  onSaved,
}: {
  state: { mode: 'add' | 'edit'; row: Project | null } | null
  userId: string
  statusColumnAvailable: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = useSupabase()
  const open = state !== null
  const isEdit = state?.mode === 'edit'
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Customers the signed-in role can read (RLS applies). Operations managers
  // may see none : in that case a project is simply created without a customer.
  const customers = useQuery<CustomerPick[]>(
    () =>
      !open
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('customer')
            .select('id,company_name')
            .order('company_name') as unknown as PromiseLike<{ data: CustomerPick[] | null; error: unknown }>),
    [open],
  )

  useEffect(() => {
    if (!open) return
    const row = state?.row
    setForm({
      name: row?.name ?? '',
      customer_id: row?.customer_id ?? '',
      site_location: row?.site_location ?? '',
      deployment_start: row?.deployment_start ?? '',
      deployment_end: row?.deployment_end ?? '',
      status: row ? currentProjectStatus(row) : 'not_started',
    })
    setFieldErrors({})
    setFormError('')
  }, [open, state?.row])

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit() {
    const errors: Record<string, string> = {}
    if (!form.name?.trim()) errors.name = 'Project name is required.'
    if (form.deployment_start && form.deployment_end && form.deployment_end < form.deployment_start)
      errors.deployment_end = 'End date must be on or after the start date.'
    setFieldErrors(errors)
    setFormError('')
    if (Object.keys(errors).length > 0) return

    const payload = {
      name: form.name.trim(),
      customer_id: form.customer_id?.trim() ? form.customer_id : null,
      site_location: form.site_location?.trim() ? form.site_location.trim() : null,
      deployment_start: form.deployment_start?.trim() ? form.deployment_start : null,
      deployment_end: form.deployment_end?.trim() ? form.deployment_end : null,
      ...(statusColumnAvailable ? { status: form.status || 'not_started' } : {}),
    }

    setSaving(true)
    const { error } = isEdit
      ? await supabase.from('project').update(payload).eq('id', state!.row!.id)
      : await supabase.from('project').insert({ ...payload, created_by: userId })
    setSaving(false)

    if (error) {
      if (/permission|policy|rls|denied/i.test((error as { message?: string }).message ?? '')) {
        setFormError('You do not have permission to save projects.')
        return
      }
      setFormError('Could not save this project. Please try again.')
      return
    }
    onSaved()
  }

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      eyebrow="Project"
      title={isEdit ? 'Edit project' : 'New project'}
      subtitle="A project can stand alone as an operational site, or be linked to a customer for billing."
      footer={
        <div className="footer-actions">
          <button className="button button-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="button button-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create project'}
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
          label="Project name"
          required
          full
          value={form.name ?? ''}
          onChange={(v) => set('name', v)}
          error={fieldErrors.name}
          placeholder="e.g. Kafue Road Upgrade"
        />
        <div className="form-field full">
          <label htmlFor="pj-customer">Customer (optional)</label>
          <select id="pj-customer" value={form.customer_id ?? ''} onChange={(e) => set('customer_id', e.target.value)}>
            <option value="">No customer (stand-alone site)</option>
            {(customers.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))}
          </select>
          {customers.status === 'ready' && (customers.data ?? []).length === 0 && (
            <span className="field-hint">No customers available to link : the project will stand alone.</span>
          )}
        </div>
        <Field
          label="Site location"
          full
          value={form.site_location ?? ''}
          onChange={(v) => set('site_location', v)}
          placeholder="e.g. Lusaka South, Plot 42"
        />
        <Field
          label="Deployment start"
          type="date"
          value={form.deployment_start ?? ''}
          onChange={(v) => set('deployment_start', v)}
        />
        <Field
          label="Deployment end"
          type="date"
          value={form.deployment_end ?? ''}
          onChange={(v) => set('deployment_end', v)}
          error={fieldErrors.deployment_end}
        />
        <div className="form-field">
          <label htmlFor="pj-status">Status</label>
          <select
            id="pj-status"
            value={form.status ?? 'not_started'}
            onChange={(event) => set('status', event.target.value)}
            disabled={!statusColumnAvailable}
          >
            <option value="not_started">Not started</option>
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
          </select>
          <span className="field-hint">
            {statusColumnAvailable
              ? 'Projects are marked Completed when their deployment end date has passed.'
              : 'Apply migration 009 to enable saved project statuses; the status shown is based on the deployment dates.'}
          </span>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------

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
