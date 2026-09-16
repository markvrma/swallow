import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import * as api from '../api/client'
import Layout from '../components/Layout'
import { useAuth } from '../lib/auth'

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)

  const deleteAccount = useMutation({
    mutationFn: api.deleteAccount,
    onSuccess: async () => {
      await signOut()
      navigate('/')
    },
  })

  return (
    <Layout>
      <div className="max-w-lg">
        <h1 className="mb-8 text-lg font-medium text-ink">Settings</h1>

        <section className="mb-10">
          <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
            Account
          </h2>
          <p className="text-sm text-ink-3">{user?.email}</p>
        </section>

        <section className="border border-line-soft p-5">
          <h2 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
            Delete account
          </h2>
          <p className="mb-4 text-sm text-ink-3">
            Removes your library, presets and watch history. This can't be undone.
          </p>

          {confirming ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => deleteAccount.mutate()}
                disabled={deleteAccount.isPending}
                className="border border-red-500 bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-60"
              >
                {deleteAccount.isPending ? 'Deleting…' : 'Yes, delete my account'}
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={deleteAccount.isPending}
                className="border border-line px-3 py-1.5 text-xs text-ink-3 hover:border-hover-line hover:bg-hover-ground hover:text-ink"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="border border-line px-3 py-1.5 text-xs text-ink-3 hover:border-red-500 hover:text-red-500"
            >
              Delete account
            </button>
          )}

          {deleteAccount.isError && (
            <p className="mt-3 text-xs text-red-500">Couldn't delete your account. Try again.</p>
          )}
        </section>
      </div>
    </Layout>
  )
}
