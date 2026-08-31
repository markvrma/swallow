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

export class ApiError extends Error {
  status: number

  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
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

export const register = (email: string, password: string) =>
  request<User>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) })

export const login = (email: string, password: string) =>
  request<User>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })

export const logout = () => request<void>('/api/auth/logout', { method: 'POST' })

export const me = () => request<User>('/api/auth/me')

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
