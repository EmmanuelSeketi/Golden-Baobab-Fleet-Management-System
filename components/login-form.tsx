'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSupabase } from '@/lib/supabase/use-supabase'

export function LoginForm({ sessionExpired = false }: { sessionExpired?: boolean }) {
  const supabase = useSupabase()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      // Genericize the credential signal to avoid account enumeration, but pass
      // through actionable states (unconfirmed email, rate limits).
      const message = signInError.message.toLowerCase()
      if (message.includes('invalid login credentials')) {
        setError('Invalid email or password.')
      } else if (message.includes('email not confirmed')) {
        setError('Please confirm your email address before signing in.')
      } else if (message.includes('rate limit') || signInError.status === 429) {
        setError('Too many attempts. Please wait a moment and try again.')
      } else {
        setError('Unable to sign in right now. Please try again.')
      }
      setLoading(false)
      return
    }
    // Full navigation so the server component re-runs and middleware sees the
    // fresh session cookie.
    router.replace('/')
    router.refresh()
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Golden%20Baobab%20Logo.PNG-feY7yBqBZci35dpQ1RqzakSO62Ya8F.png"
          alt="GBI Group logo"
        />
        <h1>Welcome back</h1>
        {sessionExpired && (
          <div className="login-error" role="alert">
            Session expired. Please sign in again.
          </div>
        )}
        <form onSubmit={submit}>
          <label htmlFor="login-email">Email address</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@gbigroup.com"
            autoComplete="email"
            required
          />
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
            required
          />
          {error && <div className="login-error">{error}</div>}
          <button className="button button-primary login-button" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  )
}
