'use client'

import { useEffect, useState } from 'react'
import { Download, Plus, Trash2 } from 'lucide-react'
import { Modal, ModalSection } from '@/components/shared'
import type { LogoChoice } from '@/lib/gbi/contract-doc'
import { downloadQuotationDoc, type QuotationDocData, type QuotationLineItem } from '@/lib/gbi/quotation-doc'

type CustomerOption = { id: string; company_name: string }

export type QuotationDefaults = Partial<Omit<QuotationDocData, 'logo'>>

function emptyItem(): QuotationLineItem {
  return { model: '', specification: '', rental: '', qty: '1', hours: '', total: '' }
}

export function QuotationDocModal({
  open,
  customers,
  defaults,
  onClose,
}: {
  open: boolean
  customers: CustomerOption[]
  defaults?: QuotationDefaults
  onClose: () => void
}) {
  const [form, setForm] = useState<QuotationDocData>(() => blank())
  const [busy, setBusy] = useState(false)

  function blank(): QuotationDocData {
    return {
      quotationNumber: '',
      lessee: '',
      address: 'ZAMBIA',
      date: new Date().toISOString().slice(0, 10),
      currency: 'USD',
      mobilizationFee: '10000',
      items: [emptyItem()],
      logo: 'gbi',
    }
  }

  useEffect(() => {
    if (open) {
      const base = blank()
      setForm({
        ...base,
        ...defaults,
        items: defaults?.items && defaults.items.length > 0 ? defaults.items : base.items,
        logo: 'gbi',
      })
    }
  }, [open, defaults])

  function set<K extends keyof QuotationDocData>(key: K, value: QuotationDocData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }
  function patchItem(index: number, key: keyof QuotationLineItem, value: string) {
    setForm((f) => ({ ...f, items: f.items.map((r, i) => (i === index ? { ...r, [key]: value } : r)) }))
  }

  async function generate() {
    setBusy(true)
    try {
      await downloadQuotationDoc(form)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      eyebrow="Commercial"
      title="Hiring quotation"
      subtitle="Fill the details, then download the bilingual quotation as a Word document."
      footer={
        <div className="modal-foot-actions" style={{ marginLeft: 'auto' }}>
          <button className="button button-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="button button-primary" onClick={generate} disabled={busy}>
            <Download size={14} />
            {busy ? 'Generating...' : 'Generate & download'}
          </button>
        </div>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span>Quotation No. 报价单编号</span>
          <input value={form.quotationNumber} onChange={(e) => set('quotationNumber', e.target.value)} placeholder="e.g. 20260730RQ" />
        </label>
        <label className="field">
          <span>Date 报价单日期</span>
          <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </label>
        <label className="field field-full">
          <span>Leasee 承租方</span>
          <input
            value={form.lessee}
            onChange={(e) => set('lessee', e.target.value)}
            placeholder="Company the equipment is hired to"
            list="quotation-doc-customers"
          />
          <datalist id="quotation-doc-customers">
            {customers.map((c) => (
              <option key={c.id} value={c.company_name} />
            ))}
          </datalist>
        </label>
        <label className="field field-full">
          <span>Address 地址</span>
          <input value={form.address} onChange={(e) => set('address', e.target.value)} />
        </label>
        <label className="field">
          <span>Currency</span>
          <select value={form.currency} onChange={(e) => set('currency', e.target.value)}>
            <option value="USD">USD ($)</option>
            <option value="ZMW">ZMW (K)</option>
          </select>
        </label>
        <label className="field">
          <span>Mobilization fee (ZMW / unit)</span>
          <input inputMode="decimal" value={form.mobilizationFee} onChange={(e) => set('mobilizationFee', e.target.value)} />
        </label>
        <label className="field field-full">
          <span>Header logo</span>
          <select value={form.logo} onChange={(e) => set('logo', e.target.value as LogoChoice)}>
            <option value="gbi">GBI Group</option>
            <option value="sdlg">SDLG</option>
            <option value="none">No logo</option>
          </select>
        </label>
      </div>

      <ModalSection
        title="Equipment"
        count={form.items.length}
        action={
          <button className="mini-add" onClick={() => set('items', [...form.items, emptyItem()])}>
            <Plus size={13} /> Add line
          </button>
        }
      >
        <p className="form-hint">Leave Hours or Total blank to print &quot;Calculate monthly&quot; as in the standard quotation.</p>
        {form.items.map((row, i) => (
          <div className="doc-line-card" key={i}>
            <div className="doc-line-card-head">
              <span className="doc-line-badge">Item {i + 1}</span>
              {form.items.length > 1 && (
                <button
                  className="doc-line-remove"
                  onClick={() => set('items', form.items.filter((_, x) => x !== i))}
                  aria-label="Remove item"
                >
                  <Trash2 size={14} /> Remove
                </button>
              )}
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Model 型号</span>
                <input placeholder="e.g. Excavator" value={row.model} onChange={(e) => patchItem(i, 'model', e.target.value)} />
              </label>
              <label className="field">
                <span>Specification 规格</span>
                <input placeholder="e.g. SDLG E6360F" value={row.specification} onChange={(e) => patchItem(i, 'specification', e.target.value)} />
              </label>
              <label className="field">
                <span>Rental / month 租赁单价</span>
                <input inputMode="decimal" placeholder="0.00" value={row.rental} onChange={(e) => patchItem(i, 'rental', e.target.value)} />
              </label>
              <label className="field">
                <span>Qty 数量</span>
                <input inputMode="numeric" placeholder="1" value={row.qty} onChange={(e) => patchItem(i, 'qty', e.target.value)} />
              </label>
              <label className="field">
                <span>Hours 工作时长</span>
                <input inputMode="decimal" placeholder="Calculate monthly" value={row.hours} onChange={(e) => patchItem(i, 'hours', e.target.value)} />
              </label>
              <label className="field">
                <span>Total price 总价</span>
                <input inputMode="decimal" placeholder="Calculate monthly" value={row.total} onChange={(e) => patchItem(i, 'total', e.target.value)} />
              </label>
            </div>
          </div>
        ))}
      </ModalSection>
    </Modal>
  )
}
