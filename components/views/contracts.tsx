'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Building2, Download, Eye, Pencil, Plus, ScrollText } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { contractStatusTone, invoiceStatusTone, money, shortDate, titleCase } from '@/lib/gbi/format'
import { canManageCommercial, type UserRole } from '@/lib/gbi/roles'
import {
  ConfirmDialog,
  DetailGrid,
  MiniState,
  Modal,
  ModalSection,
  PageHeading,
  RowActions,
  StatusBadge,
  ViewState,
} from '@/components/shared'
import { ContractDocModal } from '@/components/views/contract-doc-modal'

const CONTRACT_STATUSES = ['draft', 'active', 'expired', 'terminated']
const BILLING_FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'annually']
const BILLING_MODELS = ['hourly', 'daily', 'weekly', 'monthly', 'fixed']
const CURRENCIES = ['ZMW', 'USD', 'ZAR', 'EUR']

type Contract = {
  id: string
  contract_number: string
  customer_id: string
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

type Customer = {
  id: string
  company_name: string
  customer_code: string | null
  contact_name: string | null
  phone: string | null
  email: string | null
  billing_address: string | null
  tax_vat_number: string | null
  currency: string
  contract: { count: number }[]
}

const CONTRACT_SELECT =
  'id,contract_number,customer_id,status,start_date,end_date,payment_terms_days,billing_frequency,customer:customer_id(company_name,customer_code,currency,contact_name,email,phone),contract_machine(count),billing_rule(count)'
const CUSTOMER_SELECT =
  'id,company_name,customer_code,contact_name,phone,email,billing_address,tax_vat_number,currency,contract(count)'

export function ContractsView({ role, userId }: { role: UserRole; userId: string }) {
  const supabase = useSupabase()
  const [tab, setTab] = useState<'contracts' | 'customers'>('contracts')
  const [query, setQuery] = useState('')
  const canManage = canManageCommercial(role)
  const [docModal, setDocModal] = useState<{ contractNumber?: string; lessee?: string } | null>(null)

  // Contract state
  const [selected, setSelected] = useState<Contract | null>(null)
  const [contractForm, setContractForm] = useState<{ mode: 'add' | 'edit'; row: Contract | null } | null>(null)

  // Customer state
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerForm, setCustomerForm] = useState<{ mode: 'add' | 'edit'; row: Customer | null } | null>(null)

  const contracts = useQuery<Contract[]>(
    () =>
      supabase
        .from('contract')
        .select(CONTRACT_SELECT)
        .order('created_at', { ascending: false }) as unknown as PromiseLike<{
        data: Contract[] | null
        error: unknown
      }>,
    [],
  )
  const customers = useQuery<Customer[]>(
    () =>
      supabase
        .from('customer')
        .select(CUSTOMER_SELECT)
        .order('company_name') as unknown as PromiseLike<{ data: Customer[] | null; error: unknown }>,
    [],
  )

  const contractRows = useMemo(() => {
    const all = contracts.data ?? []
    if (!query.trim()) return all
    const q = query.toLowerCase()
    return all.filter(
      (c) =>
        c.contract_number.toLowerCase().includes(q) ||
        (c.customer?.company_name ?? '').toLowerCase().includes(q),
    )
  }, [contracts.data, query])

  const customerRows = useMemo(() => {
    const all = customers.data ?? []
    if (!query.trim()) return all
    const q = query.toLowerCase()
    return all.filter(
      (c) =>
        c.company_name.toLowerCase().includes(q) ||
        (c.customer_code ?? '').toLowerCase().includes(q) ||
        (c.contact_name ?? '').toLowerCase().includes(q),
    )
  }, [customers.data, query])

  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="Commercial"
        title="Customers & Contracts"
        description="Signed agreements, the machines they cover and the effective billing rules per contract."
        action={
          <div className="heading-actions">
            {canManage && (
              <button className="button button-secondary" onClick={() => setDocModal({})}>
                <Download size={14} /> Generate contract
              </button>
            )}
            {canManage && (
              <button
                className="button button-primary"
                onClick={() =>
                  tab === 'contracts'
                    ? setContractForm({ mode: 'add', row: null })
                    : setCustomerForm({ mode: 'add', row: null })
                }
              >
                <Plus size={15} />
                {tab === 'contracts' ? 'New contract' : 'New customer'}
              </button>
            )}
          </div>
        }
      />
      {templateMessage && <p className="form-error">{templateMessage}</p>}

      <div className="filter-row">
        <div className="seg-tabs">
          <button className={tab === 'contracts' ? 'active' : ''} onClick={() => setTab('contracts')}>
            <ScrollText size={14} />
            Contracts
          </button>
          <button className={tab === 'customers' ? 'active' : ''} onClick={() => setTab('customers')}>
            <Building2 size={14} />
            Customers
          </button>
        </div>
        <div className="toolbar-search">
          <input
            placeholder={tab === 'contracts' ? 'Search contract or customer…' : 'Search company, code or contact…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {tab === 'contracts' ? (
        <div className="panel">
          <ViewState
            status={contracts.status}
            error={contracts.error}
            isEmpty={contractRows.length === 0}
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
                    <th>Rules</th>
                    <th>Status</th>
                    <th className="col-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contractRows.map((c) => (
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
                      <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                        <RowActions
                          label={`Actions for ${c.contract_number}`}
                          actions={[
                            { label: 'View details', icon: Eye, onClick: () => setSelected(c) },
                            ...(canManage
                              ? [
                                  {
                                    label: 'Edit contract',
                                    icon: Pencil,
                                    onClick: () => setContractForm({ mode: 'edit', row: c }),
                                  },
                                ]
                              : []),
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ViewState>
        </div>
      ) : (
        <div className="panel">
          <ViewState
            status={customers.status}
            error={customers.error}
            isEmpty={customerRows.length === 0}
            title="customers"
            emptyText={query ? 'No customers match your search.' : 'No customers recorded yet.'}
            onRetry={customers.reload}
          >
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Code</th>
                    <th>Contact</th>
                    <th>Currency</th>
                    <th>Contracts</th>
                    <th className="col-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customerRows.map((c) => (
                    <tr key={c.id} className="clickable-row" onClick={() => setSelectedCustomer(c)}>
                      <td>
                        <b>{c.company_name}</b>
                        <div className="muted-cell">{c.email ?? ''}</div>
                      </td>
                      <td>{c.customer_code ?? '—'}</td>
                      <td>{c.contact_name ?? '—'}</td>
                      <td>{c.currency}</td>
                      <td>{c.contract?.[0]?.count ?? 0}</td>
                      <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                        <RowActions
                          label={`Actions for ${c.company_name}`}
                          actions={[
                            { label: 'View details', icon: Eye, onClick: () => setSelectedCustomer(c) },
                            ...(canManage
                              ? [
                                  {
                                    label: 'Edit customer',
                                    icon: Pencil,
                                    onClick: () => setCustomerForm({ mode: 'edit', row: c }),
                                  },
                                ]
                              : []),
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ViewState>
        </div>
      )}

      {canManage && (
        <ContractDocModal
          open={!!docModal}
          customers={(customers.data ?? []).map((c) => ({ id: c.id, company_name: c.company_name }))}
          defaultContractNumber={docModal?.contractNumber}
          defaultLessee={docModal?.lessee}
          onClose={() => setDocModal(null)}
        />
      )}

      <ContractModal
        contract={selected}
        canManage={canManage}
        userId={userId}
        onGenerateDoc={() =>
          selected && setDocModal({ contractNumber: selected.contract_number, lessee: selected.customer?.company_name })
        }
        onEdit={() => selected && setContractForm({ mode: 'edit', row: selected })}
        onClose={() => setSelected(null)}
      />

      <CustomerDetailModal
        customer={selectedCustomer}
        canManage={canManage}
        onEdit={() => selectedCustomer && setCustomerForm({ mode: 'edit', row: selectedCustomer })}
        onClose={() => setSelectedCustomer(null)}
      />

      {canManage && (
        <ContractFormModal
          state={contractForm}
          userId={userId}
          customers={customers.data ?? []}
          onClose={() => setContractForm(null)}
          onSaved={() => {
            setContractForm(null)
            setSelected(null)
            contracts.reload()
          }}
        />
      )}

      {canManage && (
        <CustomerFormModal
          state={customerForm}
          userId={userId}
          onClose={() => setCustomerForm(null)}
          onSaved={() => {
            setCustomerForm(null)
            setSelectedCustomer(null)
            customers.reload()
            contracts.reload()
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Contract detail modal — with inline management of billing rules & machines
// ---------------------------------------------------------------------------

type RuleRow = {
  id: string
  effective_from: string
  effective_to: string | null
  billing_model: string
  standard_hours_per_day: number | null
  standard_rate: number
  overtime_rate: number | null
  minimum_billable_hours: number | null
  weekend_rate: number | null
  public_holiday_rate: number | null
  standby_rate: number | null
  mobilisation_charge: number | null
  demobilisation_charge: number | null
}
type CoveredRow = {
  id: string
  deployment_start: string | null
  deployment_end: string | null
  machine_id: string
  machine: { machine_number: string; machine_type: string } | null
}
type InvoiceRow = {
  id: string
  invoice_number: string
  status: string
  total_amount: number
  billing_period_end: string
}

function ContractModal({
  contract,
  canManage,
  userId,
  onEdit,
  onGenerateDoc,
  onClose,
}: {
  contract: Contract | null
  canManage: boolean
  userId: string
  onEdit: () => void
  onGenerateDoc: () => void
  onClose: () => void
}) {
  const supabase = useSupabase()
  const currency = contract?.customer?.currency ?? 'ZMW'
  const [ruleForm, setRuleForm] = useState(false)
  const [machineForm, setMachineForm] = useState(false)
  const [endDeploy, setEndDeploy] = useState<CoveredRow | null>(null)

  const rules = useQuery<RuleRow[]>(
    () =>
      !contract
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('billing_rule')
            .select(
              'id,effective_from,effective_to,billing_model,standard_hours_per_day,standard_rate,overtime_rate,minimum_billable_hours,weekend_rate,public_holiday_rate,standby_rate,mobilisation_charge,demobilisation_charge',
            )
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
            .select('id,deployment_start,deployment_end,machine_id,machine:machine_id(machine_number,machine_type)')
            .eq('contract_id', contract.id)
            .order('deployment_start', { ascending: false }) as unknown as PromiseLike<{
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

  const openRule = (rules.data ?? []).find((r) => !r.effective_to) ?? null

  async function endDeployment() {
    if (!endDeploy) return
    await supabase
      .from('contract_machine')
      .update({ deployment_end: new Date().toISOString().slice(0, 10) })
      .eq('id', endDeploy.id)
    setEndDeploy(null)
    covered.reload()
  }

  return (
    <>
      <Modal
        open={!!contract}
        onClose={onClose}
        eyebrow="Contract detail"
        title={contract?.contract_number ?? ''}
        subtitle={contract?.customer?.company_name}
        footer={
          contract ? (
            <div className="modal-foot-split">
              <StatusBadge tone={contractStatusTone(contract.status)}>{titleCase(contract.status)}</StatusBadge>
              {canManage && (
                <div className="modal-foot-actions">
                  <button className="button button-secondary" onClick={onGenerateDoc}>
                    <Download size={14} />
                    Generate document
                  </button>
                  <button className="button button-secondary" onClick={onEdit}>
                    <Pencil size={14} />
                    Edit contract
                  </button>
                </div>
              )}
            </div>
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

            <ModalSection
              title="Billing rules (effective-dated)"
              count={rules.data?.length}
              action={
                canManage ? (
                  <button className="mini-add" onClick={() => setRuleForm(true)}>
                    <Plus size={13} /> Add rule
                  </button>
                ) : undefined
              }
            >
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
                    {!r.effective_to && <StatusBadge tone="green">Active</StatusBadge>}
                  </div>
                </div>
              ))}
            </ModalSection>

            <ModalSection
              title="Covered machines"
              count={covered.data?.length}
              action={
                canManage ? (
                  <button className="mini-add" onClick={() => setMachineForm(true)}>
                    <Plus size={13} /> Add machine
                  </button>
                ) : undefined
              }
            >
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
                    {canManage && !c.deployment_end && (
                      <button className="mini-link-danger" onClick={() => setEndDeploy(c)}>
                        End
                      </button>
                    )}
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

      {contract && canManage && (
        <BillingRuleFormModal
          open={ruleForm}
          contractId={contract.id}
          currency={currency}
          openRule={openRule}
          userId={userId}
          onClose={() => setRuleForm(false)}
          onSaved={() => {
            setRuleForm(false)
            rules.reload()
          }}
        />
      )}

      {contract && canManage && (
        <AddMachineModal
          open={machineForm}
          contractId={contract.id}
          existing={(covered.data ?? []).filter((c) => !c.deployment_end).map((c) => c.machine_id)}
          userId={userId}
          onClose={() => setMachineForm(false)}
          onSaved={() => {
            setMachineForm(false)
            covered.reload()
          }}
        />
      )}

      <ConfirmDialog
        open={endDeploy !== null}
        title="End deployment?"
        confirmLabel="End deployment"
        onCancel={() => setEndDeploy(null)}
        onConfirm={endDeployment}
        message={
          <>
            <b>{endDeploy?.machine?.machine_number}</b> will be marked as no longer deployed on this contract as of
            today. The historical deployment record is preserved.
          </>
        }
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Customer detail modal
// ---------------------------------------------------------------------------

function CustomerDetailModal({
  customer,
  canManage,
  onEdit,
  onClose,
}: {
  customer: Customer | null
  canManage: boolean
  onEdit: () => void
  onClose: () => void
}) {
  return (
    <Modal
      open={!!customer}
      onClose={onClose}
      eyebrow="Customer detail"
      title={customer?.company_name ?? ''}
      subtitle={customer?.customer_code ?? undefined}
      footer={
        customer && canManage ? (
          <div className="modal-foot-split">
            <span className="muted-cell">{customer.contract?.[0]?.count ?? 0} contracts</span>
            <div className="modal-foot-actions">
              <button className="button button-secondary" onClick={onEdit}>
                <Pencil size={14} />
                Edit customer
              </button>
            </div>
          </div>
        ) : null
      }
    >
      {customer && (
        <DetailGrid
          items={[
            ['Company', customer.company_name],
            ['Customer code', customer.customer_code ?? '—'],
            ['Contact name', customer.contact_name ?? '—'],
            ['Email', customer.email ?? '—'],
            ['Phone', customer.phone ?? '—'],
            ['Currency', customer.currency],
            ['Tax / VAT number', customer.tax_vat_number ?? '—'],
            ['Billing address', customer.billing_address ?? '—'],
          ]}
        />
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Contract form
// ---------------------------------------------------------------------------

function ContractFormModal({
  state,
  userId,
  customers,
  onClose,
  onSaved,
}: {
  state: { mode: 'add' | 'edit'; row: Contract | null } | null
  userId: string
  customers: Customer[]
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = useSupabase()
  const open = state !== null
  const mode = state?.mode ?? 'add'
  const row = state?.row ?? null
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && row) {
      setForm({
        contract_number: row.contract_number ?? '',
        customer_id: row.customer_id ?? '',
        status: row.status ?? 'draft',
        start_date: row.start_date ?? '',
        end_date: row.end_date ?? '',
        payment_terms_days: String(row.payment_terms_days ?? 30),
        billing_frequency: row.billing_frequency ?? 'monthly',
      })
    } else {
      setForm({ status: 'draft', billing_frequency: 'monthly', payment_terms_days: '30' })
    }
    setFieldErrors({})
    setFormError('')
  }, [open, mode, row])

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit() {
    const errors: Record<string, string> = {}
    if (!form.contract_number?.trim()) errors.contract_number = 'Contract number is required.'
    if (!form.customer_id) errors.customer_id = 'Select a customer.'
    if (!form.start_date) errors.start_date = 'Start date is required.'
    if (form.end_date && form.start_date && form.end_date < form.start_date)
      errors.end_date = 'End date must be after the start date.'
    setFieldErrors(errors)
    setFormError('')
    if (Object.keys(errors).length > 0) return

    const payload = {
      contract_number: form.contract_number.trim(),
      customer_id: form.customer_id,
      status: form.status || 'draft',
      start_date: form.start_date,
      end_date: form.end_date?.trim() ? form.end_date : null,
      payment_terms_days: form.payment_terms_days?.trim() ? Number(form.payment_terms_days) : 30,
      billing_frequency: form.billing_frequency || 'monthly',
    }

    setSaving(true)
    const { error } =
      mode === 'edit' && row
        ? await supabase.from('contract').update({ ...payload, updated_by: userId }).eq('id', row.id)
        : await supabase.from('contract').insert({ ...payload, created_by: userId })
    setSaving(false)

    if (error) {
      const code = (error as { code?: string }).code
      if (code === '23505') {
        setFieldErrors({ contract_number: 'A contract with this number already exists.' })
        return
      }
      if (/permission|policy|rls|denied/i.test((error as { message?: string }).message ?? '')) {
        setFormError('You do not have permission to save contracts.')
        return
      }
      setFormError('Could not save this contract. Please check the values and try again.')
      return
    }
    onSaved()
  }

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      eyebrow="Commercial"
      title={mode === 'edit' ? 'Edit contract' : 'New contract'}
      subtitle={
        mode === 'edit'
          ? 'Update the contract terms, period and status.'
          : 'Create a contract, then add its billing rules and covered machines from the contract detail.'
      }
      footer={
        <div className="footer-actions">
          <button className="button button-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="button button-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create contract'}
          </button>
        </div>
      }
    >
      <div className="form-grid">
        {formError && (
          <div className="form-error">
            <AlertTriangle size={15} />
            {formError}
          </div>
        )}
        <Field
          label="Contract number"
          required
          value={form.contract_number ?? ''}
          onChange={(v) => set('contract_number', v)}
          error={fieldErrors.contract_number}
          placeholder="e.g. GB-CON-006"
        />
        <div className={`form-field ${fieldErrors.customer_id ? 'invalid' : ''}`}>
          <label htmlFor="c-customer">
            Customer<span className="req">*</span>
          </label>
          <select id="c-customer" value={form.customer_id ?? ''} onChange={(e) => set('customer_id', e.target.value)}>
            <option value="">— Select customer —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))}
          </select>
          {fieldErrors.customer_id && <span className="field-error">{fieldErrors.customer_id}</span>}
        </div>
        <div className="form-field">
          <label htmlFor="c-status">Status</label>
          <select id="c-status" value={form.status ?? 'draft'} onChange={(e) => set('status', e.target.value)}>
            {CONTRACT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="c-freq">Billing frequency</label>
          <select
            id="c-freq"
            value={form.billing_frequency ?? 'monthly'}
            onChange={(e) => set('billing_frequency', e.target.value)}
          >
            {BILLING_FREQUENCIES.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </select>
        </div>
        <Field
          label="Start date"
          type="date"
          required
          value={form.start_date ?? ''}
          onChange={(v) => set('start_date', v)}
          error={fieldErrors.start_date}
        />
        <Field
          label="End date"
          type="date"
          value={form.end_date ?? ''}
          onChange={(v) => set('end_date', v)}
          error={fieldErrors.end_date}
        />
        <Field
          label="Payment terms (days)"
          type="number"
          value={form.payment_terms_days ?? ''}
          onChange={(v) => set('payment_terms_days', v)}
          placeholder="30"
        />
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Customer form
// ---------------------------------------------------------------------------

function CustomerFormModal({
  state,
  userId,
  onClose,
  onSaved,
}: {
  state: { mode: 'add' | 'edit'; row: Customer | null } | null
  userId: string
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = useSupabase()
  const open = state !== null
  const mode = state?.mode ?? 'add'
  const row = state?.row ?? null
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const str = (v: unknown) => (v == null ? '' : String(v))

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && row) {
      setForm({
        company_name: row.company_name ?? '',
        customer_code: str(row.customer_code),
        contact_name: str(row.contact_name),
        phone: str(row.phone),
        email: str(row.email),
        billing_address: str(row.billing_address),
        tax_vat_number: str(row.tax_vat_number),
        currency: row.currency ?? 'ZMW',
      })
    } else {
      setForm({ currency: 'ZMW' })
    }
    setFieldErrors({})
    setFormError('')
  }, [open, mode, row])

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit() {
    const errors: Record<string, string> = {}
    if (!form.company_name?.trim()) errors.company_name = 'Company name is required.'
    if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) errors.email = 'Enter a valid email.'
    setFieldErrors(errors)
    setFormError('')
    if (Object.keys(errors).length > 0) return

    const text = (k: string) => (form[k]?.trim() ? form[k].trim() : null)
    const payload = {
      company_name: form.company_name.trim(),
      customer_code: text('customer_code'),
      contact_name: text('contact_name'),
      phone: text('phone'),
      email: text('email'),
      billing_address: text('billing_address'),
      tax_vat_number: text('tax_vat_number'),
      currency: form.currency || 'ZMW',
    }

    setSaving(true)
    const { error } =
      mode === 'edit' && row
        ? await supabase.from('customer').update({ ...payload, updated_by: userId }).eq('id', row.id)
        : await supabase.from('customer').insert({ ...payload, created_by: userId })
    setSaving(false)

    if (error) {
      const code = (error as { code?: string }).code
      if (code === '23505') {
        setFieldErrors({ customer_code: 'This customer code is already in use.' })
        return
      }
      if (/permission|policy|rls|denied/i.test((error as { message?: string }).message ?? '')) {
        setFormError('You do not have permission to save customers.')
        return
      }
      setFormError('Could not save this customer. Please check the values and try again.')
      return
    }
    onSaved()
  }

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      eyebrow="Commercial"
      title={mode === 'edit' ? 'Edit customer' : 'New customer'}
      subtitle={mode === 'edit' ? 'Update this customer’s contact and billing details.' : 'Add a customer to bill contracts against.'}
      footer={
        <div className="footer-actions">
          <button className="button button-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="button button-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create customer'}
          </button>
        </div>
      }
    >
      <div className="form-grid">
        {formError && (
          <div className="form-error">
            <AlertTriangle size={15} />
            {formError}
          </div>
        )}
        <Field
          label="Company name"
          required
          value={form.company_name ?? ''}
          onChange={(v) => set('company_name', v)}
          error={fieldErrors.company_name}
          placeholder="e.g. Kansanshi Mining Plc"
        />
        <Field label="Customer code" value={form.customer_code ?? ''} onChange={(v) => set('customer_code', v)} />
        <Field label="Contact name" value={form.contact_name ?? ''} onChange={(v) => set('contact_name', v)} />
        <Field label="Email" value={form.email ?? ''} onChange={(v) => set('email', v)} error={fieldErrors.email} />
        <Field label="Phone" value={form.phone ?? ''} onChange={(v) => set('phone', v)} />
        <div className="form-field">
          <label htmlFor="cust-currency">Currency</label>
          <select id="cust-currency" value={form.currency ?? 'ZMW'} onChange={(e) => set('currency', e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <Field label="Tax / VAT number" value={form.tax_vat_number ?? ''} onChange={(v) => set('tax_vat_number', v)} />
        <Field
          label="Billing address"
          full
          value={form.billing_address ?? ''}
          onChange={(v) => set('billing_address', v)}
        />
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Billing rule form (effective-dated; auto-closes the prior open rule)
// ---------------------------------------------------------------------------

function BillingRuleFormModal({
  open,
  contractId,
  currency,
  openRule,
  userId,
  onClose,
  onSaved,
}: {
  open: boolean
  contractId: string
  currency: string
  openRule: RuleRow | null
  userId: string
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = useSupabase()
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setForm({ billing_model: 'hourly', standard_hours_per_day: '8' })
    setFieldErrors({})
    setFormError('')
  }, [open])

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit() {
    const errors: Record<string, string> = {}
    if (!form.effective_from) errors.effective_from = 'Effective-from date is required.'
    if (!form.standard_rate?.trim() || Number(form.standard_rate) <= 0)
      errors.standard_rate = 'Enter a standard rate greater than zero.'
    if (openRule && form.effective_from && form.effective_from <= openRule.effective_from)
      errors.effective_from = `Must be after the current rule's start (${shortDate(openRule.effective_from)}).`
    setFieldErrors(errors)
    setFormError('')
    if (Object.keys(errors).length > 0) return

    const num = (k: string) => (form[k]?.trim() ? Number(form[k]) : null)
    const payload = {
      contract_id: contractId,
      effective_from: form.effective_from,
      effective_to: null,
      billing_model: form.billing_model || 'hourly',
      standard_hours_per_day: num('standard_hours_per_day') ?? 8,
      standard_rate: Number(form.standard_rate),
      overtime_rate: num('overtime_rate'),
      minimum_billable_hours: num('minimum_billable_hours'),
      weekend_rate: num('weekend_rate'),
      public_holiday_rate: num('public_holiday_rate'),
      standby_rate: num('standby_rate'),
      mobilisation_charge: num('mobilisation_charge'),
      demobilisation_charge: num('demobilisation_charge'),
      created_by: userId,
    }

    setSaving(true)
    // Close the prior open rule the day before the new one takes effect,
    // so effective-dated history is never rewritten or overlapped.
    if (openRule) {
      const prevEnd = new Date(form.effective_from)
      prevEnd.setDate(prevEnd.getDate() - 1)
      const { error: closeErr } = await supabase
        .from('billing_rule')
        .update({ effective_to: prevEnd.toISOString().slice(0, 10) })
        .eq('id', openRule.id)
      if (closeErr) {
        setSaving(false)
        setFormError('Could not close the previous billing rule. Please try again.')
        return
      }
    }
    const { error } = await supabase.from('billing_rule').insert(payload)
    setSaving(false)

    if (error) {
      if (/permission|policy|rls|denied/i.test((error as { message?: string }).message ?? '')) {
        setFormError('You do not have permission to add billing rules.')
        return
      }
      setFormError('Could not save this billing rule. Please try again.')
      return
    }
    onSaved()
  }

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      eyebrow="Billing rule"
      title="Add billing rule"
      subtitle={
        openRule
          ? `The current rule (from ${shortDate(openRule.effective_from)}) will be closed the day before this one starts.`
          : 'Set the rates that apply from the effective date onward.'
      }
      footer={
        <div className="footer-actions">
          <button className="button button-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="button button-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Add rule'}
          </button>
        </div>
      }
    >
      <div className="form-grid">
        {formError && (
          <div className="form-error">
            <AlertTriangle size={15} />
            {formError}
          </div>
        )}
        <Field
          label="Effective from"
          type="date"
          required
          value={form.effective_from ?? ''}
          onChange={(v) => set('effective_from', v)}
          error={fieldErrors.effective_from}
        />
        <div className="form-field">
          <label htmlFor="br-model">Billing model</label>
          <select
            id="br-model"
            value={form.billing_model ?? 'hourly'}
            onChange={(e) => set('billing_model', e.target.value)}
          >
            {BILLING_MODELS.map((m) => (
              <option key={m} value={m}>
                {titleCase(m)}
              </option>
            ))}
          </select>
        </div>
        <Field
          label={`Standard rate (${currency})`}
          type="number"
          required
          value={form.standard_rate ?? ''}
          onChange={(v) => set('standard_rate', v)}
          error={fieldErrors.standard_rate}
        />
        <Field
          label="Standard hours / day"
          type="number"
          value={form.standard_hours_per_day ?? ''}
          onChange={(v) => set('standard_hours_per_day', v)}
          placeholder="8"
        />
        <Field
          label={`Overtime rate (${currency})`}
          type="number"
          value={form.overtime_rate ?? ''}
          onChange={(v) => set('overtime_rate', v)}
        />
        <Field
          label="Minimum billable hours"
          type="number"
          value={form.minimum_billable_hours ?? ''}
          onChange={(v) => set('minimum_billable_hours', v)}
        />
        <Field
          label={`Weekend rate (${currency})`}
          type="number"
          value={form.weekend_rate ?? ''}
          onChange={(v) => set('weekend_rate', v)}
        />
        <Field
          label={`Public holiday rate (${currency})`}
          type="number"
          value={form.public_holiday_rate ?? ''}
          onChange={(v) => set('public_holiday_rate', v)}
        />
        <Field
          label={`Standby rate (${currency})`}
          type="number"
          value={form.standby_rate ?? ''}
          onChange={(v) => set('standby_rate', v)}
        />
        <Field
          label={`Mobilisation charge (${currency})`}
          type="number"
          value={form.mobilisation_charge ?? ''}
          onChange={(v) => set('mobilisation_charge', v)}
        />
        <Field
          label={`Demobilisation charge (${currency})`}
          type="number"
          value={form.demobilisation_charge ?? ''}
          onChange={(v) => set('demobilisation_charge', v)}
        />
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Add covered machine
// ---------------------------------------------------------------------------

type MachinePick = { id: string; machine_number: string; machine_type: string }

function AddMachineModal({
  open,
  contractId,
  existing,
  userId,
  onClose,
  onSaved,
}: {
  open: boolean
  contractId: string
  existing: string[]
  userId: string
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = useSupabase()
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const machines = useQuery<MachinePick[]>(
    () =>
      !open
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('machine')
            .select('id,machine_number,machine_type')
            .is('deleted_at', null)
            .order('machine_number') as unknown as PromiseLike<{ data: MachinePick[] | null; error: unknown }>),
    [open],
  )

  useEffect(() => {
    if (!open) return
    setForm({ deployment_start: new Date().toISOString().slice(0, 10) })
    setFieldErrors({})
    setFormError('')
  }, [open])

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  const available = (machines.data ?? []).filter((m) => !existing.includes(m.id))

  async function submit() {
    const errors: Record<string, string> = {}
    if (!form.machine_id) errors.machine_id = 'Select a machine.'
    if (!form.deployment_start) errors.deployment_start = 'Deployment start is required.'
    setFieldErrors(errors)
    setFormError('')
    if (Object.keys(errors).length > 0) return

    setSaving(true)
    const { error } = await supabase.from('contract_machine').insert({
      contract_id: contractId,
      machine_id: form.machine_id,
      deployment_start: form.deployment_start,
      deployment_end: form.deployment_end?.trim() ? form.deployment_end : null,
      created_by: userId,
    })
    setSaving(false)

    if (error) {
      const code = (error as { code?: string }).code
      if (code === '23505') {
        setFieldErrors({ machine_id: 'This machine is already on the contract for that start date.' })
        return
      }
      if (/permission|policy|rls|denied/i.test((error as { message?: string }).message ?? '')) {
        setFormError('You do not have permission to add machines to contracts.')
        return
      }
      setFormError('Could not add this machine. Please try again.')
      return
    }
    onSaved()
  }

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      eyebrow="Covered machine"
      title="Add machine to contract"
      subtitle="Record which machine this contract covers and when its deployment began."
      footer={
        <div className="footer-actions">
          <button className="button button-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="button button-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Add machine'}
          </button>
        </div>
      }
    >
      <div className="form-grid">
        {formError && (
          <div className="form-error">
            <AlertTriangle size={15} />
            {formError}
          </div>
        )}
        <div className={`form-field full ${fieldErrors.machine_id ? 'invalid' : ''}`}>
          <label htmlFor="cm-machine">
            Machine<span className="req">*</span>
          </label>
          <select id="cm-machine" value={form.machine_id ?? ''} onChange={(e) => set('machine_id', e.target.value)}>
            <option value="">— Select machine —</option>
            {available.map((m) => (
              <option key={m.id} value={m.id}>
                {m.machine_number} — {m.machine_type}
              </option>
            ))}
          </select>
          {fieldErrors.machine_id && <span className="field-error">{fieldErrors.machine_id}</span>}
          {available.length === 0 && machines.status === 'ready' && (
            <span className="field-hint">All active machines are already on this contract.</span>
          )}
        </div>
        <Field
          label="Deployment start"
          type="date"
          required
          value={form.deployment_start ?? ''}
          onChange={(v) => set('deployment_start', v)}
          error={fieldErrors.deployment_start}
        />
        <Field
          label="Deployment end (optional)"
          type="date"
          value={form.deployment_end ?? ''}
          onChange={(v) => set('deployment_end', v)}
        />
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------

function Field({
  label,
  value,
  onChange,
  required,
  type = 'text',
  placeholder,
  error,
  full,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  type?: string
  placeholder?: string
  error?: string
  full?: boolean
}) {
  return (
    <div className={`form-field ${full ? 'full' : ''} ${error ? 'invalid' : ''}`}>
      <label>
        {label}
        {required && <span className="req">*</span>}
      </label>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {error && <span className="field-error">{error}</span>}
    </div>
  )
}
