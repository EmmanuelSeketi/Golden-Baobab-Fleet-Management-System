'use client'

import { useState } from 'react'
import { AlertTriangle, CalendarDays, Download, FileSpreadsheet } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { friendlyError, hours as fmtHours, meter, shortDate } from '@/lib/gbi/format'
import { buildMatrix, exportCsv, exportXlsx, type ExportColumn } from '@/lib/gbi/export'
import { DetailGrid, Modal, PageHeading, StatusBadge, ViewState } from '@/components/shared'

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

export function DailyHoursView() {
  const supabase = useSupabase()
  const today = isoDate(new Date())
  const [selectedDate, setSelectedDate] = useState<string>(today)
  const [selected, setSelected] = useState<Entry | null>(null)

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
  const totalHours = rows.reduce((s, r) => s + Number(r.total_hours ?? 0), 0)
  const flagged = rows.filter((r) => r.flagged_for_review).length
  const billed = rows.filter((r) => r.is_billed).length
  const isToday = selectedDate === today

  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="Operations"
        title="Daily Working Hours"
        description="Hour-meter readings captured per machine, per day, with review flags for abnormal jumps."
      />

      <ExportBar />

      <div className="hours-toolbar">
        <label className="date-control">
          <CalendarDays size={15} />
          <input
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
          isEmpty={rows.length === 0}
          title="daily hours"
          emptyTitle={isToday ? 'Nothing submitted yet for today' : 'No entries for this date'}
          emptyText={
            isToday
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
                  <th>Project</th>
                  <th>Meter start</th>
                  <th>Meter end</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="clickable-row" onClick={() => setSelected(r)}>
                    <td>
                      <b>{r.machine?.machine_number ?? '—'}</b>
                      <div className="muted-cell">{r.machine?.machine_type ?? ''}</div>
                    </td>
                    <td>{r.operator?.full_name ?? '—'}</td>
                    <td>{r.project?.name ?? '—'}</td>
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
                ))}
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

    const { headers, rows } = buildMatrix(list, EXPORT_COLUMNS)
    const base = `daily-working-hours_${from}_to_${to}`
    try {
      if (kind === 'csv') exportCsv(`${base}.csv`, headers, rows)
      else await exportXlsx(`${base}.xlsx`, headers, rows, 'Daily Hours')
      setMessage({
        text: `Exported ${list.length} ${list.length === 1 ? 'entry' : 'entries'} (${kind.toUpperCase()}).`,
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
        <label htmlFor="export-from">From</label>
        <input id="export-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div className="range-field">
        <label htmlFor="export-to">To</label>
        <input
          id="export-to"
          type="date"
          value={to}
          min={from}
          max={isoDate(new Date())}
          onChange={(e) => setTo(e.target.value)}
        />
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
