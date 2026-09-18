import type { PickMode, PickResponse, Preset } from './types.js'

// Same-origin in the web app; the extension popup's origin is chrome-extension://,
// so every path needs the deployed frontend's origin (which proxies /api to the
// backend) prefixed on. Edit this to test against a local backend.
const API_BASE = 'https://swallow-mocha.vercel.app'

/** Handed a fresh Clerk token per call by popup.ts, which reads it from the open web app tab. */
let tokenGetter: (() => Promise<string | null>) | null = null

export function setTokenGetter(getter: () => Promise<string | null>) {
  tokenGetter = getter
}

export class ApiError extends Error {
  status: number

  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = tokenGetter ? await tokenGetter() : null
  const headers: Record<string, string> = {}
  if (init?.body) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  })
  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = await response.json()
      if (typeof body.detail === 'string') detail = body.detail
      else if (Array.isArray(body.detail)) detail = body.detail[0]?.msg ?? detail
    } catch {
      /* not JSON */
    }
    throw new ApiError(response.status, detail)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const listPresets = () => request<Preset[]>('/api/me/presets')

export const pickEpisode = (mode: PickMode, ids?: { showId?: string; presetId?: string }) =>
  request<PickResponse>('/api/pick', {
    method: 'POST',
    body: JSON.stringify({ mode, show_id: ids?.showId ?? null, preset_id: ids?.presetId ?? null }),
  })

export const unwatchEpisode = (episodeId: string) =>
  request<void>(`/api/me/history/${episodeId}`, { method: 'DELETE' })

// Fires the same undo as unwatchEpisode, but synchronously with a cached token and
// `keepalive` so it survives the popup closing -- awaiting a fresh token round-trip
// (which needs the popup's own execution context) would never finish in time.
export function unwatchEpisodeBeacon(episodeId: string, token: string | null) {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  fetch(`${API_BASE}/api/me/history/${episodeId}`, { method: 'DELETE', keepalive: true, headers }).catch(() => {})
}

export const neverShowEpisode = (episodeId: string) =>
  request<void>(`/api/me/episodes/${episodeId}/never-show`, { method: 'POST' })
