export type MaintenanceStatus = 'upcoming' | 'due' | 'overdue' | 'completed'

export type MaintenanceStatusInput = {
  status: string
  status_override: boolean
  service_date: string
  next_service_due_date: string | null
}

function localDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function maintenanceStatusForDate(
  dueDate: string | null | undefined,
  now = new Date(),
): MaintenanceStatus {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return 'upcoming'
  const today = localDate(now)
  if (dueDate < today) return 'overdue'
  if (dueDate === today) return 'due'
  return 'upcoming'
}

export function maintenanceDueDate(record: MaintenanceStatusInput): string | null {
  if (record.status === 'completed') {
    return record.next_service_due_date
  }
  return record.service_date || null
}

export function maintenanceEffectiveStatus(
  record: MaintenanceStatusInput,
  now = new Date(),
): MaintenanceStatus {
  if (record.status === 'completed') {
    return record.next_service_due_date
      ? maintenanceStatusForDate(record.next_service_due_date, now)
      : 'completed'
  }

  if (record.status_override) {
    return isMaintenanceStatus(record.status) ? record.status : 'upcoming'
  }

  return maintenanceStatusForDate(record.service_date, now)
}

function isMaintenanceStatus(status: string): status is MaintenanceStatus {
  return status === 'upcoming' || status === 'due' || status === 'overdue' || status === 'completed'
}
