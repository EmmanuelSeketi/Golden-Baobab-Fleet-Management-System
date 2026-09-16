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

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getUser() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  //
  // This call hits the Supabase Auth server on EVERY request. A transient
  // failure (network blip, timeout, or a 429 rate-limit — Supabase keys auth
  // limits off IP, and a deployment shares one egress IP across all visitors)
  // used to throw here and crash the middleware, returning 500 for the whole
  // site intermittently. We now fail open on public paths and fail safe
  // (redirect to login) on protected paths, so a momentary Auth hiccup never
  // takes the deployment down.
  let user = null
  let authFailed = false
  try {
    const result = await supabase.auth.getUser()
    user = result.data.user
  } catch (err) {
    authFailed = true
    console.log('[v0] middleware getUser failed:', err instanceof Error ? err.message : err)
  }

  // Public paths always pass through, even when auth is unreachable.
  if (isPublic) {
    return supabaseResponse
  }

  // Protected path with no session (or auth temporarily unreachable): send to
  // login rather than crashing. When auth is genuinely down this shows the
  // login page instead of a 500.
  if (!user || authFailed) {
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
