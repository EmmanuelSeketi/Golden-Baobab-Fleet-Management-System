'use client'

import { useMemo, useState } from 'react'
import { ReceiptText, Wallet, AlertCircle, FileText } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { invoiceStatusTone, money, shortDate, titleCase } from '@/lib/gbi/format'
import {
  DetailGrid,
  KpiCard,
  MiniState,
  Modal,
  ModalSection,
  PageHeading,
  StatusBadge,
  ViewState,
} from '@/components/shared'

type Invoice = {
  id: string
  invoice_number: string
  status: string
  billing_period_start: string
  billing_period_end: string
  subtotal: number
  tax_amount: number
  total_amount: number
  payment_terms_days: number
  finalized_at: string | null
  customer: { company_name: string; currency: string } | null
  contract: { contract_number: string } | null
}

const OUTSTANDING = ['finalized', 'approved', 'overdue']
const LIST_SELECT =
  'id,invoice_number,status,billing_period_start,billing_period_end,subtotal,tax_amount,total_amount,payment_terms_days,finalized_at,customer:customer_id(company_name,currency),contract:contract_id(contract_number)'

export function BillingView() {
  const supabase = useSupabase()
  const [selected, setSelected] = useState<Invoice | null>(null)

  const invoices = useQuery<Invoice[]>(
    () =>
      supabase
        .from('invoice')
        .select(LIST_SELECT)
        .order('created_at', { ascending: false }) as unknown as PromiseLike<{
        data: Invoice[] | null
        error: unknown
      }>,
    [],
  )

  const rows = invoices.data ?? []
  const totals = useMemo(() => {
    let invoiced = 0
    let outstanding = 0
    let paid = 0
    let draft = 0
    for (const i of rows) {
      invoiced += Number(i.total_amount ?? 0)
      if (i.status === 'paid') paid += Number(i.total_amount ?? 0)
      if (OUTSTANDING.includes(i.status)) outstanding += Number(i.total_amount ?? 0)
      if (i.status === 'draft' || i.status === 'pending_approval') draft += 1
    }
    return { invoiced, outstanding, paid, draft }
  }, [rows])

  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="Commercial"
        title="Billing & Invoices"
        description="Invoices generated from billed working hours, with status through the approval and payment lifecycle."
      />

      <div className="kpi-grid">
        <KpiCard
          icon={ReceiptText}
          tone="gold"
          label="Total invoiced"
          value={invoices.status === 'ready' ? money(totals.invoiced) : '—'}
          sub={`${rows.length} invoices`}
        />
        <KpiCard
          icon={Wallet}
          tone="blue"
          label="Outstanding"
          value={invoices.status === 'ready' ? money(totals.outstanding) : '—'}
          sub="finalized, approved & overdue"
        />
        <KpiCard
          icon={AlertCircle}
          tone="green"
          label="Paid"
          value={invoices.status === 'ready' ? money(totals.paid) : '—'}
          sub="settled invoices"
        />
        <KpiCard
          icon={FileText}
          tone="red"
          label="In draft / approval"
          value={invoices.status === 'ready' ? `${totals.draft}` : '—'}
          sub="not yet finalized"
        />
      </div>

      <div className="panel">
        <ViewState
          status={invoices.status}
          error={invoices.error}
          isEmpty={rows.length === 0}
          title="invoices"
          emptyText="No invoices have been generated yet."
          onRetry={invoices.reload}
        >
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Period</th>
                  <th>Subtotal</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id} className="clickable-row" onClick={() => setSelected(i)}>
                    <td>
                      <b>{i.invoice_number}</b>
                      <div className="muted-cell">{i.contract?.contract_number ?? ''}</div>
                    </td>
                    <td>{i.customer?.company_name ?? '—'}</td>
                    <td>
                      {shortDate(i.billing_period_start)} → {shortDate(i.billing_period_end)}
                    </td>
                    <td>{money(i.subtotal, i.customer?.currency ?? 'ZMW')}</td>
                    <td>
                      <b>{money(i.total_amount, i.customer?.currency ?? 'ZMW')}</b>
                    </td>
                    <td>
                      <StatusBadge tone={invoiceStatusTone(i.status)}>{titleCase(i.status)}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ViewState>
      </div>

      <InvoiceModal invoice={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

type LineItem = {
  id: string
  normal_hours: number
  overtime_hours: number
  normal_charge: number
  overtime_charge: number
  additional_charges: number
  total_charge: number
  daily_hour_entry: {
    entry_date: string
    machine: { machine_number: string } | null
  } | null
}

function InvoiceModal({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const supabase = useSupabase()
  const currency = invoice?.customer?.currency ?? 'ZMW'

  const items = useQuery<LineItem[]>(
    () =>
      !invoice
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('billing_entry')
            .select(
              'id,normal_hours,overtime_hours,normal_charge,overtime_charge,additional_charges,total_charge,daily_hour_entry:daily_hour_entry_id(entry_date,machine:machine_id(machine_number))',
            )
            .eq('invoice_id', invoice.id)
            .order('created_at') as unknown as PromiseLike<{ data: LineItem[] | null; error: unknown }>),
    [invoice?.id],
  )

  return (
    <Modal
      open={!!invoice}
      onClose={onClose}
      eyebrow="Invoice detail"
      title={invoice?.invoice_number ?? ''}
      subtitle={invoice?.customer?.company_name}
      footer={
        invoice ? (
          <StatusBadge tone={invoiceStatusTone(invoice.status)}>{titleCase(invoice.status)}</StatusBadge>
        ) : null
      }
    >
      {invoice && (
        <>
          <DetailGrid
            items={[
              ['Customer', invoice.customer?.company_name ?? '—'],
              ['Contract', invoice.contract?.contract_number ?? '—'],
              ['Billing period', `${shortDate(invoice.billing_period_start)} → ${shortDate(invoice.billing_period_end)}`],
              ['Payment terms', `${invoice.payment_terms_days} days`],
              ['Subtotal', money(invoice.subtotal, currency)],
              ['Tax', money(invoice.tax_amount, currency)],
              ['Total', money(invoice.total_amount, currency)],
              ['Finalized', invoice.finalized_at ? shortDate(invoice.finalized_at) : 'Not finalized'],
            ]}
          />

          <ModalSection title="Line items" count={items.data?.length}>
            <MiniState
              status={items.status}
              error={items.error}
              isEmpty={(items.data ?? []).length === 0}
              emptyText="No billing lines attached to this invoice."
            />
            {(items.data ?? []).length > 0 && (
              <div className="table-scroll">
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Machine</th>
                      <th>Normal</th>
                      <th>OT</th>
                      <th>Charge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(items.data ?? []).map((li) => (
                      <tr key={li.id}>
                        <td>{shortDate(li.daily_hour_entry?.entry_date)}</td>
                        <td>{li.daily_hour_entry?.machine?.machine_number ?? '—'}</td>
                        <td>{li.normal_hours}</td>
                        <td>{li.overtime_hours}</td>
                        <td>
                          <b>{money(li.total_charge, currency)}</b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ModalSection>
        </>
      )}
    </Modal>
  )
}
