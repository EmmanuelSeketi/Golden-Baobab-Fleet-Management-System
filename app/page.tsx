'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, BookOpen, CalendarDays, Check, ChevronDown,
  ClipboardCheck, Clock3, FileBarChart, FileText, Fuel, Gauge, History, LayoutDashboard, Menu,
  MoreHorizontal, PackageCheck, Plus, Search, Settings, ShieldCheck, SlidersHorizontal, Truck,
  Users, Wrench, X, CircleDollarSign, CircleHelp, CircleDot
} from 'lucide-react'

type Module = 'Overview' | 'Daily Hours' | 'Fleet' | 'Operators' | 'Customers & Contracts' | 'Billing & Invoices' | 'Maintenance' | 'Reports' | 'Audit Log'

type HourRow = { id: string; machine: string; code: string; operator: string; project: string; start: number; end: number; status: string; note?: string }

const navGroups = [
  { label: 'Workspace', items: [{ label: 'Overview', icon: LayoutDashboard }, { label: 'Daily Hours', icon: Clock3 }, { label: 'Fleet', icon: Truck }, { label: 'Operators', icon: Users }] },
  { label: 'Commercial', items: [{ label: 'Customers & Contracts', icon: FileText }, { label: 'Billing & Invoices', icon: CircleDollarSign }, { label: 'Reports', icon: FileBarChart }] },
  { label: 'Assets', items: [{ label: 'Maintenance', icon: Wrench }, { label: 'Repairs', icon: ClipboardCheck }, { label: 'Calendar', icon: CalendarDays }] },
  { label: 'Governance', items: [{ label: 'Notifications', icon: Bell }, { label: 'Audit Log', icon: History }, { label: 'Settings', icon: Settings }] },
]

const uiTranslations: Record<string, string> = {
  'Fleet operations': '车队运营', 'Full operational access': '完整运营权限', 'All systems operational': '所有系统运行正常', 'Help centre': '帮助中心',
  'Good morning, Thabo': '早上好，Thabo', 'Here is what is happening across the Golden Baobab fleet today.': '以下是今天 Golden Baobab 车队的运营情况。', 'Record hours': '记录工时',
  'Active machines': '运行中的设备', 'Hours recorded today': '今日记录工时', 'Unbilled value': '未开票金额', 'Maintenance due': '待维护', 'fleet availability': '车队可用率', 'Across 24 machines': '覆盖 24 台设备', 'From 6 open periods': '来自 6 个未结算周期', '2 due within 48 hours': '2 台设备将在 48 小时内到期',
  'Fleet utilisation': '车队利用率', 'Recorded operating hours · Last 7 days': '记录运营工时 · 最近 7 天', 'This week': '本周', 'Billable hours': '可计费工时', 'Non-billable hours': '不可计费工时', '486 total hours': '共 486 小时',
  'Fleet status': '车队状态', 'Live equipment availability': '设备实时可用性', 'total assets': '资产总数', 'Operating': '运行中', 'Standby': '待机', 'Maintenance': '维护中', 'Off hire': '停租', 'View fleet': '查看车队',
  'Maintenance watchlist': '维护关注列表', 'Next service events requiring attention': '需要关注的下次维护事件', 'See all': '查看全部', 'Recent activity': '最近活动', 'Latest changes across the system': '系统中的最新变更', 'Audit log': '审计日志', '2 items need your attention': '有 2 项需要关注', '1 meter validation exception and 1 contract expiring within 90 days.': '1 个仪表验证异常和 1 个将在 90 天内到期的合同。', 'Review items': '查看项目',
  'Daily working hours': '每日工作工时', 'Capture one verified operational record for every machine on site.': '为现场每台设备记录一条已验证的运营记录。', 'Saved just now': '刚刚保存', 'Unsaved changes': '未保存的更改', 'Save all changes': '保存所有更改', 'In progress': '进行中', 'Machines': '设备', 'Recorded': '已记录', 'Total hours': '总工时', 'Exceptions': '异常', 'to review': '待审核', 'Start meter': '起始仪表', 'End meter': '结束仪表', 'Validation': '验证', 'Verified': '已验证', 'Needs review': '需要审核', 'Validation rules active': '验证规则已启用',
  'Fleet register': '车队登记', '34 tracked machines, availability, utilisation and service intervals.': '34 台受追踪设备、可用性、利用率和维护周期。', 'Add machine': '添加设备', 'Search fleet register': '搜索车队登记', 'All types': '所有类型', 'All statuses': '所有状态', 'More filters': '更多筛选', 'Current site': '当前位置', 'Next service': '下次维护', 'Service due': '待维护', 'Due now': '立即到期',
  'Customers & contracts': '客户与合同', 'Active customer agreements, effective-dated rates and deployed assets.': '有效客户协议、生效日期费率和已部署资产。', 'New contract': '新建合同', 'Active customers': '活跃客户', 'Active contracts': '有效合同', 'Expiring in 90 days': '90 天内到期', 'Review renewal terms': '查看续约条款', 'Contract register': '合同登记', 'Export register': '导出登记', 'Contract ref': '合同编号', 'Normal rate': '标准费率', 'Expiry': '到期日', 'Expiring soon': '即将到期',
  'Billing & invoices': '账单与发票', 'Reports & analytics': '报告与分析', 'Maintenance planning': '维护计划', 'Audit trail': '审计轨迹', 'Open report': '打开报告', 'Build report': '生成报告', 'Overview': '总览', 'Daily Hours': '每日工时', 'Fleet': '车队', 'Operators': '操作员', 'Customers & Contracts': '客户与合同', 'Billing & Invoices': '账单与发票', 'Reports': '报告', 'Maintenance': '维护', 'Repairs': '维修', 'Calendar': '日历', 'Notifications': '通知', 'Audit Log': '审计日志', 'Settings': '设置', 'Workspace': '工作区', 'Commercial': '商务', 'Assets': '资产', 'Governance': '治理', 'Monday, 14 July 2025': '2025 年 7 月 14 日，星期一', 'Record hours': '记录工时', 'View fleet': '查看车队', 'This week': '本周', 'See all': '查看全部', 'Audit log': '审计日志', 'Review items': '查看项目', 'Good morning, Thabo': '早上好，Thabo', 'Operations / Daily log': '运营 / 每日记录', 'Assets / Fleet register': '资产 / 车队登记', 'Commercial / Customer master': '商务 / 客户主数据', 'Commercial / Revenue': '商务 / 收入', 'Insights / Reporting': '洞察 / 报告', 'Assets / Maintenance': '资产 / 维护', 'Governance / Compliance': '治理 / 合规'
}

