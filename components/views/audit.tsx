'use client'

import { useMemo, useState } from 'react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { dateTime, titleCase, type Tone } from '@/lib/gbi/format'
import { DetailGrid, Modal, PageHeading, StatusBadge, ViewState } from '@/components/shared'

type Audit = {
  id: string
  entity_type: string
  entity_id: string
  action: string
  changed_fields: Record<string, { old: unknown; new: unknown }> | null
  reason: string | null
  created_at: string
  user: { full_name: string } | null
}

const ACTION_TONE: Record<string, Tone> = {
  create: 'green',
  update: 'blue',
  archive: 'amber',
  restore: 'blue',
  approve: 'green',
  void: 'red',
}

type AuditPage = { rows: Audit[]; total: number }
type AuditQueryRow = Omit<Audit, 'user'> & { user: Audit['user'] | Audit['user'][] }

export function AuditView() {
  const supabase = useSupabase()
  const [selected, setSelected] = useState<Audit | null>(null)
  const [page, setPage] = useState(1)

  const pageSize = 10
  const logs = useQuery<AuditPage>(
    () =>
      supabase
        .from('audit_log')
        .select('id,entity_type,entity_id,action,changed_fields,reason,created_at,user:user_id(full_name)', {
          count: 'exact',
        })
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)
        .then(({ data, error, count }) => ({
          data:
            data && count !== null
              ? {
                  rows: (data as AuditQueryRow[]).map((row) => ({
                    ...row,
                    user: Array.isArray(row.user) ? row.user[0] ?? null : row.user,
                  })),
                  total: count,
                }
              : null,
          error: error ?? (count === null ? new Error('Could not determine the total number of audit entries.') : null),
        })) as unknown as PromiseLike<{ data: AuditPage | null; error: unknown }>,
    [page],
  )

  const rows = logs.data?.rows ?? []
  const total = logs.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pageStart = (currentPage - 1) * pageSize

  return (
    <div className="page-wrap">
      <PageHeading
        title="Audit Log"
      />

      <div className="panel">
        <ViewState
          status={logs.status}
          error={logs.error}
          isEmpty={total === 0}
          title="audit log"
          emptyText="No audit entries recorded yet."
          onRetry={logs.reload}
        >
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Entity</th>
                  <th>Action</th>
                  <th>Changed fields</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="clickable-row" onClick={() => setSelected(a)}>
                    <td>{dateTime(a.created_at)}</td>
                    <td>{a.user?.full_name ?? 'System'}</td>
                    <td>{titleCase(a.entity_type)}</td>
                    <td>
                      <StatusBadge tone={ACTION_TONE[a.action] ?? 'neutral'}>{titleCase(a.action)}</StatusBadge>
                    </td>
                    <td>{a.changed_fields ? Object.keys(a.changed_fields).length : 0} fields</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > pageSize && (
            <div className="mh-pagination" aria-label="Audit log pagination">
              <span>
                Showing {pageStart + 1}–{Math.min(pageStart + pageSize, total)} of {total}
              </span>
              <div>
                <button
                  className="button button-secondary"
                  onClick={() => setPage((current) => Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1}
                >
                  Previous
                </button>
                <span>Page {currentPage} of {pageCount}</span>
                <button
                  className="button button-secondary"
                  onClick={() => setPage((current) => Math.min(pageCount, currentPage + 1))}
                  disabled={currentPage >= pageCount}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </ViewState>
      </div>

      <AuditModal audit={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

function AuditModal({ audit, onClose }: { audit: Audit | null; onClose: () => void }) {
  const changes = useMemo(() => Object.entries(audit?.changed_fields ?? {}), [audit])

  return (
    <Modal
      open={!!audit}
      onClose={onClose}
      eyebrow="Audit entry"
      title={audit ? titleCase(audit.action) : ''}
      subtitle={audit ? `${titleCase(audit.entity_type)} · ${dateTime(audit.created_at)}` : ''}
      footer={
        audit ? <StatusBadge tone={ACTION_TONE[audit.action] ?? 'neutral'}>{titleCase(audit.action)}</StatusBadge> : null
      }
    >
      {audit && (
        <>
          <DetailGrid
            items={[
              ['Performed by', audit.user?.full_name ?? 'System'],
              ['Entity type', titleCase(audit.entity_type)],
              ['Entity ID', <code key="id" className="mono-id">{audit.entity_id}</code>],
              ['Reason', audit.reason ?? 'N/A'],
            ]}
          />
          <section className="modal-section">
            <h3>
              Changed fields<span className="section-count">{changes.length}</span>
            </h3>
            {changes.length === 0 ? (
              <p className="mini-state">No field-level diff recorded.</p>
            ) : (
              <div className="table-scroll">
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Old</th>
                      <th>New</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map(([field, diff]) => (
                      <tr key={field}>
                        <td>
                          <b>{titleCase(field)}</b>
                        </td>
                        <td className="diff-old">{formatValue(diff?.old)}</td>
                        <td className="diff-new">{formatValue(diff?.new)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </Modal>
  )
}

function formatValue(value: unknown): string {
  if (value == null) return 'N/A'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
