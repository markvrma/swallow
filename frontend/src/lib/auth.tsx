import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useAuth as useClerkAuth, useClerk } from '@clerk/clerk-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '../api/client'
import { ApiError, setTokenGetter } from '../api/client'
import type { User } from '../api/types'

interface AuthState {
  user: User | null
  loading: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  refresh: async () => {},
  signOut: async () => {},
})

/** Bridges Clerk's identity to the local account row.
 *
 *  Clerk knows who is signed in; the API still owns the library, presets and
 *  history, all keyed on a local user id. `/api/auth/me` returns that row and
 *  creates it on the first authenticated call, so there is no separate signup step.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const { isLoaded, isSignedIn, getToken } = useClerkAuth()
  const clerk = useClerk()

  // The api client is not a component, so hand it a way to reach the current token.
  useEffect(() => {
    setTokenGetter(() => getToken())
  }, [getToken])

  const { data, isLoading } = useQuery({
    queryKey: ['me', isSignedIn],
    enabled: isLoaded,
    queryFn: async () => {
      if (!isSignedIn) return null
      try {
        return await api.me()
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['me'] })
  }

  const signOut = async () => {
    await clerk.signOut()
    // resetQueries (not clear) so the mounted observers refetch and the UI flips.
    await queryClient.resetQueries()
  }

  return (
    <AuthContext.Provider
      value={{ user: data ?? null, loading: !isLoaded || isLoading, refresh, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
