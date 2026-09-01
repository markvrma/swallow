const KEY = 'swallow.deliberation'

interface State {
  start: number
  stoppedAt: number | null
}

/** The clock belongs to the tab session, not to a page load: it survives reloads and
 *  navigation, and stops for good once the user commits to watching something. */
function read(): State {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as State
      if (typeof parsed.start === 'number') return parsed
    }
  } catch {
    /* private mode, blocked storage -- fall through */
  }
  const fresh: State = { start: Date.now(), stoppedAt: null }
  write(fresh)
  return fresh
}

function write(state: State) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* nothing we can do, the timer just restarts */
  }
}

export function elapsedMinutes(): number {
  const { start, stoppedAt } = read()
  return Math.floor(((stoppedAt ?? Date.now()) - start) / 60000)
}

export function isStopped(): boolean {
  return read().stoppedAt !== null
}

/** Called when the user picks an episode to actually watch. */
export function stopDeliberating() {
  const state = read()
  if (state.stoppedAt === null) write({ ...state, stoppedAt: Date.now() })
}

/** Called when the user starts choosing again after having committed to something:
 *  a stopped clock stays frozen forever otherwise, which just reads as broken. */
export function restartDeliberating() {
  if (isStopped()) write({ start: Date.now(), stoppedAt: null })
}
