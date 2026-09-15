'use client'

import { useCallback, useEffect, useState } from 'react'
import { friendlyError } from '@/lib/gbi/format'

export type QueryStatus = 'loading' | 'ready' | 'error'

export type QueryResult<T> = {
  status: QueryStatus
  data: T | null
  error: string
  reload: () => void
}

/**
 * Runs a Supabase query and tracks loading/ready/error. On any query error
 * (including RLS denial) it exposes an error string and never a fabricated
 * or cached mock value — data stays null.
 */
export function useQuery<T>(
  run: () => PromiseLike<{ data: T | null; error: unknown }>,
  deps: unknown[],
): QueryResult<T> {
  const [status, setStatus] = useState<QueryStatus>('loading')
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let active = true
    setStatus('loading')
    setError('')
    setData(null)
    Promise.resolve(run()).then(
      ({ data: result, error: queryError }) => {
        if (!active) return
        if (queryError) {
          setError(friendlyError(queryError))
          setStatus('error')
          return
        }
        setData(result)
        setStatus('ready')
      },
      (thrown) => {
        if (!active) return
        setError(friendlyError(thrown))
        setStatus('error')
      },
    )
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  return { status, data, error, reload }
}
