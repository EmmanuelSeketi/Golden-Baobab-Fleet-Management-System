import { createBrowserClient } from '@supabase/ssr'
import { supabaseUrl } from '@/lib/supabase/url'

export function createClient() {
  return createBrowserClient(
    supabaseUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Secure cookies in production; not in dev, so localhost still works.
      cookieOptions: { secure: process.env.NODE_ENV === 'production' },
    },
  )
}
