import type { LibraryShow } from '../api/types'
import { formatSeasons } from '../lib/format'

interface Props {
  item: LibraryShow
  onRoll: (showId: string) => void
}

/** A library show. Clicking it opens a random episode of just that show. */
export default function ShowCard({ item, onRoll }: Props) {
  return (
    <button
      onClick={() => onRoll(item.show.id)}
      title={`Random episode of ${item.show.name}`}
      className="group w-40 shrink-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 text-left transition-transform hover:-translate-y-1 hover:border-amber-400/60"
    >
      {item.show.image_medium ? (
        <img
          src={item.show.image_medium}
          alt={item.show.name}
          className="h-52 w-full object-cover opacity-90 group-hover:opacity-100"
        />
      ) : (
        <div className="flex h-52 w-full items-center justify-center bg-zinc-800 text-4xl">📺</div>
      )}
      <div className="p-3">
        <p className="truncate text-sm font-semibold">{item.show.name}</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {formatSeasons(item.seasons)} · {item.remaining_count}/{item.episode_count} left
        </p>
      </div>
    </button>
  )
}
