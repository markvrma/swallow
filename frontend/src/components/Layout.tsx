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
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <path d="M8 1.5c.38 0 .75.02 1.12.07l.36 1.53c.5.14.98.34 1.42.6l1.36-.78c.58.44 1.1.96 1.54 1.54l-.78 1.36c.26.44.46.92.6 1.42l1.53.36c.05.37.07.74.07 1.12s-.02.75-.07 1.12l-1.53.36c-.14.5-.34.98-.6 1.42l.78 1.36a7.5 7.5 0 0 1-1.54 1.54l-1.36-.78c-.44.26-.92.46-1.42.6l-.36 1.53c-.37.05-.74.07-1.12.07s-.75-.02-1.12-.07l-.36-1.53a5.5 5.5 0 0 1-1.42-.6l-1.36.78a7.5 7.5 0 0 1-1.54-1.54l.78-1.36a5.5 5.5 0 0 1-.6-1.42l-1.53-.36A7.5 7.5 0 0 1 .5 8c0-.38.02-.75.07-1.12l1.53-.36c.14-.5.34-.98.6-1.42l-.78-1.36c.44-.58.96-1.1 1.54-1.54l1.36.78c.44-.26.92-.46 1.42-.6l.36-1.53C7.25 1.52 7.62 1.5 8 1.5Z" />
                  <circle cx="8" cy="8" r="2.1" />
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
