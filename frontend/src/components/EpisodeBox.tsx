import { useEffect } from 'react'
import type { PickResponse } from '../api/types'
import { episodeCode } from '../lib/format'
import { stopDeliberating } from '../lib/deliberation'

interface Props {
  result: PickResponse | null
  loading: boolean
  error: string | null
  onRollAgain: () => void
  onPutBack: () => void
  onClose: () => void
}

/** The episode arrives as a box over whatever you were doing -- no new tab, no route. */
export default function EpisodeBox({ result, loading, error, onRollAgain, onPutBack, onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const episode = result?.episode
  const show = result?.show
  const image = episode?.image_original ?? episode?.image_medium ?? show?.image_original ?? null
  const justwatch = show ? `https://www.justwatch.com/us/search?q=${encodeURIComponent(show.name)}` : '#'

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-scrim p-4 pt-[8vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl border border-line bg-bar"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-2.5">
          <span className="font-nerd text-[11px] uppercase tracking-[0.14em] text-muted">⠿ your episode</span>
          <button onClick={onClose} className="font-mono text-xs text-muted hover:text-ink">
            close
          </button>
        </div>

        {loading && (
          <p className="px-5 py-16 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            ⠿ rolling…
          </p>
        )}

        {error && (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-timer">{error}</p>
            <button
              onClick={onClose}
              className="mt-4 border border-line px-4 py-2 text-xs text-ink-2 hover:border-hover-line hover:bg-hover-ground hover:text-ink"
            >
              Back
            </button>
          </div>
        )}

        {episode && show && (
          <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div>
              <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                {show.name} · {episodeCode(episode)}
              </div>

              <h2 className="text-[28px] font-medium leading-tight tracking-[-0.015em] text-pretty">
                {episode.name ?? episodeCode(episode)}
              </h2>

              <div className="mt-3 flex items-center gap-3.5 font-mono text-xs text-muted">
                <span>{episode.runtime ? `${episode.runtime} min` : 'runtime unknown'}</span>
                {episode.airdate && (
                  <>
                    <span className="text-line">/</span>
                    <span>{episode.airdate}</span>
                  </>
                )}
              </div>

              {episode.summary && (
                <p className="mt-5 max-w-[58ch] text-sm leading-[1.75] text-ink-2 text-pretty">
                  {episode.summary}
                </p>
              )}

              <div className="mt-7 flex flex-wrap gap-2">
                <a
                  href={justwatch}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => stopDeliberating()}
                  title="Stops the deliberation clock -- you've decided"
                  className="flex items-center gap-2.5 border border-bright bg-bright px-5 py-3 text-sm font-semibold text-white hover:bg-bright-hover"
                >
                  <span className="font-nerd">⠿</span>
                  Watch this one
                </a>
                <button
                  onClick={onRollAgain}
                  className="border border-line px-5 py-3 text-sm text-ink-2 hover:border-hover-line hover:bg-hover-ground hover:text-ink"
                >
                  Roll again
                </button>
                <button
                  onClick={onPutBack}
                  title="Removes this episode from your watch history and rolls again"
                  className="border border-line px-5 py-3 text-sm text-ink-2 hover:border-hover-line hover:bg-hover-ground hover:text-ink"
                >
                  Not tonight, put it back
                </button>
              </div>

              <div className="mt-6 flex flex-wrap gap-6 border-t border-line pt-4 text-xs">
                {episode.tvmaze_url && (
                  <a href={episode.tvmaze_url} target="_blank" rel="noreferrer" className="text-ink-2 hover:text-ink hover:underline">
                    TVmaze
                  </a>
                )}
                {show.imdb_id && (
                  <a
                    href={`https://www.imdb.com/title/${show.imdb_id}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-ink-2 hover:text-ink hover:underline"
                  >
                    IMDb
                  </a>
                )}
              </div>

              {result.pool_reset && (
                <div className="mt-6 border border-line border-l-[3px] border-l-timer bg-raised px-4 py-3">
                  <p className="text-xs leading-relaxed text-ink-3">
                    <span className="font-medium text-timer">You'd seen everything in this pool.</span>{' '}
                    History cleared — every episode is back in the draw.
                  </p>
                </div>
              )}
            </div>

            {image && (
              <img src={image} alt="" className="h-fit w-full border border-line object-cover" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
