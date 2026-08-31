import { useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import * as api from '../api/client'
import Layout from '../components/Layout'
import { episodeCode } from '../lib/format'

export default function EpisodePage() {
  const { episodeId } = useParams<{ episodeId: string }>()
  const [searchParams] = useSearchParams()
  const wasReset = searchParams.get('reset') === '1'

  const { data, isLoading, error } = useQuery({
    queryKey: ['episode', episodeId],
    queryFn: () => api.getEpisode(episodeId!),
    enabled: Boolean(episodeId),
  })

  const rollAgain = () => {
    // Same tab this time -- the user is already here.
    const params = new URLSearchParams()
    params.set('mode', searchParams.get('mode') ?? 'random')
    for (const key of ['showId', 'presetId']) {
      const value = searchParams.get(key)
      if (value) params.set(key, value)
    }
    window.location.assign(`/roll?${params.toString()}`)
  }

  const putBack = async () => {
    if (!episodeId) return
    await api.unwatchEpisode(episodeId)
    rollAgain()
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="mt-32 text-center text-zinc-500">Loading…</div>
      </Layout>
    )
  }
  if (error || !data) {
    return (
      <Layout>
        <div className="mt-32 text-center">
          <p className="text-red-400">Episode not found.</p>
          <Link to="/" className="mt-4 inline-block text-amber-400 hover:underline">
            ← Back home
          </Link>
        </div>
      </Layout>
    )
  }

  const { episode, show } = data
  const justwatch = `https://www.justwatch.com/us/search?q=${encodeURIComponent(show.name)}`
  const image = episode.image_original ?? episode.image_medium ?? show.image_original

  return (
    <Layout>
      {wasReset && (
        <div className="mb-6 rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          🎉 You'd seen everything in this pool — history cleared, starting fresh.
        </div>
      )}
      <div className="grid gap-8 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div>
          <p className="text-sm font-medium text-amber-400">{show.name}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            {episodeCode(episode)}
            {episode.name ? ` · ${episode.name}` : ''}
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            {episode.runtime ? `${episode.runtime} min` : 'Runtime unknown'}
            {episode.airdate ? ` · aired ${episode.airdate}` : ''}
          </p>
          {episode.summary && <p className="mt-5 leading-relaxed text-zinc-300">{episode.summary}</p>}

          <div className="mt-8 flex flex-wrap gap-2">
            <button
              onClick={rollAgain}
              className="rounded-lg bg-amber-400 px-5 py-2.5 font-semibold text-zinc-950 hover:bg-amber-300"
            >
              🎲 Roll again
            </button>
            <button
              onClick={putBack}
              title="Removes this episode from your watch history and rolls again"
              className="rounded-lg border border-zinc-700 px-5 py-2.5 text-zinc-300 hover:bg-zinc-800"
            >
              ↩ Not tonight, put it back
            </button>
          </div>

          <div className="mt-6 flex flex-wrap gap-4 text-sm">
            <a href={justwatch} target="_blank" rel="noreferrer" className="text-amber-400 hover:underline">
              Where to stream ↗
            </a>
            {episode.tvmaze_url && (
              <a href={episode.tvmaze_url} target="_blank" rel="noreferrer" className="text-zinc-400 hover:underline">
                TVmaze ↗
              </a>
            )}
            {show.imdb_id && (
              <a
                href={`https://www.imdb.com/title/${show.imdb_id}/`}
                target="_blank"
                rel="noreferrer"
                className="text-zinc-400 hover:underline"
              >
                IMDb ↗
              </a>
            )}
          </div>
        </div>
        {image && (
          <img src={image} alt="" className="h-fit w-full rounded-xl border border-zinc-800 object-cover" />
        )}
      </div>
    </Layout>
  )
}
