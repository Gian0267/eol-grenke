import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Mail, MailCheck, Search, X, Paperclip } from 'lucide-react';

// Etichette leggibili per i tipi di comunicazione registrati
const TIPO_LABEL: Record<string, string> = {
  COMUNICAZIONE_INIZIALE: 'Comunicazione iniziale',
  SOLLECITO_1: 'Sollecito 1',
  SOLLECITO_2: 'Sollecito 2',
  SOLLECITO_3: 'Sollecito 3',
  SOLLECITO_4: 'Sollecito 4',
  INVITO_PAGAMENTO: 'Invito pagamento',
  INVITO_PAGAMENTO_PROMEMORIA: 'Promemoria pagamento',
  SBLOCCO_PAGAMENTO: 'Sblocco pagamento',
  RICEVUTA_PAGAMENTO: 'Ricevuta pagamento',
  CONFERMA_RESTITUZIONE: 'Conferma restituzione',
  CONFERMA_RINNOVO: 'Conferma rinnovo',
  NOTIFICA_AGENTE: 'Notifica agente',
  NOTIFICA_RICHIESTA_CONTATTO: 'Notifica richiesta contatto',
};

function tipoLabel(tipo: string): string {
  return TIPO_LABEL[tipo] || tipo.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
}

interface Riga {
  id: string;
  data_invio: string;
  tipo: string;
  canale: string;
  destinatario: string;
  oggetto: string | null;
  esito: string | null;
  allegati: string[];
  contratto_id: string;
  contratto_nsm: string;
  cliente: string;
}

interface Dettaglio extends Riga {
  corpo_html: string | null;
}

function getUtenteId(): string | null {
  try {
    return JSON.parse(localStorage.getItem('nsm_user') || 'null')?.id ?? null;
  } catch {
    return null;
  }
}

