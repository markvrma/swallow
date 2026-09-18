// The popup can't reliably run cleanup JS when Chrome tears it down (losing focus,
// Escape) -- pagehide/unload aren't guaranteed to fire in time. A runtime Port's
// onDisconnect is: Chrome fires it whenever the popup's context goes away, so the
// popup reports its pending (uncommitted) episode here and this worker undoes it.
import { unwatchEpisodeBeacon } from './client.js'

interface Pending {
  episodeId: string
  token: string | null
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'popup') return
  let pending: Pending | null = null

  port.onMessage.addListener((msg: Pending | null) => {
    pending = msg
  })

  port.onDisconnect.addListener(() => {
    if (pending) unwatchEpisodeBeacon(pending.episodeId, pending.token)
  })
})
