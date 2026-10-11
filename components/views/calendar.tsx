'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Hammer, MapPin, Wrench } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
import type { Tone } from '@/lib/gbi/format'
import { shortDate, titleCase } from '@/lib/gbi/format'
import { PageHeading, StatusBadge, ViewState } from '@/components/shared'

type EventType = 'service' | 'repair' | 'assignment'

type CalEvent = {
  key: string
  type: EventType
  date: string // YYYY-MM-DD
  machine: string
  title: string
  tone: Tone
}

const TYPE_META: Record<EventType, { label: string; icon: React.ElementType; tone: Tone }> = {
  service: { label: 'Service due', icon: Wrench, tone: 'amber' },
  repair: { label: 'Repair', icon: Hammer, tone: 'red' },
  assignment: { label: 'Deployment', icon: MapPin, tone: 'blue' },
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function iso(d: Date) {
  return d.toISOString().slice(0, 10)
}
function monthLabel(d: Date) {
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

type ServiceRow = {
  id: string
  next_service_due_date: string | null
  service_date: string
  status: string
  service_type: string | null
  machine: { machine_number: string } | null
}
type RepairRow = {
  id: string
  fault_date: string
  fault_description: string
  repair_completed: boolean
  machine: { machine_number: string } | null
}
type AssignmentRow = {
  id: string
  start_date: string
  machine: { machine_number: string } | null
  project: { name: string } | null
}

export function CalendarView() {
  const supabase = useSupabase()
  const [cursor, setCursor] = useState(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), 1)
  })
  const [activeTypes, setActiveTypes] = useState<Record<EventType, boolean>>({
    service: true,
    repair: true,
    assignment: true,
  })
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  // Window covers the visible grid (a little into prev/next month).
  const rangeStart = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const offset = (first.getDay() + 6) % 7 // Monday-first
    return new Date(first.getFullYear(), first.getMonth(), 1 - offset)
  }, [cursor])
  const rangeEnd = useMemo(() => {
    const d = new Date(rangeStart)
    d.setDate(d.getDate() + 41)
    return d
  }, [rangeStart])

  const startIso = iso(rangeStart)
  const endIso = iso(rangeEnd)

  const services = useQuery<ServiceRow[]>(
    () =>
      supabase
        .from('maintenance_record')
        .select('id,next_service_due_date,service_date,status,service_type,machine:machine_id(machine_number)')
        .not('next_service_due_date', 'is', null)
        .gte('next_service_due_date', startIso)
        .lte('next_service_due_date', endIso) as unknown as PromiseLike<{
        data: ServiceRow[] | null
        error: unknown
      }>,
    [startIso, endIso],
  )
  const repairs = useQuery<RepairRow[]>(
    () =>
      supabase
        .from('repair_record')
        .select('id,fault_date,fault_description,repair_completed,machine:machine_id(machine_number)')
        .gte('fault_date', startIso)
        .lte('fault_date', endIso) as unknown as PromiseLike<{ data: RepairRow[] | null; error: unknown }>,
    [startIso, endIso],
  )
  const assignments = useQuery<AssignmentRow[]>(
    () =>
      supabase
        .from('machine_assignment')
        .select('id,start_date,machine:machine_id(machine_number),project:project_id(name)')
        .gte('start_date', startIso)
        .lte('start_date', endIso) as unknown as PromiseLike<{
        data: AssignmentRow[] | null
        error: unknown
      }>,
    [startIso, endIso],
  )

  const status =
    services.status === 'loading' || repairs.status === 'loading' || assignments.status === 'loading'
      ? 'loading'
      : services.error || repairs.error || assignments.error
        ? 'error'
        : 'success'
  const firstError = services.error || repairs.error || assignments.error

  const events = useMemo<CalEvent[]>(() => {
    const list: CalEvent[] = []
    if (activeTypes.service) {
      for (const s of services.data ?? []) {
        if (!s.next_service_due_date) continue
        list.push({
          key: `s-${s.id}`,
          type: 'service',
          date: s.next_service_due_date,
          machine: s.machine?.machine_number ?? 'N/A',
          title: s.service_type ? `${s.service_type} due` : 'Service due',
          tone: 'amber',
        })
      }
    }
    if (activeTypes.repair) {
      for (const r of repairs.data ?? []) {
        list.push({
          key: `r-${r.id}`,
          type: 'repair',
          date: r.fault_date,
          machine: r.machine?.machine_number ?? 'N/A',
          title: r.fault_description,
          tone: r.repair_completed ? 'green' : 'red',
        })
      }
    }
    if (activeTypes.assignment) {
      for (const a of assignments.data ?? []) {
        list.push({
          key: `a-${a.id}`,
          type: 'assignment',
          date: a.start_date,
          machine: a.machine?.machine_number ?? 'N/A',
          title: a.project?.name ? `Deployed · ${a.project.name}` : 'Deployment',
          tone: 'blue',
        })
      }
    }
    return list
  }, [services.data, repairs.data, assignments.data, activeTypes])

  const byDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    for (const e of events) {
      const arr = map.get(e.date) ?? []
      arr.push(e)
      map.set(e.date, arr)
    }
    return map
  }, [events])

  const cells = useMemo(() => {
    const arr: Date[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(rangeStart)
      d.setDate(d.getDate() + i)
      arr.push(d)
    }
    return arr
  }, [rangeStart])

  const todayIso = iso(new Date())
  const selectedEvents = selectedDay ? byDay.get(selectedDay) ?? [] : []

  function toggle(t: EventType) {
    setActiveTypes((s) => ({ ...s, [t]: !s[t] }))
  }
  function step(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1))
    setSelectedDay(null)
  }

  return (
    <div className="page-wrap">
      <PageHeading
        title="Calendar"
        description="Services, repairs and machine deployments by month."
      />

      <div className="cal-toolbar">
        <div className="cal-nav">
          <button className="icon-button" onClick={() => step(-1)} aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <b>{monthLabel(cursor)}</b>
          <button className="icon-button" onClick={() => step(1)} aria-label="Next month">
            <ChevronRight size={16} />
          </button>
          <button
            className="button button-secondary cal-today"
            onClick={() => {
              const n = new Date()
              setCursor(new Date(n.getFullYear(), n.getMonth(), 1))
              setSelectedDay(null)
            }}
          >
            Today
          </button>
        </div>
        <div className="cal-legend">
          {(Object.keys(TYPE_META) as EventType[]).map((t) => (
            <button
              key={t}
              className={`cal-legend-item ${activeTypes[t] ? 'active' : ''} tone-${TYPE_META[t].tone}`}
              onClick={() => toggle(t)}
            >
              <span className="cal-dot" />
              {TYPE_META[t].label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <ViewState
          status={status}
          error={firstError}
          isEmpty={false}
          title="calendar"
          onRetry={() => {
            services.reload()
            repairs.reload()
            assignments.reload()
          }}
        >
          <div className="cal-grid cal-head">
            {WEEKDAYS.map((d) => (
              <div key={d} className="cal-weekday">
                {d}
              </div>
            ))}
          </div>
          <div className="cal-grid">
            {cells.map((d) => {
              const dayIso = iso(d)
              const inMonth = d.getMonth() === cursor.getMonth()
              const dayEvents = byDay.get(dayIso) ?? []
              return (
                <button
                  key={dayIso}
                  className={`cal-cell ${inMonth ? '' : 'cal-out'} ${dayIso === todayIso ? 'cal-today-cell' : ''} ${
                    selectedDay === dayIso ? 'cal-selected' : ''
                  }`}
                  onClick={() => setSelectedDay(dayIso)}
                >
                  <span className="cal-date">{d.getDate()}</span>
                  <span className="cal-events">
                    {dayEvents.slice(0, 3).map((e) => (
                      <span key={e.key} className={`cal-pill tone-${e.tone}`}>
                        <span className="cal-pill-dot" />
                        <span className="cal-pill-text">
                          {e.machine} · {e.title}
                        </span>
                      </span>
                    ))}
                    {dayEvents.length > 3 && <span className="cal-more">+{dayEvents.length - 3} more</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </ViewState>
      </div>

      {selectedDay && (
        <div className="panel cal-day-panel">
          <div className="cal-day-head">
            <b>{shortDate(selectedDay)}</b>
            <span className="muted-cell">
              {selectedEvents.length} {selectedEvents.length === 1 ? 'event' : 'events'}
            </span>
          </div>
          {selectedEvents.length === 0 ? (
            <p className="mini-state">Nothing scheduled on this day.</p>
          ) : (
            <ul className="cal-day-list">
              {selectedEvents.map((e) => {
                const Icon = TYPE_META[e.type].icon
                return (
                  <li key={e.key}>
                    <span className={`cal-day-icon tone-${e.tone}`}>
                      <Icon size={14} />
                    </span>
                    <div>
                      <b>{e.machine}</b>
                      <span className="muted-cell">{e.title}</span>
                    </div>
                    <StatusBadge tone={e.tone}>{titleCase(e.type)}</StatusBadge>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