function formatDataOra(d: string): string {
  return new Date(d).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ComunicazioniInviate({ canale }: { canale: 'EMAIL' | 'PEC' }) {
  const [items, setItems] = useState<Riga[]>([]);
  const [tipi, setTipi] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [tipo, setTipo] = useState('');
  const [esito, setEsito] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [dettaglio, setDettaglio] = useState<Dettaglio | null>(null);
  const pageSize = 25;

  const headers = (): HeadersInit => {
    const h: Record<string, string> = {};
    const id = getUtenteId();
    if (id) h['x-user-id'] = id;
    return h;
  };

  useEffect(() => {
    setPage(1);
    setTipo('');
    setEsito('');
    setSearch('');
    setSearchInput('');
  }, [canale]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ canale, page: String(page), pageSize: String(pageSize) });
    if (tipo) params.set('tipo', tipo);
    if (esito) params.set('esito', esito);
    if (search) params.set('search', search);
    fetch(`/api/backoffice/comunicazioni?${params}`, { credentials: 'include', headers: headers() })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Errore caricamento'))))
      .then(data => {
        setItems(data.items);
        setTotal(data.total);
        setTipi(data.tipi || []);
      })
      .catch(() => { /* la pagina mostra lo stato vuoto */ })
      .finally(() => setLoading(false));
  }, [canale, page, tipo, esito, search]);

  const apriDettaglio = async (id: string) => {
    const res = await fetch(`/api/backoffice/comunicazioni/${id}`, { credentials: 'include', headers: headers() });
    if (res.ok) setDettaglio(await res.json());
  };

  const totPagine = Math.max(1, Math.ceil(total / pageSize));
  const isPec = canale === 'PEC';

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        {isPec ? <MailCheck className="w-6 h-6 text-flex" /> : <Mail className="w-6 h-6 text-flex" />}
        <h1 className="text-2xl font-bold text-graphite">{isPec ? 'PEC inviate' : 'Posta inviata'}</h1>
      </div>
      <p className="text-sm text-stone mb-4">
        {isPec
          ? 'Registro delle PEC spedite ai clienti. L\'esito indica la consegna al gestore: le ricevute legali di accettazione e consegna arrivano nella casella PEC Aruba.'
          : 'Registro delle email spedite: cliccando una riga vedi la mail esattamente come è stata inviata.'}
      </p>

      {/* Filtri */}
      <div className="bg-card rounded-xl border border-border p-4 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-stone mb-1">Tipo</label>
          <select
            value={tipo}
            onChange={e => { setTipo(e.target.value); setPage(1); }}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">Tutti</option>
            {tipi.map(t => <option key={t} value={t}>{tipoLabel(t)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-stone mb-1">Esito</label>
          <select
            value={esito}
            onChange={e => { setEsito(e.target.value); setPage(1); }}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">Tutti</option>
            <option value="INVIATO">Inviato</option>
            <option value="ERRORE">Errore</option>
          </select>
        </div>
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-medium text-stone mb-1">Cerca (cliente, contratto, destinatario, oggetto)</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput.trim()); setPage(1); } }}
              placeholder="Es. Rossi, NSM-…, @azienda.it"
              className="flex-1 border border-border rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={() => { setSearch(searchInput.trim()); setPage(1); }}
              className="px-3 py-2 rounded-lg bg-flex text-white text-sm hover:bg-flex-dark"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Tabella */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-stone">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Caricamento…
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-stone text-sm">Nessuna comunicazione trovata.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-paper text-left text-xs uppercase tracking-wide text-stone">
                <tr>
                  <th className="px-4 py-3">Data e ora</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Contratto</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Destinatario</th>
                  <th className="px-4 py-3">Esito</th>
                </tr>
              </thead>
              <tbody>
                {items.map(c => (
                  <tr
                    key={c.id}
                    onClick={() => apriDettaglio(c.id)}
                    className="border-t border-border hover:bg-paper cursor-pointer"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-graphite">{formatDataOra(c.data_invio)}</td>
                    <td className="px-4 py-3 font-medium text-graphite">{c.cliente}</td>
                    <td className="px-4 py-3 font-mono text-xs text-stone">{c.contratto_nsm}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1">
                        {tipoLabel(c.tipo)}
                        {c.allegati.length > 0 && <Paperclip className="w-3.5 h-3.5 text-stone" />}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-stone">{c.destinatario}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        c.esito === 'INVIATO' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {c.esito === 'INVIATO' ? 'Inviato' : 'Errore'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginazione */}
      {total > pageSize && (
        <div className="flex items-center justify-between mt-4 text-sm text-stone">
          <span>{total} comunicazioni</span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-paper"
            >
              Precedente
            </button>
            <span>Pagina {page} di {totPagine}</span>
            <button
              disabled={page >= totPagine}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-paper"
            >
              Successiva
            </button>
          </div>
        </div>
      )}

      {/* Anteprima mail come inviata */}
      {dettaglio && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDettaglio(null)}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border flex items-start justify-between gap-4">
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-graphite truncate">{dettaglio.oggetto || tipoLabel(dettaglio.tipo)}</p>
                <p className="text-stone mt-0.5">
                  {formatDataOra(dettaglio.data_invio)} · {dettaglio.canale} · a <strong>{dettaglio.destinatario}</strong>
                </p>
                <p className="text-stone">
                  {dettaglio.cliente} —{' '}
                  <Link to={`/backoffice/pratiche/${dettaglio.contratto_id}`} className="text-flex hover:underline">
                    {dettaglio.contratto_nsm}
                  </Link>
                  {dettaglio.allegati.length > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs">
                      <Paperclip className="w-3.5 h-3.5" /> {dettaglio.allegati.join(', ')}
                    </span>
                  )}
                </p>
              </div>
              <button onClick={() => setDettaglio(null)} className="p-1.5 rounded-lg hover:bg-paper shrink-0">
                <X className="w-5 h-5 text-stone" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-gray-100 p-3">
              {dettaglio.corpo_html ? (
                <iframe
                  title="Anteprima comunicazione"
                  srcDoc={dettaglio.corpo_html}
                  sandbox=""
                  className="w-full h-[65vh] bg-white rounded-lg border border-border"
                />
              ) : (
                <p className="text-sm text-stone p-4">Corpo del messaggio non archiviato per questa comunicazione.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
