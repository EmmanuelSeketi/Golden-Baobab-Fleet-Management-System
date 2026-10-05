import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseUrl } from '@/lib/supabase/url'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    supabaseUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Secure cookies in production; not in dev, so localhost still works.
      cookieOptions: { secure: process.env.NODE_ENV === 'production' },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const { pathname } = request.nextUrl
  // Public paths that an unauthenticated visitor is allowed to reach.
  const isPublic =
    pathname.startsWith('/auth') || pathname.startsWith('/_next') || pathname === '/favicon.ico'

  // Session validation strategy (keeps the site reachable under any load):
  //
  // We use getClaims() instead of getUser(). getClaims() verifies the session
  // JWT LOCALLY against the project's signing keys (JWKS), which are fetched
  // once and cached : so it does NOT hit the Supabase Auth server on every
  // request. That removes the per-request network dependency that previously
  // made the site flaky: no round-trip means no timeouts and, critically, no
  // IP-based 429 rate-limiting during traffic spikes (a deployment shares one
  // egress IP across all visitors, so getUser()-per-request throttled at load).
  //
  // getClaims() still triggers the cookie setAll() above, so token refresh and
  // session cookies keep working exactly as before.
  let hasValidSession = false
  let verificationErrored = false
  try {
    const { data, error } = await supabase.auth.getClaims()
    if (error) {
      verificationErrored = true
      console.log('[v0] middleware getClaims error:', error.message)
    } else {
      hasValidSession = Boolean(data?.claims)
    }
  } catch (err) {
    verificationErrored = true
    console.log('[v0] middleware getClaims failed:', err instanceof Error ? err.message : err)
  }

  // Public paths always pass through, even when verification is unavailable.
  if (isPublic) {
    return supabaseResponse
  }

  if (!hasValidSession) {
    // Distinguish "no session" from "couldn't verify right now". If a Supabase
    // auth cookie is present but verification errored (e.g. JWKS momentarily
    // unreachable), fail OPEN so an already-signed-in user is never locked out
    // during an outage : the server components still do a full check. Only when
    // there is genuinely no session do we redirect to login.
    const hasAuthCookie = request.cookies
      .getAll()
      .some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'))

    if (verificationErrored && hasAuthCookie) {
      return supabaseResponse
    }

    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}
