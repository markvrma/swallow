import { useCallback, useState } from 'react'
import * as api from '../api/client'
import type { PickMode, PickResponse } from '../api/types'
import EpisodeBox from '../components/EpisodeBox'
import { restartDeliberating } from './deliberation'

interface RollArgs {
  mode: PickMode
  showId?: string
  presetId?: string
}

/** One roll, shown in place. Both the home page and the controlled-random page use it,
 *  so the pick logic and the box live here rather than in each caller. */
export function useRoll() {
  const [args, setArgs] = useState<RollArgs | null>(null)
  const [result, setResult] = useState<PickResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback((next: RollArgs) => {
    // Rolling again after committing to an episode means a new round of deliberating.
    restartDeliberating()
    setArgs(next)
    setResult(null)
    setError(null)
    setLoading(true)
    api
      .pickEpisode(next.mode, { showId: next.showId, presetId: next.presetId })
      .then(setResult)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not pick an episode'))
      .finally(() => setLoading(false))
  }, [])

  // Dismissing without picking an action (Escape, click-out) is not a commitment
  // to watch -- undo the watch-history row `pick` wrote so the episode stays in the pool.
  const close = useCallback(() => {
    const episodeId = result?.episode.id
    setArgs(null)
    setResult(null)
    setError(null)
    if (episodeId) api.unwatchEpisode(episodeId).catch(() => {})
  }, [result])

  // Rolling again should not remove the episode from the pool -- undo the
  // watch-history row `pick` wrote for it before drawing the next one.
  const rollAgain = useCallback(async () => {
    if (!result || !args) return
    await api.unwatchEpisode(result.episode.id)
    run(args)
  }, [result, args, run])

  const neverShow = useCallback(async () => {
    if (!result || !args) return
    await api.neverShowEpisode(result.episode.id)
    run(args)
  }, [result, args, run])

  const box = args ? (
    <EpisodeBox
      result={result}
      loading={loading}
      error={error}
      onRollAgain={rollAgain}
      onNeverShow={neverShow}
      onClose={close}
    />
  ) : null

  return { roll: run, box }
}
