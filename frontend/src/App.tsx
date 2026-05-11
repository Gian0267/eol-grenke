import { useEffect, useState } from 'react'

type HealthStatus = {
  status: string
  message: string
} | null

export default function App() {
  const [health, setHealth] = useState<HealthStatus>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data: HealthStatus) => {
        setHealth(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Errore di connessione')
        setLoading(false)
      })
  }, [])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted">
      <div className="bg-card border border-border rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-primary mb-2">
          NSM EOL Grenke
        </h1>
        <p className="text-muted-foreground mb-6 text-sm">
          Template gestione fine noleggio contratti FLEX
        </p>

        {loading && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Connessione al backend...
          </div>
        )}

        {health && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800 font-semibold text-lg">
              {health.message}
            </p>
            <p className="text-green-600 text-xs mt-1">
              Status: {health.status}
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 font-semibold">
              Errore connessione backend
            </p>
            <p className="text-red-600 text-xs mt-1">{error}</p>
          </div>
        )}
      </div>

      <p className="text-muted-foreground text-xs mt-6">
        Smartcom Solutions Srl — Noleggio Su Misura
      </p>
    </div>
  )
}
