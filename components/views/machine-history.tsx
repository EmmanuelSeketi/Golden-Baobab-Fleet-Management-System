'use client'

import { useMemo, useState } from 'react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import type { Tone } from '@/lib/gbi/format'
import {
  hours as fmtHours,
  machineStatusTone,
  meter,
  money,
  shortDate,
  titleCase,
} from '@/lib/gbi/format'
import { KpiCard, MiniState, PageHeading, StatusBadge, ViewState } from '@/components/shared'

type MachineOption = {
  id: string
  machine_number: string
  machine_type: string
  manufacturer: string | null
  model: string | null
  current_hour_meter: number
  service_interval_hours: number | null
  current_status: string
  operator: { full_name: string } | null
  project: { name: string; site_location: string | null } | null
}

const MACHINE_SELECT =
  'id,machine_number,machine_type,manufacturer,model,current_hour_meter,service_interval_hours,current_status,operator:assigned_operator_id(full_name),project:current_project_id(name,site_location)'

type HourRow = {
  id: string
  entry_date: string
  total_hours: number
  hour_meter_start: number
  hour_meter_end: number
  operator: { full_name: string } | null
  project: { name: string } | null
}
type AssignmentRow = {
  id: string
  start_date: string
  end_date: string | null
  operator: { full_name: string } | null
  project: { name: string } | null
}
type MaintRow = {
  id: string
  service_date: string
  service_type: string | null
  status: string
  mechanic: string | null
  cost: number | null
  next_service_due_date: string | null
}
type RepairRow = {
  id: string
  fault_date: string
  fault_description: string
  repair_completed: boolean
  mechanic: string | null
  cost: number | null
  downtime_hours: number | null
}

type EventType = 'hours' | 'assignment' | 'maintenance' | 'repair'

type TimelineEvent = {
  key: string
  type: EventType
  date: string
  title: string
  detail: string
  meta: string
  status?: { label: string; tone: Tone }
  value?: string
}

const FILTERS: { key: EventType | 'all'; label: string }[] = [
  { key: 'all', label: 'All activity' },
  { key: 'hours', label: 'Hours' },
  { key: 'assignment', label: 'Assignments' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'repair', label: 'Repairs' },
]

