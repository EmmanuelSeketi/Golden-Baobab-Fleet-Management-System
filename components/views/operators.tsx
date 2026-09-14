'use client'

import { useMemo, useState } from 'react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { hours as fmtHours, shortDate } from '@/lib/gbi/format'
import {
  DetailGrid,
  MiniState,
  Modal,
  ModalSection,
  PageHeading,
  StatusBadge,
  ViewState,
} from '@/components/shared'

type Operator = {
  id: string
  full_name: string
  nrc_number: string | null
  phone_number: string | null
  address: string | null
  emergency_contact: string | null
  employment_date: string | null
  licence_details: string | null
  certifications: string | null
  notes: string | null
  is_active: boolean
}

const LIST_SELECT =
  'id,full_name,nrc_number,phone_number,address,emergency_contact,employment_date,licence_details,certifications,notes,is_active'

export function OperatorsView() {
  const supabase = useSupabase()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Operator | null>(null)

  const operators = useQuery<Operator[]>(
    () =>
      supabase.from('operator').select(LIST_SELECT).order('full_name') as unknown as PromiseLike<{
        data: Operator[] | null
        error: unknown
      }>,
    [],
  )

  const rows = useMemo(() => {
    const all = operators.data ?? []
    if (!query.trim()) return all
    const q = query.toLowerCase()
    return all.filter(
      (o) => o.full_name.toLowerCase().includes(q) || (o.nrc_number ?? '').toLowerCase().includes(q),
    )
  }, [operators.data, query])

  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="People"
        title="Operators"
        description="Machine operators, their credentials and current deployment. Operators do not have login accounts."
      />

      <div className="filter-row">
        <div className="toolbar-search">
          <input
            placeholder="Search by name or NRC…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="panel">
        <ViewState
          status={operators.status}
          error={operators.error}
          isEmpty={rows.length === 0}
          title="operators"
          emptyText={query ? 'No operators match your search.' : 'No operators registered yet.'}
          onRetry={operators.reload}
        >
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Operator</th>
                  <th>NRC</th>
                  <th>Phone</th>
                  <th>Employed</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className="clickable-row" onClick={() => setSelected(o)}>
                    <td>
                      <div className="machine-cell">
                        <span className="operator-avatar">
                          {o.full_name
                            .split(' ')
                            .slice(0, 2)
                            .map((p) => p[0])
                            .join('')
                            .toUpperCase()}
                        </span>
                        <b>{o.full_name}</b>
                      </div>
                    </td>
                    <td>{o.nrc_number ?? '—'}</td>
                    <td>{o.phone_number ?? '—'}</td>
                    <td>{shortDate(o.employment_date)}</td>
                    <td>
                      <StatusBadge tone={o.is_active ? 'green' : 'neutral'}>
                        {o.is_active ? 'Active' : 'Inactive'}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ViewState>
      </div>

      <OperatorModal operator={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

type AssignmentRow = {
  id: string
  start_date: string
  end_date: string | null
  machine: { machine_number: string; machine_type: string } | null
  project: { name: string } | null
}
type HourRow = {
  id: string
  entry_date: string
  total_hours: number | null
  machine: { machine_number: string } | null
}

function OperatorModal({ operator, onClose }: { operator: Operator | null; onClose: () => void }) {
  const supabase = useSupabase()

  const assignments = useQuery<AssignmentRow[]>(
    () =>
      !operator
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('machine_assignment')
            .select('id,start_date,end_date,machine:machine_id(machine_number,machine_type),project:project_id(name)')
            .eq('operator_id', operator.id)
            .order('start_date', { ascending: false })
            .limit(8) as unknown as PromiseLike<{ data: AssignmentRow[] | null; error: unknown }>),
    [operator?.id],
  )

  const recentHours = useQuery<HourRow[]>(
    () =>
      !operator
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('daily_hour_entry')
            .select('id,entry_date,total_hours,machine:machine_id(machine_number)')
            .eq('operator_id', operator.id)
            .order('entry_date', { ascending: false })
            .limit(10) as unknown as PromiseLike<{ data: HourRow[] | null; error: unknown }>),
    [operator?.id],
  )

  const totalRecent = (recentHours.data ?? []).reduce((s, h) => s + Number(h.total_hours ?? 0), 0)

  return (
    <Modal
      open={!!operator}
      onClose={onClose}
      eyebrow="Operator profile"
      title={operator?.full_name ?? ''}
      subtitle={operator?.nrc_number ? `NRC ${operator.nrc_number}` : undefined}
      footer={
        operator ? (
          <StatusBadge tone={operator.is_active ? 'green' : 'neutral'}>
            {operator.is_active ? 'Active' : 'Inactive'}
          </StatusBadge>
        ) : null
      }
    >
      {operator && (
        <>
          <DetailGrid
            items={[
              ['Phone', operator.phone_number ?? '—'],
              ['Employment date', shortDate(operator.employment_date)],
              ['Address', operator.address ?? '—'],
              ['Emergency contact', operator.emergency_contact ?? '—'],
              ['Licence', operator.licence_details ?? '—'],
              ['Certifications', operator.certifications ?? '—'],
              ['Recent hours logged', fmtHours(totalRecent)],
              ['Notes', operator.notes ?? '—'],
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
                  <b>{a.machine?.machine_number ?? '—'}</b>
                  <span>{a.project?.name ?? 'No project'}</span>
                </div>
                <div className="stack-meta">
                  {shortDate(a.start_date)} → {a.end_date ? shortDate(a.end_date) : 'current'}
                </div>
              </div>
            ))}
          </ModalSection>

          <ModalSection title="Recent working hours" count={recentHours.data?.length}>
            <MiniState
              status={recentHours.status}
              error={recentHours.error}
              isEmpty={(recentHours.data ?? []).length === 0}
              emptyText="No hours logged for this operator."
            />
            {(recentHours.data ?? []).map((h) => (
              <div className="stack-row" key={h.id}>
                <div>
                  <b>{h.machine?.machine_number ?? '—'}</b>
                  <span>{shortDate(h.entry_date)}</span>
                </div>
                <div className="stack-meta">{fmtHours(h.total_hours)}</div>
              </div>
            ))}
          </ModalSection>
        </>
      )}
    </Modal>
  )
}
