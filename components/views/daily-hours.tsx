'use client'

import { Fragment, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CalendarDays, Download, FileSpreadsheet, Layers } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { friendlyError, hours as fmtHours, meter, shortDate } from '@/lib/gbi/format'
import { buildMatrix, exportCsvSections, exportXlsxSheets, type ExportColumn } from '@/lib/gbi/export'
import { DetailGrid, Modal, PageHeading, StatusBadge, ViewState } from '@/components/shared'
import { DailyHoursEntry } from '@/components/views/daily-hours-entry'
import type { UserRole } from '@/lib/gbi/roles'

type Entry = {
  id: string
  entry_date: string
  hour_meter_start: number
  hour_meter_end: number
  total_hours: number | null
  flagged_for_review: boolean
  is_billed: boolean
  remarks: string | null
  site_location: string | null
  machine: { machine_number: string; machine_type: string } | null
  operator: { full_name: string } | null
  project: { name: string } | null
  customer: { company_name: string } | null
}

const SELECT =
  'id,entry_date,hour_meter_start,hour_meter_end,total_hours,flagged_for_review,is_billed,remarks,site_location,machine:machine_id(machine_number,machine_type),operator:operator_id(full_name),project:project_id(name),customer:customer_id(company_name)'

// Local calendar date as YYYY-MM-DD (avoids UTC shifting the day near midnight).
function isoDate(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return isoDate(d)
}

const EXPORT_COLUMNS: ExportColumn<Entry>[] = [
  { header: 'Entry date', value: (r) => r.entry_date },
  { header: 'Machine', value: (r) => r.machine?.machine_number ?? '' },
  { header: 'Operator', value: (r) => r.operator?.full_name ?? '' },
  { header: 'Customer', value: (r) => r.customer?.company_name ?? '' },
  { header: 'Project', value: (r) => r.project?.name ?? '' },
  { header: 'Hour meter start', value: (r) => r.hour_meter_start },
  { header: 'Hour meter end', value: (r) => r.hour_meter_end },
  { header: 'Total hours', value: (r) => r.total_hours ?? '' },
  { header: 'Site location', value: (r) => r.site_location ?? '' },
  { header: 'Remarks', value: (r) => r.remarks ?? '' },
]

