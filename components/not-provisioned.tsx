'use client'

import { ShieldAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useSupabase } from '@/lib/supabase/use-supabase'

export function NotProvisioned({
  email,
  reason,
}: {
  email: string
  reason: 'missing' | 'inactive' | 'error'
}) {
  const supabase = useSupabase()
  const router = useRouter()

  const message =
    reason === 'inactive'
      ? 'Your account has been deactivated. Contact your GBI Group administrator to restore access.'
      : reason === 'error'
        ? 'We could not verify your access profile. Please try signing in again.'
        : 'Your login is valid, but no operator profile has been set up yet. Ask your GBI Group administrator to provision your account role.'

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/auth/login')
    router.refresh()
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="provision-icon">
          <ShieldAlert size={26} />
        </div>
        <span className="eyebrow">GBI Group · Access</span>
        <h1>Account not provisioned</h1>
        <p>{message}</p>
        {email && <small className="provision-email">Signed in as {email}</small>}
        <button className="button button-primary login-button" onClick={signOut}>
          Return to sign in
        </button>
      </section>
    </main>
  )
}
