import { useState } from 'react'
import * as api from '../api/client'

interface Props {
  email: string
  onVerified: () => void | Promise<void>
  onBack?: () => void
}

const INPUT =
  'w-full border border-line bg-raised px-3 py-2.5 text-sm text-ink outline-none focus:border-hover-line'

/** Step two of signup: the six digits we just mailed. */
export default function VerifyCodeForm({ email, onVerified, onBack }: Props) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      await api.verifyEmail(email, code)
      await onVerified()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code did not work')
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    setError(null)
    setNote(null)
    try {
      await api.resendCode(email)
      setCode('')
      setNote('A new code is on its way.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send another code')
    }
  }

  return (
    <>
      <h1 className="mb-2 text-[22px] font-medium tracking-[-0.01em]">Check your email</h1>
      <p className="mb-6 text-sm text-ink-3">
        We sent a six-digit code to <span className="font-mono text-ink">{email}</span>. It expires
        in ten minutes.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <input
          autoFocus
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className={`${INPUT} text-center font-mono text-lg tracking-[0.5em]`}
        />
        {error && <p className="text-xs text-timer">{error}</p>}
        {note && <p className="text-xs text-muted">{note}</p>}
        <button
          type="submit"
          disabled={busy || code.length !== 6}
          className="w-full border border-bright bg-bright py-3 text-sm font-semibold text-white hover:bg-bright-hover disabled:border-line-soft disabled:bg-transparent disabled:text-faint"
        >
          {busy ? 'Verifying…' : 'Verify and continue'}
        </button>
      </form>
      <div className="mt-5 flex gap-4 text-xs text-muted">
        <button onClick={resend} className="text-ink-2 underline-offset-2 hover:text-ink hover:underline">
          Send another code
        </button>
        {onBack && (
          <button onClick={onBack} className="hover:text-ink">
            Use a different email
          </button>
        )}
      </div>
    </>
  )
}
