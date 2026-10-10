// Pure overtime computation : derives an operator's overtime hours and pay for
// a single daily-hour entry against the effective overtime rule. Side-effect
// free so the preview and the commit path share identical maths.

export type OvertimeRule = {
  id: string
  name: string
  effective_from: string
  effective_to: string | null
  standard_hours_per_day: number | null
  weekday_rate_multiplier: number | null
  saturday_rate_multiplier: number | null
  sunday_rate_multiplier: number | null
  public_holiday_rate_multiplier: number | null
  operator_category: string | null
  base_hourly_rate: number | null
}

export type OvertimeSourceEntry = {
  id: string
  entry_date: string
  operator_id: string | null
  total_hours: number
  base_salary?: number | null
}

export type OvertimeLine = {
  daily_hour_entry_id: string
  operator_id: string
  overtime_rule_id: string
  standard_hours: number
  overtime_hours: number
  overtime_pay: number
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

// Daily threshold fallback used before an effective overtime rule is configured.
// Pay uses the operator's current monthly salary; a missing salary yields 0.
export const DEFAULT_STANDARD_HOURS = 8
export const DEFAULT_WEEKDAY_MULTIPLIER = 1.5
export const OVERTIME_MONTHLY_HOURS = 208

/** Rule in force on a date; operator_category null = applies to all operators. */
export function pickOvertimeRule(rules: OvertimeRule[], isoDate: string): OvertimeRule | null {
  for (const r of rules) {
    if (r.effective_from <= isoDate && (r.effective_to == null || r.effective_to >= isoDate)) {
      return r
    }
  }
  return null
}

export function overtimeDayMultiplier(isoDate: string): number {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay()
  return day === 0 || day === 6 ? 2 : DEFAULT_WEEKDAY_MULTIPLIER
}

/**
 * Compute an overtime line for an entry. Returns null when the entry has no
 * operator or produced no overtime (nothing to record).
 */
export function computeOvertime(entry: OvertimeSourceEntry, rule: OvertimeRule): OvertimeLine | null {
  if (!entry.operator_id) return null
  const total = Number(entry.total_hours) || 0
  const std = rule.standard_hours_per_day != null ? Number(rule.standard_hours_per_day) : 8
  const overtimeHours = Math.max(0, total - std)
  if (overtimeHours <= 0) return null

  const standardHours = Math.min(total, std)
  const baseSalary = entry.base_salary != null ? Number(entry.base_salary) : 0
  const hourlyWage = baseSalary / OVERTIME_MONTHLY_HOURS
  const multiplier = overtimeDayMultiplier(entry.entry_date)
  const pay = round2(overtimeHours * hourlyWage * multiplier)

  return {
    daily_hour_entry_id: entry.id,
    operator_id: entry.operator_id,
    overtime_rule_id: rule.id,
    standard_hours: round2(standardHours),
    overtime_hours: round2(overtimeHours),
    overtime_pay: pay,
  }
}

export type DerivedOvertime = {
  standardHours: number
  overtimeHours: number
  overtimePay: number
  ruleId: string | null
  ruleName: string | null
  weekdayMultiplier: number
  hasRealRule: boolean
}

/**
 * Derive an operator's overtime for a single daily entry for DISPLAY purposes.
 * Unlike computeOvertime, this never requires a configured rule: when none is
 * in force it falls back to the default standard hours and multiplier so the
 * overtime page always reflects hours worked beyond standard. Returns null only
 * when there is no operator or no overtime to show.
 */
export function deriveOvertime(entry: OvertimeSourceEntry, rule: OvertimeRule | null): DerivedOvertime | null {
  if (!entry.operator_id) return null
  const total = Number(entry.total_hours) || 0
  const std = rule?.standard_hours_per_day != null ? Number(rule.standard_hours_per_day) : DEFAULT_STANDARD_HOURS
  const overtimeHours = Math.max(0, total - std)
  if (overtimeHours <= 0) return null

  const standardHours = Math.min(total, std)
  const baseSalary = entry.base_salary != null ? Number(entry.base_salary) : 0
  const hourlyWage = baseSalary / OVERTIME_MONTHLY_HOURS
  const multiplier = overtimeDayMultiplier(entry.entry_date)
  const pay = round2(overtimeHours * hourlyWage * multiplier)

  return {
    standardHours: round2(standardHours),
    overtimeHours: round2(overtimeHours),
    overtimePay: pay,
    ruleId: rule?.id ?? null,
    ruleName: rule?.name ?? null,
    weekdayMultiplier: multiplier,
    hasRealRule: !!rule,
  }
}

export type OvertimePreview = {
  lines: OvertimeLine[]
  totalPay: number
  totalHours: number
  noRuleCount: number
  noOperatorCount: number
}

export function buildOvertimePreview(
  entries: OvertimeSourceEntry[],
  rules: OvertimeRule[],
): OvertimePreview {
  const lines: OvertimeLine[] = []
  let totalPay = 0
  let totalHours = 0
  let noRuleCount = 0
  let noOperatorCount = 0

  for (const entry of entries) {
    if (!entry.operator_id) {
      noOperatorCount++
      continue
    }
    const rule = pickOvertimeRule(rules, entry.entry_date)
    if (!rule) {
      noRuleCount++
      continue
    }
    const line = computeOvertime(entry, rule)
    if (!line) continue
    lines.push(line)
    totalPay += line.overtime_pay
    totalHours += line.overtime_hours
  }

  return { lines, totalPay: round2(totalPay), totalHours: round2(totalHours), noRuleCount, noOperatorCount }
}

export { round2 }
