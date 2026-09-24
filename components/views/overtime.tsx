'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CalendarDays, CheckCircle2, Download, FileSpreadsheet, Settings2, Sparkles } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { dateTime, money, shortDate, titleCase } from '@/lib/gbi/format'
import { buildMatrix, exportCsv, exportXlsx, type ExportColumn } from '@/lib/gbi/export'
import {
  canGenerateOvertime,
  canManageOvertimeRules,
  canReviewOvertime,
  type UserRole,
} from '@/lib/gbi/roles'
import {
  buildOvertimePreview,
  round2,
  type OvertimeRule,
  type OvertimeSourceEntry,
} from '@/lib/gbi/overtime'
import { DetailGrid, Modal, ModalSection, PageHeading, StatusBadge, ViewState } from '@/components/shared'

type Overtime = {
  id: string
  standard_hours: number
  overtime_hours: number
  overtime_pay: number
  reviewed: boolean
  reviewed_at: string | null
  created_at: string
  operator: { full_name: string } | null
  rule: { name: string; weekday_rate_multiplier: number | null } | null
  entry: {
    entry_date: string
    machine: { machine_number: string } | null
  } | null
}

const FILTERS = ['all', 'pending', 'reviewed'] as const
const LIST_SELECT =
  'id,standard_hours,overtime_hours,overtime_pay,reviewed,reviewed_at,created_at,operator:operator_id(full_name),rule:overtime_rule_id(name,weekday_rate_multiplier),entry:daily_hour_entry_id(entry_date,machine:machine_id(machine_number))'

