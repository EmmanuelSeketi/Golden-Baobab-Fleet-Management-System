'use client'

import { useMemo, useState } from 'react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { money, shortDate } from '@/lib/gbi/format'
import { DetailGrid, Modal, PageHeading, StatusBadge, ViewState } from '@/components/shared'

type Repair = {
  id: string
  fault_date: string
  fault_description: string
  mechanic: string | null
  repair_completed: boolean
  parts_used: string | null
  cost: number | null
  downtime_hours: number | null
  machine: { machine_number: string; machine_type: string } | null
}

const FILTERS = ['all', 'open', 'completed'] as const
const LIST_SELECT =
  'id,fault_date,fault_description,mechanic,repair_completed,parts_used,cost,downtime_hours,machine:machine_id(machine_number,machine_type)'

export function RepairsView() {
  const supabase = useSupabase()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all')
  const [selected, setSelected] = useState<Repair | null>(null)

  const records = useQuery<Repair[]>(
    () =>
      supabase
        .from('repair_record')
        .select(LIST_SELECT)
        .order('fault_date', { ascending: false }) as unknown as PromiseLike<{
        data: Repair[] | null
        error: unknown
      }>,
    [],
  )

  const rows = useMemo(() => {
    const all = records.data ?? []
    if (filter === 'all') return all
    return all.filter((r) => (filter === 'completed' ? r.repair_completed : !r.repair_completed))
  }, [records.data, filter])

  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="Assets"
        title="Repairs"
        description="Breakdown and fault records with downtime, parts used and repair status."
      />

      <div className="filter-row">
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
          title="repairs"
          emptyText={filter === 'all' ? 'No repair records yet.' : `No ${filter} repairs.`}
          onRetry={records.reload}
        >
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Fault date</th>
                  <th>Description</th>
                  <th>Downtime</th>
                  <th>Cost</th>
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
                    <td>{shortDate(r.fault_date)}</td>
                    <td className="truncate-cell">{r.fault_description}</td>
                    <td>{r.downtime_hours != null ? `${r.downtime_hours} h` : '—'}</td>
                    <td>{money(r.cost)}</td>
                    <td>
                      <StatusBadge tone={r.repair_completed ? 'green' : 'amber'}>
                        {r.repair_completed ? 'Completed' : 'Open'}
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
        eyebrow="Repair record"
        title={selected?.machine?.machine_number ?? ''}
        subtitle={selected ? shortDate(selected.fault_date) : ''}
        footer={
          selected ? (
            <StatusBadge tone={selected.repair_completed ? 'green' : 'amber'}>
              {selected.repair_completed ? 'Completed' : 'Open'}
            </StatusBadge>
          ) : null
        }
      >
        {selected && (
          <DetailGrid
            items={[
              ['Machine', selected.machine?.machine_number ?? '—'],
              ['Machine type', selected.machine?.machine_type ?? '—'],
              ['Fault date', shortDate(selected.fault_date)],
              ['Mechanic', selected.mechanic ?? '—'],
              ['Downtime', selected.downtime_hours != null ? `${selected.downtime_hours} h` : '—'],
              ['Cost', money(selected.cost)],
              ['Parts used', selected.parts_used ?? '—'],
              ['Fault description', selected.fault_description],
            ]}
          />
        )}
      </Modal>
    </div>
  )
}
