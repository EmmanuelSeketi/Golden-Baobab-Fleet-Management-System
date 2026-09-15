'use client'

import { useMemo, useState } from 'react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { dateTime, money, shortDate } from '@/lib/gbi/format'
import { DetailGrid, Modal, PageHeading, StatusBadge, ViewState } from '@/components/shared'

type Overtime = {
  id: string
  standard_hours: number
  overtime_hours: number
  overtime_pay: number
  reviewed: boolean
  reviewed_at: string | null
  created_at: string
  operator: { full_name: string } | null
  rule: { name: string; weekday_rate_multiplier: number | null } | null
  entry: {
    entry_date: string
    machine: { machine_number: string } | null
  } | null
}

const FILTERS = ['all', 'pending', 'reviewed'] as const
const LIST_SELECT =
  'id,standard_hours,overtime_hours,overtime_pay,reviewed,reviewed_at,created_at,operator:operator_id(full_name),rule:overtime_rule_id(name,weekday_rate_multiplier),entry:daily_hour_entry_id(entry_date,machine:machine_id(machine_number))'

export function OvertimeView() {
  const supabase = useSupabase()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all')
  const [selected, setSelected] = useState<Overtime | null>(null)

  const records = useQuery<Overtime[]>(
    () =>
      supabase
        .from('overtime_entry')
        .select(LIST_SELECT)
        .order('created_at', { ascending: false }) as unknown as PromiseLike<{
        data: Overtime[] | null
        error: unknown
      }>,
    [],
  )

  const rows = useMemo(() => {
    const all = records.data ?? []
    if (filter === 'all') return all
    return all.filter((r) => (filter === 'reviewed' ? r.reviewed : !r.reviewed))
  }, [records.data, filter])

  const totalPay = rows.reduce((s, r) => s + Number(r.overtime_pay ?? 0), 0)
  const totalHours = rows.reduce((s, r) => s + Number(r.overtime_hours ?? 0), 0)

  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="People"
        title="Operator Overtime"
        description="Overtime calculated per daily entry against the effective overtime rule, pending management review."
      />

      <div className="hours-summary">
        <div>
          <span>Entries</span>
          <b>{records.status === 'ready' ? rows.length : '—'}</b>
        </div>
        <div>
          <span>Overtime hours</span>
          <b>{records.status === 'ready' ? `${totalHours.toFixed(1)} h` : '—'}</b>
        </div>
        <div>
          <span>Overtime pay</span>
          <b>{records.status === 'ready' ? money(totalPay) : '—'}</b>
        </div>
        <div>
          <span>Pending review</span>
          <b className={rows.some((r) => !r.reviewed) ? 'danger-text' : ''}>
            {records.status === 'ready' ? rows.filter((r) => !r.reviewed).length : '—'}
          </b>
        </div>
        <div>
          <span>Filter</span>
          <b style={{ textTransform: 'capitalize' }}>{filter}</b>
        </div>
      </div>

      <div className="filter-row" style={{ marginTop: 14 }}>
        {FILTERS.map((f) => (
          <button key={f} className={`chip ${filter === f ? 'chip-active' : ''}`} onClick={() => setFilter(f)}>
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="panel">
        <ViewState
          status={records.status}
          error={records.error}
          isEmpty={rows.length === 0}
          title="overtime"
          emptyText={filter === 'all' ? 'No overtime recorded yet.' : `No ${filter} overtime entries.`}
          onRetry={records.reload}
        >
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Operator</th>
                  <th>Date</th>
                  <th>Machine</th>
                  <th>Standard</th>
                  <th>Overtime</th>
                  <th>Pay</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="clickable-row" onClick={() => setSelected(r)}>
                    <td>
                      <b>{r.operator?.full_name ?? '—'}</b>
                      <div className="muted-cell">{r.rule?.name ?? ''}</div>
                    </td>
                    <td>{shortDate(r.entry?.entry_date)}</td>
                    <td>{r.entry?.machine?.machine_number ?? '—'}</td>
                    <td>{Number(r.standard_hours).toFixed(1)} h</td>
                    <td>
                      <b>{Number(r.overtime_hours).toFixed(1)} h</b>
                    </td>
                    <td>{money(r.overtime_pay)}</td>
                    <td>
                      <StatusBadge tone={r.reviewed ? 'green' : 'amber'}>
                        {r.reviewed ? 'Reviewed' : 'Pending'}
                      </StatusBadge>
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
        eyebrow="Overtime entry"
        title={selected?.operator?.full_name ?? ''}
        subtitle={selected ? shortDate(selected.entry?.entry_date) : ''}
        footer={
          selected ? (
            <StatusBadge tone={selected.reviewed ? 'green' : 'amber'}>
              {selected.reviewed ? 'Reviewed' : 'Pending review'}
            </StatusBadge>
          ) : null
        }
      >
        {selected && (
          <DetailGrid
            items={[
              ['Operator', selected.operator?.full_name ?? '—'],
              ['Machine', selected.entry?.machine?.machine_number ?? '—'],
              ['Entry date', shortDate(selected.entry?.entry_date)],
              ['Overtime rule', selected.rule?.name ?? '—'],
              [
                'Weekday multiplier',
                selected.rule?.weekday_rate_multiplier ? `${selected.rule.weekday_rate_multiplier}×` : '—',
              ],
              ['Standard hours', `${Number(selected.standard_hours).toFixed(1)} h`],
              ['Overtime hours', `${Number(selected.overtime_hours).toFixed(1)} h`],
              ['Overtime pay', money(selected.overtime_pay)],
              ['Reviewed at', selected.reviewed_at ? dateTime(selected.reviewed_at) : 'Not yet reviewed'],
              ['Recorded', dateTime(selected.created_at)],
            ]}
          />
        )}
      </Modal>
    </div>
  )
}
