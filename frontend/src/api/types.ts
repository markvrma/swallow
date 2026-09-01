export interface User {
  id: string
  email: string
  created_at: string
  email_verified_at: string | null
}

export interface PendingVerification {
  email: string
  verification_required: boolean
}

export interface Show {
  id: string
  tvmaze_id: number
  name: string
  premiered: string | null
  ended: string | null
  status: string | null
  summary: string | null
  image_medium: string | null
  image_original: string | null
  imdb_id: string | null
}

export interface SeasonInfo {
  number: number
  episode_order: number | null
  premiere_date: string | null
  episode_count: number
}

export interface ShowDetail extends Show {
  seasons: SeasonInfo[]
}

export interface ShowSearchResult {
  tvmaze_id: number
  name: string
  premiered: string | null
  ended: string | null
  status: string | null
  summary: string | null
  image_medium: string | null
  in_library: boolean
}

export interface LibraryShow {
  show: Show
  seasons: number[]
  episode_count: number
  remaining_count: number
}

export interface PresetShow {
  show: Show
  seasons: number[]
}

export interface Preset {
  id: string
  name: string
  max_runtime: number | null
  created_at: string
  last_used_at: string | null
  shows: PresetShow[]
  episode_count: number
  remaining_count: number
}

export interface Episode {
  id: string
  season: number
  number: number
  name: string | null
  airdate: string | null
  runtime: number | null
  summary: string | null
  image_medium: string | null
  image_original: string | null
  tvmaze_url: string | null
}

export interface EpisodeWithShow {
  episode: Episode
  show: Show
}

export interface PickResponse extends EpisodeWithShow {
  pool_reset: boolean
}

export type PickMode = 'random' | 'show' | 'preset'

export interface PoolCount {
  episode_count: number
  remaining_count: number
}

export const RUNTIME_BUCKETS = [15, 20, 30, 45, 60] as const
