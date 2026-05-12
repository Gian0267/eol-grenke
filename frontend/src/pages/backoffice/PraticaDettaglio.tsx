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
  data_scadenza: string;
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
  cliente: Cliente;
  agente_assegnato: Agente | null;
  agente_originario: AgenteOriginario | null;
  decisioni: Decisione[];
  richieste_contatto: RichiestaContatto[];
  pagamenti: Pagamento[];
  timeline: TimelineEntry[];
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

function formatDate(d: string): string {
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
  if (g < 35) return 'bg-red-100 text-red-700';
  if (g < 50) return 'bg-yellow-100 text-yellow-700';
  return 'bg-green-100 text-green-700';
}

const STATO_BADGE: Record<string, { bg: string; label: string }> = {
  LISTA_RICEVUTA: { bg: 'bg-gray-100 text-gray-700', label: 'Lista ricevuta' },
  COMUNICAZIONE_INVIATA: { bg: 'bg-blue-100 text-blue-700', label: 'Comunicazione inviata' },
  IN_ATTESA_DECISIONE: { bg: 'bg-yellow-100 text-yellow-800', label: 'In attesa decisione' },
  DECISIONE_RINNOVO: { bg: 'bg-green-100 text-green-700', label: 'Decisione: Rinnovo' },
  DECISIONE_RIACQUISTO: { bg: 'bg-emerald-100 text-emerald-700', label: 'Decisione: Riacquisto' },
  DECISIONE_RESTITUZIONE: { bg: 'bg-orange-100 text-orange-700', label: 'Decisione: Restituzione' },
  DECISIONE_CONTATTO: { bg: 'bg-cyan-100 text-cyan-700', label: 'Decisione: Contatto' },
  SILENZIO_REMINDER: { bg: 'bg-red-100 text-red-700', label: 'Silenzio — reminder' },
  SILENZIO_ESCALATION: { bg: 'bg-red-200 text-red-800', label: 'Silenzio — escalation' },
  RIACQUISTO_IN_ATTESA_CHIAMATA: { bg: 'bg-purple-100 text-purple-700', label: 'Riacquisto — attesa chiamata' },
  RIACQUISTO_IN_ATTESA_PAGAMENTO: { bg: 'bg-purple-100 text-purple-700', label: 'Riacquisto — attesa pagamento' },
  RIACQUISTO_COMPLETATO: { bg: 'bg-purple-200 text-purple-800', label: 'Riacquisto completato' },
  COMPLETATA: { bg: 'bg-green-200 text-green-800', label: 'Completata' },
};

function statoBadge(stato: string) {
  const found = STATO_BADGE[stato];
  if (found) return found;
  return {
    bg: 'bg-gray-100 text-gray-600',
    label: stato.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
  };
}

function timelineIcon(tipo: string) {
  switch (tipo) {
    case 'COMUNICAZIONE':
      return <Mail className="w-4 h-4 text-blue-600" />;
    case 'DECISIONE':
      return <CheckCircle className="w-4 h-4 text-green-600" />;
    case 'ESCALATION':
      return <Phone className="w-4 h-4 text-orange-600" />;
    case 'PAGAMENTO':
      return <CreditCard className="w-4 h-4 text-purple-600" />;
    default:
      return <AlertCircle className="w-4 h-4 text-gray-400" />;
  }
}

function timelineColor(tipo: string) {
  switch (tipo) {
    case 'COMUNICAZIONE':
      return 'border-blue-300 bg-blue-50';
    case 'DECISIONE':
      return 'border-green-300 bg-green-50';
    case 'ESCALATION':
      return 'border-orange-300 bg-orange-50';
    case 'PAGAMENTO':
      return 'border-purple-300 bg-purple-50';
    default:
      return 'border-gray-300 bg-gray-50';
  }
}

