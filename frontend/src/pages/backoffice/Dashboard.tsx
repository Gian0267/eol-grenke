import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Loader2, AlertTriangle, Phone, PhoneCall, PhoneOff, TrendingUp, Percent, Euro, Clock, UserCheck, FileText } from 'lucide-react'

interface Utente {
  id: string
  nome: string
  cognome: string
  email: string
  ruolo: string
}

interface RiskSilenceCounts {
  t50: number
  t40: number
  t35: number
}

interface Kpi {
  tasso_non_silenzio: number
  tasso_rinnovo: number
  tasso_riacquisto: number
  margine_medio: number
  tempo_medio_decisione: number
  tasso_intervento_manuale: number
  totale_pratiche: number
}

interface PraticaRecente {
  id: string
  cliente: string
  contratto_nsm: string
  data_scadenza: string | null
  stato: string
  decisione: string
}

function getStatoBadge(stato: string): { bg: string; text: string; label: string } {
  const s = stato?.toUpperCase() ?? ''
  if (s === 'LISTA_RICEVUTA') return { bg: 'bg-paper', text: 'text-stone', label: 'Lista ricevuta' }
  if (s === 'COMUNICAZIONE_INVIATA') return { bg: 'bg-flex-light', text: 'text-flex-dark', label: 'Comunicazione inviata' }
  if (s === 'IN_ATTESA_DECISIONE') return { bg: 'bg-warn', text: 'text-warn-text', label: 'In attesa decisione' }
  if (s.startsWith('DECISIONE_')) return { bg: 'bg-ok', text: 'text-ok-text', label: stato.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase()) }
  if (s.startsWith('SILENZIO_')) return { bg: 'bg-danger', text: 'text-danger-text', label: stato.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase()) }
  if (s.startsWith('RIACQUISTO_')) return { bg: 'bg-outlier', text: 'text-outlier-text', label: stato.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase()) }
  return { bg: 'bg-paper', text: 'text-stone', label: stato }
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [utente, setUtente] = useState<Utente | null>(null)
  const [riskCounts, setRiskCounts] = useState<RiskSilenceCounts | null>(null)
  const [kpi, setKpi] = useState<Kpi | null>(null)
  const [pratiche, setPratiche] = useState<PraticaRecente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem('nsm_user')
    if (!raw) {
      navigate('/backoffice/login')
      return
    }
    try {
      const u: Utente = JSON.parse(raw)
      setUtente(u)
    } catch {
      navigate('/backoffice/login')
    }
  }, [navigate])

  useEffect(() => {
    if (!utente) return

    const headers: HeadersInit = {
      'x-user-id': utente.id,
      'Content-Type': 'application/json',
    }
    const opts: RequestInit = { credentials: 'include', headers }

    async function fetchAll() {
      setLoading(true)
      setError(null)
      try {
        const [riskRes, kpiRes, praticheRes] = await Promise.all([
          fetch('/api/backoffice/dashboard/risk-silence-counts', opts),
          fetch('/api/backoffice/dashboard/kpi', opts),
          fetch('/api/backoffice/dashboard/pratiche-recenti', opts),
        ])

        if (!riskRes.ok || !kpiRes.ok || !praticheRes.ok) {
          throw new Error('Errore nel caricamento dei dati')
        }

        const [riskData, kpiData, praticheData] = await Promise.all([
          riskRes.json(),
          kpiRes.json(),
          praticheRes.json(),
        ])

        setRiskCounts(riskData)
        setKpi(kpiData)
        setPratiche(praticheData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Errore sconosciuto')
      } finally {
        setLoading(false)
      }
    }

    fetchAll()
  }, [utente])

  if (!utente) return null

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-flex" />
        <span className="ml-3 text-lg text-stone">Caricamento dashboard...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-red-600">
        <AlertTriangle className="h-10 w-10 mb-3" />
        <p className="text-lg font-medium">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-flex px-5 py-2 text-white hover:bg-flex-dark transition-colors"
        >
          Riprova
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Sezione 1: Pratiche a rischio silenzio */}
      <section>
        <h2 className="text-xl font-medium text-graphite mb-4">Pratiche a rischio silenzio</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* T-50 */}
          <button
            onClick={() => navigate('/backoffice/pratiche?rischio_silenzio=true')}
            className="bg-ok border border-ok-border/30 rounded-xl p-5 text-left hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="flex items-center gap-3 mb-2">
              <Phone className="h-5 w-5 text-ok-border" />
              <span className="text-sm font-medium text-ok-text uppercase tracking-wide font-mono">T-50</span>
            </div>
            <p className="text-4xl font-medium text-ok-text font-mono">{riskCounts?.t50 ?? 0}</p>
            <p className="text-sm text-ok-text/80 mt-1">Chiamata 1ª</p>
            <p className="text-xs text-ok-text/60 mt-0.5">Scadenza tra 41-50 giorni</p>
          </button>

          {/* T-40 */}
          <button
            onClick={() => navigate('/backoffice/pratiche?rischio_silenzio=true')}
            className="bg-warn border border-warn-border/30 rounded-xl p-5 text-left hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="flex items-center gap-3 mb-2">
              <PhoneCall className="h-5 w-5 text-warn-border" />
              <span className="text-sm font-medium text-warn-text uppercase tracking-wide font-mono">T-40</span>
            </div>
            <p className="text-4xl font-medium text-warn-text font-mono">{riskCounts?.t40 ?? 0}</p>
            <p className="text-sm text-warn-text/80 mt-1">Chiamata 2ª</p>
            <p className="text-xs text-warn-text/60 mt-0.5">Scadenza tra 36-40 giorni</p>
          </button>

          {/* T-35 */}
          <button
            onClick={() => navigate('/backoffice/pratiche?rischio_silenzio=true')}
            className="bg-danger border border-danger-border/30 rounded-xl p-5 text-left hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="flex items-center gap-3 mb-2">
              <PhoneOff className="h-5 w-5 text-danger-border" />
              <span className="text-sm font-medium text-danger-text uppercase tracking-wide font-mono">T-35</span>
            </div>
            <p className="text-4xl font-medium text-danger-text font-mono">{riskCounts?.t35 ?? 0}</p>
            <p className="text-sm font-medium text-danger-text mt-1">ULTIMA CHANCE</p>
            <p className="text-xs text-danger-text/60 mt-0.5">Scadenza tra 31-35 giorni</p>
          </button>
        </div>
      </section>

      {/* Sezione 2: KPI Anno Corrente */}
      <section>
        <h2 className="text-xl font-medium text-graphite mb-4">KPI Anno Corrente</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Tasso non silenzio */}
          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-5 w-5 text-stone" />
              <h3 className="text-sm font-medium text-stone">Tasso non silenzio</h3>
            </div>
            <p className={`text-3xl font-medium font-mono ${
              (kpi?.tasso_non_silenzio ?? 0) > 85 ? 'text-ok-text' : 'text-danger-text'
            }`}>
              {kpi?.tasso_non_silenzio?.toFixed(1) ?? '—'}%
            </p>
            <p className="text-xs text-stone mt-1">Obiettivo: &gt; 85%</p>
          </div>

          {/* Tasso rinnovo */}
          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <Percent className="h-5 w-5 text-stone" />
              <h3 className="text-sm font-medium text-stone">Tasso rinnovo</h3>
            </div>
            <p className="text-3xl font-medium font-mono text-graphite">
              {kpi?.tasso_rinnovo?.toFixed(1) ?? '—'}%
            </p>
          </div>

          {/* Tasso riacquisto */}
          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <Percent className="h-5 w-5 text-stone" />
              <h3 className="text-sm font-medium text-stone">Tasso riacquisto</h3>
            </div>
            <p className="text-3xl font-medium font-mono text-graphite">
              {kpi?.tasso_riacquisto?.toFixed(1) ?? '—'}%
            </p>
          </div>

          {/* Margine medio */}
          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <Euro className="h-5 w-5 text-stone" />
              <h3 className="text-sm font-medium text-stone">Margine medio</h3>
            </div>
            <p className="text-3xl font-medium font-mono text-graphite">
              &euro; {kpi?.margine_medio?.toFixed(2) ?? '—'}
            </p>
          </div>

          {/* Tempo medio decisione */}
          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-5 w-5 text-stone" />
              <h3 className="text-sm font-medium text-stone">Tempo medio decisione</h3>
            </div>
            <p className="text-3xl font-medium font-mono text-graphite">
              {kpi?.tempo_medio_decisione ?? '—'} <span className="text-lg font-normal font-sans text-stone">giorni</span>
            </p>
          </div>

          {/* Tasso intervento manuale */}
          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <UserCheck className="h-5 w-5 text-stone" />
              <h3 className="text-sm font-medium text-stone">Tasso intervento manuale</h3>
            </div>
            <p className="text-3xl font-medium font-mono text-graphite">
              {kpi?.tasso_intervento_manuale?.toFixed(1) ?? '—'}%
            </p>
          </div>
        </div>

        {/* Totale pratiche */}
        {kpi?.totale_pratiche != null && (
          <p className="text-sm text-stone mt-3">
            <FileText className="inline h-4 w-4 mr-1 -mt-0.5" />
            Totale pratiche elaborate: <span className="font-medium text-graphite font-mono">{kpi.totale_pratiche.toLocaleString('it-IT')}</span>
          </p>
        )}
      </section>

      {/* Sezione 3: Pratiche recenti */}
      <section>
        <h2 className="text-xl font-medium text-graphite mb-4">Pratiche recenti</h2>
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-paper text-left">
                  <th className="px-5 py-3 font-medium text-stone">Cliente</th>
                  <th className="px-5 py-3 font-medium text-stone">Contratto NSM</th>
                  <th className="px-5 py-3 font-medium text-stone">Scadenza</th>
                  <th className="px-5 py-3 font-medium text-stone">Stato</th>
                  <th className="px-5 py-3 font-medium text-stone">Decisione</th>
                </tr>
              </thead>
              <tbody>
                {pratiche.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                      Nessuna pratica recente
                    </td>
                  </tr>
                ) : (
                  pratiche.slice(0, 10).map((p) => {
                    const badge = getStatoBadge(p.stato)
                    return (
                      <tr
                        key={p.id}
                        onClick={() => navigate(`/backoffice/pratiche/${p.id}`)}
                        className="border-b border-border last:border-b-0 hover:bg-paper/60 cursor-pointer transition-colors"
                      >
                        <td className="px-5 py-3 font-medium text-graphite">{p.cliente}</td>
                        <td className="px-5 py-3 text-stone font-mono text-xs">{p.contratto_nsm}</td>
                        <td className="px-5 py-3 text-stone font-mono text-xs">{formatDate(p.data_scadenza)}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${badge.bg} ${badge.text}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-stone">{p.decisione || '—'}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}
