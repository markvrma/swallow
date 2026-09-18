import { setTokenGetter, listPresets, pickEpisode, unwatchEpisode, neverShowEpisode, ApiError } from './client.js'
import type { PickMode, PickResponse, Preset } from './types.js'

const FRONTEND_PATTERNS = ['https://swallow-mocha.vercel.app/*', 'http://127.0.0.1:5173/*']

// The popup can be torn down without warning (losing focus, Escape) -- pagehide/unload
// aren't reliable there. A Port to the background worker is: its onDisconnect is
// guaranteed to fire, so the worker (not this popup) does the actual cleanup fetch.
const port = chrome.runtime.connect({ name: 'popup' })

// Cached so port updates always carry a usable token without an extra round-trip.
let lastToken: string | null = null

// Reads the session token out of an already-open, signed-in web app tab.
// window.Clerk is Clerk's documented public global -- this is not internals-scraping.
async function getToken(): Promise<string | null> {
  const tabs = await chrome.tabs.query({ url: FRONTEND_PATTERNS })
  const tab = tabs[0]
  if (!tab?.id) return null

  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func: async () => {
      const clerk = (window as unknown as { Clerk?: { session?: { getToken(): Promise<string | null> } } }).Clerk
      return clerk?.session ? await clerk.session.getToken() : null
    },
  })
  lastToken = injection?.result ?? null
  return lastToken
}

setTokenGetter(getToken)

interface RollArgs {
  mode: PickMode
  presetId?: string
}

const root = document.getElementById('root')!

let presets: Preset[] = []
let presetsError: string | null = null
let args: RollArgs | null = null
let result: PickResponse | null = null
let loading = false
let error: string | null = null
// Set only by the yes button. Closing the popup any other way (losing focus,
// Escape) must undo pick()'s watched-history row, same as the web app's EpisodeBox.
let committed = false

function reportPending() {
  port.postMessage(
    result && !committed ? { episodeId: result.episode.id, token: lastToken } : null,
  )
}

function render() {
  reportPending()
  if (args) {
    root.innerHTML = renderResult()
    wireResultButtons()
  } else {
    root.innerHTML = renderHome()
    wireHomeButtons()
  }
}

function renderHome(): string {
  const list =
    presetsError != null
      ? `<p class="error">${escapeHtml(presetsError)}</p>`
      : presets.length === 0
        ? `<p class="muted">No controlled randoms yet.</p>`
        : `<ul id="preset-list">${presets
            .map((p) => `<li><button class="preset" data-id="${p.id}">${escapeHtml(p.name)}</button></li>`)
            .join('')}</ul>`

  return `
    <button id="random-btn" class="primary">Random</button>
    <h2>Controlled randoms</h2>
    ${list}
  `
}

function renderResult(): string {
  if (loading) return `<p class="muted">rolling...</p>`
  if (error) return `<p class="error">${escapeHtml(error)}</p><button id="back-btn">Back</button>`
  if (!result) return ''

  const code = `S${String(result.episode.season).padStart(2, '0')}E${String(result.episode.number).padStart(2, '0')}`

  return `
    <p class="episode">${escapeHtml(result.show.name)} &middot; ${code}<br>${escapeHtml(result.episode.name ?? '')}</p>
    <div class="actions">
      <button id="yes-btn" class="primary">yes</button>
      <button id="no-btn">no</button>
      <button id="ew-btn">ew</button>
    </div>
  `
}

function wireHomeButtons() {
  document.getElementById('random-btn')?.addEventListener('click', () => roll({ mode: 'random' }))
  document.querySelectorAll<HTMLButtonElement>('.preset').forEach((btn) => {
    btn.addEventListener('click', () => roll({ mode: 'preset', presetId: btn.dataset.id }))
  })
}

function wireResultButtons() {
  document.getElementById('back-btn')?.addEventListener('click', closeResult)
  document.getElementById('yes-btn')?.addEventListener('click', () => {
    committed = true
    closeResult()
  })
  document.getElementById('no-btn')?.addEventListener('click', () => rerollAfter(unwatchEpisode))
  document.getElementById('ew-btn')?.addEventListener('click', () => rerollAfter(neverShowEpisode))
}

function roll(next: RollArgs) {
  args = next
  result = null
  error = null
  committed = false
  loading = true
  render()
  pickEpisode(next.mode, { presetId: next.presetId })
    .then((r) => {
      result = r
    })
    .catch((err) => {
      error = err instanceof ApiError ? err.message : 'Could not pick an episode'
    })
    .finally(() => {
      loading = false
      render()
    })
}

function closeResult() {
  args = null
  result = null
  error = null
  render()
}

async function rerollAfter(undo: (episodeId: string) => Promise<void>) {
  if (!result || !args) return
  loading = true
  render()
  try {
    await undo(result.episode.id)
    roll(args)
  } catch (err) {
    error = err instanceof ApiError ? err.message : 'Could not pick an episode'
    loading = false
    render()
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}

render()
listPresets()
  .then((p) => {
    presets = p
  })
  .catch((err) => {
    presetsError =
      err instanceof ApiError && err.status === 401
        ? 'Sign in to the web app first.'
        : err instanceof Error
          ? err.message
          : 'Could not load presets'
  })
  .finally(render)
