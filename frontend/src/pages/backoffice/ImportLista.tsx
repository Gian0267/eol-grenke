import { useState, useCallback, useRef } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, Loader2, ChevronDown } from 'lucide-react'
import { Toaster, toast } from 'sonner'

const BACKOFFICE_USER_ID = '00000000-0000-0000-0000-000000000001'

type RowStatus = 'RICONCILIATO_AUTO' | 'OUTLIER_DA_GESTIRE' | 'ERRORE'

interface PreviewRow {
  index: number
  status: RowStatus
  raw: Record<string, any>
  errors?: string[]
  matchedContractId?: string
  matchedContractNsmId?: string
  pricing?: {
    monte_canoni: number
    pricing_grenke: number
    pricing_riacquisto: number
    margine_lordo: number
    valore_gift_card: number
  }
  suggestedMatches?: Array<{
    clienteId: string
    ragioneSociale: string
    piva: string
  }>
}

interface PreviewResult {
  totalRows: number
  riconciliatiAuto: number
  outlier: number
  errori: number
  rows: PreviewRow[]
}

type OutlierAction = 'ASSOCIA' | 'CREA' | 'SCARTA'

interface OutlierDecision {
  index: number
  action: OutlierAction
  clienteId?: string
  motivazione?: string
}

interface ConfirmResult {
  success: boolean
  message: string
  creati: number
  scartati: number
  errori: number
}

