'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Download, Plus, Trash2 } from 'lucide-react'
import { Modal, ModalSection } from '@/components/shared'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { shortDate } from '@/lib/gbi/format'
import { downloadContractDoc, type ContractLineItem, type LogoChoice } from '@/lib/gbi/contract-doc'

type ProjectOption = {
  id: string
  name: string
  customer_id: string | null
  deployment_start: string | null
  deployment_end: string | null
  customer: { company_name: string } | null
}

type MachineOption = {
  id: string
  machine_number: string
  machine_type: string
  manufacturer: string | null
  model: string | null
}

type EquipmentItem = ContractLineItem & { machine_id: string; machine_number: string }

function emptyTransport(): ContractLineItem {
  return { description: '', model: '', qty: '1', amount: '', period: '', delivery: 'ONE WAY' }
}

function projectPeriodMonths(start: string | null, end: string | null): string {
  if (!start || !end || end < start) return ''
  const [startYear, startMonth, startDay] = start.split('-').map(Number)
  const [endYear, endMonth, endDay] = end.split('-').map(Number)
  const monthDifference = (endYear - startYear) * 12 + endMonth - startMonth
  const anniversary = (monthsAfterStart: number) => {
    const monthIndex = startYear * 12 + startMonth - 1 + monthsAfterStart
    const year = Math.floor(monthIndex / 12)
    const month = monthIndex % 12
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    return Date.UTC(year, month, Math.min(startDay, lastDay))
  }
  const endDate = Date.UTC(endYear, endMonth - 1, endDay)
  const completedMonths = endDate < anniversary(monthDifference) ? monthDifference - 1 : monthDifference
  const hasPartialMonth = endDate !== anniversary(completedMonths)
  return String(Math.max(1, completedMonths + Number(hasPartialMonth)))
}

