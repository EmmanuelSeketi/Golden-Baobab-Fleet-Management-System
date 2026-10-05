'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CalendarDays, CheckCircle2, Download, FileSpreadsheet, Settings2 } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { dateTime, money, shortDate, titleCase } from '@/lib/gbi/format'
import { buildMatrix, exportCsv, exportXlsx, type ExportColumn } from '@/lib/gbi/export'
import { canManageOvertimeRules, canReviewOvertime, type UserRole } from '@/lib/gbi/roles'
import { deriveOvertime, pickOvertimeRule, type OvertimeRule, type OvertimeSourceEntry } from '@/lib/gbi/overtime'
import { DetailGrid, LoadingSpinner, Modal, ModalSection, PageHeading, StatusBadge, ViewState } from '@/components/shared'

// A single overtime line as shown on the page. It is derived live from a daily
// hour entry : no manual "generate" step and no dependency on rows existing in
// overtime_entry. A persisted overtime_entry only supplies the reviewed status
// (and, once recorded, its snapshotted figures).
type OtRow = {
  key: string // the source daily_hour_entry id (stable list key)
  persistedId: string | null // overtime_entry id, when the line has been recorded
  operatorId: string | null
  operatorName: string
  machineNumber: string
  entryDate: string
  ruleId: string | null
  ruleName: string | null
  weekdayMultiplier: number
  standardHours: number
  overtimeHours: number
  overtimePay: number
  reviewed: boolean
  reviewedAt: string | null
  hasRealRule: boolean
}

const FILTERS = ['all', 'pending', 'reviewed'] as const

const RULE_SELECT =
  'id,name,effective_from,effective_to,standard_hours_per_day,weekday_rate_multiplier,saturday_rate_multiplier,sunday_rate_multiplier,public_holiday_rate_multiplier,operator_category,base_hourly_rate'

// Source daily entries (the single source of truth for overtime hours).
const ENTRY_SELECT =
  'id,entry_date,operator_id,total_hours,operator:operator_id(full_name),machine:machine_id(machine_number)'

type EntryRow = {
  id: string
  entry_date: string
  operator_id: string | null
  total_hours: number
  operator: { full_name: string } | null
  machine: { machine_number: string } | null
}

type PersistedRow = {
  id: string
  daily_hour_entry_id: string
  reviewed: boolean
  reviewed_at: string | null
  standard_hours: number | null
  overtime_hours: number | null
  overtime_pay: number | null
}

