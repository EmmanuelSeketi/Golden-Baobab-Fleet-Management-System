'use client'

import { useMemo, useState } from 'react'
import { Pencil, Save } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { hours as fmtHours } from '@/lib/gbi/format'
import type { UserRole } from '@/lib/gbi/roles'

type Machine = {
  id: string
  machine_number: string
  machine_type: string
  chassis_number: string | null
  current_hour_meter: number | null
  current_status: string
  machine_location: string | null
  assigned_operator_id: string | null
  current_project_id: string | null
  operator: { full_name: string } | null
  project: { name: string; site_location: string | null; customer_id: string | null; customer: { company_name: string } | null } | null
}
type Existing = { id: string; machine_id: string; hour_meter_start: number; hour_meter_end: number; remarks: string | null }
type Draft = { start: string; end: string; remarks: string }

const MACHINE_SELECT =
  'id,machine_number,machine_type,chassis_number,current_hour_meter,current_status,machine_location,assigned_operator_id,current_project_id,operator:assigned_operator_id(full_name),project:current_project_id(name,site_location,customer_id,customer:customer_id(company_name))'

// Live total from the current draft figures (blank until both are valid and end >= start).
function draftTotal(draft: Draft): number | null {
  const start = Number(draft.start)
  const end = Number(draft.end)
  if (draft.start === '' || draft.end === '' || !Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
  return end - start
}

export function DailyHoursEntry({
  role,
  userId,
  date,
  onSaved,
}: {
  role: UserRole
  userId: string
  date: string
  onSaved: () => void
}) {
  const supabase = useSupabase()
  const canWrite = role === 'administrator' || role === 'operations_manager'
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [editing, setEditing] = useState<Record<string, boolean>>({})
  const [savedRows, setSavedRows] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  const machines = useQuery<Machine[]>(
    () =>
      supabase
        .from('machine')
        .select(MACHINE_SELECT)
        .is('deleted_at', null)
        .eq('current_status', 'on_hire')
        .order('machine_number') as unknown as PromiseLike<{
        data: Machine[] | null
        error: unknown
      }>,
    [],
  )
  const existing = useQuery<Existing[]>(
    () =>
      supabase.from('daily_hour_entry').select('id,machine_id,hour_meter_start,hour_meter_end,remarks').eq('entry_date', date) as unknown as PromiseLike<{
        data: Existing[] | null
        error: unknown
      }>,
    [date],
  )

  const rows = useMemo(
    () =>
      (machines.data ?? []).map((machine) => {
        const old = existing.data?.find((entry) => entry.machine_id === machine.id)
        return {
          machine,
          old,
          draft: drafts[`${date}:${machine.id}`] ?? {
            start: String(old?.hour_meter_start ?? machine.current_hour_meter ?? ''),
            end: String(old?.hour_meter_end ?? ''),
            remarks: old?.remarks ?? '',
          },
        }
      }),
    [machines.data, existing.data, drafts, date],
  )

  if (!canWrite || date !== new Date().toISOString().slice(0, 10)) return null

  function setDraft(rowKey: string, next: Draft) {
    setDrafts((current) => ({ ...current, [rowKey]: next }))
  }

  async function save(machine: Machine, draft: Draft, old?: Existing) {
    const start = Number(draft.start)
    const end = Number(draft.end)
    if (!Number.isFinite(start) || !Number.isFinite(end) || draft.start === '' || draft.end === '' || end < start) {
      setMessage({ text: `${machine.machine_number}: end meter must be greater than or equal to start meter.`, error: true })
      return
    }
    setSaving(machine.id)
    setMessage(null)
    const payload = {
      entry_date: date,
      machine_id: machine.id,
      operator_id: machine.assigned_operator_id,
      project_id: machine.current_project_id,
      customer_id: machine.project?.customer_id ?? null,
      site_location: machine.machine_location ?? machine.project?.site_location ?? null,
      hour_meter_start: start,
      hour_meter_end: end,
      remarks: draft.remarks.trim() || null,
      updated_by: userId,
    }
    const result = old
      ? await supabase.from('daily_hour_entry').update(payload).eq('id', old.id)
      : await supabase.from('daily_hour_entry').insert({ ...payload, created_by: userId })
    if (result.error) {
      setSaving(null)
      setMessage({ text: result.error.message, error: true })
      return
    }
    // Carry the reading forward: the machine's current hour meter becomes today's
    // end reading, so tomorrow's entry starts where today left off. Only ever
    // advance the meter : never pull it backwards when correcting an old entry.
    if (end > (machine.current_hour_meter ?? 0)) {
      await supabase.from('machine').update({ current_hour_meter: end }).eq('id', machine.id)
      machines.reload()
    }
    setSaving(null)
    setMessage({ text: `${machine.machine_number} saved.`, error: false })
    const rowKey = `${date}:${machine.id}`
    setSavedRows((current) => ({ ...current, [rowKey]: true }))
    setEditing((current) => ({ ...current, [rowKey]: false }))
    onSaved()
  }

  return (
    <section className="panel daily-hours-entry">
      <div className="panel-heading">
        <div>
          <h3>Today&apos;s machine readings</h3>
          <p>Only machines marked On hire are listed. Assignment, project, customer and site are read-only.</p>
        </div>
      </div>
      {message && <p className={message.error ? 'form-error' : 'form-success'}>{message.text}</p>}
      <div className="table-scroll">
        <table className="data-table hours-entry-table">
          <thead>
            <tr>
              <th>Machine</th>
              <th>Chassis No</th>
              <th>Operator</th>
              <th>Project / customer</th>
              <th>Site</th>
              <th>Meter start</th>
              <th>Meter end</th>
              <th>Total</th>
              <th>Remarks</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {machines.status === 'ready' && rows.length === 0 && (
              <tr>
                <td colSpan={10}>
                  No machines are currently marked On hire.
                </td>
              </tr>
            )}
            {rows.map(({ machine, old, draft }) => {
              // A saved row is locked until the user explicitly clicks Edit.
              const rowKey = `${date}:${machine.id}`
              const locked = (!!old || !!savedRows[rowKey]) && !editing[rowKey]
              const total = draftTotal(draft)
              return (
                <tr key={machine.id}>
                  <td>
                    <b className="mono">{machine.machine_number}</b>
                    <div className="muted-cell">{machine.machine_type}</div>
                  </td>
                  <td className="mono">{machine.chassis_number ?? 'N/A'}</td>
                  <td>{machine.operator?.full_name ?? 'N/A'}</td>
                  <td>
                    {machine.project?.name ?? 'N/A'}
                    <div className="muted-cell">{machine.project?.customer?.company_name ?? 'No customer'}</div>
                  </td>
                  <td>{machine.machine_location ?? machine.project?.site_location ?? 'N/A'}</td>
                  <td>
                    <input
                      className="hours-inline-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.start}
                      disabled={locked}
                      onChange={(e) => setDraft(rowKey, { ...draft, start: e.target.value })}
                      aria-label={`${machine.machine_number} meter start`}
                    />
                  </td>
                  <td>
                    <input
                      className="hours-inline-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.end}
                      disabled={locked}
                      onChange={(e) => setDraft(rowKey, { ...draft, end: e.target.value })}
                      aria-label={`${machine.machine_number} meter end`}
                    />
                  </td>
                  <td>
                    <b>{total === null ? 'N/A' : fmtHours(total)}</b>
                  </td>
                  <td>
                    <input
                      className="hours-inline-input remarks"
                      value={draft.remarks}
                      disabled={locked}
                      onChange={(e) => setDraft(rowKey, { ...draft, remarks: e.target.value })}
                      aria-label={`${machine.machine_number} remarks`}
                    />
                  </td>
                  <td>
                    {locked ? (
                      <button
                        className="button button-secondary button-small"
                        onClick={() => setEditing((current) => ({ ...current, [rowKey]: true }))}
                      >
                        <Pencil size={13} />
                        Edit
                      </button>
                    ) : (
                      <button
                        className="button button-primary button-small"
                        disabled={saving === machine.id}
                        onClick={() => save(machine, draft, old)}
                      >
                        <Save size={13} />
                        {saving === machine.id ? 'Saving…' : old ? 'Update' : 'Save'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
