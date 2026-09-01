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
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Seasons</span>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => onChange(regular.map((s) => s.number))}
            className="text-muted hover:text-ink"
          >
            All
          </button>
          <button type="button" onClick={() => onChange([])} className="text-muted hover:text-ink">
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
            className={`border px-2.5 py-1 font-mono text-[11px] ${
              selected.includes(season.number)
                ? 'border-ink-2 bg-ink-2 text-on-solid'
                : 'border-line text-muted hover:border-hover-line hover:text-ink'
            }`}
          >
            S{season.number}
            <span className="ml-1 opacity-60">·{season.episode_count}</span>
          </button>
        ))}
        {specials && (
          <button
            type="button"
            onClick={() => toggle(0)}
            title={`${specials.episode_count} specials`}
            className={`border px-2.5 py-1 font-mono text-[11px] ${
              selected.includes(0)
                ? 'border-ink-2 bg-ink-2 text-on-solid'
                : 'border-dashed border-line text-muted hover:border-hover-line hover:text-ink'
            }`}
          >
            Specials
            <span className="ml-1 opacity-60">·{specials.episode_count}</span>
          </button>
        )}
      </div>
      {selected.length === 0 && (
        <p className="mt-2 text-[11px] text-timer">Select at least one season.</p>
      )}
    </div>
  )
}