const initialHours: HourRow[] = [
  { id: '1', machine: 'CAT 320 GC', code: 'GB-EX-001', operator: 'Mandla Ndlovu', project: 'Mokopane Solar Farm', start: 4281, end: 4289, status: 'verified' },
  { id: '2', machine: 'Komatsu PC210', code: 'GB-EX-004', operator: 'Thabo Mokoena', project: 'Mokopane Solar Farm', start: 6150, end: 6157, status: 'verified' },
  { id: '3', machine: 'JCB 3CX', code: 'GB-BH-008', operator: '—', project: 'Rustenburg Roads', start: 1922, end: 1922, status: 'warning', note: 'No activity recorded' },
  { id: '4', machine: 'Volvo A30G', code: 'GB-DT-002', operator: 'Sipho Dlamini', project: 'Limpopo Aggregates', start: 7820, end: 7831, status: 'verified' },
  { id: '5', machine: 'CAT 140K', code: 'GB-GR-003', operator: 'Lerato Molefe', project: 'Rustenburg Roads', start: 3310, end: 3307, status: 'error', note: 'End meter cannot be lower than start' },
  { id: '6', machine: 'Bomag BW213', code: 'GB-RL-006', operator: 'Kabelo Sefako', project: 'Klerksdorp Industrial', start: 980, end: 987, status: 'verified' },
]

const fleet = [
  { machine: 'CAT 320 GC', code: 'GB-EX-001', type: 'Excavator', site: 'Mokopane Solar Farm', state: 'Operating', hours: '4,289 h', next: '48 h' },
  { machine: 'Komatsu PC210', code: 'GB-EX-004', type: 'Excavator', site: 'Mokopane Solar Farm', state: 'Operating', hours: '6,157 h', next: '122 h' },
  { machine: 'Volvo A30G', code: 'GB-DT-002', type: 'Dumper', site: 'Limpopo Aggregates', state: 'Operating', hours: '7,831 h', next: '9 h' },
  { machine: 'JCB 3CX', code: 'GB-BH-008', type: 'Backhoe Loader', site: 'Rustenburg Roads', state: 'Standby', hours: '1,922 h', next: '78 h' },
  { machine: 'CAT 140K', code: 'GB-GR-003', type: 'Grader', site: 'Rustenburg Roads', state: 'Service due', hours: '3,307 h', next: 'Due now' },
]

const operators = [
  { name: 'Mandla Ndlovu', code: 'OP-001', phone: '+27 71 482 1902', licence: 'Code C · valid', project: 'Mokopane Solar Farm', status: 'Active', hours: '142.5 h' },
  { name: 'Thabo Mokoena', code: 'OP-002', phone: '+27 82 314 8871', licence: 'Code C · valid', project: 'Mokopane Solar Farm', status: 'Active', hours: '136.0 h' },
  { name: 'Sipho Dlamini', code: 'OP-003', phone: '+27 76 229 4401', licence: 'Code C · expires Aug 2026', project: 'Limpopo Aggregates', status: 'Active', hours: '128.0 h' },
  { name: 'Lerato Molefe', code: 'OP-004', phone: '+27 79 654 2230', licence: 'Code C · valid', project: 'Rustenburg Roads', status: 'On leave', hours: '94.0 h' },
]

