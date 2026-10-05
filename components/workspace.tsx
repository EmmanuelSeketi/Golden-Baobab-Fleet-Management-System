'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart3,
  Bell,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  Clock,
  ChevronDown,
  FolderKanban,
  Hammer,
  History,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  FileText,
  ScrollText,
  Search,
  Settings,
  Timer,
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
import { ProjectsView } from '@/components/views/projects'
import { EquipmentLifecycleView } from '@/components/views/equipment-lifecycle'
import { MachineHistoryView } from '@/components/views/machine-history'
import { CalendarView } from '@/components/views/calendar'
import { OvertimeView } from '@/components/views/overtime'
import { ContractsView } from '@/components/views/contracts'
import { BillingView } from '@/components/views/billing'
import { ReportsView } from '@/components/views/reports'
import { MaintenanceView } from '@/components/views/maintenance'
import { RepairsView } from '@/components/views/repairs'
import { NotificationsView } from '@/components/views/notifications'
import { AuditView } from '@/components/views/audit'
import { SettingsView } from '@/components/views/settings'
import { LangProvider, useLang } from '@/lib/i18n'
import { Localizer } from '@/components/localizer'

type NavItem = {
  module: Module
  label: string
  zh: string
  icon?: React.ElementType
  iconSrc?: string
}
type NavGroup = { group: string; zh: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    group: 'Workspace',
    zh: '工作区',
    items: [
      { module: 'Overview', label: 'Dashboard', zh: '仪表板', icon: LayoutDashboard },
      { module: 'Daily Hours', label: 'Daily Working Hours', zh: '每日工时', icon: Clock },
      { module: 'Fleet', label: 'Fleet Register', zh: '车队登记', iconSrc: '/icons/fleet.svg' },
      { module: 'Projects', label: 'Projects & Sites', zh: '项目与工地', icon: FolderKanban },
      { module: 'Equipment Lifecycle', label: 'Equipment Lifecycle', zh: '设备生命周期', icon: ClipboardCheck },
      { module: 'Machine History', label: 'Machine History', zh: '机器历史', icon: History },
      { module: 'Operators', label: 'Operators', zh: '操作员', iconSrc: '/icons/operator.svg' },
      { module: 'Overtime', label: 'Operator Overtime', zh: '操作员加班', icon: Timer },
    ],
  },
  {
    group: 'Commercial',
    zh: '商务',
    items: [
      { module: 'Customers & Contracts', label: 'Customers & Contracts', zh: '客户与合同', iconSrc: '/icons/contracts.svg' },
      { module: 'Hiring Quotations', label: 'Hiring Quotations', zh: '租赁报价', icon: FileText },
      { module: 'Reports', label: 'Reports', zh: '报表', icon: BarChart3 },
    ],
  },
  {
    group: 'Assets',
    zh: '资产',
    items: [
      { module: 'Maintenance', label: 'Maintenance', zh: '保养', icon: Wrench },
      { module: 'Repairs', label: 'Repairs', zh: '维修', icon: Hammer },
      { module: 'Calendar', label: 'Calendar', zh: '日历', icon: CalendarDays },
    ],
  },
  {
    group: 'Governance',
    zh: '治理',
    items: [
      { module: 'Notifications', label: 'Notifications', zh: '通知', icon: Bell },
      { module: 'Audit Log', label: 'Audit Log', zh: '审计日志', icon: ScrollText },
      { module: 'Settings', label: 'Settings & Backup', zh: '设置与备份', icon: Settings },
    ],
  },
]

export function Workspace({ profile, email }: { profile: AppUser; email: string }) {
  return (
    <LangProvider>
      <Localizer />
      <WorkspaceInner profile={profile} email={email} />
    </LangProvider>
  )
}

function WorkspaceInner({ profile, email }: { profile: AppUser; email: string }) {
  const supabase = useSupabase()
  const router = useRouter()
  const [active, setActive] = useState<Module>('Overview')
  const [menuOpen, setMenuOpen] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set())
  const [topbarScrolled, setTopbarScrolled] = useState(false)
  const { lang, setLang } = useLang()
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    const updateScrollState = () => setTopbarScrolled(window.scrollY > 0)
    updateScrollState()
    window.addEventListener('scroll', updateScrollState, { passive: true })
    return () => window.removeEventListener('scroll', updateScrollState)
  }, [])

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

  function toggleGroup(group: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  const initials = initialsOf(profile.full_name)

  return (
    <div className="app-shell">
      <aside lang={lang} className={`sidebar ${menuOpen ? 'open' : ''}`}>
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
              <button
                type="button"
                className="nav-group-toggle"
                aria-expanded={!collapsedGroups.has(g.group)}
                aria-controls={`nav-group-${g.group.toLowerCase()}`}
                onClick={() => toggleGroup(g.group)}
              >
                <span>{lang === 'zh' ? g.zh : g.group}</span>
                <ChevronDown
                  size={14}
                  className={collapsedGroups.has(g.group) ? 'collapsed' : ''}
                />
              </button>
              <div
                id={`nav-group-${g.group.toLowerCase()}`}
                hidden={collapsedGroups.has(g.group)}
              >
                {g.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.module}
                      className={`nav-item ${active === item.module ? 'active' : ''}`}
                      onClick={() => go(item.module)}
                    >
                      {item.iconSrc ? (
                        <img src={item.iconSrc} alt="" width={22} height={22} />
                      ) : Icon ? (
                        <Icon size={16} />
                      ) : null}
                      {lang === 'zh' ? item.zh : item.label}
                    </button>
                  )
                })}
              </div>
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
        <header className={`topbar${topbarScrolled ? ' topbar-scrolled' : ''}`}>
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
      return <DailyHoursView role={role} userId={userId} />
    case 'Fleet':
      return <FleetView role={role} userId={userId} />
    case 'Operators':
      return <OperatorsView role={role} userId={userId} />
    case 'Projects':
      return <ProjectsView role={role} userId={userId} />
    case 'Equipment Lifecycle':
      return <EquipmentLifecycleView role={role} userId={userId} />
    case 'Machine History':
        return <MachineHistoryView />
      case 'Calendar':
        return <CalendarView />
    case 'Overtime':
      return <OvertimeView role={role} userId={userId} />
    case 'Customers & Contracts':
      return <ContractsView role={role} userId={userId} />
    case 'Hiring Quotations':
      return <BillingView role={role} userId={userId} />
    case 'Reports':
      return <ReportsView role={role} />
    case 'Maintenance':
      return <MaintenanceView role={role} userId={userId} />
    case 'Repairs':
      return <RepairsView role={role} userId={userId} />
    case 'Notifications':
      return <NotificationsView />
    case 'Audit Log':
      return <AuditView />
    case 'Settings':
      return <SettingsView userId={userId} />
    default:
      return null
  }
}
