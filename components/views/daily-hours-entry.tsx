'use client'

import { useMemo, useState } from 'react'
import { Save } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import type { UserRole } from '@/lib/gbi/roles'

type Machine = { id: string; machine_number: string; machine_type: string; current_hour_meter: number | null; assigned_operator_id: string | null; current_project_id: string | null; operator: { full_name: string } | null; project: { name: string; site_location: string | null; customer_id: string | null; customer: { company_name: string } | null } | null }
type Existing = { id: string; machine_id: string; hour_meter_start: number; hour_meter_end: number; remarks: string | null }
type Draft = { start: string; end: string; remarks: string }
const MACHINE_SELECT = 'id,machine_number,machine_type,current_hour_meter,assigned_operator_id,current_project_id,operator:assigned_operator_id(full_name),project:current_project_id(name,site_location,customer_id,customer:customer_id(company_name))'

export function DailyHoursEntry({ role, userId, date, onSaved }: { role: UserRole; userId: string; date: string; onSaved: () => void }) {
  const supabase = useSupabase()
  const canWrite = role === 'administrator' || role === 'operations_manager'
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const machines = useQuery<Machine[]>(() => supabase.from('machine').select(MACHINE_SELECT).is('deleted_at', null).order('machine_number') as unknown as PromiseLike<{ data: Machine[] | null; error: unknown }>, [])
  const existing = useQuery<Existing[]>(() => supabase.from('daily_hour_entry').select('id,machine_id,hour_meter_start,hour_meter_end,remarks').eq('entry_date', date) as unknown as PromiseLike<{ data: Existing[] | null; error: unknown }>, [date])
  const rows = useMemo(() => (machines.data ?? []).map((machine) => { const old = existing.data?.find((entry) => entry.machine_id === machine.id); return { machine, old, draft: drafts[machine.id] ?? { start: String(old?.hour_meter_start ?? machine.current_hour_meter ?? ''), end: String(old?.hour_meter_end ?? ''), remarks: old?.remarks ?? '' } } }), [machines.data, existing.data, drafts])
  if (!canWrite || date !== new Date().toISOString().slice(0, 10)) return null

  async function save(machine: Machine, draft: Draft, old?: Existing) {
    const start = Number(draft.start), end = Number(draft.end)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) { setMessage(`${machine.machine_number}: end meter must be greater than or equal to start meter.`); return }
    setSaving(machine.id); setMessage('')
    const payload = { entry_date: date, machine_id: machine.id, operator_id: machine.assigned_operator_id, project_id: machine.current_project_id, customer_id: machine.project?.customer_id ?? null, site_location: machine.project?.site_location ?? null, hour_meter_start: start, hour_meter_end: end, remarks: draft.remarks.trim() || null, updated_by: userId }
    const result = old ? await supabase.from('daily_hour_entry').update(payload).eq('id', old.id) : await supabase.from('daily_hour_entry').insert({ ...payload, created_by: userId })
    setSaving(null)
    if (result.error) setMessage(result.error.message)
    else { setMessage('Saved.'); setDrafts((current) => { const next = { ...current }; delete next[machine.id]; return next }); onSaved() }
  }

  return <section className="panel daily-hours-entry"><div className="panel-heading"><div><h3>Today&apos;s machine readings</h3><p>Operations Manager entry. Assignment, project, customer and site are read-only.</p></div></div>{message && <p className="form-error">{message}</p>}<div className="table-scroll"><table className="data-table"><thead><tr><th>Machine</th><th>Operator</th><th>Project / customer</th><th>Site</th><th>Meter start</th><th>Meter end</th><th>Remarks</th><th /></tr></thead><tbody>{rows.map(({ machine, old, draft }) => <tr key={machine.id}><td><b>{machine.machine_number}</b><div className="muted-cell">{machine.machine_type}</div></td><td>{machine.operator?.full_name ?? '—'}</td><td>{machine.project?.name ?? '—'}<div className="muted-cell">{machine.project?.customer?.company_name ?? 'No customer'}</div></td><td>{machine.project?.site_location ?? '—'}</td><td><input className="hours-inline-input" type="number" min="0" step="0.01" value={draft.start} onChange={(e) => setDrafts((s) => ({ ...s, [machine.id]: { ...draft, start: e.target.value } }))} aria-label={`${machine.machine_number} meter start`} /></td><td><input className="hours-inline-input" type="number" min="0" step="0.01" value={draft.end} onChange={(e) => setDrafts((s) => ({ ...s, [machine.id]: { ...draft, end: e.target.value } }))} aria-label={`${machine.machine_number} meter end`} /></td><td><input className="hours-inline-input remarks" value={draft.remarks} onChange={(e) => setDrafts((s) => ({ ...s, [machine.id]: { ...draft, remarks: e.target.value } }))} aria-label={`${machine.machine_number} remarks`} /></td><td><button className="button button-primary button-small" disabled={saving === machine.id} onClick={() => save(machine, draft, old)}><Save size={13} />{old ? 'Update' : 'Save'}</button></td></tr>)}</tbody></table></div></section>
}
