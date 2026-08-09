/**
 * Turn anything thrown into something worth showing a person.
 *
 * Supabase rejects with plain objects, not Error instances, so the usual
 * `err instanceof Error ? err.message : String(err)` renders "[object Object]"
 * — which tells the reader nothing at all.
 */
export function errorMessage(err: unknown): string {
  if (err == null) return 'Something went wrong'
  if (typeof err === 'string') return err
  if (err instanceof Error && err.message) return err.message

  if (typeof err === 'object') {
    const e = err as Record<string, unknown>
    // PostgREST / GoTrue shapes, in the order they're worth reading.
    for (const key of ['message', 'error_description', 'error', 'details', 'hint']) {
      const v = e[key]
      if (typeof v === 'string' && v.trim()) return v
    }
    if (typeof e.status === 'number') return `Request failed (${e.status})`
    try {
      const json = JSON.stringify(err)
      if (json && json !== '{}') return json.slice(0, 200)
    } catch {
      /* circular — fall through */
    }
  }
  return 'Something went wrong'
}

/** Network blips look different from real errors and deserve a retry. */
export function isTransient(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase()
  return (
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('connection') ||
    msg.includes('load failed') ||
    msg.includes('offline')
  )
}

/**
 * Retry with backoff.
 *
 * A cold app launch often beats the network stack to it — the WebView starts
 * before the radio is ready — so the very first request fails and everything
 * downstream reports "couldn't load". Retrying quietly turns that into a
 * slightly slower launch instead of an error screen.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 600,
): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      // Only transient failures are worth repeating; a bad password never
      // becomes a good one.
      if (i === attempts - 1 || !isTransient(err)) throw err
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** i))
    }
  }
  throw lastError
}
