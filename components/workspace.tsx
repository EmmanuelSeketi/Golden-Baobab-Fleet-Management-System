'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart3,
  Bell,
  Building2,
  ChevronRight,
  Clock,
  Hammer,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  ReceiptText,
  ScrollText,
  Search,
  Timer,
  Truck,
  Users,
  Wrench,
  X,
} from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import {
  type AppUser,
  type Module,
  ROLE_ACCESS_SUMMARY,
  ROLE_LABEL,
  canAccess,
  firstNameOf,
  initialsOf,
} from '@/lib/gbi/roles'
import { OverviewView } from '@/components/views/overview'
import { DailyHoursView } from '@/components/views/daily-hours'
import { FleetView } from '@/components/views/fleet'
import { OperatorsView } from '@/components/views/operators'
import { OvertimeView } from '@/components/views/overtime'
import { ContractsView } from '@/components/views/contracts'
import { BillingView } from '@/components/views/billing'
import { ReportsView } from '@/components/views/reports'
import { MaintenanceView } from '@/components/views/maintenance'
import { RepairsView } from '@/components/views/repairs'
import { NotificationsView } from '@/components/views/notifications'
import { AuditView } from '@/components/views/audit'

type NavItem = { module: Module; label: string; zh: string; icon: React.ElementType }
type NavGroup = { group: string; zh: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    group: 'Workspace',
    zh: '工作区',
    items: [
      { module: 'Overview', label: 'Overview', zh: '概览', icon: LayoutDashboard },
      { module: 'Daily Hours', label: 'Daily Working Hours', zh: '每日工时', icon: Clock },
      { module: 'Fleet', label: 'Fleet Register', zh: '车队登记', icon: Truck },
      { module: 'Operators', label: 'Operators', zh: '操作员', icon: Users },
      { module: 'Overtime', label: 'Operator Overtime', zh: '操作员加班', icon: Timer },
    ],
  },
  {
    group: 'Commercial',
    zh: '商务',
    items: [
      { module: 'Customers & Contracts', label: 'Customers & Contracts', zh: '客户与合同', icon: Building2 },
      { module: 'Billing & Invoices', label: 'Billing & Invoices', zh: '账单与发票', icon: ReceiptText },
      { module: 'Reports', label: 'Reports', zh: '报表', icon: BarChart3 },
    ],
  },
  {
    group: 'Assets',
    zh: '资产',
    items: [
      { module: 'Maintenance', label: 'Maintenance', zh: '保养', icon: Wrench },
      { module: 'Repairs', label: 'Repairs', zh: '维修', icon: Hammer },
    ],
  },
  {
    group: 'Governance',
    zh: '治理',
    items: [
      { module: 'Notifications', label: 'Notifications', zh: '通知', icon: Bell },
      { module: 'Audit Log', label: 'Audit Log', zh: '审计日志', icon: ScrollText },
    ],
  },
]

type Lang = 'en' | 'zh'

