import type {
  EpisodeWithShow,
  LibraryShow,
  PickMode,
  PickResponse,
  PoolCount,
  Preset,
  ShowDetail,
  ShowSearchResult,
  User,
} from './types'

/** Clerk's token getter, handed over by AuthProvider once Clerk has loaded.
 *  The api client is plain functions, not components, so it cannot use the hook. */
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
  // A short-lived Clerk session token, minted per request. Nothing is stored here:
  // Clerk owns the session, and the API verifies the token against its JWKS.
  const token = tokenGetter ? await tokenGetter() : null
  const headers: Record<string, string> = {}
  if (init?.body) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(path, {
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

// --- auth ---
//
// Sign-up, sign-in, sign-out and OAuth all happen in Clerk. The only call left is
// the one that resolves the Clerk identity to this app's account row.

export const me = () => request<User>('/api/auth/me')

export const deleteAccount = () => request<void>('/api/auth/me', { method: 'DELETE' })

// --- catalogue ---

export const searchShows = (q: string) =>
  request<ShowSearchResult[]>(`/api/shows/search?q=${encodeURIComponent(q)}`)

export const importShow = (tvmazeId: number) =>
  request<ShowDetail>('/api/shows/import', {
    method: 'POST',
    body: JSON.stringify({ tvmaze_id: tvmazeId }),
  })

export const getShow = (showId: string) => request<ShowDetail>(`/api/shows/${showId}`)

// --- library ---

export const listLibrary = () => request<LibraryShow[]>('/api/me/shows')

export const addLibraryShow = (tvmazeId: number, seasons: number[]) =>
  request<LibraryShow>('/api/me/shows', {
    method: 'POST',
    body: JSON.stringify({ tvmaze_id: tvmazeId, seasons }),
  })

export const updateLibraryShow = (showId: string, seasons: number[]) =>
  request<LibraryShow>(`/api/me/shows/${showId}`, {
    method: 'PATCH',
    body: JSON.stringify({ seasons }),
  })

export const removeLibraryShow = (showId: string) =>
  request<void>(`/api/me/shows/${showId}`, { method: 'DELETE' })

export const libraryCards = (limit = 5) => request<LibraryShow[]>(`/api/me/cards?limit=${limit}`)

export const unwatchEpisode = (episodeId: string) =>
  request<void>(`/api/me/history/${episodeId}`, { method: 'DELETE' })

export const neverShowEpisode = (episodeId: string) =>
  request<void>(`/api/me/episodes/${episodeId}/never-show`, { method: 'POST' })

export const resetShowHistory = (showId: string) =>
  request<void>(`/api/me/shows/${showId}/reset`, { method: 'POST' })

// --- presets ---

export interface PresetShowInput {
  show_id: string
  seasons: number[]
}

export interface PresetWrite {
  name: string
  max_runtime: number | null
  shows: PresetShowInput[]
}

export const listPresets = () => request<Preset[]>('/api/me/presets')

export const createPreset = (payload: PresetWrite) =>
  request<Preset>('/api/me/presets', { method: 'POST', body: JSON.stringify(payload) })

export const updatePreset = (presetId: string, payload: PresetWrite) =>
  request<Preset>(`/api/me/presets/${presetId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })

export const deletePreset = (presetId: string) =>
  request<void>(`/api/me/presets/${presetId}`, { method: 'DELETE' })

export const previewPreset = (payload: { max_runtime: number | null; shows: PresetShowInput[] }) =>
  request<PoolCount>('/api/me/presets/preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

// --- picking ---

export const pickEpisode = (mode: PickMode, ids?: { showId?: string; presetId?: string }) =>
  request<PickResponse>('/api/pick', {
    method: 'POST',
    body: JSON.stringify({ mode, show_id: ids?.showId ?? null, preset_id: ids?.presetId ?? null }),
  })

export const getEpisode = (episodeId: string) =>
  request<EpisodeWithShow>(`/api/episodes/${episodeId}`)
