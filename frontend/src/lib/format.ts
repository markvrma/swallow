import type { Episode } from '../api/types'

export const episodeCode = (episode: Pick<Episode, 'season' | 'number'>) =>
  `S${String(episode.season).padStart(2, '0')}E${String(episode.number).padStart(2, '0')}`

export const formatSeasons = (seasons: number[]) => {
  if (seasons.length === 0) return ''
  const sorted = [...seasons].sort((a, b) => a - b)
  const parts: string[] = []
  let start = sorted[0]
  let prev = sorted[0]
  for (const s of sorted.slice(1)) {
    if (s === prev + 1) {
      prev = s
      continue
    }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`)
    start = s
    prev = s
  }
  parts.push(start === prev ? `${start}` : `${start}–${prev}`)
  return `S${parts.join(', ')}`
}

export const yearRange = (premiered: string | null, ended: string | null) => {
  if (!premiered) return ''
  const from = premiered.slice(0, 4)
  const to = ended ? ended.slice(0, 4) : ''
  return from === to ? from : `${from}–${to}`
}
