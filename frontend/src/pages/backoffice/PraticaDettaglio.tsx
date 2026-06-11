import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast, Toaster } from 'sonner';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import {
  ArrowLeft,
  Loader2,
  Mail,
  CheckCircle,
  Phone,
  CreditCard,
  Send,
  UserCog,
  CalendarClock,
  Unlock,
  ClipboardEdit,
  FileDown,
  X,
  AlertCircle,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Cliente {
  ragione_sociale: string;
  piva: string;
  email: string;
  pec: string;
  telefono: string;
  codice_fiscale: string;
  indirizzo_sede: string;
  cap: string;
  citta: string;
  provincia: string;
}

interface Agente {
  id: string;
  nome: string;
  cognome: string;
  email?: string;
  ruolo?: string;
}

interface AgenteOriginario {
  id: string;
  nome: string;
  cognome: string;
}

interface Decisione {
  opzione_scelta: string;
  created_at: string;
  otp_verificato: boolean;
  otp_metodo: string;
  note_cliente: string | null;
}

interface RichiestaContatto {
  id: string;
  origine: string;
  nome_referente: string | null;
  telefono: string | null;
  fascia_oraria: string | null;
  modalita_preferita: string | null;
  note: string | null;
  stato: string;
  data_richiamato: string | null;
  agente_assegnato: { nome: string; cognome: string } | null;
}

interface Pagamento {
  importo_totale: number;
  metodo: string;
  stato: string;
  data_iniziato: string;
}

interface TimelineEntry {
  tipo: string;
  sottotipo: string;
  data: string;
  dettaglio: string;
  canale?: string;
  esito?: string;
  note?: string;
  assegnato?: string;
}

interface Pratica {
  id: string;
  contratto_nsm_id: string;
  contratto_grenke_id: string;
  data_stipula: string;
  data_scadenza: string | null;
  canone_mensile: number;
  numero_mesi: number;
  monte_canoni: number;
  pricing_riacquisto: number;
  pricing_grenke: number;
  margine_lordo: number;
  valore_gift_card: number;
  valore_originario: number;
  stato: string;
  origine: string;
  beni_json: string;
  giorni_a_scadenza: number;
  codice_sconto: CodiceScontoInfo | null;
  cliente: Cliente;
  agente_assegnato: Agente | null;
  agente_originario: AgenteOriginario | null;
  decisioni: Decisione[];
  richieste_contatto: RichiestaContatto[];
  pagamenti: Pagamento[];
  timeline: TimelineEntry[];
}

interface CodiceScontoInfo {
  id: string;
  codice: string;
  valore_eur: number;
  stato: string;
  data_generazione: string;
  data_scadenza: string;
  data_utilizzo: string | null;
  note: string | null;
}

interface AgenteOption {
  id: string;
  nome: string;
  cognome: string;
}

interface Utente {
  id: string;
  nome: string;
  cognome: string;
  email: string;
  ruolo: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getUtente(): Utente | null {
  try {
    const raw = localStorage.getItem('nsm_user');
    if (!raw) return null;
    return JSON.parse(raw) as Utente;
  } catch {
    return null;
  }
}

function formatEur(n: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(n);
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  try {
    return format(new Date(d), 'dd/MM/yyyy', { locale: it });
  } catch {
    return d;
  }
}

function formatDateTime(d: string): string {
  try {
    return format(new Date(d), 'dd/MM/yyyy HH:mm', { locale: it });
  } catch {
    return d;
  }
}

function giornoColor(g: number): string {
  if (g < 35) return 'bg-danger text-danger-text';
  if (g < 50) return 'bg-warn text-warn-text';
  return 'bg-ok text-ok-text';
}

const STATO_BADGE: Record<string, { bg: string; label: string }> = {
  LISTA_RICEVUTA: { bg: 'bg-paper text-stone', label: 'Lista ricevuta' },
  COMUNICAZIONE_INVIATA: { bg: 'bg-flex-light text-flex-dark', label: 'Comunicazione inviata' },
  IN_ATTESA_DECISIONE: { bg: 'bg-warn text-warn-text', label: 'In attesa decisione' },
  DECISIONE_RINNOVO: { bg: 'bg-ok text-ok-text', label: 'Decisione: Rinnovo' },
  DECISIONE_RIACQUISTO: { bg: 'bg-ok text-ok-text', label: 'Decisione: Riacquisto' },
  DECISIONE_RESTITUZIONE: { bg: 'bg-warn text-warn-text', label: 'Decisione: Restituzione' },
  DECISIONE_CONTATTO: { bg: 'bg-flex-light text-flex-dark', label: 'Decisione: Contatto' },
  SILENZIO_REMINDER: { bg: 'bg-danger text-danger-text', label: 'Silenzio — reminder' },
  SILENZIO_ESCALATION: { bg: 'bg-danger text-danger-text', label: 'Silenzio — escalation' },
  RIACQUISTO_IN_ATTESA_CHIAMATA: { bg: 'bg-outlier text-outlier-text', label: 'Riacquisto — attesa chiamata' },
  RIACQUISTO_IN_ATTESA_PAGAMENTO: { bg: 'bg-outlier text-outlier-text', label: 'Riacquisto — attesa pagamento' },
  RIACQUISTO_COMPLETATO: { bg: 'bg-ok text-ok-text', label: 'Riacquisto completato' },
  COMPLETATA: { bg: 'bg-ok text-ok-text', label: 'Completata' },
};

function statoBadge(stato: string) {
  const found = STATO_BADGE[stato];
  if (found) return found;
  return {
    bg: 'bg-paper text-stone',
    label: stato.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
  };
}

function timelineIcon(tipo: string) {
  switch (tipo) {
    case 'COMUNICAZIONE':
      return <Mail className="w-4 h-4 text-flex" />;
    case 'DECISIONE':
      return <CheckCircle className="w-4 h-4 text-ok-border" />;
    case 'ESCALATION':
      return <Phone className="w-4 h-4 text-warn-border" />;
    case 'PAGAMENTO':
      return <CreditCard className="w-4 h-4 text-outlier-text" />;
    default:
      return <AlertCircle className="w-4 h-4 text-stone" />;
  }
}

function timelineColor(tipo: string) {
  switch (tipo) {
    case 'COMUNICAZIONE':
      return 'border-flex/30 bg-flex-light';
    case 'DECISIONE':
      return 'border-ok-border/30 bg-ok';
    case 'ESCALATION':
      return 'border-warn-border/30 bg-warn';
    case 'PAGAMENTO':
      return 'border-outlier-text/30 bg-outlier';
    default:
      return 'border-border bg-paper';
  }
}

function parseBeni(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed.map((b: any) => {
        if (typeof b === 'string') return b;
        const qta = b.quantita && b.quantita > 1 ? `${b.quantita}× ` : '';
        const parts = [b.descrizione, b.marca, b.modello].filter(Boolean);
        let riga = qta + (parts.length > 0 ? parts.join(' — ') : JSON.stringify(b));
        if (b.seriale) riga += ` — S/N ${b.seriale}`;
        if (b.canone_unitario) riga += ` — ${Number(b.canone_unitario).toLocaleString('it-IT', { minimumFractionDigits: 2 })} €/mese`;
        return riga;
      });
    }
    return [String(parsed)];
  } catch {
    return json ? [json] : [];
  }
}

