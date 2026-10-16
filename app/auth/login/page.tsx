import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LoginForm } from '@/components/login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const supabase = await createClient()
  const { reason } = await searchParams
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Already signed in : send them into the workspace.
  if (user) redirect('/')

  return <LoginForm sessionExpired={reason === 'session-expired'} />
}
