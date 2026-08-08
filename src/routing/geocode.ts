export interface LatLng {
  lat: number
  lng: number
}

export interface GeocodeResult extends LatLng {
  displayName: string
  provider: 'photon' | 'nominatim'
}

/**
 * Address → coordinates, without an API key.
 *
 * Photon is primary rather than Nominatim for a decisive reason: `User-Agent`
 * is a forbidden header in browser `fetch`, so a web app physically *cannot*
 * comply with Nominatim's usage policy, and it returns 403 to datacenter and
 * unidentified traffic. Photon is OSM-backed, keyless, and POI-aware, which
 * also makes it much better at "Costco Brooklyn" than a strict address parser.
 *
 * Nominatim stays as a secondary for well-formed street addresses, and manual
 * coordinate entry is the guaranteed floor.
 *
 * Every call must run on the user's device. Geocoding from CI or a server is
 * exactly what gets these free endpoints to block you.
 */

const PHOTON = 'https://photon.komoot.io/api/'
const NOMINATIM = 'https://nominatim.openstreetmap.org/search'

/** ≥1 req/s satisfies Nominatim's policy and is polite to Photon regardless. */
const MIN_GAP_MS = 1100
let queue: Promise<unknown> = Promise.resolve()

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const result = await task()
    await new Promise((r) => setTimeout(r, MIN_GAP_MS))
    return result
  })
  // Keep the chain alive even when a link rejects.
  queue = run.catch(() => undefined)
  return run as Promise<T>
}

export const normalizeQuery = (q: string): string =>
  q.trim().toLowerCase().replace(/\s+/g, ' ')

async function fetchJson(url: string, timeoutMs = 8000): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

interface PhotonResponse {
  features?: Array<{
    geometry?: { coordinates?: [number, number] }
    properties?: Record<string, string | undefined>
  }>
}

async function viaPhoton(query: string): Promise<GeocodeResult | null> {
  const url = `${PHOTON}?q=${encodeURIComponent(query)}&limit=1`
  const json = (await fetchJson(url)) as PhotonResponse
  const f = json.features?.[0]
  const coords = f?.geometry?.coordinates
  if (!coords) return null

  // GeoJSON is [lng, lat] — the reverse of everything else here.
  const [lng, lat] = coords
  const p = f.properties ?? {}
  const displayName = [p.name, p.street, p.city, p.state]
    .filter(Boolean)
    .join(', ')

  return { lat, lng, displayName: displayName || query, provider: 'photon' }
}

interface NominatimEntry {
  lat: string
  lon: string
  display_name: string
}

async function viaNominatim(query: string): Promise<GeocodeResult | null> {
  const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=jsonv2&limit=1`
  const json = (await fetchJson(url)) as NominatimEntry[]
  const first = json?.[0]
  if (!first) return null
  return {
    lat: parseFloat(first.lat),
    lng: parseFloat(first.lon),
    displayName: first.display_name,
    provider: 'nominatim',
  }
}

/**
 * Cache lookups are injected so this module stays free of store imports and
 * can be unit tested without a database.
 */
export interface GeocodeCache {
  get(key: string): Promise<GeocodeResult | null>
  put(key: string, value: GeocodeResult): Promise<void>
}

export async function geocode(
  query: string,
  cache?: GeocodeCache,
): Promise<GeocodeResult | null> {
  const key = normalizeQuery(query)
  if (!key) return null

  const cached = await cache?.get(key)
  if (cached) return cached

  return serialize(async () => {
    let result: GeocodeResult | null = null
    try {
      result = await viaPhoton(key)
    } catch {
      /* fall through to the secondary */
    }
    if (!result) {
      try {
        result = await viaNominatim(key)
      } catch {
        // 403 here is expected, not exceptional — see the note above.
      }
    }
    if (result) await cache?.put(key, result)
    return result
  })
}

/** "40.7128, -74.0060" — the manual-entry escape hatch. */
export function parseCoordinates(input: string): LatLng | null {
  const m = input.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  if (!m) return null
  const lat = parseFloat(m[1])
  const lng = parseFloat(m[2])
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}
