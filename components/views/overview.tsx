'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import excavatorIcon from '@/components/icons/Excavator.svg'
import paymentIcon from '@/components/icons/payment.svg'
import serviceIcon from '@/components/icons/Service.svg'
import unbilledIcon from '@/components/icons/Unbilled hour entries.svg'
import { FileText } from 'lucide-react'
import { PieChart } from '@mui/x-charts/PieChart'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { maintenanceDueDate, maintenanceEffectiveStatus } from '@/lib/gbi/maintenance'
import { canAccess, firstNameOf, type UserRole } from '@/lib/gbi/roles'
import {
  hours as fmtHours,
  machineStatusTone,
  maintenanceStatusTone,
  money,
  shortDate,
  titleCase,
} from '@/lib/gbi/format'
import { KpiCard, LoadingSpinner, MiniState, PageHeading, StatusBadge } from '@/components/shared'
import { FLEET_SITE_COLORS, FleetMapModal, type FleetMapMachine } from '@/components/views/fleet-map-modal'

type MachineStatusRow = FleetMapMachine & { current_status: string }
type HourRow = { entry_date: string; total_hours: number | null }
type MaintenanceRow = {
  id: string
  status: string
  status_override: boolean
  next_service_due_date: string | null
  service_date: string
  machine: { name: string; machine_number: string; machine_type: string } | null
}
type RecentRow = {
  id: string
  entry_date: string
  total_hours: number | null
  machine: { name: string; machine_number: string } | null
  operator: { full_name: string } | null
}

const excavatorUrl = typeof excavatorIcon === 'string' ? excavatorIcon : excavatorIcon?.src ?? ''
const paymentUrl = typeof paymentIcon === 'string' ? paymentIcon : paymentIcon?.src ?? ''
const unbilledUrl = typeof unbilledIcon === 'string' ? unbilledIcon : unbilledIcon?.src ?? ''
const serviceUrl = typeof serviceIcon === 'string' ? serviceIcon : serviceIcon?.src ?? ''

const STATUS_COLORS: Record<string, string> = {
  on_hire: '#29b6f6',
  available: '#31b86c',
  under_maintenance: '#ffeb3b',
  under_repair: '#ff9100',
  breakdown: '#e0004d',
  parked: '#9aa9ad',
}

