'use client'

import { useEffect, useState } from 'react'
import { Download, Plus, Trash2 } from 'lucide-react'
import { Modal, ModalSection } from '@/components/shared'
import { downloadContractDoc, type ContractLineItem } from '@/lib/gbi/contract-doc'

type CustomerOption = { id: string; company_name: string }

function emptyEquip(): ContractLineItem {
  return { description: '', model: '', qty: '1', amount: '', period: '2', delivery: '' }
}
function emptyTransport(): ContractLineItem {
  return { description: '', model: '', qty: '1', amount: '', period: '', delivery: 'ONE WAY' }
}

export function ContractDocModal({
  open,
  customers,
  defaultContractNumber,
  defaultLessee,
  onClose,
}: {
  open: boolean
  customers: CustomerOption[]
  defaultContractNumber?: string
  defaultLessee?: string
  onClose: () => void
}) {
  const [contractNumber, setContractNumber] = useState('')
  const [lessee, setLessee] = useState('')
  const [date, setDate] = useState('')
  const [equipment, setEquipment] = useState<ContractLineItem[]>([emptyEquip()])
  const [transport, setTransport] = useState<ContractLineItem[]>([emptyTransport()])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setContractNumber(defaultContractNumber ?? '')
      setLessee(defaultLessee ?? '')
      setDate(new Date().toISOString().slice(0, 10))
      setEquipment([emptyEquip()])
      setTransport([emptyTransport()])
    }
  }, [open, defaultContractNumber, defaultLessee])

  function patchEquip(index: number, key: keyof ContractLineItem, value: string) {
    setEquipment((rows) => rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)))
  }
  function patchTransport(index: number, key: keyof ContractLineItem, value: string) {
    setTransport((rows) => rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)))
  }

  async function generate() {
    setBusy(true)
    try {
      await downloadContractDoc({ contractNumber, lessee, date, equipment, transport })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="Commercial"
      title="Generate hire contract"
      subtitle="Fill the details, then download a ready-to-sign Word document."
      footer={
        <div className="modal-foot-actions" style={{ marginLeft: 'auto' }}>
          <button className="button button-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="button button-primary" onClick={generate} disabled={busy}>
            <Download size={14} />
            {busy ? 'Generating…' : 'Generate & download'}
          </button>
        </div>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span>Contract No.</span>
          <input value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} placeholder="e.g. GBI-2026-014" />
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field field-full">
          <span>Lessee (TO / 承租方)</span>
          <input
            value={lessee}
            onChange={(e) => setLessee(e.target.value)}
            placeholder="Company or person the equipment is hired to"
            list="contract-doc-customers"
          />
          <datalist id="contract-doc-customers">
            {customers.map((c) => (
              <option key={c.id} value={c.company_name} />
            ))}
          </datalist>
        </label>
      </div>

      <ModalSection
        title="Equipment & price (USD / month)"
        count={equipment.length}
        action={
          <button className="mini-add" onClick={() => setEquipment((r) => [...r, emptyEquip()])}>
            <Plus size={13} /> Add line
          </button>
        }
      >
        <p className="form-hint">16% VAT and the VAT-inclusive totals are calculated automatically in the document.</p>
        {equipment.map((row, i) => (
          <div className="doc-line-card" key={i}>
            <div className="doc-line-card-head">
              <span className="doc-line-badge">Item {i + 1}</span>
              {equipment.length > 1 && (
                <button className="doc-line-remove" onClick={() => setEquipment((r) => r.filter((_, x) => x !== i))} aria-label="Remove item">
                  <Trash2 size={14} /> Remove
                </button>
              )}
            </div>
            <div className="form-grid">
              <label className="field field-full">
                <span>Description 货品</span>
                <input placeholder="e.g. Excavator 挖掘机" value={row.description} onChange={(e) => patchEquip(i, 'description', e.target.value)} />
              </label>
              <label className="field">
                <span>Model 型号</span>
                <input placeholder="e.g. CAT 320D" value={row.model} onChange={(e) => patchEquip(i, 'model', e.target.value)} />
              </label>
              <label className="field">
                <span>Quantity 数量</span>
                <input inputMode="numeric" placeholder="1" value={row.qty} onChange={(e) => patchEquip(i, 'qty', e.target.value)} />
              </label>
              <label className="field">
                <span>Rate — USD / month (excl. VAT)</span>
                <input inputMode="decimal" placeholder="0.00" value={row.amount} onChange={(e) => patchEquip(i, 'amount', e.target.value)} />
              </label>
              <label className="field">
                <span>Period (months)</span>
                <input inputMode="numeric" placeholder="2" value={row.period} onChange={(e) => patchEquip(i, 'period', e.target.value)} />
              </label>
            </div>
          </div>
        ))}
      </ModalSection>

      <ModalSection
        title="Transportation (ZMW)"
        count={transport.length}
        action={
          <button className="mini-add" onClick={() => setTransport((r) => [...r, emptyTransport()])}>
            <Plus size={13} /> Add line
          </button>
        }
      >
        {transport.map((row, i) => (
          <div className="doc-line-card" key={i}>
            <div className="doc-line-card-head">
              <span className="doc-line-badge">Item {i + 1}</span>
              {transport.length > 1 && (
                <button className="doc-line-remove" onClick={() => setTransport((r) => r.filter((_, x) => x !== i))} aria-label="Remove item">
                  <Trash2 size={14} /> Remove
                </button>
              )}
            </div>
            <div className="form-grid">
              <label className="field field-full">
                <span>Description</span>
                <input placeholder="e.g. Low-bed transport 平板运输" value={row.description} onChange={(e) => patchTransport(i, 'description', e.target.value)} />
              </label>
              <label className="field">
                <span>Model</span>
                <input placeholder="Optional" value={row.model} onChange={(e) => patchTransport(i, 'model', e.target.value)} />
              </label>
              <label className="field">
                <span>Quantity</span>
                <input inputMode="numeric" placeholder="1" value={row.qty} onChange={(e) => patchTransport(i, 'qty', e.target.value)} />
              </label>
              <label className="field">
                <span>Amount — ZMW (excl. VAT)</span>
                <input inputMode="decimal" placeholder="0.00" value={row.amount} onChange={(e) => patchTransport(i, 'amount', e.target.value)} />
              </label>
              <label className="field">
                <span>Delivery</span>
                <input placeholder="ONE WAY" value={row.delivery} onChange={(e) => patchTransport(i, 'delivery', e.target.value)} />
              </label>
            </div>
          </div>
        ))}
      </ModalSection>
    </Modal>
  )
}