// Group entries by site location for the sectioned export (null/blank →
// "No site location"), sorted so the exported sheets/blocks are stable.
function groupBySite(list: Entry[]): { name: string; rows: Entry[] }[] {
  const map = new Map<string, Entry[]>()
  for (const r of list) {
    const key = r.site_location?.trim() || 'No site location'
    const arr = map.get(key)
    if (arr) arr.push(r)
    else map.set(key, [r])
  }
  return Array.from(map.entries())
    .map(([name, rows]) => ({ name, rows }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function DailyHoursView({ role, userId }: { role: UserRole; userId: string }) {
  const supabase = useSupabase()
  const today = isoDate(new Date())
  const [selectedDate, setSelectedDate] = useState<string>(today)
  const [selected, setSelected] = useState<Entry | null>(null)
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [grouped, setGrouped] = useState(false)
  const dateInputRef = useRef<HTMLInputElement>(null)

  const entries = useQuery<Entry[]>(
    () =>
      !selectedDate
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('daily_hour_entry')
            .select(SELECT)
            .eq('entry_date', selectedDate)
            .order('created_at') as unknown as PromiseLike<{ data: Entry[] | null; error: unknown }>),
    [selectedDate],
  )

  const rows = entries.data ?? []

  // Distinct project names present in the day's entries (null → "Unassigned"),
  // used to populate the project filter and the group headers.
  const projectNames = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) set.add(r.project?.name ?? 'Unassigned')
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rows])

  // If the active filter no longer matches any entry (e.g. after changing the
  // date), fall back to showing everything rather than an empty table.
  const activeFilter = projectFilter !== 'all' && projectNames.includes(projectFilter) ? projectFilter : 'all'

  const visibleRows = useMemo(
    () => (activeFilter === 'all' ? rows : rows.filter((r) => (r.project?.name ?? 'Unassigned') === activeFilter)),
    [rows, activeFilter],
  )

  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>()
    for (const r of visibleRows) {
      const key = r.project?.name ?? 'Unassigned'
      const list = map.get(key)
      if (list) list.push(r)
      else map.set(key, [r])
    }
    return Array.from(map.entries())
      .map(([name, list]) => ({
        name,
        list,
        totalHours: list.reduce((s, r) => s + Number(r.total_hours ?? 0), 0),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [visibleRows])

  const totalHours = visibleRows.reduce((s, r) => s + Number(r.total_hours ?? 0), 0)
  const flagged = visibleRows.filter((r) => r.flagged_for_review).length
  const billed = visibleRows.filter((r) => r.is_billed).length
  const isToday = selectedDate === today

  function renderRow(r: Entry) {
    return (
      <tr key={r.id} className="clickable-row" onClick={() => setSelected(r)}>
        <td>
          <b>{r.machine?.machine_number ?? '—'}</b>
          <div className="muted-cell">{r.machine?.machine_type ?? ''}</div>
        </td>
        <td>{r.operator?.full_name ?? '—'}</td>
        {!grouped && <td>{r.project?.name ?? '—'}</td>}
        <td>{meter(r.hour_meter_start)}</td>
        <td>{meter(r.hour_meter_end)}</td>
        <td>
          <b>{fmtHours(r.total_hours)}</b>
        </td>
        <td>
          {r.flagged_for_review ? (
            <StatusBadge tone="red">
              <AlertTriangle size={11} /> Review
            </StatusBadge>
          ) : r.is_billed ? (
            <StatusBadge tone="green">Billed</StatusBadge>
          ) : (
            <StatusBadge tone="blue">Unbilled</StatusBadge>
          )}
        </td>
      </tr>
    )
  }

  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="Operations"
        title="Daily Working Hours"
        description="Hour-meter readings captured per machine, per day, with review flags for abnormal jumps."
      />

      <ExportBar />

      <DailyHoursEntry role={role} userId={userId} date={selectedDate} onSaved={entries.reload} />

      <div className="hours-toolbar">
        <label
          className="date-control"
          onClick={() => {
            // Open the native picker from anywhere in the control, not just the
            // (now hidden) built-in indicator icon.
            try {
              dateInputRef.current?.showPicker?.()
            } catch {
              /* showPicker unsupported/blocked — focusing the input still works */
            }
          }}
        >
          <CalendarDays size={15} />
          <input
            ref={dateInputRef}
            type="date"
            value={selectedDate}
            max={today}
            onChange={(e) => setSelectedDate(e.target.value)}
            aria-label="Select date"
          />
        </label>
        {!isToday && (
          <button className="today-button" onClick={() => setSelectedDate(today)}>
            Back to today
          </button>
        )}

        <div className="toolbar-spacer" />

        <label className="filter-select">
          <span>Project</span>
          <select value={activeFilter} onChange={(e) => setProjectFilter(e.target.value)} aria-label="Filter by project">
            <option value="all">All projects</option>
            {projectNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <button
          className={`today-button group-toggle${grouped ? ' active' : ''}`}
          onClick={() => setGrouped((g) => !g)}
          aria-pressed={grouped}
        >
          <Layers size={13} />
          Group by project
        </button>
      </div>

      <div className="hours-summary">
        <div>
          <span>Entries</span>
          <b>{entries.status === 'ready' ? rows.length : '—'}</b>
        </div>
        <div>
          <span>Total hours</span>
          <b>{entries.status === 'ready' ? fmtHours(totalHours) : '—'}</b>
        </div>
        <div>
          <span>Flagged for review</span>
          <b className={flagged > 0 ? 'danger-text' : ''}>
            {entries.status === 'ready' ? flagged : '—'}
          </b>
        </div>
        <div>
          <span>Billed</span>
          <b>{entries.status === 'ready' ? billed : '—'}</b>
        </div>
        <div>
          <span>Selected date</span>
          <b>{isToday ? 'Today' : shortDate(selectedDate)}</b>
        </div>
      </div>

      <div className="panel hours-panel">
        <ViewState
          status={entries.status}
          error={entries.error}
          isEmpty={visibleRows.length === 0}
          title="daily hours"
          emptyTitle={isToday ? 'Nothing submitted yet for today' : 'No entries for this date'}
          emptyText={
            activeFilter !== 'all'
              ? `No entries for "${activeFilter}" on the selected date.`
              : isToday
                ? 'Hour entries submitted for today will appear here as operators log them.'
                : 'No hour entries were recorded on the selected date.'
          }
          onRetry={entries.reload}
        >
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Operator</th>
                  {!grouped && <th>Project</th>}
                  <th>Meter start</th>
                  <th>Meter end</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {grouped
                  ? groups.map((g) => (
                      <Fragment key={g.name}>
                        <tr className="group-header-row">
                          <td colSpan={6}>
                            <span className="group-name">{g.name}</span>
                            <span className="group-meta">
                              {g.list.length} {g.list.length === 1 ? 'machine' : 'machines'} · {fmtHours(g.totalHours)}
                            </span>
                          </td>
                        </tr>
                        {g.list.map(renderRow)}
                      </Fragment>
                    ))
                  : visibleRows.map(renderRow)}
              </tbody>
            </table>
          </div>
        </ViewState>
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        eyebrow="Daily hour entry"
        title={selected?.machine?.machine_number ?? ''}
        subtitle={selected ? `${shortDate(selected.entry_date)} · ${selected.machine?.machine_type ?? ''}` : ''}
      >
        {selected && (
          <DetailGrid
            items={[
              ['Operator', selected.operator?.full_name ?? '—'],
              ['Project', selected.project?.name ?? '—'],
              ['Customer', selected.customer?.company_name ?? '—'],
              ['Site location', selected.site_location ?? '—'],
              ['Meter start', meter(selected.hour_meter_start)],
              ['Meter end', meter(selected.hour_meter_end)],
              ['Total hours', fmtHours(selected.total_hours)],
              [
                'Review flag',
                selected.flagged_for_review ? (
                  <StatusBadge tone="red">Flagged</StatusBadge>
                ) : (
                  <StatusBadge tone="green">Normal</StatusBadge>
                ),
              ],
              [
                'Billing',
                selected.is_billed ? (
                  <StatusBadge tone="green">Billed</StatusBadge>
                ) : (
                  <StatusBadge tone="blue">Unbilled</StatusBadge>
                ),
              ],
              ['Remarks', selected.remarks ?? '—'],
            ]}
          />
        )}
      </Modal>
    </div>
  )
}

// Independent of the main table's current-day filter: pick any range and export
// exactly the rows the current role can read (RLS is applied by the query).
function ExportBar() {
  const supabase = useSupabase()
  const [from, setFrom] = useState<string>(daysAgo(30))
  const [to, setTo] = useState<string>(isoDate(new Date()))
  const [busy, setBusy] = useState<null | 'csv' | 'xlsx'>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const fromRef = useRef<HTMLInputElement>(null)
  const toRef = useRef<HTMLInputElement>(null)

  function openPicker(ref: React.RefObject<HTMLInputElement | null>) {
    try {
      ref.current?.showPicker?.()
    } catch {
      /* showPicker unsupported/blocked — focusing the input still works */
    }
  }

  async function runExport(kind: 'csv' | 'xlsx') {
    if (from > to) {
      setMessage({ text: 'The "from" date must be on or before the "to" date.', error: true })
      return
    }
    setBusy(kind)
    setMessage(null)
    const { data, error } = await supabase
      .from('daily_hour_entry')
      .select(SELECT)
      .gte('entry_date', from)
      .lte('entry_date', to)
      .order('entry_date')
      .order('created_at')

    if (error) {
      setMessage({ text: friendlyError(error), error: true })
      setBusy(null)
      return
    }
    const list = (data ?? []) as unknown as Entry[]
    if (list.length === 0) {
      setMessage({ text: 'No entries in this range to export.', error: true })
      setBusy(null)
      return
    }

    // Section the export by Site Location — one worksheet per site in Excel,
    // one labelled block per site in CSV (which has no real sheets).
    const sections = groupBySite(list).map((g) => {
      const { headers, rows } = buildMatrix(g.rows, EXPORT_COLUMNS)
      return { name: g.name, headers, rows }
    })
    const base = `daily-working-hours_${from}_to_${to}`
    try {
      if (kind === 'csv') exportCsvSections(`${base}.csv`, sections)
      else await exportXlsxSheets(`${base}.xlsx`, sections)
      const siteWord = sections.length === 1 ? 'site' : 'sites'
      setMessage({
        text: `Exported ${list.length} ${list.length === 1 ? 'entry' : 'entries'} across ${sections.length} ${siteWord} (${kind.toUpperCase()}).`,
        error: false,
      })
    } catch {
      setMessage({ text: 'Could not generate the file. Please try again.', error: true })
    }
    setBusy(null)
  }

  return (
    <div className="export-bar">
      <div className="export-title">
        <b>Export working hours</b>
        <span>Choose any date range — independent of the day shown below.</span>
      </div>
      <div className="range-field">
        <span className="range-label">From</span>
        <label className="date-control" onClick={() => openPicker(fromRef)}>
          <CalendarDays size={15} />
          <input
            ref={fromRef}
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="Export from date"
          />
        </label>
      </div>
      <div className="range-field">
        <span className="range-label">To</span>
        <label className="date-control" onClick={() => openPicker(toRef)}>
          <CalendarDays size={15} />
          <input
            ref={toRef}
            type="date"
            value={to}
            min={from}
            max={isoDate(new Date())}
            onChange={(e) => setTo(e.target.value)}
            aria-label="Export to date"
          />
        </label>
      </div>
      <div className="export-actions">
        <button className="button button-secondary" onClick={() => runExport('csv')} disabled={busy !== null}>
          <Download size={14} />
          {busy === 'csv' ? 'Exporting…' : 'CSV'}
        </button>
        <button className="button button-primary" onClick={() => runExport('xlsx')} disabled={busy !== null}>
          <FileSpreadsheet size={14} />
          {busy === 'xlsx' ? 'Exporting…' : 'Excel'}
        </button>
      </div>
      {message && <p className={`export-msg ${message.error ? 'error' : ''}`}>{message.text}</p>}
    </div>
  )
}
