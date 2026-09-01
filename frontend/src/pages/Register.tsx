import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import * as api from '../api/client'
import { useAuth } from '../lib/auth'
import Layout from '../components/Layout'
import VerifyCodeForm from '../components/VerifyCodeForm'

export default function Register() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Set once the account exists and the code is in the post.
  const [pending, setPending] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { email: pendingEmail } = await api.register(email, password)
      setPending(pendingEmail)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-sm py-16">
        {pending ? (
          <VerifyCodeForm
            email={pending}
            onBack={() => setPending(null)}
            onVerified={async () => {
              await refresh()
              // Straight into picking shows -- an empty library can't roll anything.
              navigate('/?add=1')
            }}
          />
        ) : (
        <>
        <h1 className="mb-2 text-[22px] font-medium tracking-[-0.01em]">Create your account</h1>
        <p className="mb-6 text-sm text-ink-3">
          Then pick the shows you like — Swallow does the rest.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-line bg-raised px-3 py-2.5 text-sm text-ink outline-none focus:border-hover-line"
          />
          <input
            type="password"
            required
            minLength={8}
            placeholder="Password (8+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-line bg-raised px-3 py-2.5 text-sm text-ink outline-none focus:border-hover-line"
          />
          {error && <p className="text-xs text-timer">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full border border-bright bg-bright py-3 text-sm font-semibold text-white hover:bg-bright-hover disabled:border-line-soft disabled:bg-transparent disabled:text-faint"
          >
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </form>
        <p className="mt-5 text-xs text-muted">
          Already have one?{' '}
          <Link to="/login" className="text-ink-2 underline-offset-2 hover:text-ink hover:underline">
            Sign in
          </Link>
        </p>
        </>
        )}
      </div>
    </Layout>
  )
}
