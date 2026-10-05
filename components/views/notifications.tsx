'use client'

import { Bell } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/use-supabase'
import { useQuery } from '@/lib/gbi/use-query'
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

export function NotificationsView() {
  const supabase = useSupabase()

  const notifications = useQuery<Notification[]>(
    () =>
      supabase
        .from('notification')
        .select('id,type,message,related_entity_type,is_read,created_at')
        .order('created_at', { ascending: false })
        .limit(100) as unknown as PromiseLike<{ data: Notification[] | null; error: unknown }>,
    [],
  )

  const rows = notifications.data ?? []
  const unread = rows.filter((n) => !n.is_read).length

  return (
    <div className="page-wrap">
      <PageHeading
        title="Notifications"
        description="System alerts for reviews, service due, contract expiry and billing events."
        action={
          notifications.status === 'ready' ? (
            <span className="pill-count">
              {unread} unread · {rows.length} total
            </span>
          ) : undefined
        }
      />

      <div className="panel">
        <ViewState
          status={notifications.status}
          error={notifications.error}
          isEmpty={rows.length === 0}
          title="notifications"
          emptyTitle="You're all caught up"
          emptyText="No notifications to show."
          onRetry={notifications.reload}
        >
          <ul className="notif-list">
            {rows.map((n) => (
              <li key={n.id} className={n.is_read ? '' : 'unread'}>
                <span className="notif-icon">
                  <Bell size={15} />
                </span>
                <div className="notif-body">
                  <div className="notif-top">
                    <b>{titleCase(n.type)}</b>
                    <time>{dateTime(n.created_at)}</time>
                  </div>
                  <p>{n.message}</p>
                  {n.related_entity_type && <span className="notif-tag">{titleCase(n.related_entity_type)}</span>}
                </div>
                {!n.is_read && <span className="unread-dot" aria-label="Unread" />}
              </li>
            ))}
          </ul>
        </ViewState>
      </div>
    </div>
  )
}
