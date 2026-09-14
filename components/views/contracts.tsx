'use client'

import { useMemo, useState } from 'react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { contractStatusTone, invoiceStatusTone, money, shortDate, titleCase } from '@/lib/gbi/format'
import {
  DetailGrid,
  MiniState,
  Modal,
  ModalSection,
  PageHeading,
  StatusBadge,
  ViewState,
} from '@/components/shared'

type Contract = {
  id: string
  contract_number: string
  status: string
  start_date: string
  end_date: string | null
  payment_terms_days: number
  billing_frequency: string
  customer: {
    company_name: string
    customer_code: string | null
    currency: string
    contact_name: string | null
    email: string | null
    phone: string | null
  } | null
  contract_machine: { count: number }[]
  billing_rule: { count: number }[]
}

const LIST_SELECT =
  'id,contract_number,status,start_date,end_date,payment_terms_days,billing_frequency,customer:customer_id(company_name,customer_code,currency,contact_name,email,phone),contract_machine(count),billing_rule(count)'

export function ContractsView() {
  const supabase = useSupabase()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Contract | null>(null)

  const contracts = useQuery<Contract[]>(
    () =>
      supabase
        .from('contract')
        .select(LIST_SELECT)
        .order('created_at', { ascending: false }) as unknown as PromiseLike<{
        data: Contract[] | null
        error: unknown
      }>,
    [],
  )

  const rows = useMemo(() => {
    const all = contracts.data ?? []
    if (!query.trim()) return all
    const q = query.toLowerCase()
    return all.filter(
      (c) =>
        c.contract_number.toLowerCase().includes(q) ||
        (c.customer?.company_name ?? '').toLowerCase().includes(q),
    )
  }, [contracts.data, query])

  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="Commercial"
        title="Customers & Contracts"
        description="Signed agreements, the machines they cover and the effective billing rules per contract."
      />

      <div className="filter-row">
        <div className="toolbar-search">
          <input
            placeholder="Search by contract number or customer…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="panel">
        <ViewState
          status={contracts.status}
          error={contracts.error}
          isEmpty={rows.length === 0}
          title="contracts"
          emptyText={query ? 'No contracts match your search.' : 'No contracts recorded yet.'}
          onRetry={contracts.reload}
        >
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Customer</th>
                  <th>Period</th>
                  <th>Machines</th>
                  <th>Billing rules</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="clickable-row" onClick={() => setSelected(c)}>
                    <td>
                      <b>{c.contract_number}</b>
                      <div className="muted-cell">{titleCase(c.billing_frequency)}</div>
                    </td>
                    <td>{c.customer?.company_name ?? '—'}</td>
                    <td>
                      {shortDate(c.start_date)} → {c.end_date ? shortDate(c.end_date) : 'open'}
                    </td>
                    <td>{c.contract_machine?.[0]?.count ?? 0}</td>
                    <td>{c.billing_rule?.[0]?.count ?? 0}</td>
                    <td>
                      <StatusBadge tone={contractStatusTone(c.status)}>{titleCase(c.status)}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ViewState>
      </div>

      <ContractModal contract={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

type RuleRow = {
  id: string
  effective_from: string
  effective_to: string | null
  billing_model: string
  standard_rate: number
  overtime_rate: number | null
}
type CoveredRow = {
  id: string
  deployment_start: string | null
  deployment_end: string | null
  machine: { machine_number: string; machine_type: string } | null
}
type InvoiceRow = {
  id: string
  invoice_number: string
  status: string
  total_amount: number
  billing_period_end: string
}

function ContractModal({ contract, onClose }: { contract: Contract | null; onClose: () => void }) {
  const supabase = useSupabase()
  const currency = contract?.customer?.currency ?? 'ZMW'

  const rules = useQuery<RuleRow[]>(
    () =>
      !contract
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('billing_rule')
            .select('id,effective_from,effective_to,billing_model,standard_rate,overtime_rate')
            .eq('contract_id', contract.id)
            .order('effective_from', { ascending: false }) as unknown as PromiseLike<{
            data: RuleRow[] | null
            error: unknown
          }>),
    [contract?.id],
  )
  const covered = useQuery<CoveredRow[]>(
    () =>
      !contract
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('contract_machine')
            .select('id,deployment_start,deployment_end,machine:machine_id(machine_number,machine_type)')
            .eq('contract_id', contract.id) as unknown as PromiseLike<{
            data: CoveredRow[] | null
            error: unknown
          }>),
    [contract?.id],
  )
  const invoices = useQuery<InvoiceRow[]>(
    () =>
      !contract
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('invoice')
            .select('id,invoice_number,status,total_amount,billing_period_end')
            .eq('contract_id', contract.id)
            .order('billing_period_end', { ascending: false })
            .limit(8) as unknown as PromiseLike<{ data: InvoiceRow[] | null; error: unknown }>),
    [contract?.id],
  )

  return (
    <Modal
      open={!!contract}
      onClose={onClose}
      eyebrow="Contract detail"
      title={contract?.contract_number ?? ''}
      subtitle={contract?.customer?.company_name}
      footer={
        contract ? (
          <StatusBadge tone={contractStatusTone(contract.status)}>{titleCase(contract.status)}</StatusBadge>
        ) : null
      }
    >
      {contract && (
        <>
          <DetailGrid
            items={[
              ['Customer', contract.customer?.company_name ?? '—'],
              ['Customer code', contract.customer?.customer_code ?? '—'],
              ['Contact', contract.customer?.contact_name ?? '—'],
              ['Email', contract.customer?.email ?? '—'],
              ['Phone', contract.customer?.phone ?? '—'],
              ['Currency', currency],
              ['Start date', shortDate(contract.start_date)],
              ['End date', contract.end_date ? shortDate(contract.end_date) : 'Open-ended'],
              ['Payment terms', `${contract.payment_terms_days} days`],
              ['Billing frequency', titleCase(contract.billing_frequency)],
            ]}
          />

          <ModalSection title="Billing rules (effective-dated)" count={rules.data?.length}>
            <MiniState
              status={rules.status}
              error={rules.error}
              isEmpty={(rules.data ?? []).length === 0}
              emptyText="No billing rules recorded."
            />
            {(rules.data ?? []).map((r) => (
              <div className="stack-row" key={r.id}>
                <div>
                  <b>{titleCase(r.billing_model)}</b>
                  <span>
                    {shortDate(r.effective_from)} → {r.effective_to ? shortDate(r.effective_to) : 'current'}
                  </span>
                </div>
                <div className="stack-meta">
                  {money(r.standard_rate, currency)}
                  {r.overtime_rate ? ` · OT ${money(r.overtime_rate, currency)}` : ''}
                </div>
              </div>
            ))}
          </ModalSection>

          <ModalSection title="Covered machines" count={covered.data?.length}>
            <MiniState
              status={covered.status}
              error={covered.error}
              isEmpty={(covered.data ?? []).length === 0}
              emptyText="No machines linked to this contract."
            />
            {(covered.data ?? []).map((c) => (
              <div className="stack-row" key={c.id}>
                <div>
                  <b>{c.machine?.machine_number ?? '—'}</b>
                  <span>{c.machine?.machine_type ?? ''}</span>
                </div>
                <div className="stack-meta">
                  {shortDate(c.deployment_start)} → {c.deployment_end ? shortDate(c.deployment_end) : 'active'}
                </div>
              </div>
            ))}
          </ModalSection>

          <ModalSection title="Invoices" count={invoices.data?.length}>
            <MiniState
              status={invoices.status}
              error={invoices.error}
              isEmpty={(invoices.data ?? []).length === 0}
              emptyText="No invoices raised on this contract."
            />
            {(invoices.data ?? []).map((i) => (
              <div className="stack-row" key={i.id}>
                <div>
                  <b>{i.invoice_number}</b>
                  <span>{shortDate(i.billing_period_end)}</span>
                </div>
                <div className="stack-meta">
                  {money(i.total_amount, currency)}
                  <StatusBadge tone={invoiceStatusTone(i.status)}>{titleCase(i.status)}</StatusBadge>
                </div>
              </div>
            ))}
          </ModalSection>
        </>
      )}
    </Modal>
  )
}
