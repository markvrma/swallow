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
              <span className="hidden h-[18px] w-px bg-line sm:block" />
              <span className="hidden text-xs text-muted sm:inline">{user.email}</span>
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
