'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowUpRight, Inbox, MoreHorizontal, X } from 'lucide-react'
import type { Tone } from '@/lib/gbi/format'
import type { QueryStatus } from '@/lib/gbi/use-query'

export function PageHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string
  title: string
  action?: React.ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1 className="page-title">{title}</h1>
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
  iconSrc,
  tone = 'gold',
}: {
  label: string
  value: React.ReactNode
  sub?: string
  trend?: string
  icon?: React.ElementType
  iconSrc?: string
  tone?: string
}) {
  return (
    <div className={`kpi-card kpi-tone-${tone}`}>
      {Icon ? (
        <Icon size={28} className="kpi-icon" />
      ) : iconSrc ? (
        <img src={iconSrc} alt="" width={28} height={28} className="kpi-icon" />
      ) : null}
      <div className="kpi-copy">
        <span className="stat-label">{label}</span>
        <strong className="stat-value num">{value}</strong>
        {trend || sub ? (
          <small>
            {trend ? (
              <b className="trend-up">
                <ArrowUpRight size={13} />
                {trend}
              </b>
            ) : null}
            {sub}
          </small>
        ) : null}
      </div>
    </div>
  )
}

export function LoadingSpinner({ label = 'Loading', small = false }: { label?: string; small?: boolean }) {
  return (
    <span className={`loading-spinner${small ? ' small' : ''}`} role="status" aria-label={label}>
      <span aria-hidden="true" />
    </span>
  )
}

type SkeletonVariant = 'table' | 'list' | 'calendar' | 'timeline'

