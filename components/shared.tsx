'use client'

import { useEffect } from 'react'
import { AlertTriangle, ArrowUpRight, Inbox, Loader2, X } from 'lucide-react'
import type { Tone } from '@/lib/gbi/format'
import type { QueryStatus } from '@/lib/gbi/use-query'

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  )
}

export function StatusBadge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode
  tone?: Tone
}) {
  return (
    <span className={`status status-${tone}`}>
      <span className="status-dot" />
      {children}
    </span>
  )
}

export function KpiCard({
  label,
  value,
  sub,
  trend,
  icon: Icon,
  tone = 'gold',
}: {
  label: string
  value: string
  sub: string
  trend?: string
  icon: React.ElementType
  tone?: string
}) {
  return (
    <div className="kpi-card">
      <div className={`kpi-icon ${tone}`}>
        <Icon size={18} />
      </div>
      <div className="kpi-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>
          {trend ? (
            <b className="trend-up">
              <ArrowUpRight size={13} />
              {trend}
            </b>
          ) : null}
          {sub}
        </small>
      </div>
    </div>
  )
}

/**
 * Renders loading / error / empty states consistently. Only renders children
 * when the query succeeded AND returned rows, so a failed query can never fall
 * through to fabricated data.
 */
export function ViewState({
  status,
  error,
  isEmpty,
  title,
  emptyTitle = 'No records yet',
  emptyText,
  onRetry,
  children,
}: {
  status: QueryStatus
  error: string
  isEmpty: boolean
  title: string
  emptyTitle?: string
  emptyText: string
  onRetry?: () => void
  children: React.ReactNode
}) {
  if (status === 'loading') {
    return (
      <div className="data-state">
        <Loader2 size={20} className="spin" />
        <div>
          <b>Loading {title}…</b>
          <p>Fetching live records from Supabase.</p>
        </div>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="data-state error-state">
        <AlertTriangle size={20} />
        <div>
          <b>{title} unavailable</b>
          <p>{error}</p>
          {onRetry && (
            <button className="button button-secondary retry-button" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      </div>
    )
  }
  if (isEmpty) {
    return (
      <div className="data-state">
        <Inbox size={20} />
        <div>
          <b>{emptyTitle}</b>
          <p>{emptyText}</p>
        </div>
      </div>
    )
  }
  return <>{children}</>
}

export function Modal({
  open,
  onClose,
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  eyebrow?: string
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close details">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  )
}

export function DetailGrid({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="detail-grid">
      {items.map(([label, value]) => (
        <div key={label} className="detail-item">
          <dt>{label}</dt>
          <dd>{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

export function ModalSection({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: React.ReactNode
}) {
  return (
    <section className="modal-section">
      <h3>
        {title}
        {typeof count === 'number' && <span className="section-count">{count}</span>}
      </h3>
      {children}
    </section>
  )
}

export function MiniState({
  status,
  error,
  isEmpty,
  emptyText,
}: {
  status: QueryStatus
  error: string
  isEmpty: boolean
  emptyText: string
}) {
  if (status === 'loading') return <p className="mini-state">Loading…</p>
  if (status === 'error') return <p className="mini-state error">{error}</p>
  if (isEmpty) return <p className="mini-state">{emptyText}</p>
  return null
}
