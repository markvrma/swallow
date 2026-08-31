import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import * as api from '../api/client'
import type { ShowDetail, ShowSearchResult } from '../api/types'
import { yearRange } from '../lib/format'
import SeasonPicker from './SeasonPicker'

interface Props {
  onClose: () => void
  initialQuery?: string
}

/** Search TVmaze, pick a result, pick seasons, add. One flow, seasons never skippable.
 *  Parents mount this only while it is open, so state starts fresh each time. */
export default function AddShowDialog({ onClose, initialQuery = '' }: Props) {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<ShowSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [detail, setDetail] = useState<ShowDetail | null>(null)
  const [importing, setImporting] = useState(false)
  const [selectedSeasons, setSelectedSeasons] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<number>(0)

  useEffect(() => {
    if (query.trim().length < 2) return
    // Debounce so we don't hammer TVmaze on every keystroke.
    window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(async () => {
      setSearching(true)
      setError(null)
      try {
        setResults(await api.searchShows(query.trim()))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed')
      } finally {
        setSearching(false)
      }
    }, 350)
    return () => window.clearTimeout(debounceRef.current)
  }, [query])

  const choose = async (result: ShowSearchResult) => {
    setImporting(true)
    setError(null)
    try {
      const imported = await api.importShow(result.tvmaze_id)
      setDetail(imported)
      setSelectedSeasons(imported.seasons.filter((s) => s.number !== 0).map((s) => s.number))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const save = async () => {
    if (!detail || selectedSeasons.length === 0) return
    setSaving(true)
    setError(null)
    try {
      await api.addLibraryShow(detail.tvmaze_id, selectedSeasons)
      await queryClient.invalidateQueries({ queryKey: ['library'] })
      await queryClient.invalidateQueries({ queryKey: ['cards'] })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add show')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-[10vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {!detail ? (
          <>
            <input
              autoFocus
              placeholder="Search for a show…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                if (e.target.value.trim().length < 2) setResults([])
              }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 outline-none focus:border-amber-400"
            />
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            <div className="mt-3 max-h-80 space-y-1 overflow-y-auto">
              {searching && <p className="px-2 py-1 text-sm text-zinc-500">Searching…</p>}
              {!searching && query.trim().length >= 2 && results.length === 0 && !error && (
                <p className="px-2 py-1 text-sm text-zinc-500">No matches.</p>
              )}
              {results.map((result) => (
                <button
                  key={result.tvmaze_id}
                  disabled={importing}
                  onClick={() => choose(result)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-zinc-800 disabled:opacity-50"
                >
                  {result.image_medium ? (
                    <img src={result.image_medium} alt="" className="h-14 w-10 rounded object-cover" />
                  ) : (
                    <div className="flex h-14 w-10 items-center justify-center rounded bg-zinc-800 text-lg">
                      📺
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {result.name}
                      {result.in_library && (
                        <span className="ml-2 text-xs text-amber-400">in library</span>
                      )}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {yearRange(result.premiered, result.ended)}
                      {result.status ? ` · ${result.status}` : ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            {importing && <p className="mt-3 text-sm text-zinc-400">Importing episodes…</p>}
          </>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-3">
              {detail.image_medium && (
                <img src={detail.image_medium} alt="" className="h-20 w-14 rounded object-cover" />
              )}
              <div>
                <h2 className="text-lg font-semibold">{detail.name}</h2>
                <p className="text-xs text-zinc-500">{yearRange(detail.premiered, detail.ended)}</p>
              </div>
            </div>
            <SeasonPicker
              seasons={detail.seasons}
              selected={selectedSeasons}
              onChange={setSelectedSeasons}
            />
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDetail(null)}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800"
              >
                Back
              </button>
              <button
                onClick={save}
                disabled={selectedSeasons.length === 0 || saving}
                className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-40"
              >
                {saving ? 'Adding…' : 'Add to library'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
