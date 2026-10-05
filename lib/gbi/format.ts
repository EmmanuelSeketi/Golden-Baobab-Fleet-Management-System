// Shared formatting + status mapping so every view renders live values the
// same way. No fallback/mock values live here : helpers return explicit
// placeholders ("N/A") for genuinely missing data, never invented numbers.

export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'neutral'

export function friendlyError(error: unknown): string {
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String((error as { message: unknown }).message)
      : ''
  // RLS denials surface as permission errors : tell the user it is access,
  // not a fabricated success.
  if (/permission|rls|policy|denied/i.test(message)) {
    return 'You do not have access to this data, or your session has expired.'
  }
  return 'We could not load this data. Check your connection and try again.'
}

const ZMW = new Intl.NumberFormat('en-ZM', {
  style: 'currency',
  currency: 'ZMW',
  maximumFractionDigits: 0,
})

export function money(value: number | null | undefined, currency = 'ZMW'): string {
  if (value == null || Number.isNaN(Number(value))) return 'N/A'
  if (currency === 'ZMW') return ZMW.format(Number(value))
  return new Intl.NumberFormat('en-ZM', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value))
}

export function hours(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return 'N/A'
  return `${Number(value).toLocaleString('en-ZM', { maximumFractionDigits: 1 })} h`
}

export function meter(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return 'N/A'
  return `${Number(value).toLocaleString('en-ZM', { maximumFractionDigits: 1 })} h`
}

export function shortDate(value: string | null | undefined): string {
  if (!value) return 'N/A'
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  if (Number.isNaN(d.getTime())) return 'N/A'
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return 'N/A'
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  if (Number.isNaN(d.getTime())) return 'N/A'
  return `${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)} · ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

export function titleCase(value: string | null | undefined): string {
  if (!value) return 'N/A'
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

const MACHINE_STATUS_TONE: Record<string, Tone> = {
  working: 'green',
  on_hire: 'green',
  available: 'blue',
  under_maintenance: 'amber',
  under_repair: 'amber',
  breakdown: 'red',
  parked: 'neutral',
}

export function machineStatusTone(status: string): Tone {
  return MACHINE_STATUS_TONE[status] ?? 'neutral'
}

const CONTRACT_STATUS_TONE: Record<string, Tone> = {
  active: 'green',
  draft: 'neutral',
  expired: 'amber',
  terminated: 'red',
}

export function contractStatusTone(status: string): Tone {
  return CONTRACT_STATUS_TONE[status] ?? 'neutral'
}

const INVOICE_STATUS_TONE: Record<string, Tone> = {
  draft: 'neutral',
  pending_approval: 'blue',
  approved: 'blue',
  finalized: 'green',
  paid: 'green',
  overdue: 'red',
  void: 'red',
}

export function invoiceStatusTone(status: string): Tone {
  return INVOICE_STATUS_TONE[status] ?? 'neutral'
}

const MAINTENANCE_STATUS_TONE: Record<string, Tone> = {
  upcoming: 'blue',
  due: 'amber',
  overdue: 'red',
  completed: 'green',
}

export function maintenanceStatusTone(status: string): Tone {
  return MAINTENANCE_STATUS_TONE[status] ?? 'neutral'
}

export const OPERATOR_STATUS_LABEL: Record<string, string> = {
  working: 'Working',
  off: 'Off',
  standby: 'Standby',
}

const OPERATOR_STATUS_TONE: Record<string, Tone> = {
  working: 'green',
  standby: 'amber',
  off: 'neutral',
}

export function operatorStatusTone(status: string | null | undefined): Tone {
  return OPERATOR_STATUS_TONE[status ?? ''] ?? 'neutral'
}
