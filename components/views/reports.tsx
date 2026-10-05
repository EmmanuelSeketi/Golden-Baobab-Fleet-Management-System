'use client'

import { useMemo } from 'react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { canAccess, type UserRole } from '@/lib/gbi/roles'
import { hours as fmtHours, money } from '@/lib/gbi/format'
import { MiniState, PageHeading } from '@/components/shared'

type HourRow = {
  entry_date: string
  total_hours: number | null
  machine: { machine_number: string } | null
}
type InvoiceRow = { billing_period_end: string; total_amount: number }

function monthKey(date: string) {
  return date.slice(0, 7)
}
function monthLabel(key: string) {
  const [y, m] = key.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-GB', {
    month: 'short',
    year: '2-digit',
  })
}

export function ReportsView({ role }: { role: UserRole }) {
  const supabase = useSupabase()
  const showRevenue = canAccess('Hiring Quotations', role)
  const since = useMemo(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 5)
    d.setDate(1)
    return d.toISOString().slice(0, 10)
  }, [])

  const hours = useQuery<HourRow[]>(
    () =>
      supabase
        .from('daily_hour_entry')
        .select('entry_date,total_hours,machine:machine_id(machine_number)')
        .gte('entry_date', since)
        .order('entry_date') as unknown as PromiseLike<{ data: HourRow[] | null; error: unknown }>,
    [since],
  )
  const invoices = useQuery<InvoiceRow[]>(
    () =>
      !showRevenue
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .from('invoice')
            .select('billing_period_end,total_amount')
            .gte('billing_period_end', since)
            .then((r) => ({ data: (r.data ?? []) as InvoiceRow[], error: r.error })),
    [since, showRevenue],
  )

  const monthlyHours = useMemo(() => {
    const map = new Map<string, number>()
    for (const h of hours.data ?? []) {
      const k = monthKey(h.entry_date)
      map.set(k, (map.get(k) ?? 0) + Number(h.total_hours ?? 0))
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [hours.data])
  const maxMonthly = Math.max(1, ...monthlyHours.map((m) => m[1]))

  const monthlyRevenue = useMemo(() => {
    const map = new Map<string, number>()
    for (const i of invoices.data ?? []) {
      const k = monthKey(i.billing_period_end)
      map.set(k, (map.get(k) ?? 0) + Number(i.total_amount ?? 0))
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [invoices.data])
  const maxRevenue = Math.max(1, ...monthlyRevenue.map((m) => m[1]))

  const topMachines = useMemo(() => {
    const map = new Map<string, number>()
    for (const h of hours.data ?? []) {
      const key = h.machine?.machine_number ?? 'N/A'
      map.set(key, (map.get(key) ?? 0) + Number(h.total_hours ?? 0))
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
  }, [hours.data])
  const maxMachine = Math.max(1, ...topMachines.map((m) => m[1]))

  return (
    <div className="page-wrap">
      <PageHeading
        title="Reports"
        description="Operational trends aggregated live from recorded working hours and invoicing."
      />

      <div className={`report-grid ${showRevenue ? '' : 'single'}`}>
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Machine hours by month</h2>
              <p>Recorded utilisation, last 6 months</p>
            </div>
          </div>
          <div className="mini-chart tall">
            {hours.status !== 'ready' || monthlyHours.length === 0 ? (
              <MiniState
                status={hours.status}
                error={hours.error}
                isEmpty={monthlyHours.length === 0}
                emptyText="No hours recorded in this window."
              />
            ) : (
              <div className="mini-bars labelled">
                {monthlyHours.map(([k, total]) => (
                  <div className="mini-bar-group" key={k} title={fmtHours(total)}>
                    <div className="mini-bar gold" style={{ height: `${Math.max(4, (total / maxMonthly) * 100)}%` }} />
                    <span>{monthLabel(k)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {showRevenue && (
          <div className="panel">
            <div className="panel-header">
              <div>
                <h2>Invoiced value by month</h2>
                <p>Total invoiced, last 6 months</p>
              </div>
            </div>
            <div className="mini-chart tall">
              {invoices.status !== 'ready' || monthlyRevenue.length === 0 ? (
                <MiniState
                  status={invoices.status}
                  error={invoices.error}
                  isEmpty={monthlyRevenue.length === 0}
                  emptyText="No invoices in this window."
                />
              ) : (
                <div className="mini-bars labelled">
                  {monthlyRevenue.map(([k, total]) => (
                    <div className="mini-bar-group" key={k} title={money(total)}>
                      <div className="mini-bar slate" style={{ height: `${Math.max(4, (total / maxRevenue) * 100)}%` }} />
                      <span>{monthLabel(k)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Top machines by hours</h2>
            <p>Highest recorded utilisation, last 6 months</p>
          </div>
        </div>
        <div className="panel-pad">
          {hours.status !== 'ready' || topMachines.length === 0 ? (
            <MiniState
              status={hours.status}
              error={hours.error}
              isEmpty={topMachines.length === 0}
              emptyText="No machine hours to rank yet."
            />
          ) : (
            <ul className="rank-list">
              {topMachines.map(([machine, total]) => (
                <li key={machine}>
                  <span className="rank-label">{machine}</span>
                  <span className="rank-track">
                    <span className="rank-fill" style={{ width: `${(total / maxMachine) * 100}%` }} />
                  </span>
                  <span className="rank-value">{fmtHours(total)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
