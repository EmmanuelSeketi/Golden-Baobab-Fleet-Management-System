'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Building2, Eye, MapPin, Pencil, Plus } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { hours as fmtHours, shortDate } from '@/lib/gbi/format'
import { canManageProjects, type UserRole } from '@/lib/gbi/roles'
import {
  DetailGrid,
  MiniState,
  Modal,
  ModalSection,
  PageHeading,
  RowActions,
  ViewState,
} from '@/components/shared'

type Project = {
  id: string
  name: string
  customer_id: string | null
  site_location: string | null
  deployment_start: string | null
  deployment_end: string | null
  created_at: string
  customer: { company_name: string } | null
}

type CustomerPick = { id: string; company_name: string }

const SELECT =
  'id,name,customer_id,site_location,deployment_start,deployment_end,created_at,customer:customer_id(company_name)'

export function ProjectsView({ role, userId }: { role: UserRole; userId: string }) {
  const supabase = useSupabase()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Project | null>(null)
  const [form, setForm] = useState<{ mode: 'add' | 'edit'; row: Project | null } | null>(null)
  const canManage = canManageProjects(role)

  const projects = useQuery<Project[]>(
    () =>
      supabase.from('project').select(SELECT).order('name') as unknown as PromiseLike<{
        data: Project[] | null
        error: unknown
      }>,
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
        eyebrow="Operations"
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
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="clickable-row" onClick={() => setSelected(p)}>
                    <td>
                      <b>{p.name}</b>
                    </td>
                    <td>{p.customer?.company_name ?? '—'}</td>
                    <td>{p.site_location ?? '—'}</td>
                    <td>
                      {p.deployment_start ? shortDate(p.deployment_start) : '—'} →{' '}
                      {p.deployment_end ? shortDate(p.deployment_end) : 'open'}
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
        onEdit={() => selected && setForm({ mode: 'edit', row: selected })}
        onClose={() => setSelected(null)}
      />

      {canManage && (
        <ProjectFormModal
          state={form}
          userId={userId}
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
// Detail modal — project facts plus its recent daily-hour activity
// ---------------------------------------------------------------------------

type RecentEntry = {
  id: string
  entry_date: string
  total_hours: number | null
  machine: { machine_number: string } | null
}

function ProjectDetailModal({
  project,
  canManage,
  onEdit,
  onClose,
}: {
  project: Project | null
  canManage: boolean
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
              ['Site location', project.site_location ?? '—'],
              ['Deployment start', project.deployment_start ? shortDate(project.deployment_start) : '—'],
              ['Deployment end', project.deployment_end ? shortDate(project.deployment_end) : 'Open-ended'],
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
                  <b>{r.machine?.machine_number ?? '—'}</b>
                  <span>{shortDate(r.entry_date)}</span>
                </div>
                <div className="stack-meta">{fmtHours(r.total_hours)}</div>
              </div>
            ))}
          </ModalSection>
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
  onClose,
  onSaved,
}: {
  state: { mode: 'add' | 'edit'; row: Project | null } | null
  userId: string
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
  // may see none — in that case a project is simply created without a customer.
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
            <option value="">— No customer (stand-alone site) —</option>
            {(customers.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))}
          </select>
          {customers.status === 'ready' && (customers.data ?? []).length === 0 && (
            <span className="field-hint">No customers available to link — the project will stand alone.</span>
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