// Local calendar date as YYYY-MM-DD (avoids UTC shifting the day near midnight).
function isoDate(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

const EXPORT_COLUMNS: ExportColumn<OtRow>[] = [
  { header: 'Entry date', value: (r) => r.entryDate },
  { header: 'Operator', value: (r) => r.operatorName },
  { header: 'Machine', value: (r) => r.machineNumber },
  { header: 'Overtime rule', value: (r) => r.ruleName ?? 'Default (no rule configured)' },
  { header: 'Standard hours', value: (r) => r.standardHours },
  { header: 'Overtime hours', value: (r) => r.overtimeHours },
  { header: 'Overtime pay', value: (r) => r.overtimePay },
  { header: 'Status', value: (r) => (r.reviewed ? 'Reviewed' : 'Pending') },
]

export function OvertimeView({ role, userId }: { role: UserRole; userId: string }) {
  const supabase = useSupabase()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all')
  // Single-day filter, defaulting to today. Empty string means "All days".
  const [date, setDate] = useState<string>(isoDate(new Date()))
  const [selected, setSelected] = useState<OtRow | null>(null)
  const [managingRules, setManagingRules] = useState(false)

  const canReview = canReviewOvertime(role)
  const canRules = canManageOvertimeRules(role)

  // Source data: daily entries + effective rules + any recorded review status.
  const entries = useQuery<EntryRow[]>(
    () =>
      supabase
        .from('daily_hour_entry')
        .select(ENTRY_SELECT)
        .not('operator_id', 'is', null)
        .order('entry_date', { ascending: false }) as unknown as PromiseLike<{
        data: EntryRow[] | null
        error: unknown
      }>,
    [],
  )
  const rulesQ = useQuery<OvertimeRule[]>(
    () =>
      supabase
        .from('overtime_rule')
        .select(RULE_SELECT)
        .order('effective_from', { ascending: false }) as unknown as PromiseLike<{
        data: OvertimeRule[] | null
        error: unknown
      }>,
    [],
  )
  const persisted = useQuery<PersistedRow[]>(
    () =>
      supabase
        .from('overtime_entry')
        .select('id,daily_hour_entry_id,reviewed,reviewed_at,standard_hours,overtime_hours,overtime_pay') as unknown as PromiseLike<{
        data: PersistedRow[] | null
        error: unknown
      }>,
    [],
  )

  const status = entries.status
  const reload = () => {
    entries.reload()
    persisted.reload()
  }

  // Derive every overtime line live from daily hours. A matching persisted row
  // overlays its reviewed status and recorded figures.
  const allRows = useMemo<OtRow[]>(() => {
    const list = entries.data ?? []
    const rules = rulesQ.data ?? []
    const byEntry = new Map<string, PersistedRow>()
    for (const p of persisted.data ?? []) byEntry.set(p.daily_hour_entry_id, p)

    const out: OtRow[] = []
    for (const e of list) {
      const rule = pickOvertimeRule(rules, e.entry_date)
      const derived = deriveOvertime(e as OvertimeSourceEntry, rule)
      if (!derived) continue
      const p = byEntry.get(e.id) ?? null
      out.push({
        key: e.id,
        persistedId: p?.id ?? null,
        operatorId: e.operator_id,
        operatorName: e.operator?.full_name ?? 'N/A',
        machineNumber: e.machine?.machine_number ?? 'N/A',
        entryDate: e.entry_date,
        ruleId: derived.ruleId,
        ruleName: derived.ruleName,
        weekdayMultiplier: derived.weekdayMultiplier,
        // Prefer recorded figures once a line has been reviewed/snapshotted.
        standardHours: p?.standard_hours != null ? Number(p.standard_hours) : derived.standardHours,
        overtimeHours: p?.overtime_hours != null ? Number(p.overtime_hours) : derived.overtimeHours,
        overtimePay: p?.overtime_pay != null ? Number(p.overtime_pay) : derived.overtimePay,
        reviewed: p?.reviewed ?? false,
        reviewedAt: p?.reviewed_at ?? null,
        hasRealRule: derived.hasRealRule,
      })
    }
    return out
  }, [entries.data, rulesQ.data, persisted.data])

  const rows = useMemo(() => {
    let all = allRows
    if (date) all = all.filter((r) => r.entryDate === date)
    if (filter === 'all') return all
    return all.filter((r) => (filter === 'reviewed' ? r.reviewed : !r.reviewed))
  }, [allRows, filter, date])

  const totalPay = rows.reduce((s, r) => s + r.overtimePay, 0)
  const totalHours = rows.reduce((s, r) => s + r.overtimeHours, 0)
  const noRuleAny = allRows.some((r) => !r.hasRealRule)

  return (
    <div className="page-wrap">
      <PageHeading
        title="Operator Overtime"
        description="Overtime is derived automatically from daily hours worked beyond standard hours, pending management review."
        action={
          canRules ? (
            <div className="modal-foot-actions">
              <button className="button button-secondary" onClick={() => setManagingRules(true)}>
                <Settings2 size={15} />
                Overtime rules
              </button>
            </div>
          ) : undefined
        }
      />

      <OvertimeExportBar date={date} setDate={setDate} rows={rows} ready={status === 'ready'} />

      {noRuleAny && status === 'ready' && (
        <p className="form-info" style={{ marginTop: 12 }}>
          <AlertTriangle size={14} />
          Some overtime is shown using default hours because no overtime rule covers those dates. Add a rule to
          calculate overtime pay{canRules ? ' via “Overtime rules”.' : '.'}
        </p>
      )}

      <div className="hours-summary">
        <div>
          <span>Entries</span>
          <b>{status === 'loading' ? <LoadingSpinner small /> : status === 'ready' ? rows.length : 'N/A'}</b>
        </div>
        <div>
          <span>Overtime hours</span>
          <b>{status === 'loading' ? <LoadingSpinner small /> : status === 'ready' ? `${totalHours.toFixed(1)} h` : 'N/A'}</b>
        </div>
        <div>
          <span>Overtime pay</span>
          <b>{status === 'loading' ? <LoadingSpinner small /> : status === 'ready' ? money(totalPay) : 'N/A'}</b>
        </div>
        <div>
          <span>Pending review</span>
          <b className={rows.some((r) => !r.reviewed) ? 'danger-text' : ''}>
            {status === 'loading' ? <LoadingSpinner small /> : status === 'ready' ? rows.filter((r) => !r.reviewed).length : 'N/A'}
          </b>
        </div>
        <div>
          <span>Filter</span>
          <b style={{ textTransform: 'capitalize' }}>{filter}</b>
        </div>
      </div>

      <div className="filter-row" style={{ marginTop: 14 }}>
        {FILTERS.map((f) => (
          <button key={f} className={`chip ${filter === f ? 'chip-active' : ''}`} onClick={() => setFilter(f)}>
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="panel">
        <ViewState
          status={status}
          error={entries.error}
          isEmpty={rows.length === 0}
          title="overtime"
          emptyText={
            filter === 'all'
              ? date
                ? 'No overtime on this day. Pick another date or choose "All days".'
                : 'No overtime recorded yet. Overtime appears automatically once a daily entry exceeds standard hours.'
              : `No ${filter} overtime entries.`
          }
          onRetry={reload}
        >
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Operator</th>
                  <th>Date</th>
                  <th>Machine</th>
                  <th>Standard</th>
                  <th>Overtime</th>
                  <th>Pay</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="clickable-row" onClick={() => setSelected(r)}>
                    <td>
                      <b>{r.operatorName}</b>
                      <div className="muted-cell">{r.ruleName ?? 'Default rate'}</div>
                    </td>
                    <td>{shortDate(r.entryDate)}</td>
                    <td>{r.machineNumber}</td>
                    <td>{r.standardHours.toFixed(1)} h</td>
                    <td>
                      <b>{r.overtimeHours.toFixed(1)} h</b>
                    </td>
                    <td>{money(r.overtimePay)}</td>
                    <td>
                      <StatusBadge tone={r.reviewed ? 'green' : 'amber'}>
                        {r.reviewed ? 'Reviewed' : 'Pending'}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ViewState>
      </div>

      <OvertimeDetailModal
        entry={selected}
        canReview={canReview}
        userId={userId}
        onClose={() => setSelected(null)}
        onReviewed={() => {
          setSelected(null)
          reload()
        }}
      />

      {canRules && (
        <OvertimeRulesModal open={managingRules} userId={userId} onClose={() => setManagingRules(false)} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail + review
// ---------------------------------------------------------------------------

function OvertimeDetailModal({
  entry,
  canReview,
  userId,
  onClose,
  onReviewed,
}: {
  entry: OtRow | null
  canReview: boolean
  userId: string
  onClose: () => void
  onReviewed: () => void
}) {
  const supabase = useSupabase()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setError('')
  }, [entry?.key])

  if (!entry) return null

  async function review() {
    setBusy(true)
    setError('')
    const now = new Date().toISOString()
    // Update the recorded line if it exists, otherwise record it now (which
    // requires an effective overtime rule for the pay snapshot).
    let upErr: unknown = null
    if (entry!.persistedId) {
      const res = await supabase
        .from('overtime_entry')
        .update({ reviewed: true, reviewed_by: userId, reviewed_at: now })
        .eq('id', entry!.persistedId)
      upErr = res.error
    } else if (entry!.ruleId && entry!.operatorId) {
      const res = await supabase.from('overtime_entry').insert({
        daily_hour_entry_id: entry!.key,
        operator_id: entry!.operatorId,
        overtime_rule_id: entry!.ruleId,
        standard_hours: entry!.standardHours,
        overtime_hours: entry!.overtimeHours,
        overtime_pay: entry!.overtimePay,
        reviewed: true,
        reviewed_by: userId,
        reviewed_at: now,
      })
      upErr = res.error
    } else {
      setBusy(false)
      setError('Add an overtime rule covering this date before approving, so pay can be recorded.')
      return
    }
    setBusy(false)
    if (upErr) {
      setError(
        /permission|policy|rls|denied/i.test((upErr as { message?: string }).message ?? '')
          ? 'You do not have permission to review overtime.'
          : 'Could not mark this entry as reviewed. Please try again.',
      )
      return
    }
    onReviewed()
  }

  const canApprove = canReview && !entry.reviewed

  return (
    <Modal
      open={!!entry}
      onClose={busy ? () => {} : onClose}
      eyebrow="Overtime entry"
      title={entry.operatorName}
      subtitle={shortDate(entry.entryDate)}
      footer={
        <div className="modal-foot-split">
          <StatusBadge tone={entry.reviewed ? 'green' : 'amber'}>
            {entry.reviewed ? 'Reviewed' : 'Pending review'}
          </StatusBadge>
          {canApprove && (
            <div className="modal-foot-actions">
              <button className="button button-primary" onClick={review} disabled={busy}>
                <CheckCircle2 size={14} />
                {busy ? 'Saving…' : 'Mark reviewed'}
              </button>
            </div>
          )}
        </div>
      }
    >
      {error && (
        <div className="form-error">
          <AlertTriangle size={15} />
          {error}
        </div>
      )}
      <DetailGrid
        items={[
          ['Operator', entry.operatorName],
          ['Machine', entry.machineNumber],
          ['Entry date', shortDate(entry.entryDate)],
          ['Overtime rule', entry.ruleName ?? 'Default (no rule configured)'],
          ['Day multiplier', `${entry.weekdayMultiplier}×`],
          ['Standard hours', `${entry.standardHours.toFixed(1)} h`],
          ['Overtime hours', `${entry.overtimeHours.toFixed(1)} h`],
          ['Overtime pay', money(entry.overtimePay)],
          ['Reviewed at', entry.reviewedAt ? dateTime(entry.reviewedAt) : 'Not yet reviewed'],
        ]}
      />
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Overtime rule configuration (administrator only)
// ---------------------------------------------------------------------------

type RuleRow = OvertimeRule

function OvertimeRulesModal({ open, userId, onClose }: { open: boolean; userId: string; onClose: () => void }) {
  const supabase = useSupabase()
  const [adding, setAdding] = useState(false)

  const rules = useQuery<RuleRow[]>(
    () =>
      !open
        ? Promise.resolve({ data: [], error: null })
        : (supabase
            .from('overtime_rule')
            .select(RULE_SELECT)
            .order('effective_from', { ascending: false }) as unknown as PromiseLike<{
            data: RuleRow[] | null
            error: unknown
          }>),
    [open],
  )

  const openRule = (rules.data ?? []).find((r) => !r.effective_to) ?? null

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        eyebrow="Configuration"
        title="Overtime rules"
        subtitle="Effective-dated multipliers used to calculate operator overtime pay."
        footer={
          <div className="footer-actions">
            <button className="button button-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        }
      >
        <ModalSection
          title="Rules"
          count={rules.data?.length}
          action={
            <button className="mini-add" onClick={() => setAdding(true)}>
              Add rule
            </button>
          }
        >
          <ViewState
            status={rules.status}
            error={rules.error}
            isEmpty={(rules.data ?? []).length === 0}
            title="overtime rules"
            emptyText="No overtime rules configured yet."
            onRetry={rules.reload}
          >
            {(rules.data ?? []).map((r) => (
              <div className="stack-row" key={r.id}>
                <div>
                  <b>{r.name}</b>
                  <span>
                    {shortDate(r.effective_from)} → {r.effective_to ? shortDate(r.effective_to) : 'current'}
                    {r.operator_category ? ` · ${titleCase(r.operator_category)}` : ''}
                  </span>
                </div>
                <div className="stack-meta">
                  {r.weekday_rate_multiplier ?? 'N/A'}× wk
                  {r.base_hourly_rate ? ` · ${money(r.base_hourly_rate)}/h` : ''}
                  {!r.effective_to && <StatusBadge tone="green">Active</StatusBadge>}
                </div>
              </div>
            ))}
          </ViewState>
        </ModalSection>
      </Modal>

      {adding && (
        <OvertimeRuleFormModal
          openRule={openRule}
          userId={userId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            rules.reload()
          }}
        />
      )}
    </>
  )
}

function OvertimeRuleFormModal({
  openRule,
  userId,
  onClose,
  onSaved,
}: {
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
    setForm({ standard_hours_per_day: '8', weekday_rate_multiplier: '1.5' })
    setFieldErrors({})
    setFormError('')
  }, [])

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit() {
    const errors: Record<string, string> = {}
    if (!form.name?.trim()) errors.name = 'Rule name is required.'
    if (!form.effective_from) errors.effective_from = 'Effective-from date is required.'
    if (openRule && form.effective_from && form.effective_from <= openRule.effective_from)
      errors.effective_from = `Must be after the current rule's start (${shortDate(openRule.effective_from)}).`
    setFieldErrors(errors)
    setFormError('')
    if (Object.keys(errors).length > 0) return

    const num = (k: string) => (form[k]?.trim() ? Number(form[k]) : null)
    const payload = {
      name: form.name.trim(),
      effective_from: form.effective_from,
      effective_to: null,
      standard_hours_per_day: num('standard_hours_per_day') ?? 8,
      weekday_rate_multiplier: num('weekday_rate_multiplier') ?? 1.5,
      saturday_rate_multiplier: num('saturday_rate_multiplier'),
      sunday_rate_multiplier: num('sunday_rate_multiplier'),
      public_holiday_rate_multiplier: num('public_holiday_rate_multiplier'),
      operator_category: form.operator_category?.trim() ? form.operator_category.trim() : null,
      base_hourly_rate: num('base_hourly_rate'),
      created_by: userId,
    }

    setSaving(true)
    // Close the prior open rule the day before this one starts.
    if (openRule) {
      const prevEnd = new Date(form.effective_from)
      prevEnd.setDate(prevEnd.getDate() - 1)
      const { error: closeErr } = await supabase
        .from('overtime_rule')
        .update({ effective_to: prevEnd.toISOString().slice(0, 10) })
        .eq('id', openRule.id)
      if (closeErr) {
        setSaving(false)
        setFormError('Could not close the previous rule. Please try again.')
        return
      }
    }
    const { error } = await supabase.from('overtime_rule').insert(payload)
    setSaving(false)
    if (error) {
      setFormError(
        /permission|policy|rls|denied/i.test((error as { message?: string }).message ?? '')
          ? 'You do not have permission to configure overtime rules.'
          : 'Could not save this rule. Please try again.',
      )
      return
    }
    onSaved()
  }

  return (
    <Modal
      open
      onClose={saving ? () => {} : onClose}
      eyebrow="Overtime rule"
      title="Add overtime rule"
      subtitle={
        openRule
          ? `The current rule (from ${shortDate(openRule.effective_from)}) will be closed the day before this starts.`
          : 'Set the multipliers that apply from the effective date onward.'
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
        <OtField label="Rule name" required value={form.name ?? ''} onChange={(v) => set('name', v)} error={fieldErrors.name} full placeholder="e.g. Standard overtime 2026" />
        <OtField label="Effective from" type="date" required value={form.effective_from ?? ''} onChange={(v) => set('effective_from', v)} error={fieldErrors.effective_from} />
        <OtField label="Standard hours / day" type="number" value={form.standard_hours_per_day ?? ''} onChange={(v) => set('standard_hours_per_day', v)} placeholder="8" />
        <OtField label="Base hourly rate" type="number" value={form.base_hourly_rate ?? ''} onChange={(v) => set('base_hourly_rate', v)} placeholder="Used to compute pay" />
        <OtField label="Weekday multiplier" type="number" value={form.weekday_rate_multiplier ?? ''} onChange={(v) => set('weekday_rate_multiplier', v)} placeholder="1.5" />
        <OtField label="Saturday multiplier" type="number" value={form.saturday_rate_multiplier ?? ''} onChange={(v) => set('saturday_rate_multiplier', v)} />
        <OtField label="Sunday multiplier" type="number" value={form.sunday_rate_multiplier ?? ''} onChange={(v) => set('sunday_rate_multiplier', v)} />
        <OtField label="Public holiday multiplier" type="number" value={form.public_holiday_rate_multiplier ?? ''} onChange={(v) => set('public_holiday_rate_multiplier', v)} />
        <OtField label="Operator category (optional)" value={form.operator_category ?? ''} onChange={(v) => set('operator_category', v)} placeholder="Blank = all operators" />
      </div>
    </Modal>
  )
}

function OtField({
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

// ---------------------------------------------------------------------------
// Single-day filter + CSV/Excel export for the visible overtime entries
// ---------------------------------------------------------------------------

function OvertimeExportBar({
  date,
  setDate,
  rows,
  ready,
}: {
  date: string
  setDate: (v: string) => void
  rows: OtRow[]
  ready: boolean
}) {
  const [busy, setBusy] = useState<null | 'csv' | 'xlsx'>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const dateRef = useRef<HTMLInputElement>(null)

  function openPicker(ref: React.RefObject<HTMLInputElement | null>) {
    try {
      ref.current?.showPicker?.()
    } catch {
      /* showPicker unsupported/blocked : focusing the input still works */
    }
  }

  async function runExport(kind: 'csv' | 'xlsx') {
    if (rows.length === 0) {
      setMessage({
        text: date ? 'No overtime entries on this date to export.' : 'No overtime entries to export.',
        error: true,
      })
      return
    }
    setBusy(kind)
    setMessage(null)
    const { headers, rows: matrix } = buildMatrix(rows, EXPORT_COLUMNS)
    const base = `operator-overtime_${date || 'all-days'}`
    try {
      if (kind === 'csv') exportCsv(`${base}.csv`, headers, matrix)
      else await exportXlsx(`${base}.xlsx`, headers, matrix, 'Overtime')
      setMessage({
        text: `Exported ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} (${kind.toUpperCase()}).`,
        error: false,
      })
    } catch {
      setMessage({ text: 'Could not generate the file. Please try again.', error: true })
    }
    setBusy(null)
  }

  return (
    <div className="export-bar">
      <div className="export-title">
        <b>Export overtime</b>
        <span>Exports exactly the entries shown for the selected day.</span>
      </div>
      <div className="range-field overtime-day-filter">
        <span className="range-label">Day</span>
        <label className="date-control" onClick={() => openPicker(dateRef)}>
          <CalendarDays size={15} />
          <input
            ref={dateRef}
            type="date"
            value={date}
            max={isoDate(new Date())}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Overtime day"
          />
        </label>
        <button
          type="button"
          className={`chip ${date ? '' : 'chip-active'}`}
          onClick={() => setDate(date ? '' : isoDate(new Date()))}
          aria-pressed={!date}
          style={{ marginLeft: 8 }}
        >
          {date ? 'All days' : 'All days ✓'}
        </button>
      </div>
      <div className="export-actions">
        <button className="button button-secondary" onClick={() => runExport('csv')} disabled={busy !== null || !ready}>
          <Download size={14} />
          {busy === 'csv' ? 'Exporting…' : 'CSV'}
        </button>
        <button className="button button-primary" onClick={() => runExport('xlsx')} disabled={busy !== null || !ready}>
          <FileSpreadsheet size={14} />
          {busy === 'xlsx' ? 'Exporting…' : 'Excel'}
        </button>
      </div>
      {message && <p className={`export-msg ${message.error ? 'error' : ''}`}>{message.text}</p>}
    </div>
  )
}
