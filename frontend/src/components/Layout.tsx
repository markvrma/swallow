import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut, refresh } = useAuth()

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 pb-16">
      <header className="flex items-center justify-between py-6">
        <Link to="/" className="text-xl font-bold tracking-tight">
          <span className="text-amber-400">swallow</span>
          <span className="ml-2 text-xs font-normal text-zinc-500">
            stop choosing. start watching.
          </span>
        </Link>
        {user && (
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <span className="hidden sm:inline">{user.email}</span>
            <button
              onClick={async () => {
                await signOut()
                await refresh()
              }}
              className="rounded-md border border-zinc-700 px-3 py-1 hover:bg-zinc-800"
            >
              Sign out
            </button>
          </div>
        )}
      </header>
      <main>{children}</main>
    </div>
  )
}