const contracts = [
  { customer: 'Mokopane Solar Farm', ref: 'MSF-24-018', machines: 4, rate: 'R 1,850 / h', expiry: '31 Dec 2026', state: 'Active' },
  { customer: 'Limpopo Aggregates', ref: 'LA-25-004', machines: 3, rate: 'R 2,100 / h', expiry: '30 Sep 2026', state: 'Expiring soon' },
  { customer: 'Rustenburg Roads', ref: 'RR-24-031', machines: 6, rate: 'R 1,620 / h', expiry: '31 Mar 2027', state: 'Active' },
]

function StatusBadge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'green' | 'amber' | 'red' | 'blue' | 'neutral' }) {
  return <span className={`status status-${tone}`}><span className="status-dot" />{children}</span>
}

function KpiCard({ label, value, sub, trend, icon: Icon, tone = 'gold' }: { label: string; value: string; sub: string; trend?: string; icon: React.ElementType; tone?: string }) {
  return <div className="kpi-card"><div className={`kpi-icon ${tone}`}><Icon size={18} /></div><div className="kpi-copy"><span>{label}</span><strong>{value}</strong><small>{trend ? <b className="trend-up"><ArrowUpRight size={13} />{trend}</b> : null}{sub}</small></div></div>
}

export default function Page() {
  const [active, setActive] = useState<Module>('Overview')
  const [user, setUser] = useState<unknown>(null)
  const [authReady, setAuthReady] = useState(false)
  const [supabase, setSupabase] = useState<ReturnType<typeof createClient> | null>(null)

  useEffect(() => {
    const client = createClient()
    setSupabase(client)
    client.auth.getUser().then(({ data }) => { setUser(data.user); setAuthReady(true) })
  }, [])

  if (!authReady || !supabase) return <div className="auth-loading">Loading secure workspace…</div>
  if (!user) return <LoginScreen onLogin={setUser} supabase={supabase} />
  const [hours, setHours] = useState(initialHours)
  const [query, setQuery] = useState('')
  const [saved, setSaved] = useState(true)
  const [mobileNav, setMobileNav] = useState(false)
  const [language, setLanguage] = useState<'en' | 'zh'>('en')
  const filteredHours = useMemo(() => hours.filter(row => [row.machine, row.code, row.operator, row.project].join(' ').toLowerCase().includes(query.toLowerCase())), [hours, query])
  const zhLabels: Record<string, string> = { Overview: '总览', 'Daily Hours': '每日工时', Fleet: '车队', Operators: '操作员', 'Customers & Contracts': '客户与合同', 'Billing & Invoices': '账单与发票', Reports: '报告', Maintenance: '维护', Repairs: '维修', Calendar: '日历', Notifications: '通知', 'Audit Log': '审计日志', Settings: '设置', Workspace: '工作区', Commercial: '商务', Assets: '资产', Governance: '治理' }
  const totalHours = hours.reduce((sum, row) => sum + Math.max(row.end - row.start, 0), 0)

  useEffect(() => {
    const originals = new WeakMap<Text, string>()
    const translate = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      let node: Node | null
      while ((node = walker.nextNode())) {
        const textNode = node as Text
        const parent = textNode.parentElement
        if (!parent || ['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT'].includes(parent.tagName)) continue
        const raw = originals.get(textNode) || textNode.nodeValue || ''
        originals.set(textNode, raw)
        const leading = raw.match(/^\\s*/)?.[0] || ''
        const trailing = raw.match(/\\s*$/)?.[0] || ''
        const key = raw.trim()
        if (!key) continue
        textNode.nodeValue = language === 'zh' ? `${leading}${uiTranslations[key] || key}${trailing}` : raw
      }
    }
    const refresh = window.setTimeout(translate, 80)
    return () => window.clearTimeout(refresh)
  }, [language, active])

  function updateMeter(id: string, key: 'start' | 'end', value: string) {
    setSaved(false)
    setHours(current => current.map(row => row.id === id ? { ...row, [key]: Number(value), status: key === 'end' && Number(value) < row.start ? 'error' : 'verified', note: key === 'end' && Number(value) < row.start ? 'End meter cannot be lower than start' : undefined } : row))
  }

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <div className="brand"><img className="brand-logo" src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Golden%20Baobab%20Logo.PNG-feY7yBqBZci35dpQ1RqzakSO62Ya8F.png" alt="GBI Group logo" /><div><strong>GBI Group</strong><span>Fleet operations</span></div><button className="mobile-close" onClick={() => setMobileNav(false)}><X size={18} /></button></div>
      <div className="role-pill"><div className="avatar">OM</div><div><b>Operations Manager</b><span>Full operational access</span></div><ChevronDown size={14} /></div>
      <nav>{navGroups.map(group => <div className="nav-group" key={group.label}><small>{group.label}</small>{group.items.map(item => <button key={item.label} className={active === item.label ? 'nav-item active' : 'nav-item'} onClick={() => { setActive(item.label as Module); setMobileNav(false) }}><item.icon size={17} /><span>{language === 'zh' ? (zhLabels[item.label] || item.label) : item.label}</span>{item.label === 'Notifications' && <em>3</em>}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="sync"><span className="online-dot" />All systems operational</div><button className="help"><CircleHelp size={16} /> Help centre</button></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><button className="menu-button" onClick={() => setMobileNav(true)}><Menu size={20} /></button><div className="breadcrumb"><span>{language === 'zh' ? '工作区' : 'Workspace'}</span><b>/</b><strong>{language === 'zh' ? (zhLabels[active] || active) : active}</strong></div><div className="top-actions"><div className="language-switcher" aria-label="Language selector"><button className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button><button className={language === 'zh' ? 'active' : ''} onClick={() => setLanguage('zh')}>中文</button></div><div className="top-search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={language === 'zh' ? '搜索车队、人员、地点...' : 'Search fleet, people, sites...'} aria-label="Search" /></div><button className="icon-button" aria-label="Notifications"><Bell size={18} /><i /></button><div className="top-avatar">OM</div></div></header>
      <div className="page-wrap">
        {active === 'Overview' && <Overview setActive={setActive} />}
        {active === 'Daily Hours' && <DailyHours hours={filteredHours} query={query} setQuery={setQuery} updateMeter={updateMeter} totalHours={totalHours} saved={saved} setSaved={setSaved} />}
        {active === 'Fleet' && <FleetView />}
        {active === 'Operators' && <OperatorsView />}
        {active === 'Customers & Contracts' && <ContractsView />}
        {active === 'Billing & Invoices' && <BillingView />}
        {active === 'Maintenance' && <MaintenanceView />}
        {active === 'Reports' && <ReportsView />}
        {active === 'Audit Log' && <AuditView />}
      </div>
    </main>
  </div>
}

function LoginScreen({ onLogin, supabase }: { onLogin: (user: unknown) => void; supabase: ReturnType<typeof createClient> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError('')
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) setError(signInError.message === 'Invalid login credentials' ? 'Invalid email or password.' : 'Unable to sign in. Please check your details.')
    else onLogin(data.user)
    setLoading(false)
  }
  return <main className="login-shell"><section className="login-card"><img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Golden%20Baobab%20Logo.PNG-feY7yBqBZci35dpQ1RqzakSO62Ya8F.png" alt="GBI Group logo" /><span className="eyebrow">GBI Group · Fleet operations</span><h1>Welcome back</h1><p>Sign in to manage fleet operations, people, billing and compliance.</p><form onSubmit={submit}><label htmlFor="login-email">Email address</label><input id="login-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@gbigroup.com" required /><label htmlFor="login-password">Password</label><input id="login-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required />{error && <div className="login-error">{error}</div>}<button className="button button-primary login-button" disabled={loading}>{loading ? 'Signing in…' : 'Sign in securely'}</button></form><small>Access is managed by your GBI Group administrator.</small></section></main>
}

function OperatorsView() { const [search, setSearch] = useState(''); const filtered = operators.filter(row => `${row.name} ${row.code} ${row.project}`.toLowerCase().includes(search.toLowerCase())); return <><PageHeading eyebrow="Workspace / People" title="Operators" description="Manage operator records, licences, assignments and working hours." action={<button className="button button-primary"><Plus size={16} /> Add operator</button>} /><div className="kpi-grid small"><KpiCard label="Active operators" value="18" sub="2 on leave" icon={Users} /><KpiCard label="Hours this period" value="1,248 h" sub="Across active projects" icon={Clock3} tone="blue" /><KpiCard label="Licence renewals" value="3" sub="Due within 90 days" icon={ShieldCheck} tone="red" /></div><div className="filter-row"><div className="toolbar-search"><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search operators, codes or projects" /></div><button className="button button-secondary">All statuses <ChevronDown size={14} /></button><button className="button button-secondary"><SlidersHorizontal size={15} /> Filters</button></div><section className="panel table-panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>Operator</th><th>Contact</th><th>Licence / certification</th><th>Current project</th><th>Hours</th><th>Status</th><th /></tr></thead><tbody>{filtered.map(row => <tr key={row.code}><td><div className="machine-cell"><div className="operator-avatar">{row.name.split(' ').map(part => part[0]).join('').slice(0,2)}</div><div><b>{row.name}</b><span>{row.code}</span></div></div></td><td>{row.phone}</td><td>{row.licence}</td><td>{row.project}</td><td><b>{row.hours}</b></td><td><StatusBadge tone={row.status === 'Active' ? 'green' : 'amber'}>{row.status}</StatusBadge></td><td><MoreHorizontal size={17} className="muted-icon" /></td></tr>)}</tbody></table></div><div className="table-footer"><span>Showing {filtered.length} operators</span><span><ShieldCheck size={15} /> Licence records are tracked</span></div></section></> }

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) { return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div> }

function Overview({ setActive }: { setActive: (m: Module) => void }) {
  return <><PageHeading eyebrow="Monday, 14 July 2025" title="Good morning, Thabo" description="Here is what is happening across the Golden Baobab fleet today." action={<button className="button button-primary" onClick={() => setActive('Daily Hours')}><Plus size={16} /> Record hours</button>} />
    <section className="kpi-grid"><KpiCard label="Active machines" value="28 / 34" sub="82% fleet availability" icon={Truck} /><KpiCard label="Hours recorded today" value="142.5 h" sub="Across 24 machines" trend="8.4%" icon={Clock3} tone="blue" /><KpiCard label="Unbilled value" value="R 263,450" sub="From 6 open periods" icon={CircleDollarSign} tone="green" /><KpiCard label="Maintenance due" value="4" sub="2 due within 48 hours" icon={Wrench} tone="red" /></section>
    <div className="dashboard-grid"><section className="panel utilization-panel"><div className="panel-header"><div><h2>Fleet utilisation</h2><p>Recorded operating hours · Last 7 days</p></div><button className="select-button">This week <ChevronDown size={14} /></button></div><div className="chart-area"><div className="chart-y"><span>200h</span><span>150h</span><span>100h</span><span>50h</span><span>0h</span></div><div className="bars">{[['Mon','72','42'],['Tue','88','57'],['Wed','76','64'],['Thu','94','52'],['Fri','82','71'],['Sat','48','35'],['Sun','12','8']].map(([day, first, second]) => <div className="bar-group" key={day}><div className="bar-stack"><div className="bar gold" style={{ height: `${Number(first) * 1.3}px` }} /><div className="bar slate" style={{ height: `${Number(second) * 1.3}px` }} /></div><span>{day}</span></div>)}</div></div><div className="chart-legend"><span><i className="legend-gold" />Billable hours</span><span><i className="legend-slate" />Non-billable hours</span><b>486 total hours</b></div></section>
      <section className="panel status-panel"><div className="panel-header"><div><h2>Fleet status</h2><p>Live equipment availability</p></div><button className="text-button" onClick={() => setActive('Fleet')}>View fleet <ArrowUpRight size={14} /></button></div><div className="donut-wrap"><div className="donut"><div><strong>34</strong><span>total assets</span></div></div><div className="donut-list"><div><i className="dot green" /><span>Operating</span><b>24</b></div><div><i className="dot amber" /><span>Standby</span><b>4</b></div><div><i className="dot red" /><span>Maintenance</span><b>4</b></div><div><i className="dot slate-dot" /><span>Off hire</span><b>2</b></div></div></div></section>
    </div>
    <div className="dashboard-grid lower"><section className="panel table-panel"><div className="panel-header"><div><h2>Maintenance watchlist</h2><p>Next service events requiring attention</p></div><button className="text-button" onClick={() => setActive('Maintenance')}>See all <ArrowUpRight size={14} /></button></div><div className="compact-list">{[['CAT 140K','GB-GR-003','Service due','Today','red'],['Volvo A30G','GB-DT-002','Inspection','Tomorrow','amber'],['Komatsu PC210','GB-EX-004','Preventative service','22 Jul','blue']].map(row => <div className="compact-row" key={row[0]}><div className="machine-thumb"><Truck size={17} /></div><div className="row-main"><b>{row[0]}</b><span>{row[1]} · {row[2]}</span></div><StatusBadge tone={row[4] as 'red' | 'amber' | 'blue'}>{row[3]}</StatusBadge><MoreHorizontal size={17} className="muted-icon" /></div>)}</div></section><section className="panel table-panel"><div className="panel-header"><div><h2>Recent activity</h2><p>Latest changes across the system</p></div><button className="text-button" onClick={() => setActive('Audit Log')}>Audit log <ArrowUpRight size={14} /></button></div><div className="activity-list">{[['Thabo Mokoena','recorded 7.0 hours on Komatsu PC210','10 min ago','green'],['Naledi Maseko','approved invoice INV-2025-071','42 min ago','blue'],['System','flagged a meter anomaly on CAT 140K','1 hr ago','red']].map(row => <div className="activity" key={row[1]}><div className={`activity-icon ${row[3]}`}><CircleDot size={14} /></div><div><b>{row[0]}</b> <span>{row[1]}</span><small>{row[2]}</small></div></div>)}</div></section></div>
    <div className="alert-strip"><AlertTriangle size={18} /><div><b>2 items need your attention</b><span>1 meter validation exception and 1 contract expiring within 90 days.</span></div><button className="button button-quiet" onClick={() => setActive('Daily Hours')}>Review items <ArrowUpRight size={14} /></button></div>
  </>
}

function DailyHours({ hours, query, setQuery, updateMeter, totalHours, saved, setSaved }: { hours: HourRow[]; query: string; setQuery: (v: string) => void; updateMeter: (id: string, key: 'start' | 'end', value: string) => void; totalHours: number; saved: boolean; setSaved: (v: boolean) => void }) {
  return <><PageHeading eyebrow="Operations / Daily log" title="Daily working hours" description="Capture one verified operational record for every machine on site." action={<div className="save-state">{saved ? <><Check size={15} /> Saved just now</> : <><CircleDot size={15} /> Unsaved changes</>}<button className="button button-primary" onClick={() => setSaved(true)}>Save all changes</button></div>} />
    <div className="hours-toolbar"><div className="date-control"><CalendarDays size={17} /><b>Mon, 14 Jul 2025</b><ChevronDown size={14} /></div><div className="toolbar-search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter machines, operators or projects" /></div><button className="button button-secondary"><SlidersHorizontal size={15} /> Filters <span className="filter-count">2</span></button></div>
    <div className="hours-summary"><div><span>Date status</span><b><i className="status-dot green-dot" />In progress</b></div><div><span>Machines</span><b>{hours.length} of 34</b></div><div><span>Recorded</span><b>{hours.filter(row => row.status === 'verified').length} verified</b></div><div><span>Total hours</span><b>{totalHours.toFixed(1)} h</b></div><div><span>Exceptions</span><b className="danger-text">{hours.filter(row => row.status === 'error' || row.status === 'warning').length} to review</b></div></div>
    <section className="panel hours-panel"><div className="table-scroll"><table className="data-table hours-table"><thead><tr><th>Machine</th><th>Operator / project</th><th>Start meter</th><th>End meter</th><th>Total hours</th><th>Validation</th><th aria-label="Actions" /></tr></thead><tbody>{hours.map(row => <tr key={row.id}><td><div className="machine-cell"><div className="machine-thumb"><Truck size={17} /></div><div><b>{row.machine}</b><span>{row.code}</span></div></div></td><td><div className="assignment"><b>{row.operator}</b><span>{row.project}</span></div></td><td><input className="meter-input" type="number" value={row.start} onChange={e => updateMeter(row.id, 'start', e.target.value)} /></td><td><input className={`meter-input ${row.status === 'error' ? 'invalid' : ''}`} type="number" value={row.end} onChange={e => updateMeter(row.id, 'end', e.target.value)} /></td><td><strong className={row.status === 'error' ? 'danger-text' : ''}>{Math.max(row.end - row.start, 0).toFixed(1)} h</strong></td><td>{row.status === 'verified' ? <StatusBadge tone="green">Verified</StatusBadge> : row.status === 'warning' ? <StatusBadge tone="amber">Needs review</StatusBadge> : <div className="validation-error"><AlertTriangle size={14} /><span>{row.note}</span></div>}</td><td><button className="row-menu" aria-label={`More actions for ${row.machine}`}><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table></div><div className="table-footer"><span>Showing {hours.length} machines with activity or assignments</span><span><ShieldCheck size={15} /> Validation rules active</span></div></section>
  </>
}

function FleetView() { return <><PageHeading eyebrow="Assets / Fleet register" title="Fleet register" description="34 tracked machines, availability, utilisation and service intervals." action={<button className="button button-primary"><Plus size={16} /> Add machine</button>} /><div className="filter-row"><div className="toolbar-search"><Search size={16} /><input placeholder="Search fleet register" /></div><button className="button button-secondary">All types <ChevronDown size={14} /></button><button className="button button-secondary">All statuses <ChevronDown size={14} /></button><button className="button button-secondary"><SlidersHorizontal size={15} /> More filters</button></div><section className="panel table-panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>Machine</th><th>Type</th><th>Current site</th><th>Meter</th><th>Next service</th><th>Status</th><th /></tr></thead><tbody>{fleet.map(row => <tr key={row.code}><td><div className="machine-cell"><div className="machine-thumb large"><Truck size={19} /></div><div><b>{row.machine}</b><span>{row.code}</span></div></div></td><td>{row.type}</td><td>{row.site}</td><td><b>{row.hours}</b></td><td><span className={row.next === 'Due now' ? 'danger-text' : ''}>{row.next}</span></td><td><StatusBadge tone={row.state === 'Operating' ? 'green' : row.state === 'Service due' ? 'red' : 'amber'}>{row.state}</StatusBadge></td><td><MoreHorizontal size={17} className="muted-icon" /></td></tr>)}</tbody></table></div></section></> }
function ContractsView() { return <><PageHeading eyebrow="Commercial / Customer master" title="Customers & contracts" description="Active customer agreements, effective-dated rates and deployed assets." action={<button className="button button-primary"><Plus size={16} /> New contract</button>} /><div className="kpi-grid small"><KpiCard label="Active customers" value="12" sub="3 with active deployments" icon={Users} /><KpiCard label="Active contracts" value="18" sub="R 1.8m contracted value" icon={FileText} tone="blue" /><KpiCard label="Expiring in 90 days" value="3" sub="Review renewal terms" icon={AlertTriangle} tone="red" /></div><section className="panel table-panel"><div className="panel-header"><div><h2>Contract register</h2><p>Rates are applied based on the contract active on the operating date.</p></div><button className="button button-secondary"><FileText size={15} /> Export register</button></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Customer</th><th>Contract ref</th><th>Machines</th><th>Normal rate</th><th>Expiry</th><th>Status</th><th /></tr></thead><tbody>{contracts.map(row => <tr key={row.ref}><td><b>{row.customer}</b></td><td className="mono">{row.ref}</td><td>{row.machines} machines</td><td><b>{row.rate}</b></td><td>{row.expiry}</td><td><StatusBadge tone={row.state === 'Expiring soon' ? 'amber' : 'green'}>{row.state}</StatusBadge></td><td><MoreHorizontal size={17} className="muted-icon" /></td></tr>)}</tbody></table></div></section></> }
function BillingView() { return <><PageHeading eyebrow="Commercial / Revenue" title="Billing & invoices" description="Turn verified hours into auditable, contract-driven invoices." action={<button className="button button-primary"><Plus size={16} /> Create invoice</button>} /><div className="kpi-grid"><KpiCard label="Draft invoices" value="6" sub="R 263,450 unbilled" icon={FileText} /><KpiCard label="Awaiting approval" value="3" sub="R 184,200 total" icon={ClipboardCheck} tone="blue" /><KpiCard label="Paid this month" value="R 892,600" sub="From 21 invoices" trend="12.6%" icon={CircleDollarSign} tone="green" /><KpiCard label="Overdue" value="R 74,200" sub="2 customer accounts" icon={AlertTriangle} tone="red" /></div><section className="panel table-panel"><div className="panel-header"><div><h2>Invoice register</h2><p>Finalised invoices retain their calculation snapshot and audit history.</p></div><div className="tabs"><button className="tab active">All invoices</button><button className="tab">Drafts (6)</button><button className="tab">Finalised</button></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Period</th><th>Hours</th><th>Amount</th><th>Status</th><th /></tr></thead><tbody>{[['INV-2025-071','Mokopane Solar Farm','01–14 Jul 2025','142.5 h','R 263,450','Draft','amber'],['INV-2025-070','Limpopo Aggregates','01–30 Jun 2025','188.0 h','R 394,800','Awaiting approval','blue'],['INV-2025-069','Rustenburg Roads','01–30 Jun 2025','246.5 h','R 399,330','Finalised','green'],['INV-2025-068','Klerksdorp Industrial','01–30 Jun 2025','98.0 h','R 171,500','Paid','green']].map(row => <tr key={row[0]}><td className="mono"><b>{row[0]}</b></td><td>{row[1]}</td><td>{row[2]}</td><td>{row[3]}</td><td><b>{row[4]}</b></td><td><StatusBadge tone={row[6] as 'amber' | 'blue' | 'green'}>{row[5]}</StatusBadge></td><td><MoreHorizontal size={17} className="muted-icon" /></td></tr>)}</tbody></table></div></section></> }
function MaintenanceView() { return <><PageHeading eyebrow="Assets / Reliability" title="Maintenance planning" description="Plan service intervals, capture costs and keep machine history complete." action={<button className="button button-primary"><Plus size={16} /> Log service</button>} /><div className="maintenance-grid"><div className="panel maintenance-hero"><div className="hero-icon"><Wrench size={22} /></div><div><span className="eyebrow">Service health</span><h2>86% fleet on schedule</h2><p>4 machines need service attention. 2 are due within 48 hours.</p></div><div className="progress"><div style={{ width: '86%' }} /></div><div className="progress-meta"><span>29 on schedule</span><b>5 exceptions</b></div></div><div className="panel cost-card"><span className="eyebrow">YTD maintenance cost</span><h2>R 418,920</h2><p><ArrowDownRight size={14} /> 4.8% below budget</p><div className="cost-bars"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div></div></div><section className="panel table-panel"><div className="panel-header"><div><h2>Upcoming service events</h2><p>Service intervals are calculated from the latest verified meter reading.</p></div><button className="button button-secondary"><CalendarDays size={15} /> View calendar</button></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Machine</th><th>Service type</th><th>Due at</th><th>Assigned provider</th><th>Status</th><th /></tr></thead><tbody>{[['CAT 140K','500-hour service','3,307 h · due now','Golden Baobab workshop','Due'],['Volvo A30G','Safety inspection','7,840 h · in 9 h','Volvo Equipment SA','Upcoming'],['Komatsu PC210','Preventative service','6,280 h · in 123 h','Komatsu Africa','Scheduled']].map(row => <tr key={row[0]}><td><div className="machine-cell"><div className="machine-thumb"><Truck size={17} /></div><b>{row[0]}</b></div></td><td>{row[1]}</td><td><b className={row[4] === 'Due' ? 'danger-text' : ''}>{row[2]}</b></td><td>{row[3]}</td><td><StatusBadge tone={row[4] === 'Due' ? 'red' : row[4] === 'Upcoming' ? 'amber' : 'blue'}>{row[4]}</StatusBadge></td><td><MoreHorizontal size={17} className="muted-icon" /></td></tr>)}</tbody></table></div></section></> }
function ReportsView() { return <><PageHeading eyebrow="Insights / Reporting" title="Reports & analytics" description="Operational, utilisation, maintenance and commercial reporting." action={<button className="button button-primary"><FileBarChart size={16} /> Build report</button>} /><div className="report-grid">{[['Utilisation by machine','Compare operating hours, idle time and fleet availability',Gauge,'blue'],['Revenue & billing','Contract rates, billable hours, invoices and adjustments',CircleDollarSign,'green'],['Machine history','Complete operational, maintenance and repair timeline',History,'gold'],['Operator overtime','Hours, policies, approvals and overtime cost',Users,'purple']].map(row => { const Icon = row[2]; return <button className="report-card" key={row[0]}><div className={`report-icon ${row[3]}`}><Icon size={20} /></div><div><h2>{row[0]}</h2><p>{row[1]}</p><span>Open report <ArrowUpRight size={14} /></span></div></button> })}</div><section className="panel insight-panel"><div className="panel-header"><div><h2>Monthly operating trend</h2><p>Total verified hours across active projects</p></div><button className="select-button">2025 <ChevronDown size={14} /></button></div><div className="trend-chart">{[62,70,68,80,76,92,86].map((height, i) => <div className="trend-col" key={i}><div className="trend-bar" style={{ height: `${height}%` }} /><span>{['Jan','Feb','Mar','Apr','May','Jun','Jul'][i]}</span></div>)}</div></section></> }
function AuditView() { return <><PageHeading eyebrow="Governance / Traceability" title="Audit log" description="Every material change, approval and financial action is recorded." action={<button className="button button-secondary"><FileText size={15} /> Export log</button>} /><div className="audit-banner"><ShieldCheck size={20} /><div><b>Audit integrity enabled</b><span>Records are append-only. Operational and financial history cannot be permanently deleted.</span></div></div><section className="panel table-panel"><div className="filter-row compact"><div className="toolbar-search"><Search size={16} /><input placeholder="Search audit activity" /></div><button className="button button-secondary">All users <ChevronDown size={14} /></button><button className="button button-secondary">Last 30 days <ChevronDown size={14} /></button></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Timestamp</th><th>User / actor</th><th>Action</th><th>Entity</th><th>Reason / detail</th></tr></thead><tbody>{[['14 Jul 2025 · 09:42','Thabo Mokoena','Updated daily hours','GB-EX-004 · 14 Jul','Verified end meter 6,157'],['14 Jul 2025 · 09:16','System','Validation exception','GB-GR-003 · 14 Jul','End meter lower than start'],['14 Jul 2025 · 08:58','Naledi Maseko','Approved invoice','INV-2025-069','Approval workflow complete'],['13 Jul 2025 · 17:31','Thabo Mokoena','Created assignment','GB-DT-002','Deployed to Limpopo Aggregates']].map(row => <tr key={row[0]}><td className="muted-text">{row[0]}</td><td><b>{row[1]}</b></td><td>{row[2]}</td><td className="mono">{row[3]}</td><td>{row[4]}</td></tr>)}</tbody></table></div></section></> }