// Local calendar date as YYYY-MM-DD (avoids UTC shifting the day near midnight).
function isoDate(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

const EXPORT_COLUMNS: ExportColumn<Overtime>[] = [
  { header: 'Entry date', value: (r) => r.entry?.entry_date ?? '' },
  { header: 'Operator', value: (r) => r.operator?.full_name ?? '' },
  { header: 'Machine', value: (r) => r.entry?.machine?.machine_number ?? '' },
  { header: 'Overtime rule', value: (r) => r.rule?.name ?? '' },
  { header: 'Standard hours', value: (r) => Number(r.standard_hours ?? 0) },
  { header: 'Overtime hours', value: (r) => Number(r.overtime_hours ?? 0) },
  { header: 'Overtime pay', value: (r) => Number(r.overtime_pay ?? 0) },
  { header: 'Status', value: (r) => (r.reviewed ? 'Reviewed' : 'Pending') },
]

export function OvertimeView({ role, userId }: { role: UserRole; userId: string }) {
  const supabase = useSupabase()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all')
  // Single-day filter, defaulting to today. Empty string means "All days".
  const [date, setDate] = useState<string>(isoDate(new Date()))
  const [selected, setSelected] = useState<Overtime | null>(null)
  const [generating, setGenerating] = useState(false)
  const [managingRules, setManagingRules] = useState(false)

  const canGenerate = canGenerateOvertime(role)
  const canReview = canReviewOvertime(role)
  const canRules = canManageOvertimeRules(role)

  const records = useQuery<Overtime[]>(
    () =>
      supabase
        .from('overtime_entry')
        .select(LIST_SELECT)
        .order('created_at', { ascending: false }) as unknown as PromiseLike<{
        data: Overtime[] | null
        error: unknown
      }>,
    [],
  )

  // Auto-derive overtime from daily hours so entries reflect without a manual
  // "Generate" step. Runs once per mount for users allowed to generate; other
  // roles simply read whatever has already been derived. Any daily entry with
  // an operator that exceeds the effective rule's standard hours and has no
  // overtime row yet gets one created here.
  const [syncing, setSyncing] = useState(false)
  const syncedRef = useRef(false)
  useEffect(() => {
    if (!canGenerate || syncedRef.current) return
    syncedRef.current = true
    let cancelled = false
    ;(async () => {
      setSyncing(true)
      const [{ data: entries }, { data: rules }, { data: existing }] = await Promise.all([
        supabase
          .from('daily_hour_entry')
          .select('id,entry_date,operator_id,total_hours')
          .not('operator_id', 'is', null),
        supabase.from('overtime_rule').select(RULE_SELECT).order('effective_from', { ascending: false }),
        supabase.from('overtime_entry').select('daily_hour_entry_id'),
      ])
      if (cancelled) return
      const done = new Set(
        (existing ?? []).map((e) => (e as { daily_hour_entry_id: string }).daily_hour_entry_id),
      )
      const fresh = ((entries ?? []) as OvertimeSourceEntry[]).filter((e) => !done.has(e.id))
      const preview = buildOvertimePreview(fresh, (rules ?? []) as OvertimeRule[])
      if (preview.lines.length > 0) {
        // Ignore insert errors (e.g. a concurrent sync inserting the same rows);
        // the list reload below reflects whatever landed.
        await supabase.from('overtime_entry').insert(preview.lines)
        if (!cancelled) records.reload()
      }
      if (!cancelled) setSyncing(false)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canGenerate, supabase])

  const rows = useMemo(() => {
    let all = records.data ?? []
    // Single-day filter on the linked daily entry's date; empty = All days.
    if (date) {
      all = all.filter((r) => r.entry?.entry_date === date)
    }
    if (filter === 'all') return all
    return all.filter((r) => (filter === 'reviewed' ? r.reviewed : !r.reviewed))
  }, [records.data, filter, date])

  const totalPay = rows.reduce((s, r) => s + Number(r.overtime_pay ?? 0), 0)
  const totalHours = rows.reduce((s, r) => s + Number(r.overtime_hours ?? 0), 0)

  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="People"
        title="Operator Overtime"
        description="Overtime calculated per daily entry against the effective overtime rule, pending management review."
        action={
          canGenerate || canRules ? (
            <div className="modal-foot-actions">
              {canRules && (
                <button className="button button-secondary" onClick={() => setManagingRules(true)}>
                  <Settings2 size={15} />
                  Overtime rules
                </button>
              )}
              {canGenerate && (
                <button className="button button-primary" onClick={() => setGenerating(true)}>
                  <Sparkles size={15} />
                  Generate overtime
                </button>
              )}
            </div>
          ) : undefined
        }
      />

      <OvertimeExportBar date={date} setDate={setDate} rows={rows} ready={records.status === 'ready'} />

      <div className="hours-summary">
        <div>
          <span>Entries</span>
          <b>{records.status === 'ready' ? rows.length : '—'}</b>
        </div>
        <div>
          <span>Overtime hours</span>
          <b>{records.status === 'ready' ? `${totalHours.toFixed(1)} h` : '—'}</b>
        </div>
        <div>
          <span>Overtime pay</span>
          <b>{records.status === 'ready' ? money(totalPay) : '—'}</b>
        </div>
        <div>
          <span>Pending review</span>
          <b className={rows.some((r) => !r.reviewed) ? 'danger-text' : ''}>
            {records.status === 'ready' ? rows.filter((r) => !r.reviewed).length : '—'}
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
          status={records.status}
          error={records.error}
          isEmpty={rows.length === 0}
          title="overtime"
          emptyText={
            syncing
              ? 'Deriving overtime from daily hours…'
              : filter === 'all'
                ? date
                  ? 'No overtime on this day. Pick another date or choose "All days".'
                  : 'No overtime recorded yet.'
                : `No ${filter} overtime entries.`
          }
          onRetry={records.reload}
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
                  <tr key={r.id} className="clickable-row" onClick={() => setSelected(r)}>
                    <td>
                      <b>{r.operator?.full_name ?? '—'}</b>
                      <div className="muted-cell">{r.rule?.name ?? ''}</div>
                    </td>
                    <td>{shortDate(r.entry?.entry_date)}</td>
                    <td>{r.entry?.machine?.machine_number ?? '—'}</td>
                    <td>{Number(r.standard_hours).toFixed(1)} h</td>
                    <td>
                      <b>{Number(r.overtime_hours).toFixed(1)} h</b>
                    </td>
                    <td>{money(r.overtime_pay)}</td>
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
          records.reload()
        }}
      />

      {canGenerate && (
        <GenerateOvertimeModal
          open={generating}
          onClose={() => setGenerating(false)}
          onGenerated={() => {
            setGenerating(false)
            records.reload()
          }}
        />
      )}

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
  entry: Overtime | null
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
  }, [entry?.id])

  if (!entry) return null

  async function review() {
    setBusy(true)
    setError('')
    const { error: upErr } = await supabase
      .from('overtime_entry')
      .update({ reviewed: true, reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq('id', entry!.id)
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

  return (
    <Modal
      open={!!entry}
      onClose={busy ? () => {} : onClose}
      eyebrow="Overtime entry"
      title={entry.operator?.full_name ?? ''}
      subtitle={shortDate(entry.entry?.entry_date)}
      footer={
        <div className="modal-foot-split">
          <StatusBadge tone={entry.reviewed ? 'green' : 'amber'}>
            {entry.reviewed ? 'Reviewed' : 'Pending review'}
          </StatusBadge>
          {canReview && !entry.reviewed && (
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
          ['Operator', entry.operator?.full_name ?? '—'],
          ['Machine', entry.entry?.machine?.machine_number ?? '—'],
          ['Entry date', shortDate(entry.entry?.entry_date)],
          ['Overtime rule', entry.rule?.name ?? '—'],
          [
            'Weekday multiplier',
            entry.rule?.weekday_rate_multiplier ? `${entry.rule.weekday_rate_multiplier}×` : '—',
          ],
          ['Standard hours', `${Number(entry.standard_hours).toFixed(1)} h`],
          ['Overtime hours', `${Number(entry.overtime_hours).toFixed(1)} h`],
          ['Overtime pay', money(entry.overtime_pay)],
          ['Reviewed at', entry.reviewed_at ? dateTime(entry.reviewed_at) : 'Not yet reviewed'],
          ['Recorded', dateTime(entry.created_at)],
        ]}
      />
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Generate overtime from daily hours
// ---------------------------------------------------------------------------

function firstOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function lastOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}

const RULE_SELECT =
  'id,name,effective_from,effective_to,standard_hours_per_day,weekday_rate_multiplier,saturday_rate_multiplier,sunday_rate_multiplier,public_holiday_rate_multiplier,operator_category,base_hourly_rate'

function GenerateOvertimeModal({
  open,
  onClose,
  onGenerated,
}: {
  open: boolean
  onClose: () => void
  onGenerated: () => void
}) {
  const supabase = useSupabase()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [preview, setPreview] = useState<ReturnType<typeof buildOvertimePreview> | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    const now = new Date()
    setStart(firstOfMonth(now))
    setEnd(lastOfMonth(now))
    setPreview(null)
    setError('')
  }, [open])

  async function runPreview() {
    if (!start || !end) return setError('Choose a period first.')
    if (end < start) return setError('The end date must be after the start date.')
    setPreviewing(true)
    setError('')
    setPreview(null)

    const [{ data: entries, error: eErr }, { data: rules, error: rErr }, { data: existing, error: xErr }] =
      await Promise.all([
        supabase
          .from('daily_hour_entry')
          .select('id,entry_date,operator_id,total_hours')
          .gte('entry_date', start)
          .lte('entry_date', end)
          .not('operator_id', 'is', null),
        supabase.from('overtime_rule').select(RULE_SELECT).order('effective_from', { ascending: false }),
        supabase
          .from('overtime_entry')
          .select('daily_hour_entry_id')
          .gte('created_at', '1900-01-01'),
      ])

    setPreviewing(false)
    if (eErr || rErr || xErr) {
      setError('Could not load hours or overtime rules. Please try again.')
      return
    }
    // Skip entries that already have an overtime record so re-running is safe.
    const done = new Set((existing ?? []).map((e) => (e as { daily_hour_entry_id: string }).daily_hour_entry_id))
    const fresh = ((entries ?? []) as OvertimeSourceEntry[]).filter((e) => !done.has(e.id))
    setPreview(buildOvertimePreview(fresh, (rules ?? []) as OvertimeRule[]))
  }

  async function generate() {
    if (!preview || preview.lines.length === 0) return
    setSaving(true)
    setError('')
    const { error: insErr } = await supabase.from('overtime_entry').insert(preview.lines)
    setSaving(false)
    if (insErr) {
      setError(
        /permission|policy|rls|denied/i.test((insErr as { message?: string }).message ?? '')
          ? 'You do not have permission to generate overtime.'
          : 'Could not save overtime entries. Please try again.',
      )
      return
    }
    onGenerated()
  }

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      eyebrow="Overtime engine"
      title="Generate overtime"
      subtitle="Calculate overtime for verified daily hours in a period, skipping entries already processed."
      footer={
        <div className="footer-actions">
          <button className="button button-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          {!preview ? (
            <button className="button button-primary" onClick={runPreview} disabled={previewing}>
              {previewing ? 'Calculating…' : 'Preview overtime'}
            </button>
          ) : (
            <button className="button button-primary" onClick={generate} disabled={saving || preview.lines.length === 0}>
              {saving ? 'Generating…' : `Record ${preview.lines.length} entries`}
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
        <div className="form-field">
          <label htmlFor="ot-start">Period start</label>
          <input id="ot-start" type="date" value={start} onChange={(e) => { setStart(e.target.value); setPreview(null) }} />
        </div>
        <div className="form-field">
          <label htmlFor="ot-end">Period end</label>
          <input id="ot-end" type="date" value={end} onChange={(e) => { setEnd(e.target.value); setPreview(null) }} />
        </div>
      </div>

      {preview && (
        <div className="gen-preview">
          <h3>Preview</h3>
          {preview.lines.length === 0 ? (
            <p className="mini-state">
              No new overtime found. Entries must be verified (not flagged), have an operator, exceed standard hours,
              and not already be processed.
            </p>
          ) : (
            <>
              <div className="gen-summary">
                <div>
                  <span>New entries</span>
                  <b>{preview.lines.length}</b>
                </div>
                <div>
                  <span>Overtime hours</span>
                  <b>{preview.totalHours.toFixed(1)} h</b>
                </div>
                <div>
                  <span>Overtime pay</span>
                  <b>{money(preview.totalPay)}</b>
                </div>
                <div>
                  <span>Skipped</span>
                  <b>{preview.noRuleCount + preview.noOperatorCount}</b>
                </div>
              </div>
              {preview.noRuleCount > 0 && (
                <p className="gen-warn">
                  <AlertTriangle size={13} />
                  {preview.noRuleCount} entr{preview.noRuleCount === 1 ? 'y has' : 'ies have'} no effective overtime
                  rule and were excluded.
                </p>
              )}
            </>
          )}
        </div>
      )}
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
                  {r.weekday_rate_multiplier ?? '—'}× wk
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
// From–to range filter + CSV/Excel export for the visible overtime entries
// ---------------------------------------------------------------------------

function OvertimeExportBar({
  date,
  setDate,
  rows,
  ready,
}: {
  date: string
  setDate: (v: string) => void
  rows: Overtime[]
  ready: boolean
}) {
  const [busy, setBusy] = useState<null | 'csv' | 'xlsx'>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const dateRef = useRef<HTMLInputElement>(null)

  function openPicker(ref: React.RefObject<HTMLInputElement | null>) {
    try {
      ref.current?.showPicker?.()
    } catch {
      /* showPicker unsupported/blocked — focusing the input still works */
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
      <div className="range-field">
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
