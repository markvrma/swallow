import type { SeasonInfo } from '../api/types'

interface Props {
  seasons: SeasonInfo[]
  selected: number[]
  onChange: (seasons: number[]) => void
}

/** Checkbox-per-season plus quick range helpers. Selecting none is not a valid state
 *  the parent should accept -- adding a show is always coupled with picking seasons. */
export default function SeasonPicker({ seasons, selected, onChange }: Props) {
  const toggle = (number: number) => {
    onChange(
      selected.includes(number)
        ? selected.filter((s) => s !== number)
        : [...selected, number].sort((a, b) => a - b),
    )
  }

  const regular = seasons.filter((s) => s.number !== 0)
  const specials = seasons.find((s) => s.number === 0)

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-300">Seasons</span>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => onChange(regular.map((s) => s.number))}
            className="text-amber-400 hover:underline"
          >
            All
          </button>
          <button type="button" onClick={() => onChange([])} className="text-zinc-500 hover:underline">
            None
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {regular.map((season) => (
          <button
            key={season.number}
            type="button"
            onClick={() => toggle(season.number)}
            title={`${season.episode_count} episodes`}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
              selected.includes(season.number)
                ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
            }`}
          >
            S{season.number}
            <span className="ml-1 text-xs opacity-60">·{season.episode_count}</span>
          </button>
        ))}
        {specials && (
          <button
            type="button"
            onClick={() => toggle(0)}
            title={`${specials.episode_count} specials`}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
              selected.includes(0)
                ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                : 'border-dashed border-zinc-700 text-zinc-500 hover:border-zinc-500'
            }`}
          >
            Specials
            <span className="ml-1 text-xs opacity-60">·{specials.episode_count}</span>
          </button>
        )}
      </div>
      {selected.length === 0 && (
        <p className="mt-2 text-xs text-amber-400/80">Select at least one season.</p>
      )}
    </div>
  )
}
