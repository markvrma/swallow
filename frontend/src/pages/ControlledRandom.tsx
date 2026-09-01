import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '../api/client'
import type { Preset } from '../api/types'
import { RUNTIME_BUCKETS } from '../api/types'
import Layout from '../components/Layout'
import { formatSeasons } from '../lib/format'
import { useRoll } from '../lib/useRoll'

interface DraftShow {
  showId: string
  seasons: number[]
}

const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.12em] text-muted'

export default function ControlledRandom() {
  const queryClient = useQueryClient()
  const { roll, box } = useRoll()

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
      roll({ mode: 'preset', presetId: preset.id })
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

  const segment = (active: boolean) =>
    active
      ? 'bg-ink-2 font-medium text-on-solid'
      : 'text-muted hover:text-ink'

  return (
    <Layout>
      <div className="max-w-[860px]">
        <div className="mb-7 flex items-baseline justify-between">
          <h1 className="text-[22px] font-medium tracking-[-0.01em]">Controlled random</h1>
          <Link to="/" className="text-xs text-muted hover:text-ink">
            Back
          </Link>
        </div>

        {!building && (
          <div className="space-y-7">
            <button
              onClick={startNew}
              className="w-full border border-dashed border-line py-6 text-sm font-medium text-muted hover:border-hover-line hover:bg-hover-ground hover:text-ink"
            >
              New controlled random
            </button>

            {(presets?.length ?? 0) > 0 && (
              <section>
                <h2 className={`${LABEL} mb-3`}>Saved</h2>
                <div className="space-y-1.5">
                  {presets!.map((preset) => (
                    <div
                      key={preset.id}
                      className="flex flex-wrap items-center justify-between gap-3 border border-line bg-raised p-4"
                    >
                      <div className="min-w-0">
                        <p className="flex items-baseline gap-2.5 text-sm font-medium">
                          {preset.name}
                          <span className="font-mono text-[11px] text-muted">
                            {preset.max_runtime ? `≤${preset.max_runtime}m` : 'any'}
                          </span>
                        </p>
                        <p className="mt-1 truncate text-[11px] text-faint">
                          {preset.shows.map((ps) => `${ps.show.name} ${formatSeasons(ps.seasons)}`).join(' · ')}
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-muted">
                          {preset.remaining_count} / {preset.episode_count} unseen
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          onClick={() => roll({ mode: 'preset', presetId: preset.id })}
                          className="border border-bright bg-bright px-4 py-2 text-xs font-semibold text-white hover:bg-bright-hover"
                        >
                          Roll
                        </button>
                        <button
                          onClick={() => startEdit(preset)}
                          className="border border-line px-3 py-2 text-xs text-ink-2 hover:border-hover-line hover:bg-hover-ground hover:text-ink"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(preset.id)}
                          className="border border-line px-3 py-2 text-xs text-timer hover:border-hover-line hover:bg-hover-ground"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {building && (
          <div>
            <div className="mb-7">
              <div className={`${LABEL} mb-2.5`}>Name</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Half-hour comfort"
                className="w-[340px] max-w-full border border-line bg-raised px-3 py-2.5 text-sm text-ink outline-none focus:border-hover-line"
              />
            </div>

            <div className="mb-7">
              <div className={`${LABEL} mb-2.5`}>Episode length</div>
              <div className="flex w-fit max-w-full flex-wrap border border-line bg-raised">
                <button
                  onClick={() => setMaxRuntime(null)}
                  className={`border-r border-line px-4 py-2.5 text-[13px] ${segment(maxRuntime === null)}`}
                >
                  Any
                </button>
                {RUNTIME_BUCKETS.map((bucket, index) => (
                  <button
                    key={bucket}
                    onClick={() => setMaxRuntime(bucket)}
                    className={`px-4 py-2.5 text-[13px] ${
                      index < RUNTIME_BUCKETS.length - 1 ? 'border-r border-line' : ''
                    } ${segment(maxRuntime === bucket)}`}
                  >
                    ≤ {bucket}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-faint">
                Minutes, inclusive. A 30-minute sitcom counts as “≤ 30”.
              </p>
            </div>

            <div className="mb-7">
              <div className="mb-2.5 flex items-baseline gap-2.5">
                <span className={LABEL}>Shows &amp; seasons</span>
                <span className="text-[11px] text-faint">
                  a selected show needs at least one season
                </span>
              </div>
              {(library?.length ?? 0) === 0 && (
                <p className="text-sm text-muted">
                  Your library is empty —{' '}
                  <Link to="/?add=1" className="text-ink-2 hover:text-ink hover:underline">
                    add a show
                  </Link>{' '}
                  first.
                </p>
              )}
              <div className="space-y-1.5">
                {library?.map((item) => {
                  const draft = draftShows.find((d) => d.showId === item.show.id)
                  return (
                    <div
                      key={item.show.id}
                      className={`border p-4 ${
                        draft ? 'border-hover-line bg-raised' : 'border-line bg-transparent'
                      }`}
                    >
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={Boolean(draft)}
                          onChange={() => toggleShow(item.show.id, item.seasons)}
                          className="h-3.5 w-3.5 rounded-none accent-[var(--ink-2)]"
                        />
                        <span className={`text-sm ${draft ? 'font-medium text-ink' : 'text-ink-3'}`}>
                          {item.show.name}
                        </span>
                        <span className="font-mono text-[11px] text-faint">
                          you own {formatSeasons(item.seasons)}
                        </span>
                      </label>
                      {draft && (
                        <div className="mt-3 flex flex-wrap gap-1.5 pl-[26px]">
                          {item.seasons.map((season) => (
                            <button
                              key={season}
                              onClick={() => toggleSeason(item.show.id, season)}
                              className={`border px-2.5 py-1 font-mono text-[11px] ${
                                draft.seasons.includes(season)
                                  ? 'border-ink-2 bg-ink-2 text-on-solid'
                                  : 'border-line text-muted hover:border-hover-line hover:text-ink'
                              }`}
                            >
                              {season === 0 ? 'S0' : `S${season}`}
                            </button>
                          ))}
                          {draft.seasons.length === 0 && (
                            <span className="self-center text-[11px] text-timer">
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

            {error && <p className="mb-4 text-xs text-timer">{error}</p>}

            <div className="flex flex-wrap items-center gap-4 border-t border-line pt-5">
              <button
                disabled={!valid || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                className="border border-ink-2 bg-ink-2 px-6 py-3 text-sm font-medium text-on-solid hover:bg-hover-solid disabled:border-line-soft disabled:bg-transparent disabled:text-faint"
              >
                {saveMutation.isPending ? 'Saving…' : 'Save and roll'}
              </button>
              <button
                onClick={() => setBuilding(false)}
                className="border border-line px-5 py-3 text-[13px] text-ink-3 hover:border-hover-line hover:bg-hover-ground hover:text-ink"
              >
                Cancel
              </button>
              {showPreview && (
                <span className={`font-mono text-xs ${preview.episode_count === 0 ? 'text-timer' : 'text-muted'}`}>
                  {preview.episode_count === 0
                    ? 'No episodes match this configuration'
                    : `${preview.episode_count} episodes match · ${preview.remaining_count} unseen`}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
      {box}
    </Layout>
  )
}
