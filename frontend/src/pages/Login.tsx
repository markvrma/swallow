import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import * as api from '../api/client'
import { useAuth } from '../lib/auth'
import Layout from '../components/Layout'
import VerifyCodeForm from '../components/VerifyCodeForm'
import { ApiError } from '../api/client'

export default function Login() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // A signup that never finished: the password was right, the email isn't verified.
  const [unverified, setUnverified] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.login(email, password)
      await refresh()
      navigate('/')
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        await api.resendCode(email).catch(() => {})
        setUnverified(email)
      } else {
        setError(err instanceof Error ? err.message : 'Login failed')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-sm py-16">
        {unverified ? (
          <VerifyCodeForm
            email={unverified}
            onBack={() => setUnverified(null)}
            onVerified={async () => {
              await refresh()
              navigate('/')
            }}
          />
        ) : (
        <>
        <h1 className="mb-6 text-[22px] font-medium tracking-[-0.01em]">Welcome back</h1>
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
            placeholder="Password"
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
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-5 text-xs text-muted">
          No account?{' '}
          <Link to="/register" className="text-ink-2 underline-offset-2 hover:text-ink hover:underline">
            Create one
          </Link>
        </p>
        </>
        )}
      </div>
    </Layout>
  )
}
