'use client'

import { useMemo } from 'react'
import { AlertTriangle, CalendarClock, Clock, Truck, Wallet } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { canAccess, firstNameOf, type UserRole } from '@/lib/gbi/roles'
import {
  hours as fmtHours,
  machineStatusTone,
  maintenanceStatusTone,
  money,
  shortDate,
  titleCase,
} from '@/lib/gbi/format'
import { KpiCard, MiniState, PageHeading, StatusBadge } from '@/components/shared'

type MachineStatusRow = { current_status: string }
type HourRow = { entry_date: string; total_hours: number | null }
type MaintenanceRow = {
  id: string
  status: string
  next_service_due_date: string | null
  service_date: string
  machine: { machine_number: string; machine_type: string } | null
}
type RecentRow = {
  id: string
  entry_date: string
  total_hours: number | null
  flagged_for_review: boolean
  machine: { machine_number: string } | null
  operator: { full_name: string } | null
}

const STATUS_COLORS: Record<string, string> = {
  working: '#009943',
  on_hire: '#31b86c',
  available: '#347184',
  under_maintenance: '#d99a2b',
  under_repair: '#c9822e',
  breakdown: '#bc5b55',
  parked: '#9aa9ad',
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function OverviewView({ role, fullName }: { role: UserRole; fullName: string }) {
  const supabase = useSupabase()
  const since = useMemo(() => new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10), [])
  const showCommercial = canAccess('Billing & Invoices', role)

  const machines = useQuery<MachineStatusRow[]>(
    () => supabase.from('machine').select('current_status'),
    [],
  )
  const hours = useQuery<HourRow[]>(
    () =>
      supabase
        .from('daily_hour_entry')
        .select('entry_date,total_hours')
        .gte('entry_date', since)
        .order('entry_date'),
    [since],
  )
  const unbilled = useQuery<number>(
    () =>
      supabase
        .from('daily_hour_entry')
        .select('id', { count: 'exact', head: true })
        .eq('is_billed', false)
        .then((r) => ({ data: r.count ?? 0, error: r.error })),
    [],
  )
  const maintenance = useQuery<MaintenanceRow[]>(
    () =>
      supabase
        .from('maintenance_record')
        .select('id,status,next_service_due_date,service_date,machine:machine_id(machine_number,machine_type)')
        .in('status', ['upcoming', 'due', 'overdue'])
        .order('next_service_due_date', { nullsFirst: false })
        .limit(30) as unknown as PromiseLike<{ data: MaintenanceRow[] | null; error: unknown }>,
    [],
  )
  const recent = useQuery<RecentRow[]>(
    () =>
      supabase
        .from('daily_hour_entry')
        .select('id,entry_date,total_hours,flagged_for_review,machine:machine_id(machine_number),operator:operator_id(full_name)')
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(6) as unknown as PromiseLike<{ data: RecentRow[] | null; error: unknown }>,
    [],
  )
  const outstanding = useQuery<number>(
    () =>
      !showCommercial
        ? Promise.resolve({ data: 0, error: null })
        : supabase
            .from('invoice')
            .select('total_amount')
            .in('status', ['finalized', 'approved', 'overdue'])
            .then((r) => ({
              data: (r.data ?? []).reduce((s, x) => s + Number(x.total_amount ?? 0), 0),
              error: r.error,
            })),
    [showCommercial],
  )

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const m of machines.data ?? []) counts[m.current_status] = (counts[m.current_status] ?? 0) + 1
    return counts
  }, [machines.data])

  const fleetTotal = (machines.data ?? []).length
  const activeMachines = (statusCounts.working ?? 0) + (statusCounts.on_hire ?? 0)
  const dueCount =
    (maintenance.data ?? []).filter((m) => m.status === 'due' || m.status === 'overdue').length

  const dailyTotals = useMemo(() => {
    const map = new Map<string, number>()
    for (const h of hours.data ?? []) {
      map.set(h.entry_date, (map.get(h.entry_date) ?? 0) + Number(h.total_hours ?? 0))
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
  }, [hours.data])
  const maxDaily = Math.max(1, ...dailyTotals.map((d) => d[1]))

  const donut = useMemo(() => {
    const entries = Object.entries(statusCounts)
    if (fleetTotal === 0) return { gradient: '#eef1f2', entries: [] as [string, number][] }
    let acc = 0
    const stops: string[] = []
    for (const [status, count] of entries) {
      const start = (acc / fleetTotal) * 100
      acc += count
      const end = (acc / fleetTotal) * 100
      stops.push(`${STATUS_COLORS[status] ?? '#9aa9ad'} ${start}% ${end}%`)
    }
    return { gradient: `conic-gradient(${stops.join(',')})`, entries }
  }, [statusCounts, fleetTotal])

  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="Operations control"
        title={`${greeting()}, ${firstNameOf(fullName)}`}
        description="Live snapshot of fleet, utilisation and upcoming service across GBI Group."
      />

      <div className="kpi-grid">
        <KpiCard
          icon={Truck}
          tone="green"
          label="Active machines"
          value={machines.status === 'ready' ? `${activeMachines}` : '—'}
          sub={machines.status === 'ready' ? `of ${fleetTotal} in fleet` : 'Loading fleet…'}
        />
        <KpiCard
          icon={Clock}
          tone="blue"
          label="Unbilled hour entries"
          value={unbilled.status === 'ready' ? `${unbilled.data}` : '—'}
          sub="awaiting invoicing"
        />
        <KpiCard
          icon={AlertTriangle}
          tone="red"
          label="Service due / overdue"
          value={maintenance.status === 'ready' ? `${dueCount}` : '—'}
          sub="machines need attention"
        />
        {showCommercial ? (
          <KpiCard
            icon={Wallet}
            tone="gold"
            label="Outstanding invoices"
            value={outstanding.status === 'ready' ? money(outstanding.data) : '—'}
            sub="finalized, approved & overdue"
          />
        ) : (
          <KpiCard
            icon={CalendarClock}
            tone="gold"
            label="Fleet size"
            value={machines.status === 'ready' ? `${fleetTotal}` : '—'}
            sub="registered machines"
          />
        )}
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Utilisation — last 14 days</h2>
              <p>Total recorded machine hours per day</p>
            </div>
          </div>
          <div className="mini-chart">
            {hours.status !== 'ready' || dailyTotals.length === 0 ? (
              <MiniState
                status={hours.status}
                error={hours.error}
                isEmpty={dailyTotals.length === 0}
                emptyText="No hour entries recorded in the last 14 days."
              />
            ) : (
              <div className="mini-bars">
                {dailyTotals.map(([date, total]) => (
                  <div className="mini-bar-group" key={date} title={`${shortDate(date)} · ${fmtHours(total)}`}>
                    <div className="mini-bar" style={{ height: `${Math.max(4, (total / maxDaily) * 100)}%` }} />
                    <span>{date.slice(8, 10)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Fleet status</h2>
              <p>Current machine states</p>
            </div>
          </div>
          <div className="donut-wrap">
            {machines.status !== 'ready' || fleetTotal === 0 ? (
              <MiniState
                status={machines.status}
                error={machines.error}
                isEmpty={fleetTotal === 0}
                emptyText="No machines registered yet."
              />
            ) : (
              <>
                <div className="donut" style={{ background: donut.gradient }}>
                  <div className="donut-center">
                    <b>{fleetTotal}</b>
                    <span>machines</span>
                  </div>
                </div>
                <ul className="donut-legend">
                  {donut.entries.map(([status, count]) => (
                    <li key={status}>
                      <span className="legend-dot" style={{ background: STATUS_COLORS[status] ?? '#9aa9ad' }} />
                      {titleCase(status)}
                      <b>{count}</b>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="dashboard-grid lower">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Service pipeline</h2>
              <p>Upcoming, due and overdue maintenance</p>
            </div>
          </div>
          <div className="table-scroll">
            {maintenance.status !== 'ready' || (maintenance.data ?? []).length === 0 ? (
              <div className="panel-pad">
                <MiniState
                  status={maintenance.status}
                  error={maintenance.error}
                  isEmpty={(maintenance.data ?? []).length === 0}
                  emptyText="No scheduled maintenance."
                />
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Machine</th>
                    <th>Status</th>
                    <th>Due date</th>
                  </tr>
                </thead>
                <tbody>
                  {(maintenance.data ?? []).slice(0, 6).map((m) => (
                    <tr key={m.id}>
                      <td>
                        <b>{m.machine?.machine_number ?? '—'}</b>
                        <div className="muted-cell">{m.machine?.machine_type ?? ''}</div>
                      </td>
                      <td>
                        <StatusBadge tone={maintenanceStatusTone(m.status)}>{titleCase(m.status)}</StatusBadge>
                      </td>
                      <td>{shortDate(m.next_service_due_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Recent hour entries</h2>
              <p>Latest daily working hours logged</p>
            </div>
          </div>
          <div className="table-scroll">
            {recent.status !== 'ready' || (recent.data ?? []).length === 0 ? (
              <div className="panel-pad">
                <MiniState
                  status={recent.status}
                  error={recent.error}
                  isEmpty={(recent.data ?? []).length === 0}
                  emptyText="No hour entries logged yet."
                />
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Machine</th>
                    <th>Operator</th>
                    <th>Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {(recent.data ?? []).map((r) => (
                    <tr key={r.id}>
                      <td>{shortDate(r.entry_date)}</td>
                      <td>
                        <b>{r.machine?.machine_number ?? '—'}</b>
                        {r.flagged_for_review && <span className="flag-chip">Review</span>}
                      </td>
                      <td>{r.operator?.full_name ?? '—'}</td>
                      <td>{fmtHours(r.total_hours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