/* ------------------------------------------------------------------ */
/*  Modal wrapper                                                      */
/* ------------------------------------------------------------------ */

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-graphite">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-stone">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

type TabKey = 'panoramica' | 'timeline' | 'richieste' | 'audit';

export default function PraticaDettaglio() {
  const { id } = useParams<{ id: string }>();
  const [utente] = useState<Utente | null>(() => getUtente());

  const [pratica, setPratica] = useState<Pratica | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('panoramica');

  // Action modal states
  const [modalOpen, setModalOpen] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Cambia agente
  const [agenti, setAgenti] = useState<AgenteOption[]>([]);
  const [selectedAgente, setSelectedAgente] = useState('');

  // Modifica deadline
  const [nuovaData, setNuovaData] = useState('');
  const [motivazione, setMotivazione] = useState('');

  // Decisione manuale
  const [decisioneScelta, setDecisioneScelta] = useState<string>('');
  const [decisioneNote, setDecisioneNote] = useState('');

  // Segna richiamato loading
  const [richiamatoLoading, setRichiamatoLoading] = useState<string | null>(null);

  /* ---- API helpers ---- */

  const getHeaders = (): HeadersInit => {
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    if (utente) h['x-user-id'] = utente.id;
    return h;
  };

  const loadPratica = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/backoffice/pratiche-dettaglio/${id}`, {
        credentials: 'include',
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: Pratica = await res.json();
      setPratica(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore sconosciuto';
      setError(msg);
      toast.error(`Errore caricamento pratica: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPratica();
  }, [id]);

  const loadAgenti = async () => {
    try {
      const res = await fetch('/api/backoffice/agenti', {
        credentials: 'include',
        headers: getHeaders(),
      });
      if (!res.ok) return;
      const data: AgenteOption[] = await res.json();
      setAgenti(data);
    } catch {
      /* ignore */
    }
  };

  /* ---- Action handlers ---- */

  async function doAction(url: string, body?: object) {
    setActionLoading(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success('Azione completata con successo');
      setModalOpen(null);
      await loadPratica();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore');
    } finally {
      setActionLoading(false);
    }
  }

  function openModal(key: string) {
    setModalOpen(key);
    // Reset form states
    setSelectedAgente('');
    setNuovaData('');
    setMotivazione('');
    setDecisioneScelta('');
    setDecisioneNote('');
    if (key === 'cambia-agente') loadAgenti();
  }

  async function handleSegnaRichiamato(richiestaId: string) {
    setRichiamatoLoading(richiestaId);
    try {
      const res = await fetch(`/api/backoffice/pratiche-dettaglio/${id}/segna-richiamato`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({ richiesta_id: richiestaId }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success('Richiesta segnata come richiamata');
      await loadPratica();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore');
    } finally {
      setRichiamatoLoading(null);
    }
  }

  /* ---- Loading / Error states ---- */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Toaster position="top-right" richColors />
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !pratica) {
    return (
      <div className="py-20 text-center">
        <Toaster position="top-right" richColors />
        <AlertCircle className="w-10 h-10 mx-auto mb-3 text-red-400" />
        <p className="text-stone">{error || 'Pratica non trovata'}</p>
        <Link
          to="/backoffice/pratiche"
          className="inline-flex items-center gap-1.5 mt-4 text-sm text-graphite hover:underline"
        >
          <ArrowLeft className="w-4 h-4" /> Torna alla lista
        </Link>
      </div>
    );
  }

  const badge = statoBadge(pratica.stato);
  const beni = parseBeni(pratica.beni_json);

  /* ---- Tab definitions ---- */

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'panoramica', label: 'Panoramica' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'richieste', label: 'Richieste contatto' },
    { key: 'audit', label: 'Audit log' },
  ];

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <div>
      <Toaster position="top-right" richColors />

      {/* ---- Back + header ---- */}
      <Link
        to="/backoffice/pratiche"
        className="inline-flex items-center gap-1.5 text-sm text-graphite hover:underline mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Torna alla lista
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-graphite">
            {pratica.cliente.ragione_sociale}{' '}
            <span className="text-base font-normal text-stone font-mono">
              — {pratica.contratto_nsm_id}
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${badge.bg}`}>
            {badge.label}
          </span>
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium font-mono ${giornoColor(pratica.giorni_a_scadenza)}`}
          >
            {pratica.giorni_a_scadenza} giorni alla scadenza
          </span>
        </div>
      </div>

      {/* ---- Layout: tabs + sidebar ---- */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Tabs */}
          <div className="border-b border-border mb-6">
            <nav className="flex gap-6">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`pb-2.5 text-sm transition-colors ${
                    tab === t.key
                      ? 'border-b-2 border-flex font-medium text-graphite'
                      : 'text-stone hover:text-graphite'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab content */}
          {tab === 'panoramica' && <TabPanoramica pratica={pratica} beni={beni} badge={badge} />}
          {tab === 'timeline' && <TabTimeline timeline={pratica.timeline} />}
          {tab === 'richieste' && (
            <TabRichieste
              richieste={pratica.richieste_contatto}
              onSegnaRichiamato={handleSegnaRichiamato}
              richiamatoLoading={richiamatoLoading}
            />
          )}
          {tab === 'audit' && <TabAudit contrattoId={id!} />}
        </div>

        {/* Sidebar */}
        <aside className="lg:w-72 shrink-0">
          <div className="lg:sticky lg:top-6">
            <div className="bg-card rounded-xl border border-border p-5">
              <h3 className="text-sm font-semibold text-graphite mb-4">Azioni</h3>
              <div className="flex flex-col gap-2.5">
                <ActionBtn
                  icon={<Send className="w-4 h-4" />}
                  label="Reinvia comunicazione"
                  onClick={() => openModal('reinvia')}
                />
                <ActionBtn
                  icon={<UserCog className="w-4 h-4" />}
                  label="Cambia agente"
                  onClick={() => openModal('cambia-agente')}
                />
                <ActionBtn
                  icon={<CalendarClock className="w-4 h-4" />}
                  label="Modifica deadline"
                  onClick={() => openModal('modifica-deadline')}
                />
                {pratica.stato === 'RIACQUISTO_IN_ATTESA_CHIAMATA' && (
                  <ActionBtn
                    icon={<Unlock className="w-4 h-4" />}
                    label="Sblocca pagamento"
                    onClick={() => openModal('sblocca')}
                  />
                )}
                <ActionBtn
                  icon={<ClipboardEdit className="w-4 h-4" />}
                  label="Decisione manuale"
                  onClick={() => openModal('decisione-manuale')}
                />
                <div className="relative group">
                  <button
                    disabled
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-border bg-paper text-gray-400 cursor-not-allowed"
                  >
                    <FileDown className="w-4 h-4" />
                    Esporta storico PDF
                  </button>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-800 text-white text-xs rounded px-2.5 py-1.5 whitespace-nowrap">
                    Disponibile dopo Missione 10
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* ================================================================ */}
      {/*  MODALS                                                          */}
      {/* ================================================================ */}

      {/* Reinvia comunicazione */}
      <Modal open={modalOpen === 'reinvia'} title="Reinvia comunicazione" onClose={() => setModalOpen(null)}>
        <p className="text-sm text-stone mb-5">
          Vuoi reinviare la comunicazione EOL al cliente{' '}
          <strong>{pratica.cliente.ragione_sociale}</strong>?
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setModalOpen(null)}
            className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-paper"
          >
            Annulla
          </button>
          <button
            disabled={actionLoading}
            onClick={() => doAction(`/api/backoffice/pratiche-dettaglio/${id}/reinvia-comunicazione`)}
            className="px-4 py-2 text-sm rounded-lg bg-flex text-white hover:bg-flex-dark disabled:opacity-50 flex items-center gap-2"
          >
            {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Conferma
          </button>
        </div>
      </Modal>

      {/* Cambia agente */}
      <Modal open={modalOpen === 'cambia-agente'} title="Cambia agente assegnato" onClose={() => setModalOpen(null)}>
        <div className="mb-4">
          <label className="block text-sm font-medium text-graphite mb-1">Nuovo agente</label>
          <select
            value={selectedAgente}
            onChange={(e) => setSelectedAgente(e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-flex/30"
          >
            <option value="">Seleziona agente...</option>
            {agenti.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome} {a.cognome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setModalOpen(null)}
            className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-paper"
          >
            Annulla
          </button>
          <button
            disabled={actionLoading || !selectedAgente}
            onClick={() => doAction(`/api/backoffice/pratiche-dettaglio/${id}/cambia-agente`, { agente_id: selectedAgente })}
            className="px-4 py-2 text-sm rounded-lg bg-flex text-white hover:bg-flex-dark disabled:opacity-50 flex items-center gap-2"
          >
            {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Conferma
          </button>
        </div>
      </Modal>

      {/* Modifica deadline */}
      <Modal open={modalOpen === 'modifica-deadline'} title="Modifica deadline" onClose={() => setModalOpen(null)}>
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-sm font-medium text-graphite mb-1">Nuova data scadenza</label>
            <input
              type="date"
              value={nuovaData}
              onChange={(e) => setNuovaData(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-flex/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-graphite mb-1">Motivazione *</label>
            <textarea
              value={motivazione}
              onChange={(e) => setMotivazione(e.target.value)}
              rows={3}
              placeholder="Indica il motivo della modifica..."
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-flex/30 resize-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setModalOpen(null)}
            className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-paper"
          >
            Annulla
          </button>
          <button
            disabled={actionLoading || !nuovaData || !motivazione.trim()}
            onClick={() =>
              doAction(`/api/backoffice/pratiche-dettaglio/${id}/modifica-deadline`, {
                nuova_data: nuovaData,
                motivazione: motivazione.trim(),
              })
            }
            className="px-4 py-2 text-sm rounded-lg bg-flex text-white hover:bg-flex-dark disabled:opacity-50 flex items-center gap-2"
          >
            {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Conferma
          </button>
        </div>
      </Modal>

      {/* Sblocca pagamento */}
      <Modal open={modalOpen === 'sblocca'} title="Sblocca pagamento" onClose={() => setModalOpen(null)}>
        <p className="text-sm text-stone mb-5">
          Confermi di voler sbloccare il pagamento per il riacquisto di{' '}
          <strong>{pratica.cliente.ragione_sociale}</strong>?
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setModalOpen(null)}
            className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-paper"
          >
            Annulla
          </button>
          <button
            disabled={actionLoading}
            onClick={() => doAction(`/api/backoffice/pratiche/${id}/sblocca-pagamento`)}
            className="px-4 py-2 text-sm rounded-lg bg-flex text-white hover:bg-flex-dark disabled:opacity-50 flex items-center gap-2"
          >
            {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Conferma
          </button>
        </div>
      </Modal>

      {/* Decisione manuale */}
      <Modal open={modalOpen === 'decisione-manuale'} title="Decisione manuale" onClose={() => setModalOpen(null)}>
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-sm font-medium text-graphite mb-2">Opzione</label>
            <div className="space-y-2">
              {(['RINNOVO', 'RIACQUISTO', 'CONTATTO', 'RESTITUZIONE'] as const).map((opt) => (
                <label
                  key={opt}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                    decisioneScelta === opt ? 'border-flex bg-flex/5' : 'border-border hover:bg-paper'
                  }`}
                >
                  <input
                    type="radio"
                    name="decisione"
                    value={opt}
                    checked={decisioneScelta === opt}
                    onChange={() => setDecisioneScelta(opt)}
                    className="accent-flex"
                  />
                  <span className="text-sm">{opt.charAt(0) + opt.slice(1).toLowerCase()}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-graphite mb-1">Note (facoltative)</label>
            <textarea
              value={decisioneNote}
              onChange={(e) => setDecisioneNote(e.target.value)}
              rows={2}
              placeholder="Note aggiuntive..."
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-flex/30 resize-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setModalOpen(null)}
            className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-paper"
          >
            Annulla
          </button>
          <button
            disabled={actionLoading || !decisioneScelta}
            onClick={() =>
              doAction(`/api/backoffice/pratiche-dettaglio/${id}/decisione-manuale`, {
                decisione: decisioneScelta,
                ...(decisioneNote.trim() ? { note: decisioneNote.trim() } : {}),
              })
            }
            className="px-4 py-2 text-sm rounded-lg bg-flex text-white hover:bg-flex-dark disabled:opacity-50 flex items-center gap-2"
          >
            {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Conferma
          </button>
        </div>
      </Modal>
    </div>
  );
}

