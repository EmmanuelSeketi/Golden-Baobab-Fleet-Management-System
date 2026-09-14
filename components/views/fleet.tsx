'use client'

import { useMemo, useState } from 'react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { machineStatusTone, meter, money, shortDate, titleCase } from '@/lib/gbi/format'
import {
  DetailGrid,
  MiniState,
  Modal,
  ModalSection,
  PageHeading,
  StatusBadge,
  ViewState,
} from '@/components/shared'

type Machine = {
  id: string
  machine_number: string
  asset_number: string | null
  registration_number: string | null
  machine_type: string
  manufacturer: string | null
  brand: string | null
  model: string | null
  year: number | null
  current_hour_meter: number
  service_interval_hours: number | null
  purchase_date: string | null
  purchase_price: number | null
  current_status: string
  operator: { full_name: string } | null
  project: { name: string; site_location: string | null } | null
}

const LIST_SELECT =
  'id,machine_number,asset_number,registration_number,machine_type,manufacturer,brand,model,year,current_hour_meter,service_interval_hours,purchase_date,purchase_price,current_status,operator:assigned_operator_id(full_name),project:current_project_id(name,site_location)'

export function FleetView() {
  const supabase = useSupabase()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Machine | null>(null)

  const machines = useQuery<Machine[]>(
    () =>
      supabase.from('machine').select(LIST_SELECT).order('machine_number') as unknown as PromiseLike<{
        data: Machine[] | null
        error: unknown
      }>,
    [],
  )

  const rows = useMemo(() => {
    const all = machines.data ?? []
    if (!query.trim()) return all
    const q = query.toLowerCase()
    return all.filter(
      (m) =>
        m.machine_number.toLowerCase().includes(q) ||
        m.machine_type.toLowerCase().includes(q) ||
        (m.manufacturer ?? '').toLowerCase().includes(q),
    )
  }, [machines.data, query])

  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="Assets"
        title="Fleet Register"
        description="Every machine with its live hour meter, current status, operator and deployment."
      />

      <div className="filter-row">
        <div className="toolbar-search">
          <input
            placeholder="Search by number, type or manufacturer…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="panel">
        <ViewState
          status={machines.status}
          error={machines.error}
          isEmpty={rows.length === 0}
          title="fleet register"
          emptyText={query ? 'No machines match your search.' : 'No machines registered yet.'}
          onRetry={machines.reload}
        >
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Type</th>
                  <th>Hour meter</th>
                  <th>Operator</th>
                  <th>Deployment</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="clickable-row" onClick={() => setSelected(m)}>
                    <td>
                      <b>{m.machine_number}</b>
                      <div className="muted-cell">{[m.manufacturer, m.model].filter(Boolean).join(' ')}</div>
                    </td>
                    <td>{m.machine_type}</td>
                    <td>{meter(m.current_hour_meter)}</td>
                    <td>{m.operator?.full_name ?? '—'}</td>
                    <td>{m.project?.name ?? '—'}</td>
                    <td>
                      <StatusBadge tone={machineStatusTone(m.current_status)}>
                        {titleCase(m.current_status)}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ViewState>
      </div>

      <MachineModal machine={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

type MaintRow = {
  id: string
  service_date: string
  status: string
  service_type: string | null
  next_service_due_date: string | null
}
type RepairRow = {
  id: string
  fault_date: string
  fault_description: string
  repair_completed: boolean
  cost: number | null
}
type AssignmentRow = {
  id: string
  start_date: string
  end_date: string | null
  operator: { full_name: string } | null
  project: { name: string } | null
}

function MachineModal({ machine, onClose }: { machine: Machine | null; onClose: () => void }) {
  const supabase = useSupabase()

  const maintenance = useQuery<MaintRow[]>(
    () =>
      !machine
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('maintenance_record')
            .select('id,service_date,status,service_type,next_service_due_date')
            .eq('machine_id', machine.id)
            .order('service_date', { ascending: false })
            .limit(5) as unknown as PromiseLike<{ data: MaintRow[] | null; error: unknown }>),
    [machine?.id],
  )
  const repairs = useQuery<RepairRow[]>(
    () =>
      !machine
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('repair_record')
            .select('id,fault_date,fault_description,repair_completed,cost')
            .eq('machine_id', machine.id)
            .order('fault_date', { ascending: false })
            .limit(5) as unknown as PromiseLike<{ data: RepairRow[] | null; error: unknown }>),
    [machine?.id],
  )
  const assignments = useQuery<AssignmentRow[]>(
    () =>
      !machine
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('machine_assignment')
            .select('id,start_date,end_date,operator:operator_id(full_name),project:project_id(name)')
            .eq('machine_id', machine.id)
            .order('start_date', { ascending: false })
            .limit(6) as unknown as PromiseLike<{ data: AssignmentRow[] | null; error: unknown }>),
    [machine?.id],
  )

  return (
    <Modal
      open={!!machine}
      onClose={onClose}
      eyebrow="Machine detail"
      title={machine?.machine_number ?? ''}
      subtitle={machine ? `${machine.machine_type}${machine.model ? ` · ${machine.model}` : ''}` : ''}
      footer={
        machine ? (
          <StatusBadge tone={machineStatusTone(machine.current_status)}>
            {titleCase(machine.current_status)}
          </StatusBadge>
        ) : null
      }
    >
      {machine && (
        <>
          <DetailGrid
            items={[
              ['Asset number', machine.asset_number ?? '—'],
              ['Registration', machine.registration_number ?? '—'],
              ['Manufacturer', machine.manufacturer ?? '—'],
              ['Brand / model', [machine.brand, machine.model].filter(Boolean).join(' ') || '—'],
              ['Year', machine.year ?? '—'],
              ['Hour meter', meter(machine.current_hour_meter)],
              ['Service interval', machine.service_interval_hours ? `${machine.service_interval_hours} h` : '—'],
              ['Current operator', machine.operator?.full_name ?? '—'],
              ['Current project', machine.project?.name ?? '—'],
              ['Site', machine.project?.site_location ?? '—'],
              ['Purchase date', shortDate(machine.purchase_date)],
              ['Purchase price', money(machine.purchase_price)],
            ]}
          />

          <ModalSection title="Assignment history" count={assignments.data?.length}>
            <MiniState
              status={assignments.status}
              error={assignments.error}
              isEmpty={(assignments.data ?? []).length === 0}
              emptyText="No assignment history recorded."
            />
            {(assignments.data ?? []).map((a) => (
              <div className="stack-row" key={a.id}>
                <div>
                  <b>{a.operator?.full_name ?? 'Unassigned'}</b>
                  <span>{a.project?.name ?? 'No project'}</span>
                </div>
                <div className="stack-meta">
                  {shortDate(a.start_date)} → {a.end_date ? shortDate(a.end_date) : 'current'}
                </div>
              </div>
            ))}
          </ModalSection>

          <ModalSection title="Recent maintenance" count={maintenance.data?.length}>
            <MiniState
              status={maintenance.status}
              error={maintenance.error}
              isEmpty={(maintenance.data ?? []).length === 0}
              emptyText="No maintenance records."
            />
            {(maintenance.data ?? []).map((m) => (
              <div className="stack-row" key={m.id}>
                <div>
                  <b>{m.service_type ?? 'Service'}</b>
                  <span>{shortDate(m.service_date)}</span>
                </div>
                <StatusBadge tone={machineStatusTone(machine.current_status)}>{titleCase(m.status)}</StatusBadge>
              </div>
            ))}
          </ModalSection>

          <ModalSection title="Recent repairs" count={repairs.data?.length}>
            <MiniState
              status={repairs.status}
              error={repairs.error}
              isEmpty={(repairs.data ?? []).length === 0}
              emptyText="No repair records."
            />
            {(repairs.data ?? []).map((r) => (
              <div className="stack-row" key={r.id}>
                <div>
                  <b>{r.fault_description}</b>
                  <span>{shortDate(r.fault_date)}</span>
                </div>
                <StatusBadge tone={r.repair_completed ? 'green' : 'amber'}>
                  {r.repair_completed ? 'Completed' : 'Open'}
                </StatusBadge>
              </div>
            ))}
          </ModalSection>
        </>
      )}
    </Modal>
  )
}
