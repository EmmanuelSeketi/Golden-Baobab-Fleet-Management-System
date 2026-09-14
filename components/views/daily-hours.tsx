'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CalendarDays } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { hours as fmtHours, meter, shortDate } from '@/lib/gbi/format'
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

export function DailyHoursView() {
  const supabase = useSupabase()
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selected, setSelected] = useState<Entry | null>(null)

  const dates = useQuery<string[]>(
    () =>
      supabase
        .from('daily_hour_entry')
        .select('entry_date')
        .order('entry_date', { ascending: false })
        .then((r) => ({
          data: Array.from(new Set((r.data ?? []).map((x) => x.entry_date as string))),
          error: r.error,
        })),
    [],
  )

  useEffect(() => {
    if (!selectedDate && dates.data && dates.data.length > 0) setSelectedDate(dates.data[0])
  }, [dates.data, selectedDate])

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

  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="Operations"
        title="Daily Working Hours"
        description="Hour-meter readings captured per machine, per day, with review flags for abnormal jumps."
      />

      <div className="hours-toolbar">
        <label className="date-control">
          <CalendarDays size={15} />
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            aria-label="Select date"
          >
            {dates.status === 'ready' && (dates.data ?? []).length === 0 && <option>No dates</option>}
            {(dates.data ?? []).map((d) => (
              <option key={d} value={d}>
                {shortDate(d)}
              </option>
            ))}
          </select>
        </label>
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
          <b>{selectedDate ? shortDate(selectedDate) : '—'}</b>
        </div>
      </div>

      <div className="panel hours-panel">
        <ViewState
          status={dates.status === 'ready' ? entries.status : dates.status}
          error={entries.error || dates.error}
          isEmpty={rows.length === 0}
          title="daily hours"
          emptyText="No hour entries were recorded on this date."
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
