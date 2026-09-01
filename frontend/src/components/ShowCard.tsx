import { useState } from 'react'
import type { LibraryShow } from '../api/types'
import { formatSeasons } from '../lib/format'

interface Props {
  item: LibraryShow
  onRoll: (showId: string) => void
  onRemove: (showId: string) => void
  removing?: boolean
}

/** A library show. Clicking it opens a random episode of just that show.
 *  The poster stays — everything around it is quiet. */
export default function ShowCard({ item, onRoll, onRemove, removing = false }: Props) {
  // Removal takes history and presets with it, so it asks first -- in place, no dialog.
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="relative border border-line bg-card hover:border-hover-line hover:bg-hover-card">
      <button
        onClick={() => onRoll(item.show.id)}
        title={`Random episode of ${item.show.name}`}
        className="flex w-full flex-col text-left"
      >
        {item.show.image_medium ? (
          <img
            src={item.show.image_medium}
            alt={item.show.name}
            className="h-52 w-full border-b border-line-soft object-cover"
          />
        ) : (
          <div className="flex h-52 w-full items-center justify-center border-b border-line-soft bg-raised font-mono text-[11px] text-muted">
            no artwork
          </div>
        )}
        <span className="block px-3.5 pb-4 pt-3.5">
          <span className="block truncate text-[15px] font-medium leading-tight text-ink">
            {item.show.name}
          </span>
          <span className="mt-1.5 block font-mono text-[10px] tracking-[0.04em] text-muted">
            {formatSeasons(item.seasons)}
          </span>
        </span>
        <span className="block w-full border-t border-line-soft px-3.5 py-2 font-mono text-[10px] text-muted">
          {item.remaining_count} / {item.episode_count} left
        </span>
      </button>

      {confirming ? (
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 border-b border-line bg-bar px-2.5 py-2">
          <span className="font-mono text-[10px] text-muted">remove show?</span>
          <span className="flex gap-1.5">
            <button
              disabled={removing}
              onClick={() => onRemove(item.show.id)}
              title="Removes the show, its watch history and its part of every preset"
              className="border border-timer px-2 py-1 font-mono text-[10px] text-timer hover:bg-hover-ground disabled:opacity-50"
            >
              {removing ? '…' : 'yes'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="border border-line px-2 py-1 font-mono text-[10px] text-muted hover:border-hover-line hover:text-ink"
            >
              no
            </button>
          </span>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          title={`Remove ${item.show.name} from your account`}
          aria-label={`Remove ${item.show.name}`}
          className="absolute right-0 top-0 flex h-7 w-7 items-center justify-center border-b border-l border-line bg-bar text-muted hover:bg-hover-ground hover:text-timer"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5 5 13.5h6l.5-9" />
          </svg>
        </button>
      )}
    </div>
  )
}