export function MachineHistoryView() {
  const supabase = useSupabase()
  const [machineId, setMachineId] = useState<string>('')
  const [filter, setFilter] = useState<EventType | 'all'>('all')
  const [page, setPage] = useState(1)
  const pageSize = 6

  const machines = useQuery<MachineOption[]>(
    () =>
      supabase
        .from('machine')
        .select(MACHINE_SELECT)
        .is('deleted_at', null)
        .order('machine_number') as unknown as PromiseLike<{ data: MachineOption[] | null; error: unknown }>,
    [],
  )

  const machine = useMemo(
    () => (machines.data ?? []).find((m) => m.id === machineId) ?? null,
    [machines.data, machineId],
  )

  const hourEntries = useQuery<HourRow[]>(
    () =>
      !machineId
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('daily_hour_entry')
            .select(
              'id,entry_date,total_hours,hour_meter_start,hour_meter_end,operator:operator_id(full_name),project:project_id(name)',
            )
            .eq('machine_id', machineId)
            .order('entry_date', { ascending: false }) as unknown as PromiseLike<{
            data: HourRow[] | null
            error: unknown
          }>),
    [machineId],
  )
  const assignments = useQuery<AssignmentRow[]>(
    () =>
      !machineId
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('machine_assignment')
            .select('id,start_date,end_date,operator:operator_id(full_name),project:project_id(name)')
            .eq('machine_id', machineId)
            .order('start_date', { ascending: false }) as unknown as PromiseLike<{
            data: AssignmentRow[] | null
            error: unknown
          }>),
    [machineId],
  )
  const maintenance = useQuery<MaintRow[]>(
    () =>
      !machineId
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('maintenance_record')
            .select('id,service_date,service_type,status,mechanic,cost,next_service_due_date')
            .eq('machine_id', machineId)
            .order('service_date', { ascending: false }) as unknown as PromiseLike<{
            data: MaintRow[] | null
            error: unknown
          }>),
    [machineId],
  )
  const repairs = useQuery<RepairRow[]>(
    () =>
      !machineId
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('repair_record')
            .select('id,fault_date,fault_description,repair_completed,mechanic,cost,downtime_hours')
            .eq('machine_id', machineId)
            .order('fault_date', { ascending: false }) as unknown as PromiseLike<{
            data: RepairRow[] | null
            error: unknown
          }>),
    [machineId],
  )

  const loading =
    hourEntries.status === 'loading' ||
    assignments.status === 'loading' ||
    maintenance.status === 'loading' ||
    repairs.status === 'loading'
  const firstError = hourEntries.error || assignments.error || maintenance.error || repairs.error

  const events = useMemo<TimelineEvent[]>(() => {
    const list: TimelineEvent[] = []
    for (const h of hourEntries.data ?? []) {
      list.push({
        key: `h-${h.id}`,
        type: 'hours',
        date: h.entry_date,
        title: `${fmtHours(h.total_hours)} logged`,
        detail: `Meter ${meter(h.hour_meter_start)} → ${meter(h.hour_meter_end)}`,
        meta: [h.operator?.full_name, h.project?.name].filter(Boolean).join(' · ') || 'No operator / project',
        value: fmtHours(h.total_hours),
      })
    }
    for (const a of assignments.data ?? []) {
      list.push({
        key: `a-${a.id}`,
        type: 'assignment',
        date: a.start_date,
        title: a.project?.name ?? 'Unassigned',
        detail: `${shortDate(a.start_date)} → ${a.end_date ? shortDate(a.end_date) : 'current'}`,
        meta: a.operator?.full_name ?? 'No operator',
        status: a.end_date ? undefined : { label: 'Active', tone: 'green' },
      })
    }
    for (const m of maintenance.data ?? []) {
      list.push({
        key: `m-${m.id}`,
        type: 'maintenance',
        date: m.service_date,
        title: m.service_type ?? 'Service',
        detail: m.next_service_due_date ? `Next due ${shortDate(m.next_service_due_date)}` : 'Service record',
        meta: m.mechanic ?? 'No mechanic recorded',
        status: { label: titleCase(m.status), tone: maintTone(m.status) },
        value: m.cost != null ? money(m.cost) : undefined,
      })
    }
    for (const r of repairs.data ?? []) {
      list.push({
        key: `r-${r.id}`,
        type: 'repair',
        date: r.fault_date,
        title: r.fault_description,
        detail:
          r.downtime_hours != null ? `${fmtHours(r.downtime_hours)} downtime` : 'Repair record',
        meta: r.mechanic ?? 'No mechanic recorded',
        status: { label: r.repair_completed ? 'Completed' : 'Open', tone: r.repair_completed ? 'green' : 'amber' },
        value: r.cost != null ? money(r.cost) : undefined,
      })
    }
    list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    return list
  }, [hourEntries.data, assignments.data, maintenance.data, repairs.data])

  const visible = useMemo(
    () => (filter === 'all' ? events : events.filter((e) => e.type === filter)),
    [events, filter],
  )
  const pageCount = Math.ceil(visible.length / pageSize)
  const currentPage = Math.min(page, Math.max(1, pageCount))
  const pageStart = (currentPage - 1) * pageSize
  const pagedEvents = visible.slice(pageStart, pageStart + pageSize)

  const summary = useMemo(() => {
    const hrs = (hourEntries.data ?? []).reduce((sum, h) => sum + (Number(h.total_hours) || 0), 0)
    const days = (hourEntries.data ?? []).length
    const openRepairs = (repairs.data ?? []).filter((r) => !r.repair_completed).length
    const lastService = (maintenance.data ?? [])[0]?.service_date ?? null
    return { hrs, days, openRepairs, lastService }
  }, [hourEntries.data, repairs.data, maintenance.data])

  const machinePicker = (
    <div className="mh-picker">
      <select
        value={machineId}
        onChange={(e) => {
          setMachineId(e.target.value)
          setPage(1)
        }}
        aria-label="Select machine"
      >
        <option value="">Select a machine…</option>
        {(machines.data ?? []).map((m) => (
          <option key={m.id} value={m.id}>
            {m.machine_number} · {m.machine_type}
            {m.model ? ` (${m.model})` : ''}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <div className="page-wrap">
      <PageHeading
        title="Machine History"
      />

      {!machineId ? (
        <div className="panel">
          <div className="mh-machine-picker-row">{machinePicker}</div>
          <MiniState
            status={machines.status}
            error={machines.error}
            isEmpty={(machines.data ?? []).length === 0 && machines.status === 'ready'}
            emptyText="No machines registered yet."
          />
          {machines.status === 'ready' && (machines.data ?? []).length > 0 && (
            <div className="mh-empty">
              <b>Select a machine to view its full history</b>
              <span>Choose from the picker above to see its hours, assignments, maintenance and repairs.</span>
            </div>
          )}
        </div>
      ) : (
        <>
          {machine && (
            <div className="mh-machine-head">
              <div>
                <div className="mh-machine-name">
                  <b className="mono">{machine.machine_number}</b>
                  <StatusBadge tone={machineStatusTone(machine.current_status)}>
                    {titleCase(machine.current_status)}
                  </StatusBadge>
                </div>
                <span className="muted-cell">
                  {[machine.manufacturer, machine.model].filter(Boolean).join(' ') || machine.machine_type}
                  {machine.operator ? ` · ${machine.operator.full_name}` : ''}
                  {machine.project ? ` · ${machine.project.name}` : ''}
                </span>
              </div>
              {machinePicker}
            </div>
          )}

          <div className="kpi-grid">
            <KpiCard
              tone="gold"
              label="Current hour meter"
              value={meter(machine?.current_hour_meter)}
              sub={
                machine?.service_interval_hours
                  ? `${machine.service_interval_hours} h service interval`
                  : 'No service interval set'
              }
            />
            <KpiCard
              tone="green"
              label="Total hours logged"
              value={fmtHours(summary.hrs)}
              sub={`${summary.days} ${summary.days === 1 ? 'day' : 'days'} recorded`}
            />
            <KpiCard
              tone="blue"
              label="Last service"
              value={summary.lastService ? shortDate(summary.lastService) : 'N/A'}
              sub={`${(maintenance.data ?? []).length} service records`}
            />
            <KpiCard
              tone={summary.openRepairs > 0 ? 'red' : 'green'}
              label="Open repairs"
              value={String(summary.openRepairs)}
              sub={`${(repairs.data ?? []).length} repairs total`}
            />
          </div>

          <div className="mh-chips">
            {FILTERS.map((f) => {
              const count = f.key === 'all' ? events.length : events.filter((e) => e.type === f.key).length
              return (
                <button
                  key={f.key}
                  className={`mh-chip ${filter === f.key ? 'active' : ''}`}
                  onClick={() => {
                    setFilter(f.key)
                    setPage(1)
                  }}
                >
                  {f.label}
                  <i>{count}</i>
                </button>
              )
            })}
          </div>

          <div className="panel">
            <ViewState
              status={loading ? 'loading' : firstError ? 'error' : 'success'}
              error={firstError}
              isEmpty={visible.length === 0}
              title="machine history"
              emptyText={
                events.length === 0
                  ? 'No activity recorded for this machine yet.'
                  : 'No activity of this type for this machine.'
              }
              onRetry={() => {
                hourEntries.reload()
                assignments.reload()
                maintenance.reload()
                repairs.reload()
              }}
            >
              <ol className="mh-timeline">
                {pagedEvents.map((e) => {
                  return (
                    <li key={e.key} className="mh-event">
                      <div className="mh-event-body">
                        <div className="mh-event-top">
                          <b>{e.title}</b>
                          <span className="mh-event-date">{shortDate(e.date)}</span>
                        </div>
                        <div className="mh-event-detail">{e.detail}</div>
                        <div className="mh-event-foot">
                          <span className="mh-event-meta">{e.meta}</span>
                          {e.value && <span className="mh-event-value">{e.value}</span>}
                          {e.status && <StatusBadge tone={e.status.tone}>{e.status.label}</StatusBadge>}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </ViewState>
            {visible.length > 0 && (
              <div className="mh-pagination" aria-label="Machine history pagination">
                <span>
                  Showing {pageStart + 1}–{Math.min(pageStart + pageSize, visible.length)} of {visible.length}
                </span>
                <div>
                  <button
                    className="button button-secondary"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={currentPage <= 1}
                  >
                    Previous
                  </button>
                  <span>Page {currentPage} of {pageCount}</span>
                  <button
                    className="button button-secondary"
                    onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                    disabled={currentPage >= pageCount}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function maintTone(status: string): Tone {
  switch (status) {
    case 'completed':
      return 'green'
    case 'due':
      return 'amber'
    case 'overdue':
      return 'red'
    default:
      return 'blue'
  }
}
