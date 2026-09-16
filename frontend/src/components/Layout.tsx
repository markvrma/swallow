import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { elapsedMinutes, isStopped } from '../lib/deliberation'
import BrailleField from './BrailleField'
import OwlMark from './OwlMark'

function DeliberationTimer() {
  const [minutes, setMinutes] = useState(elapsedMinutes)
  const [stopped, setStopped] = useState(isStopped)

  useEffect(() => {
    const tick = window.setInterval(() => {
      setMinutes(elapsedMinutes())
      setStopped(isStopped())
    }, 1000)
    return () => window.clearInterval(tick)
  }, [])

  return (
    <div className="font-mono text-xs tracking-tight text-timer">
      {stopped ? 'You deliberated for' : "Time you've spent deliberating :"}{' '}
      <span className="font-medium">{minutes}</span> {minutes === 1 ? 'minute' : 'minutes'}
    </div>
  )
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth()

  return (
    <div className="relative flex min-h-screen flex-col">
      <BrailleField />
      <header className="flex h-16 items-center justify-between gap-6 border-b border-line bg-bar px-6 sm:px-10">
        <Link to="/" className="flex items-center gap-3">
          <OwlMark className="text-bright" />
          <span className="font-nerd text-[26px] font-medium lowercase leading-none tracking-[0.04em]">
            swallow
          </span>
          <span className="hidden self-end pb-0.5 text-[11px] text-muted sm:inline">stop choosing</span>
        </Link>
        <div className="flex items-center gap-5">
          <DeliberationTimer />
          {user && (
            <>
              <Link
                to="/settings"
                title="Settings"
                className="flex h-[26px] w-[26px] items-center justify-center border border-line text-ink-3 hover:border-hover-line hover:bg-hover-ground hover:text-ink"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <circle cx="8" cy="8" r="2.3" />
                  <path d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6" />
                </svg>
              </Link>
              <button
                onClick={() => signOut()}
                className="border border-line px-3 py-1 text-xs text-ink-3 hover:border-hover-line hover:bg-hover-ground hover:text-ink"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl grow px-6 py-8 sm:px-10">{children}</main>
    </div>
  )
}
