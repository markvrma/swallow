import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '../api/client'
import Layout from '../components/Layout'
import ShowCard from '../components/ShowCard'
import AddShowDialog from '../components/AddShowDialog'
import { useAuth } from '../lib/auth'

/** Open the roll page in a NEW TAB, synchronously.
 *
 *  Deliberately not `await pick(); window.open(...)`: popup blockers kill any
 *  window.open that happens after an await. The new tab performs the pick itself.
 */
function openRoll(params: Record<string, string>) {
  const search = new URLSearchParams(params).toString()
  window.open(`/roll?${search}`, '_blank', 'noopener')
}

function LoggedOutHome() {
  return (
    <div className="mt-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight">
        Stop scrolling. <span className="text-amber-400">Watch something.</span>
      </h1>
      <p className="mx-auto mt-4 max-w-md text-zinc-400">
        Tell Swallow the shows you love and it hands you an episode you haven't seen lately.
        No browsing, no decision paralysis.
      </p>
      <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          to="/register"
          className="w-56 rounded-xl bg-amber-400 py-3 text-center font-semibold text-zinc-950 hover:bg-amber-300"
        >
          Create an account
        </Link>
        <Link
          to="/login"
          title="Random needs to know your shows first"
          className="w-56 rounded-xl border border-zinc-700 py-3 text-center font-semibold text-zinc-300 hover:bg-zinc-800"
        >
          Random
        </Link>
        <Link
          to="/login"
          title="Controlled random needs to know your shows first"
          className="w-56 rounded-xl border border-zinc-700 py-3 text-center font-semibold text-zinc-300 hover:bg-zinc-800"
        >
          Controlled random
        </Link>
      </div>
      <p className="mt-6 text-xs text-zinc-600">
        Random and controlled random unlock once you've signed in and picked your shows.
      </p>
    </div>
  )
}

function LoggedInHome() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [dialogOpen, setDialogOpen] = useState(searchParams.get('add') === '1')
  const [searchSeed, setSearchSeed] = useState('')

  const { data: cards, isLoading: cardsLoading } = useQuery({
    queryKey: ['cards'],
    queryFn: () => api.libraryCards(5),
  })
  const { data: library } = useQuery({ queryKey: ['library'], queryFn: api.listLibrary })
  const { data: presets } = useQuery({ queryKey: ['presets'], queryFn: api.listPresets })

  const shuffleCards = () => queryClient.invalidateQueries({ queryKey: ['cards'] })

  const openDialog = (seed = '') => {
    setSearchSeed(seed)
    setDialogOpen(true)
    if (searchParams.get('add')) setSearchParams({}, { replace: true })
  }

  const hasShows = (library?.length ?? 0) > 0

  return (
    <div className="space-y-10">
      {/* Search + add -- top left, per spec */}
      <div className="flex items-center gap-2">
        <input
          placeholder="Search your next show…"
          onFocus={(e) => {
            openDialog(e.target.value)
            e.target.blur()
          }}
          onChange={() => {}}
          value=""
          className="w-64 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm outline-none focus:border-amber-400"
        />
        <button
          onClick={() => openDialog()}
          title="Add a show"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 text-lg text-amber-400 hover:bg-zinc-800"
        >
          +
        </button>
      </div>

      {/* The big two */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          disabled={!hasShows}
          onClick={() => openRoll({ mode: 'random' })}
          title={hasShows ? 'Open a random episode in a new tab' : 'Add a show first'}
          className="flex-1 rounded-2xl bg-amber-400 py-8 text-2xl font-bold text-zinc-950 shadow-lg shadow-amber-400/10 transition-transform hover:scale-[1.01] hover:bg-amber-300 disabled:opacity-30 disabled:hover:scale-100"
        >
          🎲 Random
        </button>
        <button
          disabled={!hasShows}
          onClick={() => navigate('/controlled')}
          title={hasShows ? 'Pick shows, seasons and episode length' : 'Add a show first'}
          className="flex-1 rounded-2xl border-2 border-zinc-700 py-8 text-2xl font-bold text-zinc-200 transition-transform hover:scale-[1.01] hover:border-amber-400/60 disabled:opacity-30 disabled:hover:scale-100"
        >
          🎛 Controlled random
        </button>
      </div>

      {/* Saved presets */}
      {(presets?.length ?? 0) > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Saved controlled randoms
          </h2>
          <div className="flex flex-wrap gap-2">
            {presets!.map((preset) => (
              <button
                key={preset.id}
                onClick={() => openRoll({ mode: 'preset', presetId: preset.id })}
                title={`${preset.episode_count} episodes · ${preset.remaining_count} unseen`}
                className="rounded-full border border-zinc-700 px-4 py-2 text-sm hover:border-amber-400/60 hover:bg-zinc-800"
              >
                {preset.name}
                {preset.max_runtime && (
                  <span className="ml-2 text-xs text-zinc-500">≤{preset.max_runtime}m</span>
                )}
              </button>
            ))}
            <button
              onClick={() => navigate('/controlled')}
              className="rounded-full border border-dashed border-zinc-600 px-4 py-2 text-sm text-zinc-400 hover:border-amber-400/60"
            >
              + New controlled random
            </button>
          </div>
        </section>
      )}

      {/* Five cards, no more */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Tap a show for a random episode
          </h2>
          {(library?.length ?? 0) > 5 && (
            <button onClick={shuffleCards} className="text-sm text-amber-400 hover:underline">
              ↻ Shuffle
            </button>
          )}
        </div>
        {cardsLoading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (cards?.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-700 p-10 text-center">
            <p className="text-zinc-400">Your library is empty.</p>
            <button
              onClick={() => openDialog()}
              className="mt-3 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
            >
              + Add your first show
            </button>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {cards!.map((item) => (
              <ShowCard
                key={item.show.id}
                item={item}
                onRoll={(showId) => openRoll({ mode: 'show', showId })}
              />
            ))}
          </div>
        )}
        {(library?.length ?? 0) > 5 && (
          <p className="mt-2 text-xs text-zinc-600">
            Showing 5 of {library!.length} shows — fewer options, faster decisions.
          </p>
        )}
      </section>

      {dialogOpen && (
        <AddShowDialog onClose={() => setDialogOpen(false)} initialQuery={searchSeed} />
      )}
    </div>
  )
}

export default function Home() {
  const { user, loading } = useAuth()

  return (
    <Layout>
      {loading ? (
        <div className="mt-24 text-center text-zinc-500">…</div>
      ) : user ? (
        <LoggedInHome />
      ) : (
        <LoggedOutHome />
      )}
    </Layout>
  )
}
