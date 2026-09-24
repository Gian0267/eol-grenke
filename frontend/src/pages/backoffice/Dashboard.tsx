import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Link } from 'react-router-dom'
import { Loader2, AlertTriangle, Phone, PhoneCall, PhoneOff, TrendingUp, Percent, Euro, Clock, UserCheck, FileText, Inbox, CalendarClock, Link2, Copy, Check, Send } from 'lucide-react'

interface ScadenzaGrenke {
  presente: boolean
  data_invio?: string
  data_scadenza_contratti?: string
  giorni_mancanti?: number
  giorni_soglia?: number
  totale?: number
  pagate?: number
  da_incassare?: number
  importo_incassato?: number
  importo_da_incassare?: number
}

interface ProssimoInvio {
  tipo: string
  etichetta: string
  soglia: number
  manuale: boolean
  data: string | null
  pratiche: number
  pronte_ora: number
  mancate: number
  totale_attesa: number
}

interface ScontoNuovoNoleggio {
  attivo: boolean
  percentuale?: number
  concessi?: number
  in_scadenza?: number
  ancora_in_tempo?: number
}

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
  segnalazioni_da_gestire?: number
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
  const [grenke, setGrenke] = useState<ScadenzaGrenke | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Link di registrazione a un nuovo noleggio, da passare a un cliente
  const [prossimiInvii, setProssimiInvii] = useState<ProssimoInvio[]>([])
  const [sconto, setSconto] = useState<ScontoNuovoNoleggio | null>(null)
  const [linkOnboarding, setLinkOnboarding] = useState<string | null>(null)
  const [copiato, setCopiato] = useState(false)

  async function copiaLink() {
    if (!linkOnboarding) return
    try {
      await navigator.clipboard.writeText(linkOnboarding)
    } catch {
      // Clipboard negata (contesto non sicuro, permessi): ripiego sulla
      // selezione, cosi' il link resta comunque copiabile a mano.
      const el = document.createElement('textarea')
      el.value = linkOnboarding
      document.body.appendChild(el)
      el.select()
      try { document.execCommand('copy') } catch { /* niente da fare */ }
      el.remove()
    }
    setCopiato(true)
    setTimeout(() => setCopiato(false), 2000)
  }

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
        const [riskRes, kpiRes, praticheRes, grenkeRes] = await Promise.all([
          fetch('/api/backoffice/dashboard/risk-silence-counts', opts),
          fetch('/api/backoffice/dashboard/kpi', opts),
          fetch('/api/backoffice/dashboard/pratiche-recenti', opts),
          fetch('/api/backoffice/dashboard/scadenza-grenke', opts),
        ])

        // Non bloccano la dashboard: se falliscono, i riquadri non compaiono
        fetch('/api/backoffice/dashboard/prossimi-invii', opts)
          .then(r => (r.ok ? r.json() : null))
          .then(d => setProssimiInvii(d?.invii ?? []))
          .catch(() => {})

        fetch('/api/backoffice/dashboard/sconto-nuovo-noleggio', opts)
          .then(r => (r.ok ? r.json() : null))
          .then(d => setSconto(d ?? null))
          .catch(() => {})

        fetch('/api/backoffice/link-onboarding', opts)
          .then(r => (r.ok ? r.json() : null))
          .then(d => setLinkOnboarding(d?.link ?? null))
          .catch(() => {})

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
        // Non blocca la dashboard: se fallisce, il riquadro semplicemente non compare
        if (grenkeRes.ok) setGrenke(await grenkeRes.json())
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
      {/* Link di registrazione a un nuovo noleggio: si copia e si incolla al
          cliente. Il valore arriva dalle Impostazioni, non e' cablato qui:
          contiene l'identificativo dell'agente e un giorno potrebbe cambiare. */}
      {linkOnboarding && (
        <section>
          <div className="bg-card rounded-xl border border-border p-4 flex flex-wrap items-center gap-3">
            <Link2 className="w-5 h-5 text-flex shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-graphite">Link per un nuovo noleggio</p>
              <p className="text-xs text-stone break-all">{linkOnboarding}</p>
            </div>
            <button
              onClick={copiaLink}
              className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-flex text-white text-sm font-medium hover:bg-flex-dark transition-colors"
            >
              {copiato ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiato ? 'Copiato' : 'Copia link'}
            </button>
          </div>
        </section>
      )}

      {/* Scadenza trasmissione lista a Grenke: entro quella data va incassato
          il massimo possibile, dopo il contratto non entra piu' nella lista. */}
      {grenke?.presente && (() => {
        const gg = grenke.giorni_mancanti ?? 0
        const scaduta = gg < 0
        const urgente = gg >= 0 && gg <= 5
        const tono = scaduta
          ? { box: 'bg-danger border-danger-border/30', testo: 'text-danger-text', icona: 'text-danger-border' }
          : urgente
            ? { box: 'bg-warn border-warn-border/30', testo: 'text-warn-text', icona: 'text-warn-border' }
            : { box: 'bg-ok border-ok-border/30', testo: 'text-ok-text', icona: 'text-ok-border' }
        const dataInvio = new Date(grenke.data_invio!).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
        const dataScad = new Date(grenke.data_scadenza_contratti!).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
        const eur = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        const quanti = scaduta
          ? `scaduta da ${-gg} ${-gg === 1 ? 'giorno' : 'giorni'}`
          : gg === 0 ? 'scade oggi' : `fra ${gg} ${gg === 1 ? 'giorno' : 'giorni'}`

        return (
          <section>
            <h2 className="text-xl font-medium text-graphite mb-4">Trasmissione lista riacquisti a Grenke</h2>
            <div className={`rounded-xl border p-5 ${tono.box}`}>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <CalendarClock className={`h-5 w-5 ${tono.icona}`} />
                    <span className={`text-sm font-medium uppercase tracking-wide font-mono ${tono.testo}`}>
                      T-{grenke.giorni_soglia}
                    </span>
                  </div>
                  <p className={`text-3xl font-medium ${tono.testo}`}>{dataInvio}</p>
                  <p className={`text-sm mt-1 ${tono.testo}/80`}>{quanti}</p>
                  <p className={`text-xs mt-0.5 ${tono.testo}/60`}>
                    Riguarda i contratti in scadenza il {dataScad}
                  </p>
                </div>

                <div className="md:text-right">
                  <p className={`text-4xl font-medium font-mono ${tono.testo}`}>
                    {grenke.pagate}<span className="text-2xl opacity-60">/{grenke.totale}</span>
                  </p>
                  <p className={`text-sm mt-1 ${tono.testo}/80`}>pagamenti incassati</p>
                  {(grenke.da_incassare ?? 0) > 0 && (
                    <p className={`text-xs mt-0.5 ${tono.testo}/60`}>
                      &euro; {eur(grenke.importo_da_incassare ?? 0)} ancora da incassare
                      {' '}su {grenke.da_incassare} {grenke.da_incassare === 1 ? 'pratica' : 'pratiche'}
                    </p>
                  )}
                </div>
              </div>

              {(grenke.da_incassare ?? 0) > 0 && (
                <Link
                  to="/backoffice/pratiche?stato=DECISIONE_RIACQUISTO"
                  className={`inline-block mt-4 text-sm font-medium underline ${tono.testo}`}
                >
                  Vedi le pratiche da incassare
                </Link>
              )}
            </div>
          </section>
        )
      })()}

      {/* Cosa parte, quando e a quante pratiche. Le date sono quelle che usa
          lo scheduler: se qui comparisse una pratica che poi non riceve
          niente, il riquadro servirebbe solo a illudere. */}
      {prossimiInvii.length > 0 && (
        <section>
          <h2 className="text-xl font-medium text-graphite mb-4">Prossime comunicazioni</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
            {prossimiInvii.map((v) => {
              const oggi = v.pronte_ora > 0
              const data = v.data
                ? new Date(v.data).toLocaleDateString('it-IT', { day: '2-digit', month: 'long' })
                : null
              return (
                <div
                  key={v.tipo}
                  className={`rounded-xl border p-5 ${oggi ? 'bg-warn border-warn-border/30' : 'bg-card border-border'}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Send className={`h-4 w-4 ${oggi ? 'text-warn-border' : 'text-stone'}`} />
                    <span className={`text-xs font-medium uppercase tracking-wide font-mono ${oggi ? 'text-warn-text' : 'text-stone'}`}>
                      T-{v.soglia}
                    </span>
                  </div>
                  <p className={`text-lg font-medium ${oggi ? 'text-warn-text' : 'text-graphite'}`}>
                    {oggi ? 'Da inviare ora' : data ?? '—'}
                  </p>
                  <p className={`text-sm mt-1 ${oggi ? 'text-warn-text' : 'text-stone'}`}>{v.etichetta}</p>
                  <p className={`text-2xl font-medium mt-3 ${oggi ? 'text-warn-text' : 'text-graphite'}`}>
                    {v.pratiche}
                    <span className="text-sm font-normal text-stone"> {v.pratiche === 1 ? 'pratica' : 'pratiche'}</span>
                  </p>
                  {v.manuale && (
                    <p className="text-xs text-stone mt-2">Si invia a mano dalla lista pratiche</p>
                  )}
                  {/* I solleciti scattano al giorno esatto: una pratica che ha
                      superato la soglia non lo ricevera' mai piu'. */}
                  {v.mancate > 0 && (
                    <p className="text-xs text-danger-text mt-2">
                      {v.mancate} {v.mancate === 1 ? 'pratica ha' : 'pratiche hanno'} superato la soglia senza riceverlo
                    </p>
                  )}
                  {v.totale_attesa > v.pratiche && v.mancate === 0 && (
                    <p className="text-xs text-stone mt-2">{v.totale_attesa} in attesa in totale</p>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Sconto per nuovo noleggio: lo concede una persona spuntando la
          spedizione. Senza questo promemoria si promette uno sconto e poi non
          lo si applica — e il cliente se ne accorge alla richiesta di pagamento. */}
      {sconto?.attivo && (sconto.ancora_in_tempo ?? 0) + (sconto.concessi ?? 0) > 0 && (
        <section>
          <h2 className="text-xl font-medium text-graphite mb-4">Sconto per nuovo noleggio</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm text-stone">Sconto concesso</p>
              <p className="text-2xl font-medium text-graphite mt-2">{sconto.concessi ?? 0}</p>
              <p className="text-xs text-stone mt-1">spedizione confermata, riscatto a −{sconto.percentuale}%</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm text-stone">Ancora in tempo</p>
              <p className="text-2xl font-medium text-graphite mt-2">{sconto.ancora_in_tempo ?? 0}</p>
              <p className="text-xs text-stone mt-1">possono ancora ordinare e ricevere</p>
            </div>
            <div className={`rounded-xl border p-5 ${(sconto.in_scadenza ?? 0) > 0 ? 'bg-warn border-warn-border/30' : 'border-border bg-card'}`}>
              <p className={`text-sm ${(sconto.in_scadenza ?? 0) > 0 ? 'text-warn-text' : 'text-stone'}`}>Limite entro 15 giorni</p>
              <p className={`text-2xl font-medium mt-2 ${(sconto.in_scadenza ?? 0) > 0 ? 'text-warn-text' : 'text-graphite'}`}>
                {sconto.in_scadenza ?? 0}
              </p>
              <p className={`text-xs mt-1 ${(sconto.in_scadenza ?? 0) > 0 ? 'text-warn-text' : 'text-stone'}`}>
                senza conferma di spedizione
              </p>
            </div>
          </div>
        </section>
      )}

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
          {/* Segnalazioni casella info@ da gestire */}
          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <Inbox className="h-5 w-5 text-stone" />
              <h3 className="text-sm font-medium text-stone">Segnalazioni da gestire</h3>
            </div>
            <p className={`text-3xl font-medium font-mono ${(kpi?.segnalazioni_da_gestire ?? 0) > 0 ? 'text-danger-text' : 'text-ok-text'}`}>
              {kpi?.segnalazioni_da_gestire ?? 0}
            </p>
            <p className="text-xs text-stone mt-1">
              <Link to="/backoffice/segnalazioni-casella" className="text-flex hover:underline">Casella info@ — vai alle segnalazioni</Link>
            </p>
          </div>

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
