import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Workspace } from '@/components/workspace'
import { NotProvisioned } from '@/components/not-provisioned'
import type { AppUser } from '@/lib/gbi/roles'

export default async function Page() {
  const supabase = await createClient()

  // A transient Supabase Auth failure here must not 500 the whole page. If the
  // auth server is momentarily unreachable, treat it as no session and let the
  // login route handle re-authentication rather than crashing.
  let user = null
  try {
    const result = await supabase.auth.getUser()
    user = result.data.user
  } catch (err) {
    console.log('[v0] page getUser failed:', err instanceof Error ? err.message : err)
    redirect('/auth/login')
  }

  // Middleware already redirects unauthenticated users, but guard again in case
  // this page is reached directly (defense in depth).
  if (!user) redirect('/auth/login')

  // Load the real identity + role for this session from app_user (RLS allows a
  // user to read their own row). This drives the name, role and access model.
  // A thrown error (network/timeout) is caught and rendered as the recoverable
  // "error" state instead of a hard 500.
  let profile: AppUser | null = null
  let queryError = false
  try {
    const { data, error } = await supabase
      .from('app_user')
      .select('id, full_name, role, is_active')
      .eq('id', user.id)
      .maybeSingle()
    if (error) queryError = true
    else profile = data as AppUser | null
  } catch (err) {
    console.log('[v0] page app_user query failed:', err instanceof Error ? err.message : err)
    queryError = true
  }

  if (queryError || !profile || !profile.is_active) {
    return (
      <NotProvisioned
        email={user.email ?? ''}
        reason={queryError ? 'error' : !profile ? 'missing' : 'inactive'}
      />
    )
  }

  return <Workspace profile={profile} email={user.email ?? ''} />
}
