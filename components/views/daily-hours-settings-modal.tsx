'use client'

import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { Modal } from '@/components/shared'

// Modal for administrators / operations managers to define the company-wide
// normal working hours. Any daily total above this value is treated as
// abnormal and flagged for review.
export function DailyHoursSettingsModal({
  open,
  onClose,
  currentHours,
  userId,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  currentHours: number
  userId: string
  onSaved: () => void
}) {
  const supabase = useSupabase()
  const [value, setValue] = useState(String(currentHours))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed the field whenever the modal is opened with a fresh current value.
  useEffect(() => {
    if (open) {
      setValue(String(currentHours))
      setError(null)
    }
  }, [open, currentHours])

  async function save() {
    const hours = Number(value)
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      setError('Enter a normal working-hours value between 0 and 24.')
      return
    }
    setSaving(true)
    setError(null)
    const { error: updateError } = await supabase
      .from('operating_hours_setting')
      .update({ normal_working_hours: hours, updated_by: userId, updated_at: new Date().toISOString() })
      .eq('id', true)
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    onSaved()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="Operations rule"
      title="Normal working hours"
      subtitle="Daily totals above this value are flagged as abnormal and need review."
    >
      <div className="form-grid">
        <div className="field field-wide">
          <span>Normal working hours per day</span>
          <input
            type="number"
            min="0"
            max="24"
            step="0.5"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Normal working hours per day"
          />
          <small className="field-hint">Default is 8 hours. Applies to every machine across all projects.</small>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="modal-footer">
        <button className="button button-secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button className="button button-primary" onClick={save} disabled={saving}>
          <Save size={14} />
          {saving ? 'Saving…' : 'Save rule'}
        </button>
      </div>
    </Modal>
  )
}
