'use client'

import { useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import type { UserRole } from '@/lib/gbi/roles'
import { PageHeading } from '@/components/shared'

const BUCKET = 'Documents'

type Template = {
  step: number
  file: string
  title: string
  chinese: string
  description: string
}

const TEMPLATES: Template[] = [
  { step: 1, file: 'Entry.doc', title: 'Entry Confirmation', chinese: '设备入场确认单', description: 'Confirms equipment delivery, records starting meter/hours, and verifies good working condition. Marks the start of the rental.' },
  { step: 2, file: 'Checkpoint.doc', title: 'Checkpoint Confirmation', chinese: '设备关键时间节点确认单', description: 'Records equipment usage and condition at interim checkpoints during the rental period. Used for monitoring and billing.' },
  { step: 3, file: 'Exit.doc', title: 'Exit Confirmation', chinese: '设备离场确认单', description: 'Confirms equipment return, records final meter/hours and total usage. Marks the end of the rental.' },
]

export function EquipmentLifecycleView({ role: _role, userId: _userId }: { role: UserRole; userId: string }) {
  const supabase = useSupabase()
  const [busy, setBusy] = useState<string>('')
  const [error, setError] = useState<string>('')

  async function download(file: string) {
    setError('')
    setBusy(file)
    try {
      const { data, error: dlError } = await supabase.storage.from(BUCKET).download(file)
      if (dlError || !data) {
        // Fall back to the public URL for a public bucket.
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(file)
        if (!pub?.publicUrl) throw new Error(dlError?.message ?? 'file not found in the Documents bucket.')
        const res = await fetch(pub.publicUrl)
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        triggerDownload(await res.blob(), file)
        return
      }
      triggerDownload(data, file)
    } catch (err) {
      setError(`Could not fetch ${file}: ${err instanceof Error ? err.message : 'unknown error.'}`)
    } finally {
      setBusy('')
    }
  }

  function triggerDownload(blob: Blob, file: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = file
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page-wrap">
      <PageHeading
        title="Equipment Lifecycle"
        description="Download the standard confirmation forms used across the hire lifecycle: Entry → Checkpoint(s) → Exit."
      />
      <p className="lifecycle-flow-note">
        Together these three forms create a complete audit trail for billing, maintenance, and dispute resolution
        between the lessor (Golden Baobab Investments Ltd) and the lessee.
      </p>
      {error && <div className="form-message form-message-error">{error}</div>}
      <section className="lifecycle-template-grid">
        {TEMPLATES.map((template) => (
          <article className="lifecycle-template-card" key={template.file}>
            <div className="lifecycle-template-head">
              <span className="lifecycle-template-step">
                Step {template.step}
              </span>
            </div>
            <h3 className="lifecycle-template-title">{template.title}</h3>
            <p className="lifecycle-template-chinese">{template.chinese}</p>
            <p className="lifecycle-template-desc">{template.description}</p>
            <button
              className="button button-primary lifecycle-template-button"
              onClick={() => download(template.file)}
              disabled={busy === template.file}
            >
              {busy === template.file ? <FileText size={15} /> : <Download size={15} />}
              {busy === template.file ? 'Preparing…' : 'Download template'}
            </button>
          </article>
        ))}
      </section>
    </div>
  )
}
