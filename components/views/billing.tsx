'use client'

import { useMemo, useState } from 'react'
import { FileText, Plus } from 'lucide-react'
import { QuotationDocModal } from '@/components/views/quotation-doc-modal'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { canManageCommercial, type UserRole } from '@/lib/gbi/roles'
import { money, shortDate } from '@/lib/gbi/format'
import {
  DetailGrid,
  KpiCard,
  LoadingSpinner,
  MiniState,
  Modal,
  ModalSection,
  PageHeading,
  ViewState,
} from '@/components/shared'
import { downloadQuotationDoc, type QuotationDocData } from '@/lib/gbi/quotation-doc'

type Quotation = {
  id: string
  quotation_number: string
  quotation_date: string
  customer_id: string
  customer_name: string
  project_id: string
  project_name: string
  contract_id: string | null
  contract_number: string | null
  address: string
  currency: string
  mobilization_fee: number
  created_at: string
  hiring_quotation_item: { id: string }[]
}

type QuotationItem = {
  id: string
  line_number: number
  machine_id: string | null
  machine_number: string
  model: string
  specification: string
  rental: number | null
  quantity: number
  hours: number | null
  total_price: number | null
}

const QUOTATION_SELECT =
  'id,quotation_number,quotation_date,customer_id,customer_name,project_id,project_name,contract_id,contract_number,address,currency,mobilization_fee,created_at,hiring_quotation_item(id)'

function quotationDoc(quotation: Quotation, items: QuotationItem[]): QuotationDocData {
  return {
    quotationNumber: quotation.quotation_number,
    lessee: quotation.customer_name,
    address: quotation.address,
    date: quotation.quotation_date,
    currency: quotation.currency,
    mobilizationFee: String(quotation.mobilization_fee),
    logo: 'gbi',
    items: items.map((item) => ({
      model: item.model,
      specification: item.specification,
      rental: item.rental === null ? '' : String(item.rental),
      qty: String(item.quantity),
      hours: item.hours === null ? '' : String(item.hours),
      total: item.total_price === null ? '' : String(item.total_price),
    })),
  }
}

export function BillingView({ role, userId }: { role: UserRole; userId: string }) {
  const supabase = useSupabase()
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Quotation | null>(null)
  const canManage = canManageCommercial(role)

  const quotations = useQuery<Quotation[]>(
    () =>
      supabase
        .from('hiring_quotation')
        .select(QUOTATION_SELECT)
        .order('quotation_date', { ascending: false })
        .order('created_at', { ascending: false }) as unknown as PromiseLike<{
        data: Quotation[] | null
        error: unknown
      }>,
    [],
  )
  const rows = quotations.data ?? []
  const month = new Date().toISOString().slice(0, 7)
  const thisMonthCount = useMemo(
    () => rows.filter((quotation) => quotation.quotation_date.startsWith(month)).length,
    [rows, month],
  )
  const customerCount = useMemo(() => new Set(rows.map((quotation) => quotation.customer_id)).size, [rows])

  return (
    <div className="page-wrap">
      <PageHeading
        title="Invoice"
        action={
          canManage ? (
            <button className="button button-primary" onClick={() => setCreating(true)}>
              <Plus size={15} />
              New invoice
            </button>
          ) : undefined
        }
      />

      <div className="kpi-grid">
        <KpiCard
          tone="gold"
          label="Invoices"
          value={quotations.status === 'loading' ? <LoadingSpinner small /> : quotations.status === 'ready' ? rows.length : 'N/A'}
          sub="saved invoice history"
        />
        <KpiCard
          tone="blue"
          label="This month"
          value={quotations.status === 'loading' ? <LoadingSpinner small /> : quotations.status === 'ready' ? thisMonthCount : 'N/A'}
          sub="invoices issued"
        />
        <KpiCard
          tone="green"
          label="Customers invoiced"
          value={quotations.status === 'loading' ? <LoadingSpinner small /> : quotations.status === 'ready' ? customerCount : 'N/A'}
          sub="distinct lessees"
        />
      </div>

      <div className="panel">
        <ViewState
          status={quotations.status}
          error={quotations.error}
          isEmpty={rows.length === 0}
          title="invoices"
          emptyText="No invoices have been saved yet."
          onRetry={quotations.reload}
        >
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Leasee / customer</th>
                  <th>Project</th>
                  <th>Equipment</th>
                  <th>Contract</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((quotation) => (
                  <tr key={quotation.id} className="clickable-row" onClick={() => setSelected(quotation)}>
                    <td>
                      <b>{quotation.quotation_number}</b>
                    </td>
                    <td>{shortDate(quotation.quotation_date)}</td>
                    <td>{quotation.customer_name}</td>
                    <td>{quotation.project_name}</td>
                    <td>{quotation.hiring_quotation_item?.length ?? 0} machine(s)</td>
                    <td>{quotation.contract_number ?? 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ViewState>
      </div>

      <QuotationDocModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          quotations.reload()
        }}
      />

      <QuotationDetailModal quotation={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

function QuotationDetailModal({ quotation, onClose }: { quotation: Quotation | null; onClose: () => void }) {
  const supabase = useSupabase()
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const items = useQuery<QuotationItem[]>(
    () =>
      !quotation
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('hiring_quotation_item')
            .select('id,line_number,machine_id,machine_number,model,specification,rental,quantity,hours,total_price')
            .eq('quotation_id', quotation.id)
            .order('line_number') as unknown as PromiseLike<{
            data: QuotationItem[] | null
            error: unknown
          }>),
    [quotation?.id],
  )

  async function download() {
    if (!quotation || !items.data) return
    setDownloading(true)
    setDownloadError('')
    try {
      await downloadQuotationDoc(quotationDoc(quotation, items.data))
    } catch {
      setDownloadError('Could not generate the quotation document. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Modal
      open={quotation !== null}
      onClose={onClose}
      eyebrow="Invoice history"
      title={quotation?.quotation_number ?? ''}
      subtitle={quotation?.customer_name}
      footer={
        quotation ? (
          <div className="modal-foot-actions">
            <button className="button button-secondary" onClick={download} disabled={items.status !== 'ready' || downloading}>
              <FileText size={14} />
              {downloading ? 'Generating…' : 'Download invoice'}
            </button>
          </div>
        ) : undefined
      }
    >
      {quotation && (
        <>
          {downloadError && <div className="form-error">{downloadError}</div>}
          <DetailGrid
            items={[
              ['Leasee / customer', quotation.customer_name],
              ['Quotation date', shortDate(quotation.quotation_date)],
              ['Address', quotation.address || 'N/A'],
              ['Project', quotation.project_name],
              ['Contract', quotation.contract_number ?? 'Not linked'],
              ['Currency', quotation.currency],
              ['Mobilization fee per unit', money(quotation.mobilization_fee, 'ZMW')],
            ]}
          />
          <ModalSection title="Quoted machines" count={items.data?.length}>
            <MiniState
              status={items.status}
              error={items.error}
              isEmpty={(items.data ?? []).length === 0}
              emptyText="No machine lines are saved on this quotation."
            />
            {(items.data ?? []).map((item) => (
              <div className="stack-row" key={item.id}>
                <div>
                  <b><span className="mono">{item.machine_number}</span> · {item.model}</b>
                  <span>{item.specification}</span>
                </div>
                <div className="stack-meta">
                  {item.total_price === null ? 'Calculate monthly' : money(item.total_price, quotation.currency)}
                </div>
              </div>
            ))}
          </ModalSection>
        </>
      )}
    </Modal>
  )
}
