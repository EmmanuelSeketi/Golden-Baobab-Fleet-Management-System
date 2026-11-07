'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Download, Plus, Trash2 } from 'lucide-react'
import { Modal, ModalSection } from '@/components/shared'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { downloadQuotationDoc, type QuotationDocData, type QuotationLineItem } from '@/lib/gbi/quotation-doc'
import type { LogoChoice } from '@/lib/gbi/contract-doc'

type Customer = {
  id: string
  company_name: string
  billing_address: string | null
  currency: string
}
type Project = { id: string; name: string; customer_id: string | null; site_location: string | null }
type Contract = {
  id: string
  contract_number: string
  customer_id: string
  status: string
  start_date: string
  end_date: string | null
}
type ProjectContract = {
  effective_from: string
  effective_to: string | null
  contract: Contract | null
}
type Machine = {
  id: string
  name: string
  machine_number: string
  machine_type: string
  manufacturer: string | null
  brand: string | null
  model: string | null
  chassis_number: string | null
}
type ItemDraft = { machineId: string; rental: string; hours: string; total: string }
type SavedQuotation = { data: QuotationDocData }

const emptyItem = (): ItemDraft => ({ machineId: '', rental: '', hours: '', total: '' })
const today = () => new Date().toISOString().slice(0, 10)
const newQuotationNumber = () =>
  `GBI-HQ-${today().replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

export function QuotationDocModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = useSupabase()
  const [quotationNumber, setQuotationNumber] = useState('')
  const [quotationDate, setQuotationDate] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [contractId, setContractId] = useState('')
  const [address, setAddress] = useState('ZAMBIA')
  const [currency, setCurrency] = useState('ZMW')
  const [logo, setLogo] = useState<LogoChoice>('gbi')
  const [mobilizationFee, setMobilizationFee] = useState('10000')
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedQuotation, setSavedQuotation] = useState<SavedQuotation | null>(null)

  const customers = useQuery<Customer[]>(
    () =>
      !open
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('customer')
            .select('id,company_name,billing_address,currency')
            .order('company_name') as unknown as PromiseLike<{
            data: Customer[] | null
            error: unknown
          }>),
    [open],
  )
  const projects = useQuery<Project[]>(
    () =>
      !open
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('project')
            .select('id,name,customer_id,site_location')
            .order('name') as unknown as PromiseLike<{
            data: Project[] | null
            error: unknown
          }>),
    [open],
  )
  const projectContracts = useQuery<ProjectContract[]>(
    () =>
      !open || !projectId
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('project_contract')
            .select('effective_from,effective_to,contract:contract_id(id,contract_number,customer_id,status,start_date,end_date)')
            .eq('project_id', projectId) as unknown as PromiseLike<{
            data: ProjectContract[] | null
            error: unknown
          }>),
    [open, projectId],
  )
  const machines = useQuery<Machine[]>(
    () =>
      !open || !projectId
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('machine')
            .select('id,name,machine_number,machine_type,manufacturer,brand,model,chassis_number')
            .eq('current_project_id', projectId)
            .is('deleted_at', null)
            .order('machine_number') as unknown as PromiseLike<{
            data: Machine[] | null
            error: unknown
          }>),
    [open, projectId],
  )

  const customer = (customers.data ?? []).find((row) => row.id === customerId)
  const projectOptions = useMemo(
    () => (projects.data ?? []).filter((project) => project.customer_id),
    [projects.data],
  )
  const contractOptions = useMemo(
    () =>
      (projectContracts.data ?? [])
        .filter((link) => {
          const contract = link.contract
          return (
            contract &&
            contract.customer_id === customerId &&
            contract.start_date <= quotationDate &&
            (!contract.end_date || contract.end_date >= quotationDate) &&
            link.effective_from <= quotationDate &&
            (!link.effective_to || link.effective_to >= quotationDate)
          )
        })
        .map((link) => link.contract as Contract),
    [projectContracts.data, customerId, quotationDate],
  )

  useEffect(() => {
    if (open) {
      setQuotationNumber(newQuotationNumber())
      setQuotationDate(today())
      setCustomerId('')
      setProjectId('')
      setContractId('')
      setAddress('ZAMBIA')
      setCurrency('ZMW')
      setLogo('gbi')
      setMobilizationFee('10000')
      setItems([emptyItem()])
      setError('')
      setSavedQuotation(null)
    }
  }, [open])

  function chooseCustomer(id: string) {
    const selectedCustomer = (customers.data ?? []).find((row) => row.id === id)
    setCustomerId(id)
    const selectedProject = (projects.data ?? []).find((row) => row.id === projectId)
    if (selectedProject && selectedProject.customer_id !== id) {
      setProjectId('')
      setContractId('')
      setItems([emptyItem()])
    }
    if (selectedCustomer) {
      setAddress(selectedCustomer.billing_address?.trim() || 'ZAMBIA')
      setCurrency(selectedCustomer.currency || 'ZMW')
    }
  }

  function chooseProject(id: string) {
    const selectedProject = (projects.data ?? []).find((row) => row.id === id)
    const selectedCustomer = (customers.data ?? []).find((row) => row.id === selectedProject?.customer_id)
    setProjectId(id)
    setContractId('')
    setItems([emptyItem()])
    if (selectedCustomer) {
      setCustomerId(selectedCustomer.id)
      setAddress(selectedCustomer.billing_address?.trim() || 'ZAMBIA')
      setCurrency(selectedCustomer.currency || 'ZMW')
    }
  }

  function patchItem(index: number, key: keyof ItemDraft, value: string) {
    setItems((current) => current.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
  }

  function machineLabels(machine: Machine) {
    const model = machine.model || [machine.brand, machine.manufacturer].filter(Boolean).join(' ') || machine.machine_type
    const specification = [machine.name, machine.machine_type, machine.machine_number].filter(Boolean).join(' · ')
    return { model, specification }
  }

  function quotationDocument(): QuotationDocData {
    return {
      quotationNumber,
      lessee: customer?.company_name ?? '',
      address,
      date: quotationDate,
      currency,
      mobilizationFee,
      logo,
      items: items.map((item) => {
        const machine = (machines.data ?? []).find((row) => row.id === item.machineId)
        const labels = machine ? machineLabels(machine) : { model: '', specification: '' }
        return {
          ...labels,
          rental: item.rental.trim(),
          qty: '1',
          hours: item.hours.trim(),
          total: item.total.trim(),
        } satisfies QuotationLineItem
      }),
    }
  }

  async function downloadSaved(saved: SavedQuotation | null = savedQuotation) {
    if (!saved) return false
    try {
      await downloadQuotationDoc(saved.data)
      onClose()
      return true
    } catch {
      setError('The quotation was saved, but its document could not be generated. Use Download quotation to try again.')
      return false
    }
  }

  async function submit() {
    if (savedQuotation) {
      await downloadSaved()
      return
    }
    if (!customerId) return setError('Select the leasee / customer.')
    if (!projectId) return setError('Select the associated project.')
    if (!quotationNumber.trim()) return setError('Enter a quotation number.')
    if (!Number.isFinite(Number(mobilizationFee)) || Number(mobilizationFee) < 0) {
      return setError('Enter a valid mobilization fee.')
    }
    if (!items.length || items.some((item) => !item.machineId)) {
      return setError('Select a project machine for every quotation line.')
    }
    if (new Set(items.map((item) => item.machineId)).size !== items.length) {
      return setError('A machine can only appear once on a quotation.')
    }
    for (const item of items) {
      for (const [label, value] of [
        ['Rental', item.rental],
        ['Hours', item.hours],
        ['Total price', item.total],
      ]) {
        if (value.trim() && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
          return setError(`${label} must be a valid non-negative number.`)
        }
      }
    }

    const document = quotationDocument()
    setSaving(true)
    setError('')
    const { data, error: saveError } = await supabase.rpc('create_hiring_quotation', {
      p_quotation_number: quotationNumber.trim(),
      p_customer_id: customerId,
      p_project_id: projectId,
      p_contract_id: contractId || null,
      p_quotation_date: quotationDate,
      p_address: address.trim(),
      p_currency: currency,
      p_mobilization_fee: Number(mobilizationFee),
      p_items: items.map((item) => {
        const machine = (machines.data ?? []).find((row) => row.id === item.machineId)!
        const labels = machineLabels(machine)
        return {
          machine_id: machine.id,
          machine_number: machine.machine_number,
          ...labels,
          rental: item.rental.trim() ? Number(item.rental) : null,
          quantity: 1,
          hours: item.hours.trim() ? Number(item.hours) : null,
          total_price: item.total.trim() ? Number(item.total) : null,
        }
      }),
    })
    setSaving(false)
    if (saveError || typeof data !== 'string') {
      setError(
        /duplicate|unique/i.test((saveError as { message?: string } | null)?.message ?? '')
          ? 'That quotation number is already in use. Choose a different number.'
          : (saveError as { message?: string } | null)?.message ?? 'Could not save this quotation. Please try again.',
      )
      return
    }

    const saved = { data: document }
    setSavedQuotation(saved)
    onSaved()
    await downloadSaved(saved)
  }

  const selectedMachineIds = items.map((item) => item.machineId).filter(Boolean)

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      eyebrow="Commercial"
      title={savedQuotation ? 'Quotation saved' : 'New quotation'}
      subtitle="The document shows the lessee and quoted machines. Project and contract are retained in the app history."
      footer={
        <div className="modal-foot-actions" style={{ marginLeft: 'auto' }}>
          <button className="button button-secondary" onClick={onClose} disabled={saving}>
            Close
          </button>
          <button className="button button-primary" onClick={submit} disabled={saving || customers.status !== 'ready'}>
            <Download size={14} />
            {saving ? 'Saving…' : savedQuotation ? 'Download quotation' : 'Save & download'}
          </button>
        </div>
      }
    >
      {error && (
        <div className="form-error">
          <AlertTriangle size={15} />
          {error}
        </div>
      )}
      {savedQuotation ? (
        <p className="form-success">Quotation {quotationNumber} has been saved to history.</p>
      ) : (
        <>
          <div className="form-grid">
            <label className="field">
              <span>Quotation No.</span>
              <input value={quotationNumber} onChange={(e) => setQuotationNumber(e.target.value)} />
            </label>
            <label className="field">
              <span>Date</span>
              <input type="date" value={quotationDate} onChange={(e) => setQuotationDate(e.target.value)} />
            </label>
            <label className="field field-full">
              <span>Associated project</span>
              <select
                value={projectId}
                disabled={projects.status !== 'ready'}
                onChange={(e) => chooseProject(e.target.value)}
              >
                <option value="">
                  {projects.status === 'loading'
                    ? 'Loading projects…'
                    : projectOptions.length
                      ? 'Select project'
                      : 'No customer-linked projects'}
                </option>
                {projectOptions.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
              {projects.status === 'error' && <span className="field-error">{projects.error}</span>}
              {projects.status === 'ready' && projectOptions.length === 0 && (
                <span className="form-hint">
                  No customer-linked projects are available for quotations.
                </span>
              )}
            </label>
            <label className="field field-full">
              <span>Leasee / customer</span>
              <select
                value={customerId}
                disabled={customers.status !== 'ready'}
                onChange={(e) => chooseCustomer(e.target.value)}
              >
                <option value="">
                  {customers.status === 'loading' ? 'Loading customers…' : 'Select customer'}
                </option>
                {(customers.data ?? []).map((row) => (
                  <option key={row.id} value={row.id}>{row.company_name}</option>
                ))}
              </select>
              {customers.status === 'error' && <span className="field-error">{customers.error}</span>}
              {projectId && customer && (
                <span className="form-hint">Customer selected from the associated project; you can change it if needed.</span>
              )}
            </label>
            <label className="field field-full">
              <span>Contract (optional)</span>
              <select
                value={contractId}
                disabled={!projectId || projectContracts.status !== 'ready'}
                onChange={(e) => setContractId(e.target.value)}
              >
                <option value="">
                  {!projectId
                    ? 'Select a project first'
                    : projectContracts.status === 'loading'
                      ? 'Loading contracts…'
                      : contractOptions.length
                        ? 'No contract linked'
                        : 'No active contract linked'}
                </option>
                {contractOptions.map((contract) => (
                  <option key={contract.id} value={contract.id}>{contract.contract_number}</option>
                ))}
              </select>
              {projectId && projectContracts.status === 'error' && (
                <span className="field-error">{projectContracts.error}</span>
              )}
              {projectId && projectContracts.status === 'ready' && contractOptions.length === 0 && (
                <span className="form-hint">
                  No contract linked to this project is active on the quotation date. Link a contract to the project or update the quotation date.
                </span>
              )}
            </label>
            <label className="field field-full">
              <span>Address</span>
              <input value={address} onChange={(e) => setAddress(e.target.value)} />
            </label>
            <label className="field">
              <span>Header logo</span>
              <select value={logo} onChange={(event) => setLogo(event.target.value as LogoChoice)} disabled={saving}>
                <option value="gbi">GBI Group</option>
                <option value="sdlg">SDLG</option>
                <option value="none">No logo</option>
              </select>
            </label>
            <label className="field">
              <span>Currency</span>
              <input value={currency} readOnly />
            </label>
            <label className="field">
              <span>Mobilization fee (ZMW / unit)</span>
              <input inputMode="decimal" value={mobilizationFee} onChange={(e) => setMobilizationFee(e.target.value)} />
            </label>
          </div>

          <ModalSection
            title="Project machines"
            count={items.length}
            action={
              <button
                className="mini-add"
                onClick={() => setItems((current) => [...current, emptyItem()])}
                disabled={!projectId || machines.status !== 'ready' || !machines.data?.length}
              >
                <Plus size={13} /> Add machine
              </button>
            }
          >
            <p className="form-hint">Select from machines assigned to this project. Model and specification are filled from the machine record.</p>
            {projectId && machines.status === 'error' && <p className="field-error">{machines.error}</p>}
            {projectId && machines.status === 'loading' && <p className="form-hint">Loading project machines…</p>}
            {projectId && machines.status === 'ready' && machines.data?.length === 0 && (
              <p className="form-hint">
                No machines are currently assigned to this project. Assign a machine in Fleet, then reopen the quotation.
              </p>
            )}
            {items.map((item, index) => {
              const machine = (machines.data ?? []).find((row) => row.id === item.machineId)
              const labels = machine ? machineLabels(machine) : null
              return (
                <div className="doc-line-card" key={index}>
                  <div className="doc-line-card-head">
                    <span className="doc-line-badge">Machine {index + 1}</span>
                    {items.length > 1 && (
                      <button
                        className="doc-line-remove"
                        onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                        aria-label="Remove machine"
                      >
                        <Trash2 size={14} /> Remove
                      </button>
                    )}
                  </div>
                  <div className="form-grid">
                    <label className="field field-full">
                      <span>Machine</span>
                      <select
                        value={item.machineId}
                        disabled={!projectId || machines.status !== 'ready'}
                        onChange={(e) => patchItem(index, 'machineId', e.target.value)}
                      >
                        <option value="">
                          {!projectId
                            ? 'Select a project first'
                            : machines.status === 'loading'
                              ? 'Loading machines…'
                              : machines.data?.length
                                ? 'Select machine'
                                : 'No machines assigned'}
                        </option>
                        {(machines.data ?? [])
                          .filter((row) => row.id === item.machineId || !selectedMachineIds.includes(row.id))
                          .map((row) => (
                            <option key={row.id} value={row.id}>{row.name} · {row.machine_number} · {row.machine_type}</option>
                          ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Model</span>
                      <input value={labels?.model ?? ''} readOnly />
                    </label>
                    <label className="field">
                      <span>Specification</span>
                      <input value={labels?.specification ?? ''} readOnly />
                    </label>
                    <label className="field">
                      <span>Rental / month</span>
                      <input inputMode="decimal" value={item.rental} onChange={(e) => patchItem(index, 'rental', e.target.value)} />
                    </label>
                    <label className="field">
                      <span>Hours</span>
                      <input inputMode="decimal" placeholder="Calculate monthly" value={item.hours} onChange={(e) => patchItem(index, 'hours', e.target.value)} />
                    </label>
                    <label className="field">
                      <span>Total price</span>
                      <input inputMode="decimal" placeholder="Calculate monthly" value={item.total} onChange={(e) => patchItem(index, 'total', e.target.value)} />
                    </label>
                  </div>
                </div>
              )
            })}
          </ModalSection>
        </>
      )}
    </Modal>
  )
}
