import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Workspace } from '@/components/workspace'
import { NotProvisioned } from '@/components/not-provisioned'
import type { AppUser } from '@/lib/gbi/roles'

export default async function Page() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Middleware already redirects unauthenticated users, but guard again in case
  // this page is reached directly (defense in depth).
  if (!user) redirect('/auth/login')

  // Load the real identity + role for this session from app_user (RLS allows a
  // user to read their own row). This drives the name, role and access model.
  const { data: profile, error } = await supabase
    .from('app_user')
    .select('id, full_name, role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (error || !profile || !profile.is_active) {
    return <NotProvisioned email={user.email ?? ''} reason={error ? 'error' : !profile ? 'missing' : 'inactive'} />
  }

  return <Workspace profile={profile as AppUser} email={user.email ?? ''} />
}
