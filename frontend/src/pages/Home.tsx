import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '../api/client'
import Layout from '../components/Layout'
import ShowCard from '../components/ShowCard'
import AddShowDialog from '../components/AddShowDialog'
import { useAuth } from '../lib/auth'
import { useRoll } from '../lib/useRoll'

/** Braille, not icon fonts: a full 6-dot cell reads as a die face, and a middle-row
 *  line with a fat cell in it reads as a row of knobs. */
const DIE = '\u283f'
const KNOBS = '\u2824\u283f\u2824'

function LoggedOutHome() {
  return (
    <div className="flex flex-col items-center py-16">
      <div className="mb-12 max-w-xl text-center">
        <h1 className="text-[34px] font-medium leading-[1.25] tracking-[-0.015em] text-pretty">
          You already know what you like.
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-3 text-pretty">
          Swallow keeps your shows and hands you one episode. No grid to scroll, no thumbnails
          competing for you, no autoplaying trailer. One button, one answer.
        </p>
      </div>

      <div className="flex w-[340px] max-w-full flex-col gap-2.5">
        <Link
          to="/login"
          title="Random needs to know your shows first"
          className="flex items-center justify-center gap-3 border border-bright bg-bright py-5 text-lg font-semibold text-white hover:bg-bright-hover"
        >
          <span className="font-nerd text-lg leading-none">{DIE}</span>
          Random
        </Link>
        <Link
          to="/login"
          title="Controlled random needs to know your shows first"
          className="border border-line py-3 text-center text-sm font-medium text-ink-2 hover:border-hover-line hover:bg-hover-ground hover:text-ink"
        >
          Controlled random
        </Link>
        <Link
          to="/register"
          className="border border-line py-3 text-center text-sm font-medium text-ink-2 hover:border-hover-line hover:bg-hover-ground hover:text-ink"
        >
          Create an account
        </Link>
      </div>

      <p className="mt-6 text-center text-[11px] text-faint">
        Random and controlled random need to know your shows first.
      </p>

      <p className="mt-10 text-center text-[11px] leading-relaxed text-faint">
        Already have an account?{' '}
        <Link to="/login" className="text-ink-2 underline-offset-2 hover:text-ink hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}

function LoggedInHome() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const { roll, box } = useRoll()
  const [dialogOpen, setDialogOpen] = useState(searchParams.get('add') === '1')
  const [searchSeed, setSearchSeed] = useState('')

  const { data: cards, isLoading: cardsLoading } = useQuery({
    queryKey: ['cards'],
    queryFn: () => api.libraryCards(5),
  })
  const { data: library } = useQuery({ queryKey: ['library'], queryFn: api.listLibrary })
  const { data: presets } = useQuery({ queryKey: ['presets'], queryFn: api.listPresets })

  const shuffleCards = () => queryClient.invalidateQueries({ queryKey: ['cards'] })

  // Removing a show also drops its history and its slice of every preset, so all
  // three lists are stale afterwards.
  const removeShow = useMutation({
    mutationFn: (showId: string) => api.removeLibraryShow(showId),
    onSuccess: () =>
      Promise.all(
        ['cards', 'library', 'presets'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  })

  const openDialog = (seed = '') => {
    setSearchSeed(seed)
    setDialogOpen(true)
    if (searchParams.get('add')) setSearchParams({}, { replace: true })
  }

  const hasShows = (library?.length ?? 0) > 0

  return (
    <div>
      {/* Search + add -- top left, per spec */}
      <div className="mb-9 flex items-center gap-2">
        <div className="flex h-[34px] w-[300px] max-w-full items-center gap-2 border border-line bg-raised px-3">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="shrink-0 text-faint">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5 L14 14" />
          </svg>
          <input
            placeholder="Search your shows"
            onFocus={(e) => {
              openDialog(e.target.value)
              e.target.blur()
            }}
            onChange={() => {}}
            value=""
            className="w-full bg-transparent text-[13px] text-ink outline-none"
          />
        </div>
        <button
          onClick={() => openDialog()}
          title="Add a show"
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center border border-line bg-raised text-ink-3 hover:border-hover-line hover:bg-hover-ground hover:text-ink"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
      </div>

      {/* The big two */}
      <div className="mb-10 flex flex-col gap-3 sm:flex-row">
        <button
          disabled={!hasShows}
          onClick={() => roll({ mode: 'random' })}
          title={hasShows ? 'Hand me an episode' : 'Add a show first'}
          className="flex flex-1 items-center justify-center gap-3 border border-bright bg-bright py-7 text-[19px] font-semibold text-white hover:bg-bright-hover disabled:border-line-soft disabled:bg-transparent disabled:text-faint"
        >
          <span className="font-nerd text-2xl leading-none">{DIE}</span>
          Random
        </button>
        <button
          disabled={!hasShows}
          onClick={() => navigate('/controlled')}
          title={hasShows ? 'Pick shows, seasons and episode length' : 'Add a show first'}
          className="flex flex-1 items-center justify-center gap-3 border border-line py-7 text-[19px] font-medium text-ink-2 hover:border-hover-line hover:bg-hover-ground hover:text-ink disabled:border-line-soft disabled:bg-transparent disabled:text-faint"
        >
          <span className="font-nerd text-2xl leading-none tracking-[-0.1em]">{KNOBS}</span>
          Controlled random
        </button>
      </div>

      {/* Saved presets */}
      {(presets?.length ?? 0) > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
            Saved controlled randoms
          </h2>
          <div className="flex flex-wrap gap-2">
            {presets!.map((preset) => (
              <button
                key={preset.id}
                onClick={() => roll({ mode: 'preset', presetId: preset.id })}
                title={`${preset.episode_count} episodes · ${preset.remaining_count} unseen`}
                className="flex items-baseline gap-2.5 border border-line bg-raised px-3.5 py-2 text-[13px] text-ink-2 hover:border-hover-line hover:bg-hover-ground"
              >
                {preset.name}
                <span className="font-mono text-[11px] text-muted">
                  {preset.max_runtime ? `≤${preset.max_runtime}m` : 'any'}
                </span>
              </button>
            ))}
            <button
              onClick={() => navigate('/controlled')}
              className="border border-dashed border-line px-3.5 py-2 text-[13px] text-muted hover:border-hover-line hover:bg-hover-ground"
            >
              New…
            </button>
          </div>
        </section>
      )}

      {/* Five cards, no more */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
            Pick one, or don't
          </h2>
          {(library?.length ?? 0) > 5 && (
            <button
              onClick={shuffleCards}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-ink"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M13.6 8a5.6 5.6 0 1 1-1.7-4" />
                <path d="M13.9 2.4v3.3h-3.3" />
              </svg>
              Shuffle
            </button>
          )}
        </div>
        {cardsLoading ? (
          <p className="font-mono text-xs text-muted">Loading…</p>
        ) : (cards?.length ?? 0) === 0 ? (
          <div className="border border-dashed border-line p-10 text-center">
            <p className="text-sm text-ink-3">Your library is empty.</p>
            <button
              onClick={() => openDialog()}
              className="mt-4 border border-bright bg-bright px-4 py-2 text-sm font-semibold text-white hover:bg-bright-hover"
            >
              Add your first show
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {cards!.map((item) => (
              <ShowCard
                key={item.show.id}
                item={item}
                onRoll={(showId) => roll({ mode: 'show', showId })}
                onRemove={(showId) => removeShow.mutate(showId)}
                removing={removeShow.isPending && removeShow.variables === item.show.id}
              />
            ))}
          </div>
        )}
        {(library?.length ?? 0) > 5 && (
          <p className="mt-3 text-[11px] text-faint">
            {cards?.length ?? 0} of {library!.length} shows. Fewer options, faster decisions.
          </p>
        )}
      </section>

      {dialogOpen && (
        <AddShowDialog onClose={() => setDialogOpen(false)} initialQuery={searchSeed} />
      )}
      {box}
    </div>
  )
}

export default function Home() {
  const { user, loading } = useAuth()

  return (
    <Layout>
      {loading ? (
        <div className="py-24 text-center font-mono text-xs text-muted">…</div>
      ) : user ? (
        <LoggedInHome />
      ) : (
        <LoggedOutHome />
      )}
    </Layout>
  )
}
