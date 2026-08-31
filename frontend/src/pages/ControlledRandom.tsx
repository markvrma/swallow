import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '../api/client'
import type { Preset } from '../api/types'
import { RUNTIME_BUCKETS } from '../api/types'
import Layout from '../components/Layout'
import { formatSeasons } from '../lib/format'

interface DraftShow {
  showId: string
  seasons: number[]
}

function openRoll(presetId: string) {
  window.open(`/roll?mode=preset&presetId=${presetId}`, '_blank', 'noopener')
}

export default function ControlledRandom() {
  const queryClient = useQueryClient()

  const { data: library } = useQuery({ queryKey: ['library'], queryFn: api.listLibrary })
  const { data: presets } = useQuery({ queryKey: ['presets'], queryFn: api.listPresets })

  const [editing, setEditing] = useState<Preset | null>(null)
  const [building, setBuilding] = useState(false)
  const [name, setName] = useState('')
  const [maxRuntime, setMaxRuntime] = useState<number | null>(null)
  const [draftShows, setDraftShows] = useState<DraftShow[]>([])
  const [error, setError] = useState<string | null>(null)

  const startNew = () => {
    setEditing(null)
    setName('')
    setMaxRuntime(null)
    setDraftShows([])
    setError(null)
    setBuilding(true)
  }

  const startEdit = (preset: Preset) => {
    setEditing(preset)
    setName(preset.name)
    setMaxRuntime(preset.max_runtime)
    setDraftShows(preset.shows.map((ps) => ({ showId: ps.show.id, seasons: ps.seasons })))
    setError(null)
    setBuilding(true)
  }

  // Every selected show must have at least one season -- same rule the API enforces.
  const valid =
    name.trim().length > 0 &&
    draftShows.length > 0 &&
    draftShows.every((d) => d.seasons.length > 0)

  // Live "N episodes match" count, debounced.
  const previewPayload = useMemo(
    () => ({
      max_runtime: maxRuntime,
      shows: draftShows
        .filter((d) => d.seasons.length > 0)
        .map((d) => ({ show_id: d.showId, seasons: d.seasons })),
    }),
    [draftShows, maxRuntime],
  )
  const [preview, setPreview] = useState<{ episode_count: number; remaining_count: number } | null>(null)
  useEffect(() => {
    if (!building || previewPayload.shows.length === 0) return
    const t = window.setTimeout(() => {
      api.previewPreset(previewPayload).then(setPreview).catch(() => setPreview(null))
    }, 300)
    return () => window.clearTimeout(t)
  }, [previewPayload, building])
  const showPreview = preview !== null && previewPayload.shows.length > 0

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        max_runtime: maxRuntime,
        shows: draftShows.map((d) => ({ show_id: d.showId, seasons: d.seasons })),
      }
      return editing ? api.updatePreset(editing.id, payload) : api.createPreset(payload)
    },
    onSuccess: async (preset) => {
      await queryClient.invalidateQueries({ queryKey: ['presets'] })
      setBuilding(false)
      openRoll(preset.id)
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Could not save'),
  })

  const deleteMutation = useMutation({
    mutationFn: (presetId: string) => api.deletePreset(presetId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['presets'] }),
  })

  const toggleShow = (showId: string, allSeasons: number[]) => {
    setDraftShows((current) => {
      const existing = current.find((d) => d.showId === showId)
      if (existing) return current.filter((d) => d.showId !== showId)
      // Selecting a show forces a season choice; default to everything they own.
      return [...current, { showId, seasons: allSeasons }]
    })
  }

  const toggleSeason = (showId: string, season: number) => {
    setDraftShows((current) =>
      current.map((d) =>
        d.showId === showId
          ? {
              ...d,
              seasons: d.seasons.includes(season)
                ? d.seasons.filter((s) => s !== season)
                : [...d.seasons, season].sort((a, b) => a - b),
            }
          : d,
      ),
    )
  }

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Controlled random</h1>
        <Link to="/" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Home
        </Link>
      </div>

      {!building && (
        <div className="space-y-6">
          <button
            onClick={startNew}
            className="w-full rounded-xl border-2 border-dashed border-zinc-700 py-6 text-lg font-semibold text-zinc-300 hover:border-amber-400/60"
          >
            + New controlled random
          </button>

          {(presets?.length ?? 0) > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Saved</h2>
              {presets!.map((preset) => (
                <div
                  key={preset.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {preset.name}
                      {preset.max_runtime && (
                        <span className="ml-2 rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                          ≤ {preset.max_runtime} min
                        </span>
                      )}
                    </p>
                    <p className="mt-1 truncate text-xs text-zinc-500">
                      {preset.shows.map((ps) => `${ps.show.name} ${formatSeasons(ps.seasons)}`).join(' · ')}
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">
                      {preset.remaining_count}/{preset.episode_count} episodes unseen
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => openRoll(preset.id)}
                      className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
                    >
                      🎲 Roll
                    </button>
                    <button
                      onClick={() => startEdit(preset)}
                      className="rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(preset.id)}
                      className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-red-400 hover:bg-zinc-800"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
      )}

      {building && (
        <div className="space-y-8">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-300">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Comfort comedies, short ones"
              className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-300">
              Episode length
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setMaxRuntime(null)}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  maxRuntime === null
                    ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                }`}
              >
                Any
              </button>
              {RUNTIME_BUCKETS.map((bucket) => (
                <button
                  key={bucket}
                  onClick={() => setMaxRuntime(bucket)}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    maxRuntime === bucket
                      ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                      : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                  }`}
                >
                  ≤ {bucket} min
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-300">
              Shows & seasons
              <span className="ml-2 font-normal text-zinc-500">
                selecting a show requires choosing its seasons
              </span>
            </label>
            {(library?.length ?? 0) === 0 && (
              <p className="text-sm text-zinc-500">
                Your library is empty —{' '}
                <Link to="/?add=1" className="text-amber-400 hover:underline">
                  add a show
                </Link>{' '}
                first.
              </p>
            )}
            <div className="space-y-2">
              {library?.map((item) => {
                const draft = draftShows.find((d) => d.showId === item.show.id)
                return (
                  <div
                    key={item.show.id}
                    className={`rounded-xl border p-4 transition-colors ${
                      draft ? 'border-amber-400/50 bg-zinc-900' : 'border-zinc-800 bg-zinc-900/50'
                    }`}
                  >
                    <label className="flex cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={Boolean(draft)}
                        onChange={() => toggleShow(item.show.id, item.seasons)}
                        className="h-4 w-4 accent-amber-400"
                      />
                      <span className="font-medium">{item.show.name}</span>
                      <span className="text-xs text-zinc-500">
                        you own {formatSeasons(item.seasons)}
                      </span>
                    </label>
                    {draft && (
                      <div className="mt-3 flex flex-wrap gap-2 pl-7">
                        {item.seasons.map((season) => (
                          <button
                            key={season}
                            onClick={() => toggleSeason(item.show.id, season)}
                            className={`rounded-md border px-2.5 py-1 text-xs ${
                              draft.seasons.includes(season)
                                ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                                : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                            }`}
                          >
                            {season === 0 ? 'Specials' : `S${season}`}
                          </button>
                        ))}
                        {draft.seasons.length === 0 && (
                          <span className="text-xs text-amber-400/80">
                            pick at least one season
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex items-center gap-4">
            <button
              disabled={!valid || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className="rounded-lg bg-amber-400 px-6 py-2.5 font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-40"
            >
              {saveMutation.isPending ? 'Saving…' : editing ? 'Save & roll' : 'Save & roll 🎲'}
            </button>
            <button
              onClick={() => setBuilding(false)}
              className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm hover:bg-zinc-800"
            >
              Cancel
            </button>
            {showPreview && (
              <span className={`text-sm ${preview.episode_count === 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                {preview.episode_count === 0
                  ? 'No episodes match this configuration'
                  : `${preview.episode_count} episodes match · ${preview.remaining_count} unseen`}
              </span>
            )}
          </div>
        </div>
      )}
    </Layout>
  )
}
