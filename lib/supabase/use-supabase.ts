'use client'

import { useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Memoized browser Supabase client so every view shares a single instance
 * (the singleton pattern the SSR helpers expect) instead of re-creating one
 * on each render.
 */
export function useSupabase() {
  return useMemo(() => createClient(), [])
}
