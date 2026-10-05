// Pure billing computation : converts a verified daily-hour entry into a
// charge using the effective billing rule. Kept side-effect free so it can be
// unit-reasoned and reused by both the preview and the commit path.

export type BillingRule = {
  id: string
  contract_id: string
  effective_from: string
  effective_to: string | null
  billing_model: string
  standard_hours_per_day: number | null
  standard_rate: number
  overtime_rate: number | null
  minimum_billable_hours: number | null
  weekend_rate: number | null
  public_holiday_rate: number | null
  standby_rate: number | null
  mobilisation_charge: number | null
  demobilisation_charge: number | null
}

export type HourEntry = {
  id: string
  entry_date: string
  machine_id: string
  total_hours: number
}

export type ChargeLine = {
  daily_hour_entry_id: string
  contract_id: string
  billing_rule_id: string
  normal_hours: number
  overtime_hours: number
  normal_charge: number
  overtime_charge: number
  additional_charges: number
  total_charge: number
}

// Models the engine can price per daily-hour entry. Period-based models
// (weekly/monthly/fixed) are invoiced manually, not auto-generated, so they
// are surfaced to the user rather than silently mispriced.
export const AUTO_BILLABLE_MODELS = ['hourly', 'daily']

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Select the rule in force on a given ISO date (YYYY-MM-DD). */
export function pickRule(rules: BillingRule[], isoDate: string): BillingRule | null {
  for (const r of rules) {
    if (r.effective_from <= isoDate && (r.effective_to == null || r.effective_to >= isoDate)) {
      return r
    }
  }
  return null
}

function isWeekend(isoDate: string): boolean {
  // Parse as UTC to avoid timezone drift on date-only strings.
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay()
  return day === 0 || day === 6
}

/**
 * Compute the charge for one daily-hour entry under a rule.
 * Returns null when the rule's model is not auto-billable.
 */
export function computeCharge(entry: HourEntry, rule: BillingRule): ChargeLine | null {
  const model = rule.billing_model
  if (!AUTO_BILLABLE_MODELS.includes(model)) return null

  const total = Number(entry.total_hours) || 0
  const weekend = isWeekend(entry.entry_date)
  const baseRate = weekend && rule.weekend_rate != null ? Number(rule.weekend_rate) : Number(rule.standard_rate)

  if (model === 'daily') {
    // Flat rate for any day the machine recorded work.
    const charge = total > 0 ? round2(baseRate) : 0
    return {
      daily_hour_entry_id: entry.id,
      contract_id: rule.contract_id,
      billing_rule_id: rule.id,
      normal_hours: round2(total),
      overtime_hours: 0,
      normal_charge: charge,
      overtime_charge: 0,
      additional_charges: 0,
      total_charge: charge,
    }
  }

  // hourly
  const stdPerDay = rule.standard_hours_per_day != null ? Number(rule.standard_hours_per_day) : 8
  const minBillable = rule.minimum_billable_hours != null ? Number(rule.minimum_billable_hours) : 0
  const billable = Math.max(total, minBillable)
  const normalHours = Math.min(billable, stdPerDay)
  const overtimeHours = Math.max(0, billable - stdPerDay)
  const otRate = rule.overtime_rate != null ? Number(rule.overtime_rate) : baseRate
  const normalCharge = round2(normalHours * baseRate)
  const overtimeCharge = round2(overtimeHours * otRate)

  return {
    daily_hour_entry_id: entry.id,
    contract_id: rule.contract_id,
    billing_rule_id: rule.id,
    normal_hours: round2(normalHours),
    overtime_hours: round2(overtimeHours),
    normal_charge: normalCharge,
    overtime_charge: overtimeCharge,
    additional_charges: 0,
    total_charge: round2(normalCharge + overtimeCharge),
  }
}

export type PreviewResult = {
  lines: ChargeLine[]
  subtotal: number
  billableCount: number
  noRuleCount: number
  unsupportedCount: number
}

/** Build charge lines for a set of entries, reporting what could not be priced. */
export function buildPreview(entries: HourEntry[], rules: BillingRule[]): PreviewResult {
  const lines: ChargeLine[] = []
  let subtotal = 0
  let noRuleCount = 0
  let unsupportedCount = 0

  for (const entry of entries) {
    const rule = pickRule(rules, entry.entry_date)
    if (!rule) {
      noRuleCount++
      continue
    }
    const line = computeCharge(entry, rule)
    if (!line) {
      unsupportedCount++
      continue
    }
    lines.push(line)
    subtotal += line.total_charge
  }

  return {
    lines,
    subtotal: round2(subtotal),
    billableCount: lines.length,
    noRuleCount,
    unsupportedCount,
  }
}

export { round2 }