/* ================================================================== */
/*  Action button                                                      */
/* ================================================================== */

function ActionBtn({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-border bg-card hover:bg-paper text-graphite transition-colors"
    >
      {icon}
      {label}
    </button>
  );
}

/* ================================================================== */
/*  Tab: Panoramica                                                    */
/* ================================================================== */

function TabPanoramica({
  pratica,
  beni,
  badge,
}: {
  pratica: Pratica;
  beni: string[];
  badge: { bg: string; label: string };
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {/* Dati cliente */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold text-graphite mb-3">Dati cliente</h3>
        <dl className="space-y-2 text-sm">
          <Row label="Ragione sociale" value={pratica.cliente.ragione_sociale} />
          <Row label="P.IVA" value={pratica.cliente.piva} />
          <Row label="Codice fiscale" value={pratica.cliente.codice_fiscale} />
          <Row label="Email" value={pratica.cliente.email} />
          <Row label="PEC" value={pratica.cliente.pec} />
          <Row label="Telefono" value={pratica.cliente.telefono} />
          <Row
            label="Indirizzo"
            value={
              [pratica.cliente.indirizzo_sede, pratica.cliente.cap, pratica.cliente.citta, pratica.cliente.provincia]
                .filter(Boolean)
                .join(', ') || '—'
            }
          />
        </dl>
      </div>

      {/* Dati contratto */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold text-graphite mb-3">Calcolo economico</h3>
        <dl className="space-y-2 text-sm">
          <Row label="Ns. costo (acquisto da Grenke)" value={formatEur(pratica.pricing_grenke)} />
          <Row label="Prezzo riacquisto cliente" value={formatEur(pratica.pricing_riacquisto)} />
          <Row label="Margine lordo" value={formatEur(pratica.margine_lordo)} highlight />
          <Row label="Valore Sconto Bronze" value={formatEur(pratica.valore_gift_card)} highlight />
          <Row label="Valore originario" value={formatEur(pratica.valore_originario)} />
        </dl>
      </div>

      {/* Premio Fedeltà — codice Sconto Copertura Bronze */}
      {pratica.codice_sconto && (
        <div className="bg-card rounded-xl border border-border p-5 md:col-span-2">
          <h3 className="text-sm font-semibold text-graphite mb-3">Premio Fedeltà — Codice Sconto Copertura Bronze</h3>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
            <div>
              <span className="text-stone text-xs uppercase tracking-wide">Codice</span>
              <p className="font-mono font-bold text-lg text-graphite mt-0.5 select-all">{pratica.codice_sconto.codice}</p>
            </div>
            <div>
              <span className="text-stone text-xs uppercase tracking-wide">Valore</span>
              <p className="text-graphite font-medium mt-0.5">{formatEur(pratica.codice_sconto.valore_eur)}</p>
            </div>
            <div>
              <span className="text-stone text-xs uppercase tracking-wide">Stato</span>
              <div className="mt-0.5">
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                  pratica.codice_sconto.stato === 'GENERATO' ? 'bg-flex-light text-flex-dark'
                    : pratica.codice_sconto.stato === 'UTILIZZATO' ? 'bg-ok text-ok-text'
                    : pratica.codice_sconto.stato === 'ANNULLATO' ? 'bg-danger text-danger-text'
                    : 'bg-paper text-stone'
                }`}>
                  {pratica.codice_sconto.stato}
                </span>
              </div>
            </div>
            <div>
              <span className="text-stone text-xs uppercase tracking-wide">Generato</span>
              <p className="text-graphite mt-0.5">{formatDate(pratica.codice_sconto.data_generazione)}</p>
            </div>
            <div>
              <span className="text-stone text-xs uppercase tracking-wide">Scadenza</span>
              <p className="text-graphite mt-0.5">{formatDate(pratica.codice_sconto.data_scadenza)}</p>
            </div>
            {pratica.codice_sconto.data_utilizzo && (
              <div>
                <span className="text-stone text-xs uppercase tracking-wide">Utilizzato il</span>
                <p className="text-graphite mt-0.5">{formatDate(pratica.codice_sconto.data_utilizzo)}</p>
              </div>
            )}
            {pratica.codice_sconto.stato === 'ANNULLATO' && pratica.codice_sconto.note && (
              <div>
                <span className="text-stone text-xs uppercase tracking-wide">Motivo annullo</span>
                <p className="text-graphite mt-0.5">{pratica.codice_sconto.note}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contratto */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold text-graphite mb-3">Dati contratto</h3>
        <dl className="space-y-2 text-sm">
          <Row label="Contratto NSM" value={pratica.contratto_nsm_id} mono />
          <Row label="Contratto Grenke" value={pratica.contratto_grenke_id} mono />
          <Row label="Data stipula" value={formatDate(pratica.data_stipula)} />
          <Row label="Scadenza" value={formatDate(pratica.data_scadenza)} />
          <Row label="Canone mensile" value={formatEur(pratica.canone_mensile)} />
          <Row label="Numero mesi" value={String(pratica.numero_mesi)} />
          <Row label="Monte canoni" value={formatEur(pratica.monte_canoni)} />
          {beni.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:gap-3 pt-1">
              <dt className="text-stone sm:w-40 shrink-0">Beni</dt>
              <dd className="text-graphite">
                <ul className="list-disc list-inside">
                  {beni.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Stato corrente */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold text-graphite mb-3">Stato corrente</h3>
        <div className="space-y-3 text-sm">
          <div>
            <span className="text-stone text-xs uppercase tracking-wide">Stato</span>
            <div className="mt-1">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${badge.bg}`}>
                {badge.label}
              </span>
            </div>
          </div>
          <div>
            <span className="text-stone text-xs uppercase tracking-wide">Origine</span>
            <p className="text-graphite mt-0.5">{pratica.origine || '—'}</p>
          </div>
          <div>
            <span className="text-stone text-xs uppercase tracking-wide">Agente assegnato</span>
            <p className="text-graphite mt-0.5">
              {pratica.agente_assegnato
                ? `${pratica.agente_assegnato.nome} ${pratica.agente_assegnato.cognome}`
                : '— Nessuno —'}
            </p>
            {pratica.agente_assegnato?.email && (
              <p className="text-stone text-xs">{pratica.agente_assegnato.email}</p>
            )}
          </div>
          {pratica.agente_originario && (
            <div>
              <span className="text-stone text-xs uppercase tracking-wide">Agente originario</span>
              <p className="text-graphite mt-0.5">
                {pratica.agente_originario.nome} {pratica.agente_originario.cognome}
              </p>
            </div>
          )}

          {/* Decisioni */}
          {pratica.decisioni.length > 0 && (
            <div className="pt-2 border-t">
              <span className="text-stone text-xs uppercase tracking-wide">Decisioni registrate</span>
              <div className="mt-2 space-y-2">
                {pratica.decisioni.map((d, i) => (
                  <div key={i} className="bg-paper rounded-lg p-3 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-graphite">{d.opzione_scelta}</span>
                      <span className="text-stone">{formatDateTime(d.created_at)}</span>
                    </div>
                    <div className="text-stone mt-1">
                      OTP: {d.otp_verificato ? 'verificato' : 'non verificato'} ({d.otp_metodo})
                    </div>
                    {d.note_cliente && <p className="text-graphite mt-1 italic">{d.note_cliente}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pagamenti */}
          {pratica.pagamenti.length > 0 && (
            <div className="pt-2 border-t">
              <span className="text-stone text-xs uppercase tracking-wide">Pagamenti</span>
              <div className="mt-2 space-y-2">
                {pratica.pagamenti.map((p, i) => (
                  <div key={i} className="bg-paper rounded-lg p-3 text-xs flex justify-between items-center">
                    <div>
                      <span className="font-medium text-graphite">{formatEur(p.importo_totale)}</span>
                      <span className="text-stone ml-2">{p.metodo}</span>
                    </div>
                    <div className="text-right">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          p.stato === 'COMPLETATO'
                            ? 'bg-ok text-ok-text'
                            : p.stato === 'FALLITO'
                            ? 'bg-danger text-danger-text'
                            : 'bg-warn text-warn-text'
                        }`}
                      >
                        {p.stato}
                      </span>
                      <div className="text-stone mt-0.5">{formatDateTime(p.data_iniziato)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Tab: Timeline                                                      */
/* ================================================================== */

function TabTimeline({ timeline }: { timeline: TimelineEntry[] }) {
  if (!timeline || timeline.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center text-stone text-sm">
        Nessun evento nella timeline.
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />

      <div className="space-y-4">
        {timeline.map((entry, i) => (
          <div key={i} className="relative pl-12">
            {/* Icon bubble */}
            <div className="absolute left-2.5 top-3 w-5 h-5 flex items-center justify-center rounded-full bg-white border border-border">
              {timelineIcon(entry.tipo)}
            </div>

            <div className={`rounded-lg border p-4 ${timelineColor(entry.tipo)}`}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-stone">{entry.tipo}</span>
                  {entry.sottotipo && (
                    <span className="text-xs text-stone">/ {entry.sottotipo}</span>
                  )}
                </div>
                <span className="text-xs text-stone">{formatDateTime(entry.data)}</span>
              </div>
              <p className="text-sm text-graphite">{entry.dettaglio}</p>
              {entry.canale && (
                <p className="text-xs text-stone mt-1">Canale: {entry.canale}</p>
              )}
              {entry.esito && (
                <p className="text-xs text-stone mt-1">
                  <strong>Esito:</strong> {entry.esito}
                </p>
              )}
              {entry.note && (
                <p className="text-xs text-stone mt-1 italic">Note: {entry.note}</p>
              )}
              {entry.assegnato && (
                <p className="text-xs text-stone mt-1">Assegnato a: {entry.assegnato}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Tab: Richieste contatto                                            */
/* ================================================================== */

function TabRichieste({
  richieste,
  onSegnaRichiamato,
  richiamatoLoading,
}: {
  richieste: RichiestaContatto[];
  onSegnaRichiamato: (id: string) => void;
  richiamatoLoading: string | null;
}) {
  if (!richieste || richieste.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center text-stone text-sm">
        Nessuna richiesta di contatto.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {richieste.map((r) => {
        const isRichiamato = r.stato === 'RICHIAMATO';
        return (
          <div key={r.id} className="bg-card rounded-xl border border-border p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-gray-400" />
                <span className="font-medium text-graphite">{r.nome_referente || 'Referente non specificato'}</span>
              </div>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  isRichiamato
                    ? 'bg-ok text-ok-text'
                    : 'bg-warn text-warn-text'
                }`}
              >
                {r.stato}
              </span>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm mb-3">
              {r.telefono && <Row label="Telefono" value={r.telefono} />}
              {r.fascia_oraria && <Row label="Fascia oraria" value={r.fascia_oraria} />}
              {r.modalita_preferita && <Row label="Modalita" value={r.modalita_preferita} />}
              {r.origine && <Row label="Origine" value={r.origine} />}
              {r.agente_assegnato && (
                <Row
                  label="Agente assegnato"
                  value={`${r.agente_assegnato.nome} ${r.agente_assegnato.cognome}`}
                />
              )}
              {r.data_richiamato && <Row label="Data richiamato" value={formatDateTime(r.data_richiamato)} />}
            </dl>

            {r.note && (
              <p className="text-xs text-stone italic mb-3">Note: {r.note}</p>
            )}

            <button
              disabled={isRichiamato || richiamatoLoading === r.id}
              onClick={() => onSegnaRichiamato(r.id)}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                isRichiamato
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-flex text-white hover:bg-flex-dark disabled:opacity-50'
              }`}
            >
              {richiamatoLoading === r.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isRichiamato ? 'Gia richiamato' : 'Segna come richiamato'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/*  Tab: Audit log                                                     */
/* ================================================================== */

function TabAudit({ contrattoId }: { contrattoId: string }) {
  const [eventi, setEventi] = useState<any[]>([]);
  const [verifica, setVerifica] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const headers: Record<string, string> = {};
    const raw = localStorage.getItem('nsm_user');
    if (raw) { try { headers['x-user-id'] = JSON.parse(raw).id; } catch {} }

    Promise.all([
      fetch(`/api/backoffice/pratiche-dettaglio/${contrattoId}/audit`, { headers, credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch(`/api/backoffice/pratiche-dettaglio/${contrattoId}/audit/verify`, { headers, credentials: 'include' }).then(r => r.ok ? r.json() : null),
    ]).then(([ev, ver]) => {
      setEventi(ev);
      setVerifica(ver);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [contrattoId]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) return <div className="text-center py-8 text-stone text-sm">Caricamento audit log...</div>;

  return (
    <div className="space-y-4">
      {verifica && (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
          verifica.integra
            ? 'bg-ok text-ok-text border border-ok-border'
            : 'bg-danger text-danger-text border border-danger-border'
        }`}>
          <span>{verifica.integra ? '✓' : '⚠'}</span>
          <span>
            {verifica.integra
              ? `Catena verificata — ${verifica.eventi} eventi`
              : `Catena rotta — ${verifica.errore_al_evento_N}`}
          </span>
        </div>
      )}

      {eventi.length === 0 ? (
        <div className="bg-paper rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-stone text-sm">Nessun evento audit registrato</p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paper border-b text-left text-stone">
                <th className="px-4 py-2 font-medium">Timestamp</th>
                <th className="px-4 py-2 font-medium">Attore</th>
                <th className="px-4 py-2 font-medium">Azione</th>
                <th className="px-4 py-2 font-medium">Dati</th>
              </tr>
            </thead>
            <tbody>
              {eventi.map((ev: any) => {
                const isOpen = expanded.has(ev.id);
                let dati: Record<string, unknown> = {};
                try { dati = JSON.parse(ev.dati_json); } catch {}
                return (
                  <tr key={ev.id} className="border-b last:border-b-0 hover:bg-paper">
                    <td className="px-4 py-2 text-stone whitespace-nowrap font-mono text-xs">
                      {new Date(ev.timestamp).toLocaleString('it-IT')}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        ev.attore_tipo === 'CLIENTE' ? 'bg-flex-light text-flex-dark' :
                        ev.attore_tipo === 'BACKOFFICE' ? 'bg-outlier text-outlier-text' :
                        'bg-paper text-stone'
                      }`}>{ev.attore_tipo}</span>
                    </td>
                    <td className="px-4 py-2 font-medium text-graphite">{ev.azione}</td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => toggleExpand(ev.id)}
                        className="text-flex hover:text-flex-dark text-xs underline"
                      >
                        {isOpen ? 'Nascondi' : 'Mostra'}
                      </button>
                      {isOpen && (
                        <pre className="mt-2 text-xs bg-paper rounded p-2 max-w-md overflow-x-auto whitespace-pre-wrap font-mono">
                          {JSON.stringify(dati, null, 2)}
                        </pre>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-end">
        <a
          href={`/api/admin/audit/export/${contrattoId}`}
          className="text-sm text-flex hover:text-flex-dark underline"
          target="_blank"
          rel="noreferrer"
        >
          Esporta PDF audit
        </a>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Shared row component                                               */
/* ================================================================== */

function Row({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-3">
      <dt className="text-stone sm:w-40 shrink-0">{label}</dt>
      <dd
        className={`text-graphite ${mono ? 'font-mono text-xs' : ''} ${highlight ? 'font-semibold text-ok-text' : ''}`}
      >
        {value || '—'}
      </dd>
    </div>
  );
}