export function ContractDocModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = useSupabase()
  const [contractNumber, setContractNumber] = useState('')
  const [projectId, setProjectId] = useState('')
  const [date, setDate] = useState('')
  const [logo, setLogo] = useState<LogoChoice>('gbi')
  const [equipment, setEquipment] = useState<EquipmentItem[]>([])
  const [transport, setTransport] = useState<ContractLineItem[]>([emptyTransport()])
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [savedContractId, setSavedContractId] = useState<string | null>(null)

  const projects = useQuery<ProjectOption[]>(
    () =>
      !open
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('project')
            .select('id,name,customer_id,deployment_start,deployment_end,customer:customer_id(company_name)')
            .order('name') as unknown as PromiseLike<{ data: ProjectOption[] | null; error: unknown }>),
    [open],
  )

  const machines = useQuery<MachineOption[]>(
    () =>
      !open || !projectId
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('machine')
            .select('id,machine_number,machine_type,manufacturer,model')
            .eq('current_project_id', projectId)
            .is('deleted_at', null)
            .order('machine_number') as unknown as PromiseLike<{ data: MachineOption[] | null; error: unknown }>),
    [open, projectId],
  )

  const selectedProject = (projects.data ?? []).find((project) => project.id === projectId) ?? null
  const period = projectPeriodMonths(selectedProject?.deployment_start ?? null, selectedProject?.deployment_end ?? null)
  const locked = busy || savedContractId !== null

  useEffect(() => {
    if (!open) return
    setContractNumber('')
    setProjectId('')
    setDate(new Date().toISOString().slice(0, 10))
    setLogo('gbi')
    setEquipment([])
    setTransport([emptyTransport()])
    setBusy(false)
    setFormError('')
    setSavedContractId(null)
  }, [open])

  useEffect(() => {
    if (!open || !projectId || machines.status !== 'ready') {
      setEquipment([])
      return
    }
    setEquipment(
      (machines.data ?? []).map((machine) => ({
        machine_id: machine.id,
        machine_number: machine.machine_number,
        description: machine.machine_type,
        model: machine.model ?? machine.manufacturer ?? '',
        qty: '1',
        amount: '',
        period,
        delivery: '',
      })),
    )
  }, [open, projectId, machines.status, machines.data, period])

  function patchEquip(index: number, key: 'description' | 'model' | 'amount', value: string) {
    setEquipment((rows) => rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
  }

  function patchTransport(index: number, key: keyof ContractLineItem, value: string) {
    setTransport((rows) => rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
  }

  async function generate() {
    if (busy) return
    if (!savedContractId) {
      if (!contractNumber.trim()) return setFormError('Contract number is required.')
      if (!selectedProject) return setFormError('Select a project.')
      if (!selectedProject.customer_id || !selectedProject.customer?.company_name)
        return setFormError('Link a customer to this project before generating its contract.')
      if (!selectedProject.deployment_start || !selectedProject.deployment_end || !period)
        return setFormError('Set valid project deployment start and end dates before generating its contract.')
      if (machines.status !== 'ready') return setFormError('Wait for the project machines to finish loading.')
      if (equipment.length === 0) return setFormError('The selected project has no currently assigned machines.')
      if (equipment.some((item) => !item.description.trim() || !item.model.trim()))
        return setFormError('Enter a description and model for each project machine.')
      if (!date) return setFormError('Document date is required.')
    }

    setBusy(true)
    setFormError('')
    let contractWasSaved = savedContractId !== null
    try {
      if (!savedContractId) {
        const { data, error } = await supabase.rpc('create_project_contract_document', {
          p_contract_number: contractNumber.trim(),
          p_project_id: projectId,
          p_document_date: date,
          p_logo_choice: logo,
          p_equipment: equipment.map(({ machine_id, ...item }) => ({ ...item, machine_id })),
          p_transport: transport,
        })
        if (error) {
          const code = (error as { code?: string }).code
          setFormError(
            code === '23505'
              ? 'A contract with this number already exists. Use a different contract number.'
              : (error as { message?: string }).message ?? 'Could not save the contract. Please try again.',
          )
          return
        }
        if (!data) {
          setFormError('The contract was not saved because the database did not return its record ID.')
          return
        }
        setSavedContractId(data)
        contractWasSaved = true
        onSaved()
      }

      await downloadContractDoc({
        contractNumber,
        lessee: selectedProject?.customer?.company_name ?? '',
        date,
        equipment,
        transport,
        logo,
      })
      onClose()
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown document-generation error.'
      setFormError(
        contractWasSaved
          ? `The contract is saved, but the document could not be downloaded: ${detail}`
          : `Could not generate the contract document: ${detail}`,
      )
    } finally {
      setBusy(false)
    }
  }

  const canGenerate =
    !busy &&
    (savedContractId !== null ||
      (Boolean(contractNumber.trim()) &&
        Boolean(selectedProject?.customer_id) &&
        Boolean(selectedProject?.deployment_start) &&
        Boolean(selectedProject?.deployment_end) &&
        machines.status === 'ready' &&
        equipment.length > 0 &&
        equipment.every((item) => item.description.trim() && item.model.trim()) &&
        Boolean(date)))

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      eyebrow="Commercial"
      title="New Contract"
      subtitle="Choose a project to load its assigned machines and contract period, then save and download the document."
      footer={
        <div className="modal-foot-actions" style={{ marginLeft: 'auto' }}>
          <button className="button button-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="button button-primary" onClick={generate} disabled={!canGenerate}>
            <Download size={14} />
            {busy ? 'Generating…' : savedContractId ? 'Retry download' : 'Save & download'}
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
        <label className="field">
          <span>Contract No.</span>
          <input
            value={contractNumber}
            onChange={(event) => setContractNumber(event.target.value)}
            placeholder="e.g. GBI-2026-014"
            disabled={locked}
          />
        </label>
        <label className="field">
          <span>Document date</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={locked} />
        </label>
        <label className="field field-full">
          <span>Project</span>
          <select
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value)
              setFormError('')
            }}
            disabled={locked || projects.status !== 'ready'}
          >
            <option value="">Select a project</option>
            {(projects.data ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}{project.customer?.company_name ? ` · ${project.customer.company_name}` : ''}
              </option>
            ))}
          </select>
          {projects.status === 'error' && <span className="field-error">Could not load projects. Close and try again.</span>}
        </label>
        <label className="field field-full">
          <span>Lessee</span>
          <input value={selectedProject?.customer?.company_name ?? ''} readOnly placeholder="Select a customer-linked project" />
        </label>
        {selectedProject && (
          <div className="field-hint field-full">
            Project period: {selectedProject.deployment_start ? shortDate(selectedProject.deployment_start) : 'start date not set'} →{' '}
            {selectedProject.deployment_end ? shortDate(selectedProject.deployment_end) : 'end date not set'}
            {period ? ` · ${period} month${period === '1' ? '' : 's'}` : ''}
          </div>
        )}
        <label className="field field-full">
          <span>Header logo</span>
          <select value={logo} onChange={(event) => setLogo(event.target.value as LogoChoice)} disabled={locked}>
            <option value="gbi">GBI Group</option>
            <option value="sdlg">SDLG</option>
            <option value="none">No logo</option>
          </select>
        </label>
      </div>

      <ModalSection title="Equipment & price (USD / month)" count={equipment.length}>
        <p className="form-hint">
          Each current project machine creates one item. Quantity is one and period is calculated from the project dates;
          description, model and rate can be reviewed before saving.
        </p>
        {machines.status === 'loading' && projectId && <p className="form-hint">Loading assigned machines…</p>}
        {machines.status === 'error' && projectId && (
          <p className="field-error">Could not load machines assigned to this project.</p>
        )}
        {machines.status === 'ready' && projectId && equipment.length === 0 && (
          <p className="form-hint">No active machines are currently assigned to this project.</p>
        )}
        {equipment.map((row, index) => (
          <div className="doc-line-card" key={row.machine_id}>
            <div className="doc-line-card-head">
              <span className="doc-line-badge">
                Item {index + 1} · {row.machine_number}
              </span>
            </div>
            <div className="form-grid">
              <label className="field field-full">
                <span>Description 货品</span>
                <input
                  value={row.description}
                  onChange={(event) => patchEquip(index, 'description', event.target.value)}
                  disabled={locked}
                />
              </label>
              <label className="field">
                <span>Model 型号</span>
                <input
                  value={row.model}
                  onChange={(event) => patchEquip(index, 'model', event.target.value)}
                  disabled={locked}
                />
              </label>
              <label className="field">
                <span>Quantity 数量</span>
                <input value={row.qty} readOnly />
              </label>
              <label className="field">
                <span>Rate: USD / month (excl. VAT)</span>
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={row.amount}
                  onChange={(event) => patchEquip(index, 'amount', event.target.value)}
                  disabled={locked}
                />
              </label>
              <label className="field">
                <span>Period (months)</span>
                <input value={row.period} readOnly />
              </label>
            </div>
          </div>
        ))}
      </ModalSection>

      <ModalSection
        title="Transportation (ZMW)"
        count={transport.length}
        action={
          <button
            className="mini-add"
            onClick={() => setTransport((rows) => [...rows, emptyTransport()])}
            disabled={locked}
          >
            <Plus size={13} /> Add line
          </button>
        }
      >
        {transport.map((row, index) => (
          <div className="doc-line-card" key={index}>
            <div className="doc-line-card-head">
              <span className="doc-line-badge">Item {index + 1}</span>
              {transport.length > 1 && (
                <button
                  className="doc-line-remove"
                  onClick={() => setTransport((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}
                  disabled={locked}
                  aria-label="Remove item"
                >
                  <Trash2 size={14} /> Remove
                </button>
              )}
            </div>
            <div className="form-grid">
              <label className="field field-full">
                <span>Description</span>
                <input
                  placeholder="e.g. Low-bed transport 平板运输"
                  value={row.description}
                  onChange={(event) => patchTransport(index, 'description', event.target.value)}
                  disabled={locked}
                />
              </label>
              <label className="field">
                <span>Model</span>
                <input
                  placeholder="Optional"
                  value={row.model}
                  onChange={(event) => patchTransport(index, 'model', event.target.value)}
                  disabled={locked}
                />
              </label>
              <label className="field">
                <span>Quantity</span>
                <input
                  inputMode="numeric"
                  placeholder="1"
                  value={row.qty}
                  onChange={(event) => patchTransport(index, 'qty', event.target.value)}
                  disabled={locked}
                />
              </label>
              <label className="field">
                <span>Amount: ZMW (excl. VAT)</span>
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={row.amount}
                  onChange={(event) => patchTransport(index, 'amount', event.target.value)}
                  disabled={locked}
                />
              </label>
              <label className="field">
                <span>Delivery</span>
                <input
                  placeholder="ONE WAY"
                  value={row.delivery}
                  onChange={(event) => patchTransport(index, 'delivery', event.target.value)}
                  disabled={locked}
                />
              </label>
            </div>
          </div>
        ))}
      </ModalSection>
    </Modal>
  )
}