function parseBeni(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed.map((b: any) => {
        if (typeof b === 'string') return b;
        const parts = [b.descrizione, b.marca, b.modello, b.seriale].filter(Boolean);
        return parts.length > 0 ? parts.join(' — ') : JSON.stringify(b);
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
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
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
        <p className="text-gray-600">{error || 'Pratica non trovata'}</p>
        <Link
          to="/backoffice/pratiche"
          className="inline-flex items-center gap-1.5 mt-4 text-sm text-[#1a3a52] hover:underline"
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
        className="inline-flex items-center gap-1.5 text-sm text-[#1a3a52] hover:underline mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Torna alla lista
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {pratica.cliente.ragione_sociale}{' '}
            <span className="text-base font-normal text-gray-500">
              — {pratica.contratto_nsm_id}
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${badge.bg}`}>
            {badge.label}
          </span>
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${giornoColor(pratica.giorni_a_scadenza)}`}
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
          <div className="border-b border-gray-200 mb-6">
            <nav className="flex gap-6">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`pb-2.5 text-sm transition-colors ${
                    tab === t.key
                      ? 'border-b-2 border-[#1a3a52] font-medium text-[#1a3a52]'
                      : 'text-gray-500 hover:text-gray-700'
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
          {tab === 'audit' && <TabAudit />}
        </div>

        {/* Sidebar */}
        <aside className="lg:w-72 shrink-0">
          <div className="lg:sticky lg:top-6">
            <div className="bg-white rounded-xl border p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Azioni</h3>
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
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
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
        <p className="text-sm text-gray-600 mb-5">
          Vuoi reinviare la comunicazione EOL al cliente{' '}
          <strong>{pratica.cliente.ragione_sociale}</strong>?
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setModalOpen(null)}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
          >
            Annulla
          </button>
          <button
            disabled={actionLoading}
            onClick={() => doAction(`/api/backoffice/pratiche-dettaglio/${id}/reinvia-comunicazione`)}
            className="px-4 py-2 text-sm rounded-lg bg-[#1a3a52] text-white hover:bg-[#243f55] disabled:opacity-50 flex items-center gap-2"
          >
            {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Conferma
          </button>
        </div>
      </Modal>

      {/* Cambia agente */}
      <Modal open={modalOpen === 'cambia-agente'} title="Cambia agente assegnato" onClose={() => setModalOpen(null)}>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Nuovo agente</label>
          <select
            value={selectedAgente}
            onChange={(e) => setSelectedAgente(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a52]/30"
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
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
          >
            Annulla
          </button>
          <button
            disabled={actionLoading || !selectedAgente}
            onClick={() => doAction(`/api/backoffice/pratiche-dettaglio/${id}/cambia-agente`, { agente_id: selectedAgente })}
            className="px-4 py-2 text-sm rounded-lg bg-[#1a3a52] text-white hover:bg-[#243f55] disabled:opacity-50 flex items-center gap-2"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Nuova data scadenza</label>
            <input
              type="date"
              value={nuovaData}
              onChange={(e) => setNuovaData(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a52]/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivazione *</label>
            <textarea
              value={motivazione}
              onChange={(e) => setMotivazione(e.target.value)}
              rows={3}
              placeholder="Indica il motivo della modifica..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a52]/30 resize-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setModalOpen(null)}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
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
            className="px-4 py-2 text-sm rounded-lg bg-[#1a3a52] text-white hover:bg-[#243f55] disabled:opacity-50 flex items-center gap-2"
          >
            {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Conferma
          </button>
        </div>
      </Modal>

      {/* Sblocca pagamento */}
      <Modal open={modalOpen === 'sblocca'} title="Sblocca pagamento" onClose={() => setModalOpen(null)}>
        <p className="text-sm text-gray-600 mb-5">
          Confermi di voler sbloccare il pagamento per il riacquisto di{' '}
          <strong>{pratica.cliente.ragione_sociale}</strong>?
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setModalOpen(null)}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
          >
            Annulla
          </button>
          <button
            disabled={actionLoading}
            onClick={() => doAction(`/api/backoffice/pratiche/${id}/sblocca-pagamento`)}
            className="px-4 py-2 text-sm rounded-lg bg-[#1a3a52] text-white hover:bg-[#243f55] disabled:opacity-50 flex items-center gap-2"
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Opzione</label>
            <div className="space-y-2">
              {(['RINNOVO', 'RIACQUISTO', 'CONTATTO', 'RESTITUZIONE'] as const).map((opt) => (
                <label
                  key={opt}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                    decisioneScelta === opt ? 'border-[#1a3a52] bg-[#1a3a52]/5' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="decisione"
                    value={opt}
                    checked={decisioneScelta === opt}
                    onChange={() => setDecisioneScelta(opt)}
                    className="accent-[#1a3a52]"
                  />
                  <span className="text-sm">{opt.charAt(0) + opt.slice(1).toLowerCase()}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note (facoltative)</label>
            <textarea
              value={decisioneNote}
              onChange={(e) => setDecisioneNote(e.target.value)}
              rows={2}
              placeholder="Note aggiuntive..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a52]/30 resize-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setModalOpen(null)}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
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
            className="px-4 py-2 text-sm rounded-lg bg-[#1a3a52] text-white hover:bg-[#243f55] disabled:opacity-50 flex items-center gap-2"
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
      className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 transition-colors"
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
      <div className="bg-white rounded-xl border p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Dati cliente</h3>
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
      <div className="bg-white rounded-xl border p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Calcolo economico</h3>
        <dl className="space-y-2 text-sm">
          <Row label="Pricing Grenke (5%)" value={formatEur(pratica.pricing_grenke)} />
          <Row label="Pricing riacquisto (8%)" value={formatEur(pratica.pricing_riacquisto)} />
          <Row label="Margine lordo (3%)" value={formatEur(pratica.margine_lordo)} highlight />
          <Row label="Valore gift card" value={formatEur(pratica.valore_gift_card)} highlight />
          <Row label="Valore originario" value={formatEur(pratica.valore_originario)} />
        </dl>
      </div>

      {/* Contratto */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Dati contratto</h3>
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
              <dt className="text-gray-500 sm:w-40 shrink-0">Beni</dt>
              <dd className="text-gray-900">
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
      <div className="bg-white rounded-xl border p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Stato corrente</h3>
        <div className="space-y-3 text-sm">
          <div>
            <span className="text-gray-500 text-xs uppercase tracking-wide">Stato</span>
            <div className="mt-1">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${badge.bg}`}>
                {badge.label}
              </span>
            </div>
          </div>
          <div>
            <span className="text-gray-500 text-xs uppercase tracking-wide">Origine</span>
            <p className="text-gray-900 mt-0.5">{pratica.origine || '—'}</p>
          </div>
          <div>
            <span className="text-gray-500 text-xs uppercase tracking-wide">Agente assegnato</span>
            <p className="text-gray-900 mt-0.5">
              {pratica.agente_assegnato
                ? `${pratica.agente_assegnato.nome} ${pratica.agente_assegnato.cognome}`
                : '— Nessuno —'}
            </p>
            {pratica.agente_assegnato?.email && (
              <p className="text-gray-500 text-xs">{pratica.agente_assegnato.email}</p>
            )}
          </div>
          {pratica.agente_originario && (
            <div>
              <span className="text-gray-500 text-xs uppercase tracking-wide">Agente originario</span>
              <p className="text-gray-900 mt-0.5">
                {pratica.agente_originario.nome} {pratica.agente_originario.cognome}
              </p>
            </div>
          )}

          {/* Decisioni */}
          {pratica.decisioni.length > 0 && (
            <div className="pt-2 border-t">
              <span className="text-gray-500 text-xs uppercase tracking-wide">Decisioni registrate</span>
              <div className="mt-2 space-y-2">
                {pratica.decisioni.map((d, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-3 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-900">{d.opzione_scelta}</span>
                      <span className="text-gray-500">{formatDateTime(d.created_at)}</span>
                    </div>
                    <div className="text-gray-500 mt-1">
                      OTP: {d.otp_verificato ? 'verificato' : 'non verificato'} ({d.otp_metodo})
                    </div>
                    {d.note_cliente && <p className="text-gray-700 mt-1 italic">{d.note_cliente}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pagamenti */}
          {pratica.pagamenti.length > 0 && (
            <div className="pt-2 border-t">
              <span className="text-gray-500 text-xs uppercase tracking-wide">Pagamenti</span>
              <div className="mt-2 space-y-2">
                {pratica.pagamenti.map((p, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-3 text-xs flex justify-between items-center">
                    <div>
                      <span className="font-medium text-gray-900">{formatEur(p.importo_totale)}</span>
                      <span className="text-gray-500 ml-2">{p.metodo}</span>
                    </div>
                    <div className="text-right">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          p.stato === 'COMPLETATO'
                            ? 'bg-green-100 text-green-700'
                            : p.stato === 'FALLITO'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {p.stato}
                      </span>
                      <div className="text-gray-500 mt-0.5">{formatDateTime(p.data_iniziato)}</div>
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
      <div className="bg-white rounded-xl border p-8 text-center text-gray-500 text-sm">
        Nessun evento nella timeline.
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-5 top-0 bottom-0 w-px bg-gray-200" />

      <div className="space-y-4">
        {timeline.map((entry, i) => (
          <div key={i} className="relative pl-12">
            {/* Icon bubble */}
            <div className="absolute left-2.5 top-3 w-5 h-5 flex items-center justify-center rounded-full bg-white border border-gray-200">
              {timelineIcon(entry.tipo)}
            </div>

            <div className={`rounded-lg border p-4 ${timelineColor(entry.tipo)}`}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">{entry.tipo}</span>
                  {entry.sottotipo && (
                    <span className="text-xs text-gray-500">/ {entry.sottotipo}</span>
                  )}
                </div>
                <span className="text-xs text-gray-500">{formatDateTime(entry.data)}</span>
              </div>
              <p className="text-sm text-gray-800">{entry.dettaglio}</p>
              {entry.canale && (
                <p className="text-xs text-gray-500 mt-1">Canale: {entry.canale}</p>
              )}
              {entry.esito && (
                <p className="text-xs text-gray-600 mt-1">
                  <strong>Esito:</strong> {entry.esito}
                </p>
              )}
              {entry.note && (
                <p className="text-xs text-gray-500 mt-1 italic">Note: {entry.note}</p>
              )}
              {entry.assegnato && (
                <p className="text-xs text-gray-500 mt-1">Assegnato a: {entry.assegnato}</p>
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
      <div className="bg-white rounded-xl border p-8 text-center text-gray-500 text-sm">
        Nessuna richiesta di contatto.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {richieste.map((r) => {
        const isRichiamato = r.stato === 'RICHIAMATO';
        return (
          <div key={r.id} className="bg-white rounded-xl border p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-gray-400" />
                <span className="font-medium text-gray-900">{r.nome_referente || 'Referente non specificato'}</span>
              </div>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  isRichiamato
                    ? 'bg-green-100 text-green-700'
                    : 'bg-yellow-100 text-yellow-700'
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
              <p className="text-xs text-gray-500 italic mb-3">Note: {r.note}</p>
            )}

            <button
              disabled={isRichiamato || richiamatoLoading === r.id}
              onClick={() => onSegnaRichiamato(r.id)}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                isRichiamato
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-[#1a3a52] text-white hover:bg-[#243f55] disabled:opacity-50'
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

function TabAudit() {
  return (
    <div className="bg-gray-100 rounded-xl border border-dashed border-gray-300 p-8 text-center">
      <p className="text-gray-500 text-sm">Audit log disponibile dopo Missione 10</p>
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
      <dt className="text-gray-500 sm:w-40 shrink-0">{label}</dt>
      <dd
        className={`text-gray-900 ${mono ? 'font-mono text-xs' : ''} ${highlight ? 'font-semibold text-green-700' : ''}`}
      >
        {value || '—'}
      </dd>
    </div>
  );
}
