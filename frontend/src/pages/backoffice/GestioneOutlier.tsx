import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Loader2,
  Search,
  UserPlus,
  Trash2,
  Link2,
  CheckCircle2,
  X,
  ShieldAlert,
} from 'lucide-react'
import { toast, Toaster } from 'sonner'

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface Utente {
  id: string
  nome: string
  cognome: string
  email: string
  ruolo: string
}

interface OutlierCliente {
  ragione_sociale: string
  piva: string
  email: string
}

interface Outlier {
  id: string
  contratto_nsm_id: string
  contratto_grenke_id: string
  canone_mensile: number
  numero_mesi: number
  data_scadenza: string
  stato_riconciliazione: string
  origine: string
  cliente: OutlierCliente
}

interface Suggestion {
  id: string
  ragione_sociale: string
  piva: string
  email: string
  score: number
}

type ModalAction = 'ASSOCIA' | 'CREA' | 'SCARTA'

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function formatDate(d: string): string {
  const date = new Date(d)
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function formatEur(n: number): string {
  return n.toLocaleString('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function scoreLabel(score: number): { label: string; color: string; border: string } {
  if (score > 50) return { label: 'Alta', color: 'text-green-700 bg-green-50', border: 'border-l-green-500' }
  if (score > 20) return { label: 'Media', color: 'text-yellow-700 bg-yellow-50', border: 'border-l-yellow-500' }
  return { label: 'Bassa', color: 'text-gray-600 bg-gray-100', border: 'border-l-gray-400' }
}

const ALLOWED_ROLES = ['BACKOFFICE_INTERNO', 'ADMIN']

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function GestioneOutlier() {
  const navigate = useNavigate()

  /* --- auth ------------------------------------------------------- */
  const [utente, setUtente] = useState<Utente | null>(null)
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    const raw = localStorage.getItem('nsm_user')
    if (!raw) {
      navigate('/backoffice/login')
      return
    }
    try {
      const u: Utente = JSON.parse(raw)
      setUtente(u)
      setAuthorized(ALLOWED_ROLES.includes(u.ruolo))
    } catch {
      navigate('/backoffice/login')
    }
  }, [navigate])

  /* --- outlier list ----------------------------------------------- */
  const [outliers, setOutliers] = useState<Outlier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchOutliers = useCallback(async () => {
    if (!utente) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/backoffice/outliers', {
        credentials: 'include',
        headers: { 'x-user-id': utente.id },
      })
      if (!res.ok) throw new Error('Errore nel caricamento degli outlier')
      const data: Outlier[] = await res.json()
      setOutliers(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore sconosciuto')
    } finally {
      setLoading(false)
    }
  }, [utente])

  useEffect(() => {
    if (utente && authorized) fetchOutliers()
  }, [utente, authorized, fetchOutliers])

  /* --- suggestions per outlier ------------------------------------ */
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion[]>>({})
  const [loadingSugg, setLoadingSugg] = useState<Record<string, boolean>>({})

  const fetchSuggestions = async (outlierId: string) => {
    if (!utente) return
    setLoadingSugg(prev => ({ ...prev, [outlierId]: true }))
    try {
      const res = await fetch(`/api/backoffice/outliers/${outlierId}/suggestions`, {
        credentials: 'include',
        headers: { 'x-user-id': utente.id },
      })
      if (!res.ok) throw new Error('Errore nel caricamento dei suggerimenti')
      const data: Suggestion[] = await res.json()
      setSuggestions(prev => ({ ...prev, [outlierId]: data }))
    } catch {
      toast.error('Impossibile caricare i suggerimenti')
    } finally {
      setLoadingSugg(prev => ({ ...prev, [outlierId]: false }))
    }
  }

  /* --- modal state ------------------------------------------------ */
  const [modal, setModal] = useState<{
    open: boolean
    outlierId: string
    action: ModalAction
    clienteId?: string
    clienteLabel?: string
  } | null>(null)
  const [motivazione, setMotivazione] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const openModal = (outlierId: string, action: ModalAction, clienteId?: string, clienteLabel?: string) => {
    setModal({ open: true, outlierId, action, clienteId, clienteLabel })
    setMotivazione('')
  }

  const closeModal = () => {
    if (submitting) return
    setModal(null)
    setMotivazione('')
  }

  const handleResolve = async () => {
    if (!modal || !utente) return
    if ((modal.action === 'CREA' || modal.action === 'SCARTA') && !motivazione.trim()) {
      toast.error('La motivazione è obbligatoria')
      return
    }
    setSubmitting(true)
    try {
      const body: Record<string, string> = { action: modal.action }
      if (modal.action === 'ASSOCIA' && modal.clienteId) {
        body.clienteId = modal.clienteId
      }
      if (motivazione.trim()) {
        body.motivazione = motivazione.trim()
      }

      const res = await fetch(`/api/backoffice/outliers/${modal.outlierId}/resolve`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': utente.id,
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Errore nella risoluzione')

      // Remove from list
      setOutliers(prev => prev.filter(o => o.id !== modal.outlierId))
      // Clean up suggestions
      setSuggestions(prev => {
        const next = { ...prev }
        delete next[modal.outlierId]
        return next
      })

      const labels: Record<ModalAction, string> = {
        ASSOCIA: 'Outlier associato con successo',
        CREA: 'Nuovo cliente creato con successo',
        SCARTA: 'Outlier scartato con successo',
      }
      toast.success(labels[modal.action])
      closeModal()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore nella risoluzione')
    } finally {
      setSubmitting(false)
    }
  }

  /* --- permission guard ------------------------------------------- */
  if (utente && !authorized) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-gray-500">
        <ShieldAlert className="h-12 w-12 mb-4 text-red-400" />
        <p className="text-lg font-semibold text-gray-700">Accesso non autorizzato</p>
        <p className="text-sm mt-1">
          Questa pagina è riservata agli utenti con ruolo BACKOFFICE_INTERNO o ADMIN.
        </p>
      </div>
    )
  }

  if (!utente) return null

  /* --- loading ---------------------------------------------------- */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-[#1a3a52]" />
        <span className="ml-3 text-lg text-gray-500">Caricamento outlier...</span>
      </div>
    )
  }

  /* --- error ------------------------------------------------------ */
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-red-600">
        <AlertTriangle className="h-10 w-10 mb-3" />
        <p className="text-lg font-medium">{error}</p>
        <button
          onClick={fetchOutliers}
          className="mt-4 rounded-lg bg-[#1a3a52] px-5 py-2 text-white hover:bg-[#15304a] transition-colors"
        >
          Riprova
        </button>
      </div>
    )
  }

  /* --- render ----------------------------------------------------- */
  return (
    <div className="space-y-6">
      <Toaster position="top-right" richColors />

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <AlertTriangle className="h-6 w-6 text-yellow-500" />
          <h1 className="text-2xl font-bold text-[#1a3a52]">Gestione Outlier</h1>
        </div>
        <p className="text-sm text-gray-500">
          {outliers.length === 0
            ? 'Nessun outlier da gestire'
            : `${outliers.length} contratt${outliers.length === 1 ? 'o' : 'i'} con stato OUTLIER_DA_GESTIRE`}
        </p>
      </div>

      {/* Empty state */}
      {outliers.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <CheckCircle2 className="h-14 w-14 mx-auto mb-4 text-green-400" />
          <p className="text-lg font-medium text-gray-600">Nessun outlier da gestire</p>
          <p className="text-sm mt-1">Tutti i contratti sono stati riconciliati correttamente.</p>
        </div>
      )}

      {/* Outlier cards */}
      <div className="space-y-5">
        {outliers.map(outlier => {
          const sugg = suggestions[outlier.id]
          const isLoadingSugg = loadingSugg[outlier.id] ?? false

          return (
            <div key={outlier.id} className="bg-white rounded-xl border p-5">
              {/* Contract info header */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                    <h3 className="font-semibold text-[#1a3a52]">
                      {outlier.cliente.ragione_sociale}
                    </h3>
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-medium">
                      Outlier
                    </span>
                  </div>

                  {/* Contract details grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500 text-xs">ID Grenke</span>
                      <p className="font-medium">{outlier.contratto_grenke_id || '—'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">ID NSM</span>
                      <p className="font-medium">{outlier.contratto_nsm_id || '—'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">Canone mensile</span>
                      <p className="font-medium">&euro; {formatEur(Number(outlier.canone_mensile))}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">Mesi</span>
                      <p className="font-medium">{outlier.numero_mesi}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">Scadenza</span>
                      <p className="font-medium">{outlier.data_scadenza ? formatDate(outlier.data_scadenza) : '—'}</p>
                    </div>
                  </div>

                  {/* Client data from Excel */}
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm bg-gray-50 rounded-lg p-3">
                    <div>
                      <span className="text-gray-500 text-xs">Ragione sociale (Excel)</span>
                      <p className="font-medium">{outlier.cliente.ragione_sociale}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">P.IVA</span>
                      <p className="font-medium">{outlier.cliente.piva || '—'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">Email</span>
                      <p className="font-medium">{outlier.cliente.email || '—'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => fetchSuggestions(outlier.id)}
                  disabled={isLoadingSugg}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#1a3a52] text-white hover:bg-[#15304a] transition-colors disabled:opacity-50"
                >
                  {isLoadingSugg ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Cerca suggerimenti
                </button>
                <button
                  onClick={() => openModal(outlier.id, 'CREA')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-green-300 text-green-700 hover:bg-green-50 transition-colors"
                >
                  <UserPlus className="h-4 w-4" />
                  Crea nuovo cliente
                </button>
                <button
                  onClick={() => openModal(outlier.id, 'SCARTA')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-red-300 text-red-700 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  Scarta
                </button>
              </div>

              {/* Suggestions list */}
              {sugg && (
                <div className="mt-2">
                  <p className="text-sm font-medium text-gray-600 mb-2">
                    {sugg.length === 0
                      ? 'Nessun suggerimento trovato'
                      : `${sugg.length} suggeriment${sugg.length === 1 ? 'o' : 'i'} trovati`}
                  </p>
                  <div className="space-y-2">
                    {sugg.map(s => {
                      const sc = scoreLabel(s.score)
                      return (
                        <div
                          key={s.id}
                          className={`border-l-4 ${sc.border} bg-white border rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`}
                        >
                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                            <div>
                              <span className="text-gray-500 text-xs">Ragione sociale</span>
                              <p className="font-medium">{s.ragione_sociale}</p>
                            </div>
                            <div>
                              <span className="text-gray-500 text-xs">P.IVA</span>
                              <p className="font-medium">{s.piva || '—'}</p>
                            </div>
                            <div>
                              <span className="text-gray-500 text-xs">Email</span>
                              <p className="font-medium">{s.email || '—'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className={`text-xs font-semibold px-2 py-1 rounded ${sc.color}`}>
                              {sc.label} ({s.score}%)
                            </span>
                            <button
                              onClick={() =>
                                openModal(outlier.id, 'ASSOCIA', s.id, s.ragione_sociale)
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                            >
                              <Link2 className="h-3.5 w-3.5" />
                              Associa
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ---- Confirm Modal ---------------------------------------- */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            {/* Modal header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#1a3a52]">
                {modal.action === 'ASSOCIA' && 'Conferma associazione'}
                {modal.action === 'CREA' && 'Crea nuovo cliente'}
                {modal.action === 'SCARTA' && 'Scarta outlier'}
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="space-y-4">
              {modal.action === 'ASSOCIA' && (
                <p className="text-sm text-gray-600">
                  Vuoi associare questo outlier al cliente{' '}
                  <span className="font-semibold text-[#1a3a52]">{modal.clienteLabel}</span>?
                </p>
              )}

              {modal.action === 'CREA' && (
                <p className="text-sm text-gray-600">
                  Verrà creato un nuovo cliente a partire dai dati dell'outlier. Inserisci una
                  motivazione.
                </p>
              )}

              {modal.action === 'SCARTA' && (
                <p className="text-sm text-gray-600">
                  L'outlier verrà scartato e non sarà più visibile. Inserisci una motivazione.
                </p>
              )}

              {(modal.action === 'CREA' || modal.action === 'SCARTA') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Motivazione <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={motivazione}
                    onChange={e => setMotivazione(e.target.value)}
                    placeholder="Inserisci la motivazione..."
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a52] focus:border-transparent resize-none"
                  />
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={closeModal}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                onClick={handleResolve}
                disabled={submitting || ((modal.action === 'CREA' || modal.action === 'SCARTA') && !motivazione.trim())}
                className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 flex items-center gap-2 ${
                  modal.action === 'SCARTA'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-[#1a3a52] hover:bg-[#15304a]'
                }`}
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {modal.action === 'ASSOCIA' && 'Conferma associazione'}
                {modal.action === 'CREA' && 'Crea cliente'}
                {modal.action === 'SCARTA' && 'Conferma scarto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
