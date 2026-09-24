'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Printer,
  ReceiptText,
  Sparkles,
  Wallet,
} from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { invoiceStatusTone, money, shortDate, titleCase } from '@/lib/gbi/format'
import { canManageCommercial, type UserRole } from '@/lib/gbi/roles'
import { buildPreview, round2, type BillingRule, type HourEntry } from '@/lib/gbi/billing'
import {
  ConfirmDialog,
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
  customer_id: string
  contract_id: string
  customer: { company_name: string; currency: string } | null
  contract: { contract_number: string } | null
}

const OUTSTANDING = ['finalized', 'approved', 'overdue']
const LIST_SELECT =
  'id,invoice_number,status,billing_period_start,billing_period_end,subtotal,tax_amount,total_amount,payment_terms_days,finalized_at,customer_id,contract_id,customer:customer_id(company_name,currency),contract:contract_id(contract_number)'

export function BillingView({ role, userId }: { role: UserRole; userId: string }) {
  const supabase = useSupabase()
  const [selected, setSelected] = useState<Invoice | null>(null)
  const [generating, setGenerating] = useState(false)
  const canManage = canManageCommercial(role)

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
      if (i.status === 'void') continue
      invoiced += Number(i.total_amount ?? 0)
      if (i.status === 'paid') paid += Number(i.total_amount ?? 0)
      if (OUTSTANDING.includes(i.status)) outstanding += Number(i.total_amount ?? 0)
      if (i.status === 'draft' || i.status === 'pending_approval') draft += 1
    }
    return { invoiced, outstanding, paid, draft }
  }, [rows])

  const ready = invoices.status === 'ready'

  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="Commercial"
        title="Billing & Invoices"
        description="Generate invoices from verified working hours, then move them through approval, finalisation and payment."
        action={
          canManage ? (
            <button className="button button-primary" onClick={() => setGenerating(true)}>
              <Sparkles size={15} />
              Generate invoice
            </button>
          ) : undefined
        }
      />

      <div className="kpi-grid">
        <KpiCard
          icon={ReceiptText}
          tone="gold"
          label="Total invoiced"
          value={ready ? money(totals.invoiced) : '—'}
          sub={`${rows.length} invoices`}
        />
        <KpiCard
          icon={Wallet}
          tone="blue"
          label="Outstanding"
          value={ready ? money(totals.outstanding) : '—'}
          sub="finalized, approved & overdue"
        />
        <KpiCard
          icon={AlertCircle}
          tone="green"
          label="Paid"
          value={ready ? money(totals.paid) : '—'}
          sub="settled invoices"
        />
        <KpiCard
          icon={FileText}
          tone="red"
          label="In draft / approval"
          value={ready ? `${totals.draft}` : '—'}
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

      <InvoiceModal
        invoice={selected}
        canManage={canManage}
        userId={userId}
        onClose={() => setSelected(null)}
        onChanged={() => {
          invoices.reload()
        }}
      />

      {canManage && (
        <GenerateInvoiceModal
          open={generating}
          userId={userId}
          onClose={() => setGenerating(false)}
          onGenerated={(inv) => {
            setGenerating(false)
            invoices.reload()
            if (inv) setSelected(inv)
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Invoice detail + lifecycle + adjustments + export
// ---------------------------------------------------------------------------

type LineItem = {
  id: string
  normal_hours: number
  overtime_hours: number
  normal_charge: number
  overtime_charge: number
  additional_charges: number
  total_charge: number
  daily_hour_entry_id: string
  daily_hour_entry: {
    entry_date: string
    machine: { machine_number: string } | null
  } | null
}
type Adjustment = { id: string; reason: string; amount: number; created_at: string }

const NEXT_STATUS: Record<string, { to: string; label: string; icon: React.ElementType }[]> = {
  draft: [{ to: 'pending_approval', label: 'Submit for approval', icon: CheckCircle2 }],
  pending_approval: [{ to: 'approved', label: 'Approve', icon: CheckCircle2 }],
  approved: [{ to: 'finalized', label: 'Finalize', icon: CheckCircle2 }],
  finalized: [{ to: 'paid', label: 'Mark as paid', icon: Wallet }],
  overdue: [{ to: 'paid', label: 'Mark as paid', icon: Wallet }],
}

function InvoiceModal({
  invoice,
  canManage,
  userId,
  onClose,
  onChanged,
}: {
  invoice: Invoice | null
  canManage: boolean
  userId: string
  onClose: () => void
  onChanged: () => void
}) {
  const supabase = useSupabase()
  const currency = invoice?.customer?.currency ?? 'ZMW'
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [voiding, setVoiding] = useState(false)
  const [adjusting, setAdjusting] = useState(false)

  const items = useQuery<LineItem[]>(
    () =>
      !invoice
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('billing_entry')
            .select(
              'id,normal_hours,overtime_hours,normal_charge,overtime_charge,additional_charges,total_charge,daily_hour_entry_id,daily_hour_entry:daily_hour_entry_id(entry_date,machine:machine_id(machine_number))',
            )
            .eq('invoice_id', invoice.id)
            .order('created_at') as unknown as PromiseLike<{ data: LineItem[] | null; error: unknown }>),
    [invoice?.id],
  )
  const adjustments = useQuery<Adjustment[]>(
    () =>
      !invoice
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('invoice_adjustment')
            .select('id,reason,amount,created_at')
            .eq('invoice_id', invoice.id)
            .order('created_at') as unknown as PromiseLike<{ data: Adjustment[] | null; error: unknown }>),
    [invoice?.id],
  )

  useEffect(() => {
    setActionError('')
  }, [invoice?.id])

  if (!invoice) return null

  const transitions = canManage ? NEXT_STATUS[invoice.status] ?? [] : []
  const canVoid = canManage && ['draft', 'pending_approval', 'approved'].includes(invoice.status)
  const canAdjust = canManage && ['finalized', 'overdue', 'paid'].includes(invoice.status)

  async function moveTo(to: string) {
    setBusy(true)
    setActionError('')
    const patch: Record<string, unknown> = { status: to, updated_at: new Date().toISOString() }
    if (to === 'finalized') {
      patch.finalized_at = new Date().toISOString()
      patch.finalized_by = userId
    }
    const { error } = await supabase.from('invoice').update(patch).eq('id', invoice!.id)
    setBusy(false)
    if (error) {
      setActionError(
        /permission|policy|rls|denied/i.test((error as { message?: string }).message ?? '')
          ? 'You do not have permission to change this invoice.'
          : 'Could not update the invoice. Please try again.',
      )
      return
    }
    onChanged()
    onClose()
  }

  async function confirmVoid() {
    setBusy(true)
    setActionError('')
    // Release the underlying hours so they can be re-billed, and detach the
    // billing lines from the voided invoice.
    const entryIds = (items.data ?? []).map((li) => li.daily_hour_entry_id).filter(Boolean)
    const { error: vErr } = await supabase
      .from('invoice')
      .update({ status: 'void', updated_at: new Date().toISOString() })
      .eq('id', invoice!.id)
    if (!vErr) {
      await supabase.from('billing_entry').update({ invoice_id: null }).eq('invoice_id', invoice!.id)
      if (entryIds.length > 0) {
        await supabase.from('daily_hour_entry').update({ is_billed: false }).in('id', entryIds)
      }
    }
    setBusy(false)
    if (vErr) {
      setActionError('Could not void this invoice. Please try again.')
      return
    }
    setVoiding(false)
    onChanged()
    onClose()
  }

  function exportCsv() {
    const rows = [
      ['Date', 'Machine', 'Normal hours', 'OT hours', 'Normal charge', 'OT charge', 'Total'],
      ...(items.data ?? []).map((li) => [
        li.daily_hour_entry?.entry_date ?? '',
        li.daily_hour_entry?.machine?.machine_number ?? '',
        String(li.normal_hours),
        String(li.overtime_hours),
        String(li.normal_charge),
        String(li.overtime_charge),
        String(li.total_charge),
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${invoice!.invoice_number}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <Modal
        open={!!invoice}
        onClose={busy ? () => {} : onClose}
        eyebrow="Invoice detail"
        title={invoice.invoice_number}
        subtitle={invoice.customer?.company_name}
        footer={
          <div className="modal-foot-split">
            <StatusBadge tone={invoiceStatusTone(invoice.status)}>{titleCase(invoice.status)}</StatusBadge>
            <div className="modal-foot-actions">
              <button className="button button-secondary" onClick={exportCsv}>
                <Download size={14} />
                CSV
              </button>
              <button className="button button-secondary" onClick={() => window.print()}>
                <Printer size={14} />
                Print
              </button>
              {canVoid && (
                <button className="button button-danger" onClick={() => setVoiding(true)} disabled={busy}>
                  Void
                </button>
              )}
              {transitions.map((t) => (
                <button key={t.to} className="button button-primary" onClick={() => moveTo(t.to)} disabled={busy}>
                  <t.icon size={14} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        }
      >
        {actionError && (
          <div className="form-error">
            <AlertTriangle size={15} />
            {actionError}
          </div>
        )}
        <DetailGrid
          items={[
            ['Customer', invoice.customer?.company_name ?? '—'],
            ['Contract', invoice.contract?.contract_number ?? '—'],
            [
              'Billing period',
              `${shortDate(invoice.billing_period_start)} → ${shortDate(invoice.billing_period_end)}`,
            ],
            ['Payment terms', `${invoice.payment_terms_days} days`],
            ['Subtotal', money(invoice.subtotal, currency)],
            ['Tax', money(invoice.tax_amount, currency)],
            ['Total', money(invoice.total_amount, currency)],
            ['Finalized', invoice.finalized_at ? shortDate(invoice.finalized_at) : 'Not finalized'],
          ]}
        />

        <ModalSection
          title="Line items"
          count={items.data?.length}
          action={
            <button className="mini-add" onClick={exportCsv}>
              <Download size={13} /> Export
            </button>
          }
        >
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

        <ModalSection
          title="Adjustments"
          count={adjustments.data?.length}
          action={
            canAdjust ? (
              <button className="mini-add" onClick={() => setAdjusting(true)}>
                Add adjustment
              </button>
            ) : undefined
          }
        >
          <MiniState
            status={adjustments.status}
            error={adjustments.error}
            isEmpty={(adjustments.data ?? []).length === 0}
            emptyText="No adjustments on this invoice."
          />
          {(adjustments.data ?? []).map((a) => (
            <div className="stack-row" key={a.id}>
              <div>
                <b>{a.reason}</b>
                <span>{shortDate(a.created_at)}</span>
              </div>
              <div className="stack-meta">
                <b className={Number(a.amount) < 0 ? 'amt-neg' : 'amt-pos'}>{money(a.amount, currency)}</b>
              </div>
            </div>
          ))}
        </ModalSection>
      </Modal>

      <ConfirmDialog
        open={voiding}
        title="Void this invoice?"
        confirmLabel="Void invoice"
        busy={busy}
        onCancel={() => !busy && setVoiding(false)}
        onConfirm={confirmVoid}
        message={
          <>
            <b>{invoice.invoice_number}</b> will be voided. Its billed hours are released so they can be
            re-invoiced. This cannot be undone.
          </>
        }
      />

      {adjusting && (
        <AdjustmentModal
          invoiceId={invoice.id}
          currency={currency}
          userId={userId}
          baseTotal={round2(Number(invoice.subtotal) + Number(invoice.tax_amount))}
          existing={(adjustments.data ?? []).reduce((s, a) => s + Number(a.amount), 0)}
          onClose={() => setAdjusting(false)}
          onSaved={() => {
            setAdjusting(false)
            adjustments.reload()
            onChanged()
          }}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Adjustment form
// ---------------------------------------------------------------------------

function AdjustmentModal({
  invoiceId,
  currency,
  userId,
  baseTotal,
  existing,
  onClose,
  onSaved,
}: {
  invoiceId: string
  currency: string
  userId: string
  baseTotal: number
  existing: number
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = useSupabase()
  const [reason, setReason] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!reason.trim()) return setError('Enter a reason for the adjustment.')
    if (!amount.trim() || Number.isNaN(Number(amount))) return setError('Enter a valid amount (may be negative).')
    setSaving(true)
    setError('')
    const amt = round2(Number(amount))
    const { error: insErr } = await supabase.from('invoice_adjustment').insert({
      invoice_id: invoiceId,
      reason: reason.trim(),
      amount: amt,
      created_by: userId,
    })
    if (!insErr) {
      const newTotal = round2(baseTotal + existing + amt)
      await supabase.from('invoice').update({ total_amount: newTotal, updated_at: new Date().toISOString() }).eq('id', invoiceId)
    }
    setSaving(false)
    if (insErr) {
      setError('Could not save the adjustment. Please try again.')
      return
    }
    onSaved()
  }

  return (
    <Modal
      open
      onClose={saving ? () => {} : onClose}
      eyebrow="Invoice adjustment"
      title="Add adjustment"
      subtitle="Finalized invoices are corrected with adjustments, never edited directly."
      footer={
        <div className="footer-actions">
          <button className="button button-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="button button-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Add adjustment'}
          </button>
        </div>
      }
    >
      <div className="form-grid">
        {error && (
          <div className="form-error">
            <AlertTriangle size={15} />
            {error}
          </div>
        )}
        <div className="form-field full">
          <label>
            Reason<span className="req">*</span>
          </label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Agreed rate correction" />
        </div>
        <div className="form-field full">
          <label>
            Amount ({currency})<span className="req">*</span>
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Use a negative value to reduce the total"
          />
          <span className="field-hint">Positive increases the invoice total; negative reduces it.</span>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Generate invoice from verified, unbilled hours
// ---------------------------------------------------------------------------

type ContractOpt = {
  id: string
  contract_number: string
  payment_terms_days: number
  customer_id: string
  customer: { company_name: string; currency: string } | null
}

function firstOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function lastOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}

function GenerateInvoiceModal({
  open,
  userId,
  onClose,
  onGenerated,
}: {
  open: boolean
  userId: string
  onClose: () => void
  onGenerated: (invoice: Invoice | null) => void
}) {
  const supabase = useSupabase()
  const [contractId, setContractId] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [taxPct, setTaxPct] = useState('16')
  const [preview, setPreview] = useState<ReturnType<typeof buildPreview> | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const contracts = useQuery<ContractOpt[]>(
    () =>
      !open
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('contract')
            .select('id,contract_number,payment_terms_days,customer_id,customer:customer_id(company_name,currency)')
            .neq('status', 'draft')
            .order('contract_number') as unknown as PromiseLike<{ data: ContractOpt[] | null; error: unknown }>),
    [open],
  )

  useEffect(() => {
    if (!open) return
    const now = new Date()
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    setContractId('')
    setStart(firstOfMonth(lastMonth))
    setEnd(lastOfMonth(lastMonth))
    setTaxPct('16')
    setPreview(null)
    setError('')
  }, [open])

  const contract = (contracts.data ?? []).find((c) => c.id === contractId) ?? null
  const currency = contract?.customer?.currency ?? 'ZMW'

  async function runPreview() {
    if (!contractId || !start || !end) {
      setError('Select a contract and billing period first.')
      return
    }
    if (end < start) {
      setError('The end date must be after the start date.')
      return
    }
    setPreviewing(true)
    setError('')
    setPreview(null)

    // Covered machines for this contract, deployed at any point in the window.
    const { data: cm, error: cmErr } = await supabase
      .from('contract_machine')
      .select('machine_id,deployment_start,deployment_end')
      .eq('contract_id', contractId)
    if (cmErr) {
      setPreviewing(false)
      setError('Could not load the contract’s machines. Please try again.')
      return
    }
    const machineIds = (cm ?? [])
      .filter(
        (m) =>
          (m.deployment_start ?? '0000-01-01') <= end && (m.deployment_end == null || m.deployment_end >= start),
      )
      .map((m) => m.machine_id as string)

    if (machineIds.length === 0) {
      setPreview({ lines: [], subtotal: 0, billableCount: 0, noRuleCount: 0, unsupportedCount: 0 })
      setPreviewing(false)
      return
    }

    const [{ data: entries, error: eErr }, { data: rules, error: rErr }] = await Promise.all([
      supabase
        .from('daily_hour_entry')
        .select('id,entry_date,machine_id,total_hours')
        .in('machine_id', machineIds)
        .gte('entry_date', start)
        .lte('entry_date', end)
        .eq('is_billed', false),
      supabase
        .from('billing_rule')
        .select(
          'id,contract_id,effective_from,effective_to,billing_model,standard_hours_per_day,standard_rate,overtime_rate,minimum_billable_hours,weekend_rate,public_holiday_rate,standby_rate,mobilisation_charge,demobilisation_charge',
        )
        .eq('contract_id', contractId)
        .order('effective_from', { ascending: false }),
    ])

    setPreviewing(false)
    if (eErr || rErr) {
      setError('Could not load hours or billing rules. Please try again.')
      return
    }
    const result = buildPreview((entries ?? []) as HourEntry[], (rules ?? []) as BillingRule[])
    setPreview(result)
  }

  async function generate() {
    if (!preview || !contract || preview.lines.length === 0) return
    setSaving(true)
    setError('')

    const subtotal = preview.subtotal
    const tax = round2(subtotal * (Number(taxPct) || 0) / 100)
    const total = round2(subtotal + tax)
    const period = end.slice(0, 7).replace('-', '')
    const invoiceNumber = `INV-${period}-${Math.floor(1000 + Math.random() * 9000)}`

    const { data: inv, error: invErr } = await supabase
      .from('invoice')
      .insert({
        invoice_number: invoiceNumber,
        customer_id: contract.customer_id,
        contract_id: contract.id,
        billing_period_start: start,
        billing_period_end: end,
        status: 'draft',
        subtotal,
        tax_amount: tax,
        total_amount: total,
        payment_terms_days: contract.payment_terms_days ?? 30,
        created_by: userId,
      })
      .select(LIST_SELECT)
      .single()

    if (invErr || !inv) {
      setSaving(false)
      setError(
        /permission|policy|rls|denied/i.test((invErr as { message?: string })?.message ?? '')
          ? 'You do not have permission to create invoices.'
          : 'Could not create the invoice. Please try again.',
      )
      return
    }

    const entryIds = preview.lines.map((l) => l.daily_hour_entry_id)
    const { error: beErr } = await supabase
      .from('billing_entry')
      .insert(preview.lines.map((l) => ({ ...l, invoice_id: (inv as { id: string }).id })))
    if (beErr) {
      // Roll the invoice back to void so we don't leave an empty draft.
      await supabase.from('invoice').update({ status: 'void' }).eq('id', (inv as { id: string }).id)
      setSaving(false)
      setError('Could not attach billing lines. The invoice was voided; please try again.')
      return
    }
    await supabase.from('daily_hour_entry').update({ is_billed: true }).in('id', entryIds)

    setSaving(false)
    onGenerated(inv as unknown as Invoice)
  }

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      eyebrow="Automated billing"
      title="Generate invoice"
      subtitle="Convert verified, unbilled working hours into a draft invoice using the contract’s effective billing rules."
      footer={
        <div className="footer-actions">
          <button className="button button-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          {!preview ? (
            <button className="button button-primary" onClick={runPreview} disabled={previewing}>
              {previewing ? 'Calculating…' : 'Preview charges'}
            </button>
          ) : (
            <button
              className="button button-primary"
              onClick={generate}
              disabled={saving || preview.lines.length === 0}
            >
              {saving ? 'Generating…' : `Create draft (${preview.billableCount} lines)`}
            </button>
          )}
        </div>
      }
    >
      <div className="form-grid">
        {error && (
          <div className="form-error">
            <AlertTriangle size={15} />
            {error}
          </div>
        )}
        <div className="form-field full">
          <label htmlFor="gen-contract">
            Contract<span className="req">*</span>
          </label>
          <select
            id="gen-contract"
            value={contractId}
            onChange={(e) => {
              setContractId(e.target.value)
              setPreview(null)
            }}
          >
            <option value="">— Select contract —</option>
            {(contracts.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.contract_number} — {c.customer?.company_name ?? ''}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="gen-start">Period start</label>
          <input
            id="gen-start"
            type="date"
            value={start}
            onChange={(e) => {
              setStart(e.target.value)
              setPreview(null)
            }}
          />
        </div>
        <div className="form-field">
          <label htmlFor="gen-end">Period end</label>
          <input
            id="gen-end"
            type="date"
            value={end}
            onChange={(e) => {
              setEnd(e.target.value)
              setPreview(null)
            }}
          />
        </div>
        <div className="form-field">
          <label htmlFor="gen-tax">Tax / VAT (%)</label>
          <input id="gen-tax" type="number" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} />
        </div>
      </div>

      {preview && (
        <div className="gen-preview">
          <h3>Preview</h3>
          {preview.lines.length === 0 ? (
            <p className="mini-state">
              No billable hours found for this contract and period. Hours must be verified (not flagged) and not
              already billed.
            </p>
          ) : (
            <>
              <div className="gen-summary">
                <div>
                  <span>Billable lines</span>
                  <b>{preview.billableCount}</b>
                </div>
                <div>
                  <span>Subtotal</span>
                  <b>{money(preview.subtotal, currency)}</b>
                </div>
                <div>
                  <span>Tax ({Number(taxPct) || 0}%)</span>
                  <b>{money(round2((preview.subtotal * (Number(taxPct) || 0)) / 100), currency)}</b>
                </div>
                <div>
                  <span>Total</span>
                  <b>{money(round2(preview.subtotal * (1 + (Number(taxPct) || 0) / 100)), currency)}</b>
                </div>
              </div>
              {(preview.noRuleCount > 0 || preview.unsupportedCount > 0) && (
                <p className="gen-warn">
                  <AlertTriangle size={13} />
                  {preview.noRuleCount > 0 && `${preview.noRuleCount} entr${preview.noRuleCount === 1 ? 'y has' : 'ies have'} no effective billing rule. `}
                  {preview.unsupportedCount > 0 &&
                    `${preview.unsupportedCount} entr${preview.unsupportedCount === 1 ? 'y uses' : 'ies use'} a period-based model billed manually. `}
                  These are excluded.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