export function LoadingSkeleton({
  label,
  variant = 'table',
  columns = 6,
}: {
  label: string
  variant?: SkeletonVariant
  columns?: number
}) {
  const columnIndices = Array.from({ length: columns }, (_, index) => index)

  return (
    <div className={`loading-skeleton loading-skeleton-${variant}`} role="status" aria-label={`Loading ${label}`}>
      {variant === 'table' && (
        <div className="table-scroll">
          <table className="data-table" aria-hidden="true">
            <thead>
              <tr>
                {columnIndices.map((column) => (
                  <th key={column}>
                    <span className="skeleton-block" style={{ width: `${[54, 72, 63, 80][column % 4]}%` }} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, row) => (
                <tr key={row}>
                  {columnIndices.map((column) => (
                    <td key={column}>
                      <span
                        className="skeleton-block"
                        style={{ width: `${[74, 52, 86, 64, 44][(row + column) % 5]}%` }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {variant === 'list' && (
        <ul className="loading-skeleton-list" aria-hidden="true">
          {Array.from({ length: 5 }, (_, row) => (
            <li key={row}>
              <span className="skeleton-block skeleton-notification-icon" />
              <span className="loading-skeleton-list-copy">
                <span className="skeleton-block" />
                <span className="skeleton-block" />
                <span className="skeleton-block" />
              </span>
            </li>
          ))}
        </ul>
      )}

      {variant === 'calendar' && (
        <>
          <div className="cal-grid cal-head" aria-hidden="true">
            {columnIndices.slice(0, 7).map((column) => (
              <span className="skeleton-block skeleton-weekday" key={column} />
            ))}
          </div>
          <div className="cal-grid loading-skeleton-calendar-grid" aria-hidden="true">
            {Array.from({ length: 42 }, (_, day) => (
              <span className="loading-skeleton-calendar-cell" key={day}>
                <span className="skeleton-block skeleton-calendar-date" />
                {day % 3 !== 0 && <span className="skeleton-block skeleton-calendar-event" />}
                {day % 4 === 0 && <span className="skeleton-block skeleton-calendar-event short" />}
              </span>
            ))}
          </div>
        </>
      )}

      {variant === 'timeline' && (
        <ol className="loading-skeleton-timeline" aria-hidden="true">
          {Array.from({ length: 5 }, (_, row) => (
            <li key={row}>
              <span className="skeleton-block" />
              <span className="skeleton-block" />
              <span className="skeleton-block" />
            </li>
          ))}
        </ol>
      )}
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
  loadingVariant = 'table',
  loadingColumns = 6,
  children,
}: {
  status: QueryStatus
  error: string
  isEmpty: boolean
  title: string
  emptyTitle?: string
  emptyText: string
  onRetry?: () => void
  loadingVariant?: SkeletonVariant
  loadingColumns?: number
  children: React.ReactNode
}) {
  if (status === 'loading') {
    return <LoadingSkeleton label={title} variant={loadingVariant} columns={loadingColumns} />
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
          <dd>{value ?? 'N/A'}</dd>
        </div>
      ))}
    </dl>
  )
}

export function ModalSection({
  title,
  count,
  action,
  children,
}: {
  title: string
  count?: number
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="modal-section">
      <div className="modal-section-head">
        <h3>
          {title}
          {typeof count === 'number' && <span className="section-count">{count}</span>}
        </h3>
        {action}
      </div>
      <div className="modal-section-content">{children}</div>
    </section>
  )
}

export function MiniState({
  status,
  error,
  isEmpty,
  emptyText,
  loadingVariant = 'inline',
}: {
  status: QueryStatus
  error: string
  isEmpty: boolean
  emptyText: string
  loadingVariant?: 'inline' | 'chart'
}) {
  if (status === 'loading') {
    if (loadingVariant === 'chart') {
      return (
        <div className="loading-chart-skeleton" role="status" aria-label="Loading chart" aria-hidden="false">
          <div className="loading-chart-grid" aria-hidden="true">
            {Array.from({ length: 7 }, (_, bar) => (
              <span className="loading-chart-bar" key={bar} style={{ height: `${[38, 64, 48, 82, 56, 72, 44][bar]}%` }} />
            ))}
          </div>
        </div>
      )
    }
    return (
      <p className="mini-state mini-state-loading">
        <span className="skeleton-block skeleton-inline" aria-hidden="true" />
        <span className="visually-hidden">Loading…</span>
      </p>
    )
  }
  if (status === 'error') return <p className="mini-state error">{error}</p>
  if (isEmpty) return <p className="mini-state">{emptyText}</p>
  return null
}

export type RowAction = {
  label: string
  icon: React.ElementType
  onClick: () => void
  danger?: boolean
}

/**
 * A circular three-dot trigger that opens a small action menu inline in a table
 * row, so Edit/Delete/View can run without first opening the detail modal. The
 * menu is fixed-positioned from the trigger's rect so it is never clipped by the
 * table's horizontal scroll container.
 */
export function RowActions({
  actions,
  label = 'Row actions',
  showActionIcons = true,
  showTriggerIcon = true,
}: {
  actions: RowAction[]
  label?: string
  showActionIcons?: boolean
  showTriggerIcon?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as Node
      // The menu is a fixed-positioned sibling of the trigger, so it must be
      // excluded here too : otherwise mousedown closes it before a menu item's
      // click can fire.
      if (btnRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  if (actions.length === 0) return null

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) setCoords({ top: rect.bottom + 6, left: Math.max(8, rect.right - 194) })
    setOpen((v) => !v)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`row-action-trigger${showTriggerIcon ? '' : ' labelled'}${open ? ' is-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={toggle}
      >
        {showTriggerIcon ? <MoreHorizontal size={16} /> : 'Actions'}
      </button>
      {open && (
        <div
          ref={menuRef}
          className="row-action-menu"
          role="menu"
          style={{ top: coords.top, left: coords.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {actions.map((a) => {
            const Icon = a.icon
            return (
              <button
                key={a.label}
                type="button"
                role="menuitem"
                className={`row-action-item${a.danger ? ' danger' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(false)
                  a.onClick()
                }}
              >
                {showActionIcons && <Icon size={15} />}
                {a.label}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

/**
 * Confirmation dialog for destructive actions. Renders above the detail modal
 * (higher z-index) so an operator/machine can be deleted straight from its
 * profile. Never performs the action itself : the caller owns the mutation.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: React.ReactNode
  confirmLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div className="confirm-overlay" role="presentation" onClick={() => !busy && onCancel()}>
      <div
        className="confirm-card"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-icon">
          <AlertTriangle size={22} />
        </div>
        <h3>{title}</h3>
        <div className="confirm-message">{message}</div>
        <div className="confirm-actions">
          <button className="button button-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="button button-danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
