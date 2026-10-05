/**
 * The project's NEXT_PUBLIC_SUPABASE_URL is configured with a trailing
 * `/rest/v1/` path. @supabase/supabase-js expects the bare project URL and
 * appends its own service paths (`/auth/v1`, `/rest/v1`, `/storage/v1`), so a
 * pathful base produces broken URLs like `/rest/v1/auth/v1/token`.
 *
 * This normalizes whatever is configured down to the origin the SDK expects,
 * without requiring the env var itself to be changed.
 */
export function supabaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
  }
  try {
    return new URL(raw).origin
  } catch {
    // Fall back to stripping any path segment manually.
    return raw.replace(/\/(rest|auth|storage|realtime)\/v1\/?$/, '').replace(/\/+$/, '')
  }
}
