import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router'
import { Loader2, AlertTriangle, Download, TrendingUp, Euro, Users, FileText, RefreshCw, BarChart3 } from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Utente {
  id: string
  nome: string
  cognome: string
  email: string
  ruolo: string
}

type Periodo = 'anno' | 'trimestre' | 'mese'

interface MeseData {
  mese: string
  tasso_non_silenzio: number
  rinnovi: number
  riacquisti: number
  restituzioni: number
  silenzi: number
}

interface Sintesi {
  totale: number
  rinnovi: number
  riacquisti: number
  restituzioni: number
  silenzi: number
  tasso_non_silenzio: number
  per_mese: MeseData[]
}

interface DettaglioPerdita {
  id: string
  contratto_nsm: string
  cliente: string
  margine_perso: number
  data_scadenza: string
}

interface PerditeSilenzio {
  totale_perso: number
  numero_pratiche: number
  dettaglio: DettaglioPerdita[]
}

interface PerformanceAgente {
  agente: string
  ruolo: string
  pratiche_totali: number
  tasso_non_silenzio: number
  margine_generato: number
  silenzi: number
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatCurrency(value: number): string {
  return `€ ${value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const PERIODO_LABELS: Record<Periodo, string> = {
  mese: 'Mese corrente',
  trimestre: 'Trimestre corrente',
  anno: 'Anno corrente',
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Reportistica() {
  const navigate = useNavigate()
  const [utente, setUtente] = useState<Utente | null>(null)
  const [periodo, setPeriodo] = useState<Periodo>('anno')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sintesi, setSintesi] = useState<Sintesi | null>(null)
  const [perdite, setPerdite] = useState<PerditeSilenzio | null>(null)
  const [performance, setPerformance] = useState<PerformanceAgente[]>([])

  // Auth
  useEffect(() => {
    const raw = localStorage.getItem('nsm_user')
    if (!raw) {
      navigate('/backoffice/login')
      return
    }
    try {
      setUtente(JSON.parse(raw))
    } catch {
      navigate('/backoffice/login')
    }
  }, [navigate])

  // Fetch all reports
  const fetchReports = useCallback(async (u: Utente, p: Periodo) => {
    setLoading(true)
    setError(null)

    const headers: HeadersInit = {
      'x-user-id': u.id,
      'Content-Type': 'application/json',
    }
    const opts: RequestInit = { credentials: 'include', headers }

    try {
      const [sintesiRes, perditeRes, perfRes] = await Promise.all([
        fetch(`/api/backoffice/reports/sintesi?periodo=${p}`, opts),
        fetch(`/api/backoffice/reports/perdite-silenzio?periodo=${p}`, opts),
        fetch(`/api/backoffice/reports/performance-agenti?periodo=${p}`, opts),
      ])

      if (!sintesiRes.ok || !perditeRes.ok || !perfRes.ok) {
        throw new Error('Errore nel caricamento dei report')
      }

      const [sintesiData, perditeData, perfData] = await Promise.all([
        sintesiRes.json(),
        perditeRes.json(),
        perfRes.json(),
      ])

      setSintesi(sintesiData)
      setPerdite(perditeData)
      setPerformance(
        (perfData as PerformanceAgente[]).sort((a, b) => b.pratiche_totali - a.pratiche_totali),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore sconosciuto')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (utente) fetchReports(utente, periodo)
  }, [utente, periodo, fetchReports])

  // CSV export
  const handleExport = useCallback(() => {
    if (!sintesi || !perdite || !performance) return

    const BOM = '﻿'
    const rows: string[] = []

    // Section 1: Sintesi KPI
    rows.push('SINTESI KPI')
    rows.push(`Periodo;${PERIODO_LABELS[periodo]}`)
    rows.push(`Totale pratiche;${sintesi.totale}`)
    rows.push(`Rinnovi;${sintesi.rinnovi}`)
    rows.push(`Riacquisti;${sintesi.riacquisti}`)
    rows.push(`Restituzioni;${sintesi.restituzioni}`)
    rows.push(`Silenzi;${sintesi.silenzi}`)
    rows.push(`Tasso non-silenzio;${sintesi.tasso_non_silenzio.toFixed(1)}%`)
    rows.push('')
    rows.push('Dettaglio per mese')
    rows.push('Mese;Tasso non-silenzio;Rinnovi;Riacquisti;Restituzioni;Silenzi')
    for (const m of sintesi.per_mese) {
      rows.push(`${m.mese};${m.tasso_non_silenzio.toFixed(1)}%;${m.rinnovi};${m.riacquisti};${m.restituzioni};${m.silenzi}`)
    }
    rows.push('')

    // Section 2: Perdite da silenzio
    rows.push('PERDITE DA SILENZIO')
    rows.push(`Totale perso;${sintesi ? formatCurrency(perdite.totale_perso) : ''}`)
    rows.push(`Numero pratiche;${perdite.numero_pratiche}`)
    rows.push('')
    rows.push('Contratto NSM;Cliente;Margine perso;Data scadenza')
    for (const d of perdite.dettaglio) {
      rows.push(`${d.contratto_nsm};${d.cliente};${formatCurrency(d.margine_perso)};${formatDate(d.data_scadenza)}`)
    }
    rows.push('')

    // Section 3: Performance agenti
    rows.push('PERFORMANCE AGENTI')
    rows.push('Agente;Ruolo;Pratiche totali;Tasso non-silenzio;Margine generato;Silenzi')
    for (const a of performance) {
      rows.push(`${a.agente};${a.ruolo};${a.pratiche_totali};${a.tasso_non_silenzio.toFixed(1)}%;${formatCurrency(a.margine_generato)};${a.silenzi}`)
    }

    const csv = BOM + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `report_${periodo}_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [sintesi, perdite, performance, periodo])

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  if (!utente) return null

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-flex" />
        <span className="ml-3 text-lg text-stone">Caricamento report...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-danger-text">
        <AlertTriangle className="h-10 w-10 mb-3" />
        <p className="text-lg font-medium">{error}</p>
        <button
          onClick={() => utente && fetchReports(utente, periodo)}
          className="mt-4 rounded-lg bg-flex px-5 py-2 text-white hover:bg-flex-dark transition-colors"
        >
          Riprova
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-stone mr-1">Periodo:</span>
        {(['mese', 'trimestre', 'anno'] as Periodo[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriodo(p)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              periodo === p
                ? 'bg-flex text-white'
                : 'bg-card border text-stone hover:bg-paper'
            }`}
          >
            {PERIODO_LABELS[p]}
          </button>
        ))}
        <button
          onClick={() => utente && fetchReports(utente, periodo)}
          className="ml-auto rounded-lg border border-border px-3 py-2 text-stone hover:bg-paper transition-colors"
          title="Aggiorna"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* ============================================================ */}
      {/*  Report 1: Sintesi KPI                                       */}
      {/* ============================================================ */}
      {sintesi && (
        <section>
          <h2 className="text-xl font-bold text-graphite mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Sintesi KPI
          </h2>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <div className="bg-card rounded-xl border border-border p-5">
              <p className="text-xs font-medium text-stone uppercase tracking-wide">Totale pratiche</p>
              <p className="text-2xl font-bold text-graphite mt-1">{sintesi.totale.toLocaleString('it-IT')}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-5">
              <p className="text-xs font-medium text-stone uppercase tracking-wide">Rinnovi</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{sintesi.rinnovi.toLocaleString('it-IT')}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-5">
              <p className="text-xs font-medium text-stone uppercase tracking-wide">Riacquisti</p>
              <p className="text-2xl font-bold text-flex mt-1">{sintesi.riacquisti.toLocaleString('it-IT')}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-5">
              <p className="text-xs font-medium text-stone uppercase tracking-wide">Restituzioni</p>
              <p className="text-2xl font-bold text-orange-500 mt-1">{sintesi.restituzioni.toLocaleString('it-IT')}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-5">
              <p className="text-xs font-medium text-stone uppercase tracking-wide">Silenzi</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{sintesi.silenzi.toLocaleString('it-IT')}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-5">
              <p className="text-xs font-medium text-stone uppercase tracking-wide">Tasso non-silenzio</p>
              <p className={`text-2xl font-bold mt-1 ${
                sintesi.tasso_non_silenzio > 85 ? 'text-green-600' : 'text-red-600'
              }`}>
                {sintesi.tasso_non_silenzio.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Line chart: Tasso non-silenzio */}
          <div className="bg-card rounded-xl border border-border p-5 mb-6">
            <h3 className="text-sm font-semibold text-stone mb-4">Andamento tasso non-silenzio (%)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={sintesi.per_mese}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="mese" tick={{ fontSize: 12 }} />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  formatter={(value: number) => [`${value.toFixed(1)}%`, 'Tasso non-silenzio']}
                />
                <Legend />
                <ReferenceLine
                  y={85}
                  stroke="#ef4444"
                  strokeDasharray="6 4"
                  label={{ value: 'Obiettivo 85%', position: 'insideTopRight', fill: '#ef4444', fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="tasso_non_silenzio"
                  name="Tasso non-silenzio"
                  stroke="#185FA5"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#185FA5' }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Bar chart: Composizione decisioni */}
          <div className="bg-card rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-stone mb-4">Composizione decisioni per mese</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={sintesi.per_mese}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="mese" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="rinnovi" name="Rinnovi" stackId="a" fill="#22c55e" />
                <Bar dataKey="riacquisti" name="Riacquisti" stackId="a" fill="#3b82f6" />
                <Bar dataKey="restituzioni" name="Restituzioni" stackId="a" fill="#f97316" />
                <Bar dataKey="silenzi" name="Silenzi" stackId="a" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/*  Report 2: Perdite da silenzio                                */}
      {/* ============================================================ */}
      {perdite && (
        <section>
          <h2 className="text-xl font-bold text-graphite mb-4 flex items-center gap-2">
            <Euro className="h-5 w-5" />
            Perdite da silenzio
          </h2>

          {/* Big number card */}
          <div className="bg-card rounded-xl border border-border p-6 mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div>
              <p className="text-xs font-medium text-stone uppercase tracking-wide mb-1">Margine totale perso</p>
              <p className="text-4xl font-bold text-red-600">{formatCurrency(perdite.totale_perso)}</p>
            </div>
            <div className="sm:ml-8">
              <p className="text-xs font-medium text-stone uppercase tracking-wide mb-1">Pratiche in silenzio</p>
              <p className="text-4xl font-bold text-graphite">{perdite.numero_pratiche}</p>
            </div>
          </div>

          {/* Detail table */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-paper text-left">
                    <th className="px-5 py-3 font-semibold text-stone">Contratto NSM</th>
                    <th className="px-5 py-3 font-semibold text-stone">Cliente</th>
                    <th className="px-5 py-3 font-semibold text-stone text-right">Margine perso</th>
                    <th className="px-5 py-3 font-semibold text-stone">Data scadenza</th>
                  </tr>
                </thead>
                <tbody>
                  {perdite.dettaglio.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-stone">
                        Nessuna perdita nel periodo
                      </td>
                    </tr>
                  ) : (
                    perdite.dettaglio.map((d) => (
                      <tr key={d.id} className="border-b last:border-b-0 hover:bg-paper transition-colors">
                        <td className="px-5 py-3 font-medium text-graphite">{d.contratto_nsm}</td>
                        <td className="px-5 py-3 text-stone">{d.cliente}</td>
                        <td className="px-5 py-3 text-right font-medium text-red-600">{formatCurrency(d.margine_perso)}</td>
                        <td className="px-5 py-3 text-stone">{formatDate(d.data_scadenza)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/*  Report 3: Performance agenti                                 */}
      {/* ============================================================ */}
      {performance.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-graphite mb-4 flex items-center gap-2">
            <Users className="h-5 w-5" />
            Performance agenti
          </h2>

          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-paper text-left">
                    <th className="px-5 py-3 font-semibold text-stone">Agente</th>
                    <th className="px-5 py-3 font-semibold text-stone">Ruolo</th>
                    <th className="px-5 py-3 font-semibold text-stone text-right">Pratiche totali</th>
                    <th className="px-5 py-3 font-semibold text-stone text-right">Tasso non-silenzio</th>
                    <th className="px-5 py-3 font-semibold text-stone text-right">Margine generato</th>
                    <th className="px-5 py-3 font-semibold text-stone text-right">Silenzi</th>
                  </tr>
                </thead>
                <tbody>
                  {performance.map((a, idx) => (
                    <tr key={idx} className="border-b last:border-b-0 hover:bg-paper transition-colors">
                      <td className="px-5 py-3 font-medium text-graphite">{a.agente}</td>
                      <td className="px-5 py-3 text-stone">{a.ruolo}</td>
                      <td className="px-5 py-3 text-right text-graphite">{a.pratiche_totali.toLocaleString('it-IT')}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                          a.tasso_non_silenzio > 85
                            ? 'bg-ok text-ok-text'
                            : 'bg-danger text-danger-text'
                        }`}>
                          {a.tasso_non_silenzio.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-graphite">{formatCurrency(a.margine_generato)}</td>
                      <td className="px-5 py-3 text-right text-red-600 font-medium">{a.silenzi}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/*  Export button                                                 */}
      {/* ============================================================ */}
      <div className="flex justify-end pb-4">
        <button
          onClick={handleExport}
          disabled={!sintesi}
          className="flex items-center gap-2 rounded-lg bg-flex px-6 py-3 text-white font-medium hover:bg-flex-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="h-4 w-4" />
          Esporta Report
        </button>
      </div>
    </div>
  )
}
