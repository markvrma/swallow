import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import * as api from '../api/client'
import type { PickMode } from '../api/types'
import Layout from '../components/Layout'

/** This page IS the new tab. It performs the pick itself so the tab could be
 *  opened synchronously on click (popup blockers kill window.open after an await). */
export default function Roll() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    // StrictMode double-invokes effects in dev; a pick is a write, so guard it.
    if (started.current) return
    started.current = true

    const mode = (searchParams.get('mode') ?? 'random') as PickMode
    const showId = searchParams.get('showId') ?? undefined
    const presetId = searchParams.get('presetId') ?? undefined

    api
      .pickEpisode(mode, { showId, presetId })
      .then((result) => {
        const reset = result.pool_reset ? '&reset=1' : ''
        const from = new URLSearchParams({ mode, ...(showId && { showId }), ...(presetId && { presetId }) })
        navigate(`/episode/${result.episode.id}?${from.toString()}${reset}`, { replace: true })
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not pick an episode'))
  }, [searchParams, navigate])

  return (
    <Layout>
      <div className="mt-32 text-center">
        {error ? (
          <>
            <p className="text-lg text-red-400">{error}</p>
            <Link to="/" className="mt-4 inline-block text-amber-400 hover:underline">
              ← Back home
            </Link>
          </>
        ) : (
          <>
            <p className="animate-pulse text-5xl">🎲</p>
            <p className="mt-4 text-zinc-400">Rolling…</p>
          </>
        )}
      </div>
    </Layout>
  )
}