export default function ImportLista() {
  const [step, setStep] = useState<'upload' | 'preview' | 'confirmed'>('upload')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [decisions, setDecisions] = useState<Map<number, OutlierDecision>>(new Map())
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.error('Formato non supportato. Caricare un file .xlsx')
      return
    }
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/backoffice/import/preview', {
        method: 'POST',
        headers: { 'x-user-id': BACKOFFICE_USER_ID },
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const data: PreviewResult = await res.json()
      setPreview(data)
      setStep('preview')

      const initialDecisions = new Map<number, OutlierDecision>()
      for (const row of data.rows) {
        if (row.status === 'OUTLIER_DA_GESTIRE') {
          initialDecisions.set(row.index, { index: row.index, action: 'SCARTA', motivazione: '' })
        }
      }
      setDecisions(initialDecisions)

      toast.success(`Anteprima caricata: ${data.totalRows} righe`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore caricamento')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }, [uploadFile])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }, [uploadFile])

  const updateDecision = (index: number, update: Partial<OutlierDecision>) => {
    setDecisions(prev => {
      const next = new Map(prev)
      const existing = next.get(index) || { index, action: 'SCARTA' as OutlierAction, motivazione: '' }
      next.set(index, { ...existing, ...update })
      return next
    })
  }

  const canConfirm = () => {
    if (!preview) return false
    for (const row of preview.rows) {
      if (row.status !== 'OUTLIER_DA_GESTIRE') continue
      const d = decisions.get(row.index)
      if (!d) return false
      if ((d.action === 'SCARTA' || d.action === 'CREA') && !d.motivazione?.trim()) return false
      if (d.action === 'ASSOCIA' && !d.clienteId) return false
    }
    return true
  }

  const handleConfirm = async () => {
    if (!preview || !canConfirm()) return
    setLoading(true)
    try {
      const res = await fetch('/api/backoffice/import/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': BACKOFFICE_USER_ID,
        },
        body: JSON.stringify({
          rows: preview.rows,
          outlierDecisions: Array.from(decisions.values()),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const result: ConfirmResult = await res.json()
      setConfirmResult(result)
      setStep('confirmed')
      toast.success(result.message)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore conferma')
    } finally {
      setLoading(false)
    }
  }

  const statusIcon = (status: RowStatus) => {
    switch (status) {
      case 'RICONCILIATO_AUTO': return <CheckCircle2 className="w-5 h-5 text-ok-text" />
      case 'OUTLIER_DA_GESTIRE': return <AlertTriangle className="w-5 h-5 text-warn-text" />
      case 'ERRORE': return <XCircle className="w-5 h-5 text-danger-text" />
    }
  }

  const statusBg = (status: RowStatus) => {
    switch (status) {
      case 'RICONCILIATO_AUTO': return 'bg-ok border-ok-border'
      case 'OUTLIER_DA_GESTIRE': return 'bg-warn border-warn-border'
      case 'ERRORE': return 'bg-danger border-danger-border'
    }
  }

  const statusLabel = (status: RowStatus) => {
    switch (status) {
      case 'RICONCILIATO_AUTO': return 'Riconciliato'
      case 'OUTLIER_DA_GESTIRE': return 'Outlier'
      case 'ERRORE': return 'Errore'
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n)

  return (
    <div>
      <Toaster position="top-right" richColors />

      <div>
        {/* Step: Upload */}
        {step === 'upload' && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-graphite mb-2">Importa lista Grenke</h2>
            <p className="text-stone mb-8">
              Carica il file Excel ricevuto da Grenke con la lista dei contratti in scadenza.
              Il sistema effettuerà la riconciliazione automatica con i contratti NSM.
            </p>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-all
                ${dragOver ? 'border-ok-border bg-ok' : 'border-border hover:border-flex hover:bg-paper'}
                ${loading ? 'pointer-events-none opacity-60' : ''}
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />
              {loading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-12 h-12 text-flex animate-spin" />
                  <p className="text-flex font-medium">Analisi in corso...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-paper flex items-center justify-center">
                    {dragOver ? (
                      <FileSpreadsheet className="w-8 h-8 text-ok-text" />
                    ) : (
                      <Upload className="w-8 h-8 text-stone" />
                    )}
                  </div>
                  <p className="text-graphite font-medium">
                    Trascina qui il file Excel oppure clicca per selezionarlo
                  </p>
                  <p className="text-sm text-stone">Formato supportato: .xlsx</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && preview && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-graphite">Anteprima importazione</h2>
                <p className="text-stone">{preview.totalRows} contratti analizzati</p>
              </div>
              <button
                onClick={() => { setStep('upload'); setPreview(null) }}
                className="text-sm text-stone hover:text-graphite underline"
              >
                Carica un altro file
              </button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-ok border border-ok-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-5 h-5 text-ok-text" />
                  <span className="text-sm font-medium text-ok-text">Riconciliati</span>
                </div>
                <p className="text-3xl font-bold text-ok-text">{preview.riconciliatiAuto}</p>
              </div>
              <div className="bg-warn border border-warn-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-5 h-5 text-warn-text" />
                  <span className="text-sm font-medium text-warn-text">Outlier</span>
                </div>
                <p className="text-3xl font-bold text-warn-text">{preview.outlier}</p>
              </div>
              <div className="bg-danger border border-danger-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <XCircle className="w-5 h-5 text-danger-text" />
                  <span className="text-sm font-medium text-danger-text">Errori</span>
                </div>
                <p className="text-3xl font-bold text-danger-text">{preview.errori}</p>
              </div>
            </div>

            {/* Table */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-paper border-b border-border">
                      <th className="text-left px-4 py-3 font-medium text-stone">#</th>
                      <th className="text-left px-4 py-3 font-medium text-stone">Stato</th>
                      <th className="text-left px-4 py-3 font-medium text-stone">Contratto Grenke</th>
                      <th className="text-left px-4 py-3 font-medium text-stone">Ragione Sociale</th>
                      <th className="text-left px-4 py-3 font-medium text-stone">P.IVA</th>
                      <th className="text-right px-4 py-3 font-medium text-stone">Canone</th>
                      <th className="text-right px-4 py-3 font-medium text-stone">Mesi</th>
                      <th className="text-right px-4 py-3 font-medium text-stone">Monte Canoni</th>
                      <th className="text-right px-4 py-3 font-medium text-stone">Prezzo Grenke</th>
                      <th className="text-right px-4 py-3 font-medium text-stone">Riacquisto Cliente</th>
                      <th className="text-right px-4 py-3 font-medium text-stone">Margine</th>
                      <th className="text-right px-4 py-3 font-medium text-stone">Gift Card</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.index} className={`border-b border-border ${statusBg(row.status)}`}>
                        <td className="px-4 py-3 text-stone">{row.index + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {statusIcon(row.status)}
                            <span className="text-xs font-medium">{statusLabel(row.status)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{row.raw.contratto_grenke_id}</td>
                        <td className="px-4 py-3">{row.raw['cliente.ragione_sociale']}</td>
                        <td className="px-4 py-3 font-mono text-xs">{row.raw['cliente.piva']}</td>
                        <td className="px-4 py-3 text-right">{fmt(row.raw.canone_mensile)}</td>
                        <td className="px-4 py-3 text-right">{row.raw.numero_mesi}</td>
                        <td className="px-4 py-3 text-right">{row.pricing ? fmt(row.pricing.monte_canoni) : '—'}</td>
                        <td className="px-4 py-3 text-right">{row.pricing ? fmt(row.pricing.pricing_grenke) : '—'}</td>
                        <td className="px-4 py-3 text-right">{row.pricing ? fmt(row.pricing.pricing_riacquisto) : '—'}</td>
                        <td className={`px-4 py-3 text-right ${row.pricing && row.pricing.margine_lordo <= 0 ? 'text-err-text font-medium' : ''}`}>{row.pricing ? fmt(row.pricing.margine_lordo) : '—'}</td>
                        <td className="px-4 py-3 text-right">
                          {row.pricing ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-ok text-ok-text">
                              {fmt(row.pricing.valore_gift_card)}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Outlier management */}
            {preview.outlier > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-bold text-graphite mb-4">
                  Gestione Outlier ({preview.outlier})
                </h3>
                <div className="space-y-4">
                  {preview.rows
                    .filter(r => r.status === 'OUTLIER_DA_GESTIRE')
                    .map(row => {
                      const decision = decisions.get(row.index)
                      return (
                        <div key={row.index} className="bg-warn border border-warn-border rounded-xl p-5">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <p className="font-medium text-graphite">
                                {row.raw['cliente.ragione_sociale']}
                                <span className="ml-2 text-sm text-stone">P.IVA {row.raw['cliente.piva']}</span>
                              </p>
                              <p className="text-sm text-stone">
                                Contratto: {row.raw.contratto_grenke_id} — Canone {fmt(row.raw.canone_mensile)}/mese × {row.raw.numero_mesi} mesi
                              </p>
                            </div>
                            {row.pricing && (
                              <span className="text-sm font-medium text-warn-text">
                                Monte canoni: {fmt(row.pricing.monte_canoni)}
                              </span>
                            )}
                          </div>

                          {row.suggestedMatches && row.suggestedMatches.length > 0 && (
                            <div className="mb-3 p-3 bg-white/50 rounded-lg">
                              <p className="text-xs font-medium text-warn-text mb-1">Suggerimenti di matching:</p>
                              {row.suggestedMatches.map((s, si) => (
                                <p key={si} className="text-xs text-stone">
                                  {s.ragioneSociale} (P.IVA {s.piva})
                                  <button
                                    onClick={() => updateDecision(row.index, { action: 'ASSOCIA', clienteId: s.clienteId })}
                                    className="ml-2 text-flex underline"
                                  >
                                    Associa
                                  </button>
                                </p>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <select
                                value={decision?.action || 'SCARTA'}
                                onChange={(e) => updateDecision(row.index, {
                                  action: e.target.value as OutlierAction,
                                  clienteId: undefined,
                                  motivazione: '',
                                })}
                                className="appearance-none bg-card border border-border rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-flex/20"
                              >
                                <option value="SCARTA">Scarta</option>
                                <option value="CREA">Crea nuovo</option>
                                <option value="ASSOCIA">Associa esistente</option>
                              </select>
                              <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-stone pointer-events-none" />
                            </div>

                            {(decision?.action === 'SCARTA' || decision?.action === 'CREA') && (
                              <input
                                type="text"
                                placeholder="Motivazione (obbligatoria)"
                                value={decision?.motivazione || ''}
                                onChange={(e) => updateDecision(row.index, { motivazione: e.target.value })}
                                className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-flex/20 placeholder:text-stone"
                              />
                            )}

                            {decision?.action === 'ASSOCIA' && decision.clienteId && (
                              <span className="text-sm text-ok-text font-medium">
                                Associato a cliente {decision.clienteId.slice(0, 8)}...
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            {/* Confirm button */}
            <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
              <p className="text-sm text-stone">
                Verranno creati <strong>{preview.riconciliatiAuto + Array.from(decisions.values()).filter(d => d.action !== 'SCARTA').length}</strong> contratti EOL
              </p>
              <button
                onClick={handleConfirm}
                disabled={loading || !canConfirm()}
                className={`
                  px-6 py-3 rounded-xl font-medium text-white transition-all
                  ${loading || !canConfirm()
                    ? 'bg-stone cursor-not-allowed'
                    : 'bg-ok-text hover:bg-ok-text/80 shadow-md hover:shadow-lg'}
                `}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Importazione in corso...
                  </span>
                ) : (
                  'Conferma importazione'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step: Confirmed */}
        {step === 'confirmed' && confirmResult && (
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-20 h-20 rounded-full bg-ok flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-ok-text" />
            </div>
            <h2 className="text-2xl font-bold text-graphite mb-2">Importazione completata</h2>
            <p className="text-stone mb-8">{confirmResult.message}</p>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-ok border border-ok-border rounded-xl p-4">
                <p className="text-sm text-ok-text font-medium">Creati</p>
                <p className="text-3xl font-bold text-ok-text">{confirmResult.creati}</p>
              </div>
              <div className="bg-warn border border-warn-border rounded-xl p-4">
                <p className="text-sm text-warn-text font-medium">Scartati</p>
                <p className="text-3xl font-bold text-warn-text">{confirmResult.scartati}</p>
              </div>
              <div className="bg-danger border border-danger-border rounded-xl p-4">
                <p className="text-sm text-danger-text font-medium">Errori</p>
                <p className="text-3xl font-bold text-danger-text">{confirmResult.errori}</p>
              </div>
            </div>

            <button
              onClick={() => { setStep('upload'); setPreview(null); setConfirmResult(null) }}
              className="px-6 py-3 rounded-xl font-medium text-white bg-flex hover:bg-flex-dark transition-all shadow-md"
            >
              Nuova importazione
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
