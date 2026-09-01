import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import ControlledRandom from './pages/ControlledRandom'

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-ground font-mono text-xs text-muted">…</div>
  }
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/controlled"
        element={
          <Protected>
            <ControlledRandom />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