export function Workspace({ profile, email }: { profile: AppUser; email: string }) {
  const supabase = useSupabase()
  const router = useRouter()
  const [active, setActive] = useState<Module>('Overview')
  const [menuOpen, setMenuOpen] = useState(false)
  const [lang, setLang] = useState<Lang>('en')
  const [signingOut, setSigningOut] = useState(false)

  // Filter navigation to what this role may actually read (mirrors RLS).
  const groups = useMemo(
    () =>
      NAV.map((g) => ({
        ...g,
        items: g.items.filter((i) => canAccess(i.module, profile.role)),
      })).filter((g) => g.items.length > 0),
    [profile.role],
  )

  const activeItem = useMemo(() => {
    for (const g of groups) {
      const found = g.items.find((i) => i.module === active)
      if (found) return { group: g, item: found }
    }
    return null
  }, [groups, active])

  async function signOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
    // Full navigation so middleware re-evaluates and blocks the workspace by
    // URL after the session cookie is cleared.
    router.replace('/auth/login')
    router.refresh()
  }

  function go(module: Module) {
    setActive(module)
    setMenuOpen(false)
  }

  const initials = initialsOf(profile.full_name)

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="brand-logo"
            src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Golden%20Baobab%20Logo.PNG-feY7yBqBZci35dpQ1RqzakSO62Ya8F.png"
            alt="GBI Group"
          />
          <div>
            <strong>GBI Group</strong>
            <span>Fleet Operations</span>
          </div>
          <button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <nav>
          {groups.map((g) => (
            <div className="nav-group" key={g.group}>
              <small>{lang === 'zh' ? g.zh : g.group}</small>
              {g.items.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.module}
                    className={`nav-item ${active === item.module ? 'active' : ''}`}
                    onClick={() => go(item.module)}
                  >
                    <Icon size={16} />
                    {lang === 'zh' ? item.zh : item.label}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sync">
            <span className="online-dot" />
            {ROLE_ACCESS_SUMMARY[profile.role]}
          </div>
          <button className="help" onClick={signOut} disabled={signingOut}>
            <LogOut size={14} />
            {signingOut ? 'Signing out…' : lang === 'zh' ? '退出登录' : 'Sign out'}
          </button>
        </div>
      </aside>

      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}

      <div className="main-content">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <b>{lang === 'zh' ? activeItem?.group.zh : activeItem?.group.group}</b>
            <ChevronRight size={13} />
            <strong>{lang === 'zh' ? activeItem?.item.zh : activeItem?.item.label}</strong>
          </div>
          <div className="top-actions">
            <div className="language-switcher">
              <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>
                EN
              </button>
              <button className={lang === 'zh' ? 'active' : ''} onClick={() => setLang('zh')}>
                中文
              </button>
            </div>
            <div className="top-search">
              <Search size={15} />
              <input placeholder={lang === 'zh' ? '搜索…' : 'Search fleet, operators…'} />
            </div>
            <button className="icon-button" aria-label="Notifications" onClick={() => go('Notifications')}>
              <Bell size={18} />
              <i />
            </button>
            <div className="account-pill" title={`${profile.full_name} · ${email}`}>
              <div className="avatar">{initials}</div>
              <div className="account-meta">
                <b>{profile.full_name}</b>
                <span>{ROLE_LABEL[profile.role]}</span>
              </div>
            </div>
          </div>
        </header>

        <ActiveView
          module={active}
          role={profile.role}
          userId={profile.id}
          fullName={profile.full_name}
        />
      </div>
    </div>
  )
}

function ActiveView({
  module,
  role,
  userId,
  fullName,
}: {
  module: Module
  role: AppUser['role']
  userId: string
  fullName: string
}) {
  // Defense in depth: even though nav is filtered, never render a module this
  // role cannot access (RLS is the final backstop for the data itself).
  if (!canAccess(module, role)) {
    return (
      <div className="page-wrap">
        <div className="data-state error-state">
          <div>
            <b>Access restricted</b>
            <p>Your role does not have access to this area.</p>
          </div>
        </div>
      </div>
    )
  }

  switch (module) {
    case 'Overview':
      return <OverviewView role={role} fullName={fullName} />
    case 'Daily Hours':
      return <DailyHoursView />
    case 'Fleet':
      return <FleetView role={role} userId={userId} />
    case 'Operators':
      return <OperatorsView role={role} userId={userId} />
    case 'Overtime':
      return <OvertimeView />
    case 'Customers & Contracts':
      return <ContractsView />
    case 'Billing & Invoices':
      return <BillingView />
    case 'Reports':
      return <ReportsView role={role} />
    case 'Maintenance':
      return <MaintenanceView />
    case 'Repairs':
      return <RepairsView />
    case 'Notifications':
      return <NotificationsView />
    case 'Audit Log':
      return <AuditView />
    default:
      return null
  }
}
