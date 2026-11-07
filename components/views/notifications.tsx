'use client'

import { Bell } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import { maintenanceDueDate, maintenanceEffectiveStatus } from '@/lib/gbi/maintenance'
import { canAccess, type UserRole } from '@/lib/gbi/roles'
import { dateTime, titleCase } from '@/lib/gbi/format'
import { PageHeading, ViewState } from '@/components/shared'

type Notification = {
  id: string
  type: string
  message: string
  related_entity_type: string | null
  is_read: boolean
  created_at: string
}

type MaintenanceAlert = {
  id: string
  status: string
  status_override: boolean
  service_date: string
  next_service_due_date: string | null
  service_type: string | null
  machine: { name: string; machine_number: string } | null
}

type RepairAlert = {
  id: string
  fault_date: string
  fault_description: string
  machine: { name: string; machine_number: string } | null
}

type InvoiceAlert = { id: string; invoice_number: string; status: string }
type ContractAlert = { id: string; contract_number: string; end_date: string }
type QueryRows<T> = { data: T[] | null; error: unknown }

function isoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function NotificationsView({ role }: { role: UserRole }) {
  const supabase = useSupabase()
  const operationalRole = role === 'administrator' || role === 'operations_manager'
  const commercialRole = canAccess('Hiring Quotations', role)
  const today = isoDate(new Date())
  const expiryLimitDate = new Date()
  expiryLimitDate.setDate(expiryLimitDate.getDate() + 30)
  const expiryLimit = isoDate(expiryLimitDate)

  const notifications = useQuery<Notification[]>(
    () =>
      supabase
        .from('notification')
        .select('id,type,message,related_entity_type,is_read,created_at')
        .order('created_at', { ascending: false })
        .limit(100) as unknown as PromiseLike<{ data: Notification[] | null; error: unknown }>,
    [],
  )

  const alerts = useQuery<Notification[]>(
    async () => {
      const noMaintenance: QueryRows<MaintenanceAlert> = { data: [], error: null }
      const noRepairs: QueryRows<RepairAlert> = { data: [], error: null }
      const noInvoices: QueryRows<InvoiceAlert> = { data: [], error: null }
      const noContracts: QueryRows<ContractAlert> = { data: [], error: null }

      const maintenanceRequest: PromiseLike<QueryRows<MaintenanceAlert>> = operationalRole
        ? (supabase
            .from('maintenance_record')
            .select('id,status,status_override,service_date,next_service_due_date,service_type,machine:machine_id(name,machine_number)')
            .order('service_date')
            .limit(100) as unknown as PromiseLike<QueryRows<MaintenanceAlert>>)
        : Promise.resolve(noMaintenance)
      const repairRequest: PromiseLike<QueryRows<RepairAlert>> = operationalRole
        ? (supabase
            .from('repair_record')
            .select('id,fault_date,fault_description,machine:machine_id(name,machine_number)')
            .eq('repair_completed', false)
            .order('fault_date', { ascending: false })
            .limit(20) as unknown as PromiseLike<QueryRows<RepairAlert>>)
        : Promise.resolve(noRepairs)
      const invoiceRequest: PromiseLike<QueryRows<InvoiceAlert>> = commercialRole
        ? (supabase
            .from('invoice')
            .select('id,invoice_number,status')
            .in('status', ['pending_approval', 'overdue'])
            .order('created_at', { ascending: false })
            .limit(20) as unknown as PromiseLike<QueryRows<InvoiceAlert>>)
        : Promise.resolve(noInvoices)
      const contractRequest: PromiseLike<QueryRows<ContractAlert>> = commercialRole
        ? (supabase
            .from('contract')
            .select('id,contract_number,end_date')
            .eq('status', 'active')
            .not('end_date', 'is', null)
            .gte('end_date', today)
            .lte('end_date', expiryLimit)
            .order('end_date')
            .limit(20) as unknown as PromiseLike<QueryRows<ContractAlert>>)
        : Promise.resolve(noContracts)

      const [maintenance, repairs, invoices, contracts] = await Promise.all([
        maintenanceRequest,
        repairRequest,
        invoiceRequest,
        contractRequest,
      ])
      const error = maintenance.error || repairs.error || invoices.error || contracts.error
      if (error) return { data: null, error }

      const rows: Notification[] = []
      for (const service of maintenance.data ?? []) {
        const status = maintenanceEffectiveStatus(service)
        if (status === 'completed') continue
        const machine = service.machine ? `${service.machine.name} (${service.machine.machine_number})` : 'Machine'
        const dueDate = maintenanceDueDate(service)
        rows.push({
          id: `service-${service.id}`,
          type: `${titleCase(status)} maintenance`,
          message: `${service.service_type ?? 'Service'} for ${machine}${dueDate ? ` is due ${dateTime(dueDate).split(' · ')[0]}.` : '.'}`,
          related_entity_type: 'maintenance',
          is_read: false,
          created_at: dueDate ?? new Date().toISOString(),
        })
      }
      for (const repair of repairs.data ?? []) {
        rows.push({
          id: `repair-${repair.id}`,
          type: 'Open repair',
          message: `${repair.machine ? `${repair.machine.name} (${repair.machine.machine_number})` : 'Machine'}: ${repair.fault_description}`,
          related_entity_type: 'repair',
          is_read: false,
          created_at: repair.fault_date,
        })
      }
      for (const invoice of invoices.data ?? []) {
        rows.push({
          id: `invoice-${invoice.id}`,
          type: invoice.status === 'overdue' ? 'Overdue invoice' : 'Invoice approval',
          message: invoice.status === 'overdue'
            ? `${invoice.invoice_number} is overdue.`
            : `${invoice.invoice_number} is awaiting approval.`,
          related_entity_type: 'invoice',
          is_read: false,
          created_at: new Date().toISOString(),
        })
      }
      for (const contract of contracts.data ?? []) {
        rows.push({
          id: `contract-${contract.id}`,
          type: 'Contract expiring',
          message: `${contract.contract_number} expires ${dateTime(contract.end_date).split(' · ')[0]}.`,
          related_entity_type: 'contract',
          is_read: false,
          created_at: contract.end_date,
        })
      }
      return { data: rows, error: null }
    },
    [role, operationalRole, commercialRole, today, expiryLimit],
  )

  const rows = [...(notifications.data ?? []), ...(alerts.data ?? [])]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 100)
  const status =
    notifications.status === 'error' || alerts.status === 'error'
      ? 'error'
      : notifications.status === 'loading' || alerts.status === 'loading'
        ? 'loading'
        : 'ready'
  const error = notifications.error || alerts.error
  const unread = rows.filter((notification) => !notification.is_read).length

  return (
    <div className="page-wrap">
      <PageHeading
        title="Notifications"
        action={
          status === 'ready' ? (
            <span className="pill-count">
              {unread} unread · {rows.length} total
            </span>
          ) : undefined
        }
      />

      <div className="panel">
        <ViewState
          status={status}
          error={error}
          isEmpty={rows.length === 0}
          title="notifications"
          loadingVariant="list"
          emptyTitle="You're all caught up"
          emptyText="No notifications to show."
          onRetry={() => {
            notifications.reload()
            alerts.reload()
          }}
        >
          <ul className="notif-list">
            {rows.map((notification) => (
              <li key={notification.id} className={notification.is_read ? '' : 'unread'}>
                <span className="notif-icon">
                  <Bell size={15} />
                </span>
                <div className="notif-body">
                  <div className="notif-top">
                    <b>{titleCase(notification.type)}</b>
                    <time>{dateTime(notification.created_at)}</time>
                  </div>
                  <p>{notification.message}</p>
                  {notification.related_entity_type && (
                    <span className="notif-tag">{titleCase(notification.related_entity_type)}</span>
                  )}
                </div>
                {!notification.is_read && <span className="unread-dot" aria-label="Unread" />}
              </li>
            ))}
          </ul>
        </ViewState>
      </div>
    </div>
  )
}
