'use client'

import { useMemo, useState } from 'react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { maintenanceStatusTone, money, shortDate, titleCase } from '@/lib/gbi/format'
import { DetailGrid, Modal, PageHeading, StatusBadge, ViewState } from '@/components/shared'

type Maintenance = {
  id: string
  service_date: string
  hour_meter_at_service: number | null
  next_service_due_hours: number | null
  next_service_due_date: string | null
  service_type: string | null
  mechanic: string | null
  parts_replaced: string | null
  cost: number | null
  status: string
  machine: { machine_number: string; machine_type: string } | null
}

const STATUSES = ['all', 'upcoming', 'due', 'overdue', 'completed']
const LIST_SELECT =
  'id,service_date,hour_meter_at_service,next_service_due_hours,next_service_due_date,service_type,mechanic,parts_replaced,cost,status,machine:machine_id(machine_number,machine_type)'

export function MaintenanceView() {
  const supabase = useSupabase()
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState<Maintenance | null>(null)

  const records = useQuery<Maintenance[]>(
    () =>
      supabase
        .from('maintenance_record')
        .select(LIST_SELECT)
        .order('service_date', { ascending: false }) as unknown as PromiseLike<{
        data: Maintenance[] | null
        error: unknown
      }>,
    [],
  )

  const rows = useMemo(() => {
    const all = records.data ?? []
    return filter === 'all' ? all : all.filter((r) => r.status === filter)
  }, [records.data, filter])

  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="Assets"
        title="Maintenance"
        description="Scheduled and completed servicing, with the next service due by hours or date."
      />

      <div className="filter-row">
        {STATUSES.map((s) => (
          <button
            key={s}
            className={`chip ${filter === s ? 'chip-active' : ''}`}
            onClick={() => setFilter(s)}
          >
            {titleCase(s)}
          </button>
        ))}
      </div>

      <div className="panel">
        <ViewState
          status={records.status}
          error={records.error}
          isEmpty={rows.length === 0}
          title="maintenance"
          emptyText={filter === 'all' ? 'No maintenance records yet.' : `No ${filter} maintenance records.`}
          onRetry={records.reload}
        >
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Service date</th>
                  <th>Type</th>
                  <th>Mechanic</th>
                  <th>Next due</th>
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
                    <td>{shortDate(r.service_date)}</td>
                    <td>{r.service_type ?? '—'}</td>
                    <td>{r.mechanic ?? '—'}</td>
                    <td>{shortDate(r.next_service_due_date)}</td>
                    <td>
                      <StatusBadge tone={maintenanceStatusTone(r.status)}>{titleCase(r.status)}</StatusBadge>
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
        eyebrow="Maintenance record"
        title={selected?.machine?.machine_number ?? ''}
        subtitle={selected ? `${selected.service_type ?? 'Service'} · ${shortDate(selected.service_date)}` : ''}
        footer={
          selected ? (
            <StatusBadge tone={maintenanceStatusTone(selected.status)}>{titleCase(selected.status)}</StatusBadge>
          ) : null
        }
      >
        {selected && (
          <DetailGrid
            items={[
              ['Machine', selected.machine?.machine_number ?? '—'],
              ['Machine type', selected.machine?.machine_type ?? '—'],
              ['Service date', shortDate(selected.service_date)],
              ['Service type', selected.service_type ?? '—'],
              ['Mechanic', selected.mechanic ?? '—'],
              ['Meter at service', selected.hour_meter_at_service ? `${selected.hour_meter_at_service} h` : '—'],
              ['Next due (hours)', selected.next_service_due_hours ? `${selected.next_service_due_hours} h` : '—'],
              ['Next due (date)', shortDate(selected.next_service_due_date)],
              ['Cost', money(selected.cost)],
              ['Parts replaced', selected.parts_replaced ?? '—'],
            ]}
          />
        )}
      </Modal>
    </div>
  )
}
