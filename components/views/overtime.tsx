'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays, CheckCircle2, Download, FileSpreadsheet, Settings2 } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { dateTime, money, shortDate } from '@/lib/gbi/format'
import { buildMatrix, exportCsv, exportXlsx } from '@/lib/gbi/export'
import { canManageOvertimeRules, canReviewOvertime, type UserRole } from '@/lib/gbi/roles'
import {
  deriveOvertime,
  OVERTIME_MONTHLY_HOURS,
  overtimeDayMultiplier,
  pickOvertimeRule,
  round2,
  type OvertimeRule,
  type OvertimeSourceEntry,
} from '@/lib/gbi/overtime'
import { DetailGrid, LoadingSpinner, Modal, ModalSection, PageHeading, StatusBadge, ViewState } from '@/components/shared'

// A single overtime line as shown on the page. It is derived live from a daily
// hour entry : a persisted overtime_entry only supplies reviewed status.
type OtRow = {
  key: string // the source daily_hour_entry id (stable list key)
  persistedId: string | null // overtime_entry id, when the line has been recorded
  operatorId: string | null
  operatorName: string
  baseSalary: number | null
  hourlyWage: number
  machineId: string
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
  'id,entry_date,operator_id,total_hours,operator:operator_id(full_name,base_salary),machine:machine_id(id,machine_number)'

type EntryRow = {
  id: string
  entry_date: string
  operator_id: string | null
  total_hours: number
  operator: { full_name: string; base_salary: number | null } | null
  machine: { id: string; machine_number: string } | null
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

export function OvertimeView({ role, userId }: { role: UserRole; userId: string }) {
  const supabase = useSupabase()
  const currentDate = isoDate(new Date())
  const [selectedDate, setSelectedDate] = useState(currentDate)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all')
  const [machineFilter, setMachineFilter] = useState('')
  const [operatorFilter, setOperatorFilter] = useState('')
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
        .eq('entry_date', selectedDate)
        .order('entry_date', { ascending: false }) as unknown as PromiseLike<{
        data: EntryRow[] | null
        error: unknown
      }>,
    [selectedDate],
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

  const status =
    entries.status === 'error' || rulesQ.status === 'error' || persisted.status === 'error'
      ? 'error'
      : entries.status === 'loading' || rulesQ.status === 'loading' || persisted.status === 'loading'
        ? 'loading'
        : 'ready'
  const loadError = entries.error || rulesQ.error || persisted.error
  const reload = () => {
    entries.reload()
    rulesQ.reload()
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
      const derived = deriveOvertime(
        { ...e, base_salary: e.operator?.base_salary ?? null } as OvertimeSourceEntry,
        rule,
      )
      if (!derived) continue
      const p = byEntry.get(e.id) ?? null
      out.push({
        key: e.id,
        persistedId: p?.id ?? null,
        operatorId: e.operator_id,
        operatorName: e.operator?.full_name ?? 'N/A',
        baseSalary: e.operator?.base_salary == null ? null : Number(e.operator.base_salary),
        hourlyWage: (Number(e.operator?.base_salary) || 0) / OVERTIME_MONTHLY_HOURS,
        machineId: e.machine?.id ?? '',
        machineNumber: e.machine?.machine_number ?? 'N/A',
        entryDate: e.entry_date,
        ruleId: derived.ruleId,
        ruleName: derived.ruleName,
        weekdayMultiplier: derived.weekdayMultiplier,
        // Recalculate with the current salary, including for previously reviewed lines.
        standardHours: derived.standardHours,
        overtimeHours: derived.overtimeHours,
        overtimePay: derived.overtimePay,
        reviewed: p?.reviewed ?? false,
        reviewedAt: p?.reviewed_at ?? null,
        hasRealRule: derived.hasRealRule,
      })
    }
    return out
  }, [entries.data, rulesQ.data, persisted.data])

  const rows = useMemo(() => {
    let all = allRows
    if (machineFilter) all = all.filter((r) => r.machineId === machineFilter)
    if (operatorFilter) all = all.filter((r) => r.operatorId === operatorFilter)
    if (filter !== 'all') all = all.filter((r) => (filter === 'reviewed' ? r.reviewed : !r.reviewed))
    return all
  }, [allRows, filter, machineFilter, operatorFilter])

  const machineOptions = useMemo(
    () => Array.from(new Map(allRows.filter((row) => row.machineId).map((row) => [row.machineId, row.machineNumber])).entries())
      .sort((a, b) => a[1].localeCompare(b[1])),
    [allRows],
  )
  const operatorOptions = useMemo(
    () => Array.from(new Map(allRows.filter((row) => row.operatorId).map((row) => [row.operatorId!, row.operatorName])).entries())
      .sort((a, b) => a[1].localeCompare(b[1])),
    [allRows],
  )

  const noRuleAny = allRows.some((r) => !r.hasRealRule)
  const noSalaryAny = allRows.some((r) => r.baseSalary == null)

  return (
    <div className="page-wrap">
      <PageHeading
        title="Operator Overtime"
        description="Daily overtime and review status."
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

      <DailyOvertimeSection
        status={status}
        error={loadError}
        reload={reload}
        rows={rows}
        filter={filter}
        setFilter={setFilter}
        selectedDate={selectedDate}
        currentDate={currentDate}
        setSelectedDate={setSelectedDate}
        machineFilter={machineFilter}
        setMachineFilter={setMachineFilter}
        operatorFilter={operatorFilter}
        setOperatorFilter={setOperatorFilter}
        machineOptions={machineOptions}
        operatorOptions={operatorOptions}
        noRuleAny={noRuleAny}
        noSalaryAny={noSalaryAny}
        onSelect={setSelected}
      />

      <MonthlyOvertimePayroll
        rules={rulesQ.data ?? []}
        rulesReady={rulesQ.status === 'ready'}
        rulesError={rulesQ.error}
      />

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

function DailyOvertimeSection({
  status,
  error,
  reload,
  rows,
  filter,
  setFilter,
  selectedDate,
  currentDate,
  setSelectedDate,
  machineFilter,
  setMachineFilter,
  operatorFilter,
  setOperatorFilter,
  machineOptions,
  operatorOptions,
  noRuleAny,
  noSalaryAny,
  onSelect,
}: {
  status: 'loading' | 'ready' | 'error'
  error: string
  reload: () => void
  rows: OtRow[]
  filter: (typeof FILTERS)[number]
  setFilter: (filter: (typeof FILTERS)[number]) => void
  selectedDate: string
  currentDate: string
  setSelectedDate: (date: string) => void
  machineFilter: string
  setMachineFilter: (machineId: string) => void
  operatorFilter: string
  setOperatorFilter: (operatorId: string) => void
  machineOptions: [string, string][]
  operatorOptions: [string, string][]
  noRuleAny: boolean
  noSalaryAny: boolean
  onSelect: (row: OtRow) => void
}) {
  const totalPay = rows.reduce((sum, row) => sum + row.overtimePay, 0)
  const totalHours = rows.reduce((sum, row) => sum + row.overtimeHours, 0)

  return (
    <section className="daily-overtime-section">
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
          <b className={rows.some((row) => !row.reviewed) ? 'danger-text' : ''}>
            {status === 'loading'
              ? <LoadingSpinner small />
              : status === 'ready'
                ? rows.filter((row) => !row.reviewed).length
                : 'N/A'}
          </b>
        </div>
        <div>
          <span>Filter</span>
          <b style={{ textTransform: 'capitalize' }}>{filter}</b>
        </div>
      </div>

      {(noRuleAny || noSalaryAny) && status === 'ready' && (
        <p className="form-info" style={{ marginTop: 12 }}>
          <AlertTriangle size={14} />
          {noRuleAny &&
            'Some entries use the default 8-hour daily threshold because no overtime rule covers their dates. '}
          {noSalaryAny && 'Entries without a Base Salary show zero overtime pay until one is entered. '}
          Weekdays use 1.5× and Saturdays/Sundays use 2×; public holidays use the weekday rate unless they fall on a weekend.
        </p>
      )}

      <div className="overtime-filters">
        <label className="form-field overtime-date-filter">
          <span>Day</span>
          <input
            type="date"
            value={selectedDate}
            max={currentDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            aria-label="Overtime day"
          />
        </label>
        <div className="overtime-status-filters" role="group" aria-label="Filter overtime by review status">
          {FILTERS.map((value) => (
            <button
              key={value}
              className={`chip ${filter === value ? 'chip-active' : ''}`}
              onClick={() => setFilter(value)}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
        <select
          className="overtime-select-filter"
          aria-label="Filter by machine"
          value={machineFilter}
          onChange={(event) => setMachineFilter(event.target.value)}
        >
          <option value="">All machines</option>
          {machineOptions.map(([id, machineNumber]) => (
            <option key={id} value={id}>{machineNumber}</option>
          ))}
        </select>
        <select
          className="overtime-select-filter"
          aria-label="Filter by operator"
          value={operatorFilter}
          onChange={(event) => setOperatorFilter(event.target.value)}
        >
          <option value="">All operators</option>
          {operatorOptions.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
      </div>

      <div className="panel">
        <ViewState
          status={status}
          error={error}
          isEmpty={rows.length === 0}
          title="overtime"
          emptyText={
            filter === 'all'
              ? 'No overtime recorded for this day. Overtime appears when a daily entry exceeds standard hours.'
              : `No ${filter} overtime entries for this day.`
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
                {rows.map((row) => (
                  <tr key={row.key} className="clickable-row" onClick={() => onSelect(row)}>
                    <td>
                      <b>{row.operatorName}</b>
                      <div className="muted-cell">{row.ruleName ?? 'Default rate'}</div>
                    </td>
                    <td>{shortDate(row.entryDate)}</td>
                    <td>{row.machineNumber}</td>
                    <td>{row.standardHours.toFixed(1)} h</td>
                    <td><b>{row.overtimeHours.toFixed(1)} h</b></td>
                    <td>{money(row.overtimePay)}</td>
                    <td>
                      <StatusBadge tone={row.reviewed ? 'green' : 'amber'}>
                        {row.reviewed ? 'Reviewed' : 'Pending'}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ViewState>
      </div>
    </section>
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
      setError('Add an overtime rule covering this date before marking it reviewed.')
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
          ['Current base salary', entry.baseSalary == null ? 'Not set' : money(entry.baseSalary)],
          ['Hourly wage (salary ÷ 208)', money(entry.hourlyWage)],
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
        subtitle="Effective-dated daily standard hours. Pay uses the operator’s current monthly Base Salary divided by 208."
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
                  </span>
                </div>
                <div className="stack-meta">
                  {r.standard_hours_per_day ?? 8} h/day
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
    setForm({ standard_hours_per_day: '8' })
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
    const standardHours = form.standard_hours_per_day?.trim()
    if (standardHours && (!Number.isFinite(Number(standardHours)) || Number(standardHours) <= 0))
      errors.standard_hours_per_day = 'Standard hours must be greater than zero.'
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
      operator_category: null,
      base_hourly_rate: null,
      weekday_rate_multiplier: 1.5,
      saturday_rate_multiplier: 2,
      sunday_rate_multiplier: 2,
      public_holiday_rate_multiplier: 1.5,
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
          : 'Set the daily standard hours from this effective date onward. The payroll formula uses a fixed 1.5× weekday and 2× weekend rate.'
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
        <OtField
          label="Standard hours / day"
          type="number"
          value={form.standard_hours_per_day ?? ''}
          onChange={(v) => set('standard_hours_per_day', v)}
          error={fieldErrors.standard_hours_per_day}
          placeholder="8"
          min="0.01"
          step="0.25"
        />
        <p className="field-hint full">
          Hourly wage = current monthly Base Salary ÷ 208. Weekday overtime is 1.5× and Saturday/Sunday overtime is 2×. Public holidays use the weekday rate unless they fall on a weekend.
        </p>
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
  min,
  step,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  type?: string
  placeholder?: string
  error?: string
  full?: boolean
  min?: string
  step?: string
}) {
  return (
    <div className={`form-field ${full ? 'full' : ''} ${error ? 'invalid' : ''}`}>
      <label>
        {label}
        {required && <span className="req">*</span>}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        min={min}
        step={step}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <span className="field-error">{error}</span>}
    </div>
  )
}

type PayrollSummaryRow = {
  operatorId: string
  operatorName: string
  baseSalary: number | null
  weekdayHours: number
  weekendHours: number
  totalHours: number
  totalPay: number
}

type PayrollEntry = {
  id: string
  entry_date: string
  operator_id: string | null
  total_hours: number
  operator: { full_name: string; base_salary: number | null } | null
}

function MonthlyOvertimePayroll({
  rules,
  rulesReady,
  rulesError,
}: {
  rules: OvertimeRule[]
  rulesReady: boolean
  rulesError: string
}) {
  const supabase = useSupabase()
  const today = isoDate(new Date())
  const [fromDate, setFromDate] = useState(`${today.slice(0, 7)}-01`)
  const [toDate, setToDate] = useState(today)
  const [busy, setBusy] = useState<null | 'csv' | 'xlsx'>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const invalidRange = !fromDate || !toDate || fromDate > toDate

  const payrollEntries = useQuery<PayrollEntry[]>(
    async () => {
      if (invalidRange) return { data: [], error: null }
      const pageSize = 500
      const result: PayrollEntry[] = []
      for (let offset = 0; ; offset += pageSize) {
        const page = await supabase
          .from('daily_hour_entry')
          .select('id,entry_date,operator_id,total_hours,operator:operator_id(full_name,base_salary)')
          .not('operator_id', 'is', null)
          .gte('entry_date', fromDate)
          .lte('entry_date', toDate)
          .order('entry_date')
          .order('id')
          .range(offset, offset + pageSize - 1) as unknown as {
          data: PayrollEntry[] | null
          error: unknown
        }
        if (page.error) return { data: null, error: page.error }
        const batch = page.data ?? []
        result.push(...batch)
        if (batch.length < pageSize) break
      }
      return { data: result, error: null }
    },
    [fromDate, toDate],
  )

  const periodRows = useMemo<PayrollSummaryRow[]>(() => {
    const byOperator = new Map<string, PayrollSummaryRow>()
    for (const entry of payrollEntries.data ?? []) {
      const derived = deriveOvertime(
        { ...entry, base_salary: entry.operator?.base_salary ?? null },
        pickOvertimeRule(rules, entry.entry_date),
      )
      if (!derived) continue
      const key = entry.operator_id ?? entry.operator?.full_name ?? 'Unknown operator'
      const baseSalary = entry.operator?.base_salary == null ? null : Number(entry.operator.base_salary)
      const summary = byOperator.get(key) ?? {
        operatorId: key,
        operatorName: entry.operator?.full_name ?? 'N/A',
        baseSalary,
        weekdayHours: 0,
        weekendHours: 0,
        totalHours: 0,
        totalPay: 0,
      }
      if (baseSalary != null) summary.baseSalary = baseSalary
      if (overtimeDayMultiplier(entry.entry_date) === 2) summary.weekendHours += derived.overtimeHours
      else summary.weekdayHours += derived.overtimeHours
      summary.totalHours += derived.overtimeHours
      summary.totalPay += derived.overtimePay
      byOperator.set(key, summary)
    }
    return Array.from(byOperator.values())
      .map((row) => ({
        ...row,
        weekdayHours: round2(row.weekdayHours),
        weekendHours: round2(row.weekendHours),
        totalHours: round2(row.totalHours),
        totalPay: round2(row.totalPay),
      }))
      .sort((a, b) => a.operatorName.localeCompare(b.operatorName))
  }, [payrollEntries.data, rules])

  const missingSalaryCount = periodRows.filter((row) => row.baseSalary == null).length
  const ready = payrollEntries.status === 'ready' && rulesReady
  const totals = periodRows.reduce(
    (sum, row) => ({
      weekdayHours: sum.weekdayHours + row.weekdayHours,
      weekendHours: sum.weekendHours + row.weekendHours,
      totalHours: sum.totalHours + row.totalHours,
      totalPay: sum.totalPay + row.totalPay,
    }),
    { weekdayHours: 0, weekendHours: 0, totalHours: 0, totalPay: 0 },
  )

  async function runExport(kind: 'csv' | 'xlsx') {
    if (invalidRange || periodRows.length === 0) {
      setMessage({
        text: invalidRange
          ? 'Choose a valid start and end date.'
          : 'No overtime entries in this period to export.',
        error: true,
      })
      return
    }
    setBusy(kind)
    setMessage(null)
    const exportRows = [
      ...periodRows.map((row) => [
        row.operatorName,
        row.baseSalary ?? '',
        fromDate,
        toDate,
        row.baseSalary == null ? '' : round2(row.baseSalary / OVERTIME_MONTHLY_HOURS),
        row.weekdayHours,
        row.weekendHours,
        row.totalHours,
        row.totalPay,
      ]),
      ['TOTAL', '', fromDate, toDate, '', round2(totals.weekdayHours), round2(totals.weekendHours), round2(totals.totalHours), round2(totals.totalPay)],
    ]
    const headers = [
      'Operator',
      'Current base salary (ZMW/month)',
      'Period start',
      'Period end',
      'Hourly wage (ZMW/hour; base salary / 208)',
      'Weekday overtime hours',
      'Weekend overtime hours',
      'Total overtime hours',
      'Overtime pay (ZMW)',
    ]
    const filename = `overtime-payroll_${fromDate}_${toDate}`
    try {
      if (kind === 'csv') exportCsv(`${filename}.csv`, headers, exportRows)
      else await exportXlsx(`${filename}.xlsx`, headers, exportRows, 'Payroll summary')
      setMessage({ text: `Exported overtime payroll for ${periodRows.length} operators.`, error: false })
    } catch {
      setMessage({ text: 'Could not generate the file. Please try again.', error: true })
    }
    setBusy(null)
  }

  return (
    <div className="export-bar monthly-payroll-bar">
      <div className="export-title">
        <b>Monthly payroll consolidation</b>
        <span>
          Summarizes daily-hour overtime within the selected dates, using each operator’s current Base Salary ÷ 208.
        </span>
      </div>
      <div className="range-field">
        <span className="range-label">From</span>
        <label className="date-control">
          <CalendarDays size={15} />
          <input
            type="date"
            value={fromDate}
            max={today}
            onChange={(event) => setFromDate(event.target.value)}
            aria-label="Payroll period start"
          />
        </label>
      </div>
      <div className="range-field">
        <span className="range-label">To</span>
        <label className="date-control">
          <CalendarDays size={15} />
          <input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            max={today}
            onChange={(event) => setToDate(event.target.value)}
            aria-label="Payroll period end"
          />
        </label>
      </div>
      <div className="export-actions">
        <button
          className="button button-secondary"
          onClick={() => runExport('csv')}
          disabled={busy !== null || !ready || invalidRange}
        >
          <Download size={14} />
          {busy === 'csv' ? 'Exporting…' : 'CSV'}
        </button>
        <button
          className="button button-primary"
          onClick={() => runExport('xlsx')}
          disabled={busy !== null || !ready || invalidRange}
        >
          <FileSpreadsheet size={14} />
          {busy === 'xlsx' ? 'Exporting…' : 'Excel'}
        </button>
      </div>
      {missingSalaryCount > 0 && (
        <p className="export-msg error">
          {missingSalaryCount} operator{missingSalaryCount === 1 ? '' : 's'} with overtime in this period have no Base Salary; their pay is shown as zero.
        </p>
      )}
      {payrollEntries.status === 'error' && (
        <p className="export-msg error">
          Could not load daily hours for payroll consolidation. {payrollEntries.error}
          <button className="button button-secondary retry-button" onClick={payrollEntries.reload}>
            Try again
          </button>
        </p>
      )}
      {rulesError && (
        <p className="export-msg error">
          Could not load overtime rules for payroll consolidation. {rulesError}
        </p>
      )}
      {payrollEntries.status === 'loading' && (
        <p className="export-msg">Loading daily hours for the selected payroll period…</p>
      )}
      {ready && (
        <>
          <p className="export-msg">
            Checked {payrollEntries.data?.length ?? 0} submitted daily-hour entr
            {(payrollEntries.data?.length ?? 0) === 1 ? 'y' : 'ies'} from {shortDate(fromDate)} to {shortDate(toDate)}.
          </p>
          {periodRows.length > 0 ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Operator</th>
                    <th>Base salary / month</th>
                    <th>Hourly wage</th>
                    <th>Weekday OT</th>
                    <th>Weekend OT</th>
                    <th>Total OT hours</th>
                    <th>Overtime pay</th>
                  </tr>
                </thead>
                <tbody>
                  {periodRows.map((row) => (
                    <tr key={row.operatorId}>
                      <td><b>{row.operatorName}</b></td>
                      <td>{row.baseSalary == null ? 'Not set' : money(row.baseSalary)}</td>
                      <td>
                        {row.baseSalary == null
                          ? 'N/A'
                          : money(round2(row.baseSalary / OVERTIME_MONTHLY_HOURS))}
                      </td>
                      <td>{row.weekdayHours.toFixed(2)} h</td>
                      <td>{row.weekendHours.toFixed(2)} h</td>
                      <td>{row.totalHours.toFixed(2)} h</td>
                      <td><b>{money(row.totalPay)}</b></td>
                    </tr>
                  ))}
                  <tr>
                    <td><b>Total</b></td>
                    <td />
                    <td />
                    <td><b>{round2(totals.weekdayHours).toFixed(2)} h</b></td>
                    <td><b>{round2(totals.weekendHours).toFixed(2)} h</b></td>
                    <td><b>{round2(totals.totalHours).toFixed(2)} h</b></td>
                    <td><b>{money(round2(totals.totalPay))}</b></td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="export-msg">
              {(payrollEntries.data?.length ?? 0) === 0
                ? 'No submitted daily-hour entries were found for these dates.'
                : 'Daily-hour entries were found, but none exceeded their daily standard-hours threshold. Check the overtime rules if you expected overtime.'}
            </p>
          )}
        </>
      )}
      {message && <p className={`export-msg ${message.error ? 'error' : ''}`}>{message.text}</p>}
    </div>
  )
}