function greetingFor(hour: number) {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

// Time-of-day depends on the viewer's clock, so it must be computed after mount
// to avoid a server/client hydration mismatch. Start neutral, then personalise.
function useGreeting() {
  const [greeting, setGreeting] = useState('Welcome back')
  useEffect(() => {
    setGreeting(greetingFor(new Date().getHours()))
  }, [])
  return greeting
}

export function OverviewView({ role, fullName }: { role: UserRole; fullName: string }) {
  const supabase = useSupabase()
  const greeting = useGreeting()
  const rawFirstName = firstNameOf(fullName).trim()
  const firstName = rawFirstName
    ? `${rawFirstName[0].toUpperCase()}${rawFirstName.slice(1).toLowerCase()}`
    : rawFirstName
  const since = useMemo(() => new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10), [])
  const showCommercial = canAccess('Hiring Quotations', role)

  const machines = useQuery<MachineStatusRow[]>(
    () =>
      supabase
        .from('machine')
        .select('name,machine_number,current_status,project:current_project_id(name,site_location)')
        .is('deleted_at', null)
        .then(({ data, error }) => ({
          data: data?.map((machine) => ({
            ...machine,
            project: Array.isArray(machine.project) ? machine.project[0] ?? null : machine.project,
          })) ?? null,
          error,
        })),
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
        .select('id,status,status_override,next_service_due_date,service_date,machine:machine_id(name,machine_number,machine_type)')
        .order('service_date')
        .limit(100) as unknown as PromiseLike<{ data: MaintenanceRow[] | null; error: unknown }>,
    [],
  )
  const recent = useQuery<RecentRow[]>(
    () =>
      supabase
        .from('daily_hour_entry')
        .select('id,entry_date,total_hours,machine:machine_id(name,machine_number),operator:operator_id(full_name)')
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
  const activeMachines = statusCounts.on_hire ?? 0
  const fleetSites = useMemo(() => {
    const sites = new Map<string, { name: string; machineCount: number }>()
    for (const machine of machines.data ?? []) {
      const location = machine.project?.site_location?.trim()
      if (!location) continue
      const key = location.toLowerCase()
      const site = sites.get(key)
      if (site) site.machineCount += 1
      else sites.set(key, { name: location, machineCount: 1 })
    }
    return Array.from(sites.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [machines.data])
  const siteChartData = fleetSites.map((site, index) => ({
    label: site.name,
    value: site.machineCount,
    color: FLEET_SITE_COLORS[index % FLEET_SITE_COLORS.length],
  }))
  const scheduledMaintenance = (maintenance.data ?? [])
    .map((record) => ({
      ...record,
      effectiveStatus: maintenanceEffectiveStatus(record),
    }))
    .filter((record) => record.effectiveStatus !== 'completed')
    .sort((a, b) =>
      (maintenanceDueDate(a) ?? '').localeCompare(maintenanceDueDate(b) ?? ''),
    )
  const dueCount = scheduledMaintenance.filter(
    (record) => record.effectiveStatus === 'due' || record.effectiveStatus === 'overdue',
  ).length

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

  const [chartRange, setChartRange] = useState(14)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; date: string; hours: number } | null>(null)
  const chartRef = useRef<HTMLDivElement>(null)

  const chartData = useMemo(() => {
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    const map = new Map<string, number>()
    for (const h of hours.data ?? []) {
      map.set(h.entry_date, (map.get(h.entry_date) ?? 0) + Number(h.total_hours ?? 0))
    }
    const days: { date: string; hours: number; isToday: boolean; dayLabel: string }[] = []
    for (let i = chartRange - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setUTCDate(d.getUTCDate() - i)
      const dateStr = d.toISOString().slice(0, 10)
      const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit' })
      days.push({
        date: dateStr,
        hours: map.get(dateStr) ?? 0,
        isToday: dateStr === todayStr,
        dayLabel,
      })
    }
    return days
  }, [hours.data, chartRange])

  const maxHours = Math.max(1, ...chartData.map((d) => d.hours))
  const avgHours = chartData.reduce((s, d) => s + d.hours, 0) / chartData.length

  const chartLeft = 40
  const chartRight = 590
  const chartWidth = chartRight - chartLeft
  const chartHeight = 150
  const chartBaseline = 190
  const barStep = chartWidth / chartData.length
  const barWidth = Math.max(6, Math.min(20, barStep * 0.55))
  const gridLines = [0, Math.round(maxHours * 0.25), Math.round(maxHours * 0.5), Math.round(maxHours * 0.75), Math.round(maxHours)]
  const yLabels = gridLines.filter((y, i, arr) => y !== arr[i - 1])

  const chartY = (hours: number) => chartBaseline - (hours / maxHours) * chartHeight

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
        title={`${greeting}, ${firstName}`}
      />

      <div className="kpi-grid dashboard-kpi-grid">
        <KpiCard
          tone="green"
          label="Active machines"
          value={machines.status === 'loading' ? <LoadingSpinner small /> : machines.status === 'ready' ? `${activeMachines}` : 'N/A'}
          iconSrc={excavatorUrl}
          iconSize={42}
        />
        <KpiCard
          tone="blue"
          label="Unbilled hour entries"
          value={unbilled.status === 'loading' ? <LoadingSpinner small /> : unbilled.status === 'ready' ? `${unbilled.data}` : 'N/A'}
          iconSrc={unbilledUrl}
          iconSize={38}
        />
        <KpiCard
          tone="red"
          label="Service due / overdue"
          value={maintenance.status === 'loading' ? <LoadingSpinner small /> : maintenance.status === 'ready' ? `${dueCount}` : 'N/A'}
          iconSrc={serviceUrl}
          iconSize={42}
        />
        {showCommercial ? (
          <KpiCard
            tone="gold"
            label="Outstanding invoices"
            value={outstanding.status === 'loading' ? <LoadingSpinner small /> : outstanding.status === 'ready' ? money(outstanding.data) : 'N/A'}
            iconSrc={paymentUrl}
            iconSize={46}
          />
        ) : (
          <KpiCard
            tone="gold"
            label="Fleet size"
            value={machines.status === 'loading' ? <LoadingSpinner small /> : machines.status === 'ready' ? `${fleetTotal}` : 'N/A'}
            icon={FileText}
            iconSize={38}
          />
        )}
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Utilisation</h2>
            </div>
            <div className="range-toggle">
              {[7, 14, 30].map((days) => (
                <button
                  key={days}
                  className={`range-pill${chartRange === days ? ' active' : ''}`}
                  onClick={() => setChartRange(days)}
                >
                  {days}D
                </button>
              ))}
            </div>
          </div>
          <div className="mini-chart" ref={chartRef}>
            {hours.status !== 'ready' || chartData.length === 0 ? (
              <MiniState
                status={hours.status}
                error={hours.error}
                isEmpty={chartData.length === 0}
                emptyText="No hour entries recorded in the last 14 days."
                loadingVariant="chart"
              />
            ) : (
              <svg
                className="chart-svg"
                viewBox="0 0 600 220"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#009943" />
                    <stop offset="100%" stopColor="#31b86c" />
                  </linearGradient>
                  <linearGradient id="todayBarGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#007a35" />
                    <stop offset="100%" stopColor="#009943" />
                  </linearGradient>
                </defs>
                {gridLines.map((y) => (
                  <line
                    key={y}
                    x1={chartLeft}
                    y1={chartY(y)}
                    x2={chartRight}
                    y2={chartY(y)}
                    className="chart-gridline"
                  />
                ))}
                {yLabels.map((y) => (
                  <text
                    key={y}
                    x={chartLeft - 8}
                    y={chartY(y) + 3}
                    className="chart-y-label"
                  >
                    {y}
                  </text>
                ))}
                {chartData.map((d, i) => {
                  const x = chartLeft + (i + 0.5) * barStep
                  const barHeight = maxHours > 0 ? (d.hours / maxHours) * chartHeight : 0
                  const y = chartBaseline - barHeight
                  const isToday = d.isToday
                  const isZero = d.hours === 0
                  return (
                    <g key={d.date}>
                      <rect
                        x={x - barWidth / 2}
                        y={y}
                        width={barWidth}
                        height={Math.max(barHeight, 2)}
                        rx={barWidth / 2}
                        ry={barWidth / 2}
                        className={`chart-bar${isToday ? ' today' : ''}${isZero ? ' zero' : ''}`}
                        style={{
                          fill: isToday ? 'url(#todayBarGradient)' : isZero ? 'none' : 'url(#barGradient)',
                          animationDelay: `${i * 35}ms`,
                        }}
                        onMouseMove={(e) => {
                          const rect = chartRef.current?.getBoundingClientRect()
                          if (rect) {
                            setTooltip({
                              x: e.clientX - rect.left,
                              y: e.clientY - rect.top,
                              date: d.date,
                              hours: d.hours,
                            })
                          }
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      />
                      <text
                        x={x}
                        y={chartBaseline + 14}
                        className="chart-x-label"
                      >
                        {d.dayLabel}
                      </text>
                    </g>
                  )
                })}
                {avgHours > 0 && (
                  <line
                    x1={chartLeft}
                    y1={chartY(avgHours)}
                    x2={chartRight}
                    y2={chartY(avgHours)}
                    className="chart-avg-line"
                  />
                )}
              </svg>
            )}
            {tooltip && (
              <div className="chart-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
                <b>{shortDate(tooltip.date)}</b>
                <span>{fmtHours(tooltip.hours)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Fleet status</h2>
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
                <div className="donut donut-animate" style={{ background: donut.gradient }}>
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

      <section className="panel dashboard-map-panel">
        <div className="panel-header">
          <div>
            <h2>Fleet map</h2>
          </div>
        </div>
        <div className="dashboard-map-content">
          <div className="dashboard-map-summary">
            {machines.status !== 'ready' || fleetTotal === 0 ? (
              <MiniState
                status={machines.status}
                error={machines.error}
                isEmpty={fleetTotal === 0}
                emptyText="No machines to map."
              />
            ) : (
              <div className="dashboard-map-summary-layout">
                {fleetSites.length > 0 && (
                  <PieChart
                    className="dashboard-site-chart"
                    series={[{
                      innerRadius: 30,
                      outerRadius: 100,
                      paddingAngle: 5,
                      cornerRadius: 5,
                      startAngle: -45,
                      endAngle: 225,
                      cx: 150,
                      cy: 150,
                      data: siteChartData,
                      arcLabel: 'value',
                      arcLabelMinAngle: 15,
                    }]}
                    width={300}
                    height={300}
                    hideLegend
                  />
                )}
                {fleetSites.length > 0 && (
                  <ul className="dashboard-site-legend">
                    {fleetSites.map((site, index) => (
                      <li key={site.name}>
                        <i
                          className="dashboard-site-dot"
                          style={{ backgroundColor: FLEET_SITE_COLORS[index % FLEET_SITE_COLORS.length] }}
                          aria-hidden="true"
                        />
                        <span>{site.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          {machines.status === 'ready' && fleetTotal > 0 && (
            <FleetMapModal
              machines={machines.data ?? []}
              inline
              maxZoom={7}
            />
          )}
        </div>
      </section>

      <div className="dashboard-grid lower">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Recent hour entries</h2>
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
              <table className="data-table compact overview-ruled-table">
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
                        <b>{r.machine?.name ?? 'N/A'}</b>
                        <div className="muted-cell mono">{r.machine?.machine_number ?? ''}</div>
                      </td>
                      <td>{r.operator?.full_name ?? 'N/A'}</td>
                      <td>{fmtHours(r.total_hours)}</td>
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
              <h2>Service pipeline</h2>
            </div>
          </div>
          <div className="table-scroll">
            {maintenance.status !== 'ready' || (maintenance.data ?? []).length === 0 ? (
              <div className="panel-pad">
                <MiniState
                  status={maintenance.status}
                  error={maintenance.error}
                  isEmpty={scheduledMaintenance.length === 0}
                  emptyText="No scheduled maintenance."
                />
              </div>
            ) : (
              <table className="data-table compact overview-ruled-table">
                <thead>
                  <tr>
                    <th>Machine</th>
                    <th>Status</th>
                    <th>Due date</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduledMaintenance.slice(0, 4).map((m) => (
                    <tr key={m.id}>
                      <td>
                        <b>{m.machine?.name ?? 'N/A'}</b>
                        <div className="muted-cell mono">{m.machine?.machine_number ?? ''}</div>
                        <div className="muted-cell">{m.machine?.machine_type ?? ''}</div>
                      </td>
                      <td>
                        <StatusBadge tone={maintenanceStatusTone(m.effectiveStatus)}>
                          {titleCase(m.effectiveStatus)}
                        </StatusBadge>
                      </td>
                      <td>{shortDate(maintenanceDueDate(m))}</td>
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
