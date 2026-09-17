// Role model + module access, kept in lockstep with rls_policies.sql so the UI
// never offers a page the database would reject anyway. RLS remains the real
// enforcement boundary; this only shapes what is shown and reachable client side.

export type UserRole =
  | 'administrator'
  | 'operations_manager'
  | 'management'
  | 'accounts_billing'

export type AppUser = {
  id: string
  full_name: string
  role: UserRole
  is_active: boolean
}

export type Module =
  | 'Overview'
  | 'Daily Hours'
  | 'Fleet'
  | 'Operators'
  | 'Projects'
  | 'Overtime'
  | 'Machine History'
  | 'Calendar'
  | 'Customers & Contracts'
  | 'Billing & Invoices'
  | 'Reports'
  | 'Maintenance'
  | 'Repairs'
  | 'Notifications'
  | 'Audit Log'
  | 'Settings'

export const ROLE_LABEL: Record<UserRole, string> = {
  administrator: 'Administrator',
  operations_manager: 'Operations Manager',
  management: 'Management',
  accounts_billing: 'Accounts & Billing',
}

export const ROLE_ACCESS_SUMMARY: Record<UserRole, string> = {
  administrator: 'Full system access',
  operations_manager: 'Operations & fleet access',
  management: 'Read-only, all areas',
  accounts_billing: 'Commercial & billing access',
}

// Commercial tables (customer/contract/billing/invoice) exclude operations_manager.
const COMMERCIAL_ROLES: UserRole[] = ['administrator', 'management', 'accounts_billing']
// audit_log is admin + management only.
const AUDIT_ROLES: UserRole[] = ['administrator', 'management']

const MODULE_ROLES: Partial<Record<Module, UserRole[]>> = {
  'Customers & Contracts': COMMERCIAL_ROLES,
  'Billing & Invoices': COMMERCIAL_ROLES,
  'Audit Log': AUDIT_ROLES,
  Settings: ['administrator'],
}

export function canAccess(module: Module, role: UserRole): boolean {
  const allowed = MODULE_ROLES[module]
  return allowed ? allowed.includes(role) : true
}

// Write access to operational tables (machine, operator, …) mirrors the RLS
// insert policy: administrator + operations_manager only. Management is
// read-only, so it never sees create/edit controls.
export function canManageOps(role: UserRole): boolean {
  return role === 'administrator' || role === 'operations_manager'
}

// Write access to commercial tables (customer, contract, contract_machine,
// billing_rule, billing_entry, invoice, invoice_adjustment) mirrors the RLS
// insert/update policy: administrator + accounts_billing only. Management has
// read-only commercial access; operations_manager has none.
export function canManageCommercial(role: UserRole): boolean {
  return role === 'administrator' || role === 'accounts_billing'
}

// Projects are operational records (operations logs daily hours against them;
// commercial only links them to customers for billing). Write access mirrors
// the RLS insert/update policy for the project table — administrator +
// operations_manager only. Management stays read-only; all roles may read.
export function canManageProjects(role: UserRole): boolean {
  return role === 'administrator' || role === 'operations_manager'
}

// overtime_rule configuration is administrator-only per RLS.
export function canManageOvertimeRules(role: UserRole): boolean {
  return role === 'administrator'
}

// Generating overtime entries writes overtime_entry, grouped with the
// operational write policy (administrator + operations_manager).
export function canGenerateOvertime(role: UserRole): boolean {
  return role === 'administrator' || role === 'operations_manager'
}

// Reviewing overtime is a management sign-off; administrators and operations
// managers may also clear the queue.
export function canReviewOvertime(role: UserRole): boolean {
  return role === 'administrator' || role === 'management' || role === 'operations_manager'
}

export function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function firstNameOf(name: string): string {
  return name.split(' ').filter(Boolean)[0] ?? name
}
