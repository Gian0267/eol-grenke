import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast, Toaster } from 'sonner';
import { Phone, Unlock, Loader2, CheckCircle2, MessageCircle, User, FileText, EyeOff, Mail, X } from 'lucide-react';

const API_BASE = '';
const BACKOFFICE_USER_ID = '00000000-0000-0000-0000-000000000001';

/** Riga "Agenzia · Agente" della rete commerciale, dalle colonne A e B NSM. */
function ReteCommerciale({ agenzia, agente }: { agenzia?: string | null; agente?: string | null }) {
  if (!agenzia && !agente) return null;
  return (
    <p className="text-xs text-stone mb-3">
      <span className="font-medium text-graphite">{agenzia || '—'}</span>
      {agente && <> &middot; {agente}</>}
    </p>
  );
}

interface PraticaRiacquisto {
  id: string;
  contratto_nsm_id: string;
  contratto_grenke_id: string;
  stato: string;
  data_scadenza: string | null;
  monte_canoni: string;
  pricing_riacquisto: string;
  updated_at: string;
  agenzia: string | null;
  agente: string | null;
  cliente: {
    ragione_sociale: string;
    piva: string;
    email: string;
    telefono: string | null;
  };
  richieste_contatto: Array<{
    id: string;
    nome_referente: string | null;
    telefono: string | null;
    fascia_oraria: string | null;
    created_at: string;
    stato: string;
    data_richiamato: string | null;
  }>;
}

interface RichiestaContatto {
  id: string;
  origine: string;
  nome_referente: string | null;
  telefono: string | null;
  giorno_preferito: string | null;
  fascia_oraria: string | null;
  modalita_preferita: string | null;
  note: string | null;
  created_at: string;
  contratto_eol: {
    id: string;
    contratto_nsm_id: string;
    agenzia: string | null;
    agente: string | null;
    contratto_grenke_id: string;
    data_scadenza: string | null;
    canone_mensile: string;
    numero_mesi: number;
    pricing_riacquisto: string;
    stato: string;
    cliente: {
      ragione_sociale: string;
      piva: string;
      email: string | null;
      telefono: string | null;
      referente_nome: string | null;
      referente_telefono: string | null;
    };
  };
}

const ORIGINE_LABEL: Record<string, string> = {
  OPZIONE_CONTATTO_PERSONALIZZATO: 'Contatto personalizzato',
  WIDGET_CHIAMAMI: 'Widget "Chiamami"',
  ASSISTENZA_NUOVO_NOLEGGIO: 'Assistenza nuovo noleggio',
};

function formatEur(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getHeaders(): HeadersInit {
  const raw = localStorage.getItem('nsm_user');
  const id = raw ? (JSON.parse(raw).id as string) : BACKOFFICE_USER_ID;
  return { 'x-user-id': id };
}

export default function RiacquistiInAttesa() {
  const [riacquisti, setRiacquisti] = useState<PraticaRiacquisto[]>([]);
  const [richieste, setRichieste] = useState<RichiestaContatto[]>([]);
  const [loading, setLoading] = useState(true);
  const [sbloccando, setSbloccando] = useState<string | null>(null);
  const [sbloccati, setSbloccati] = useState<Set<string>>(new Set());
  const [richiamando, setRichiamando] = useState<string | null>(null);
  const [richiamati, setRichiamati] = useState<Set<string>>(new Set());

  const fetchDati = () => {
    setLoading(true);
    fetch(`${API_BASE}/api/backoffice/riacquisti-in-attesa`, {
      credentials: 'include',
      headers: getHeaders(),
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((body) => {
        setRiacquisti(body.riacquisti || []);
        setRichieste(body.richieste || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDati(); }, []);

  const handleSblocca = async (id: string) => {
    setSbloccando(id);
    try {
      const res = await fetch(`${API_BASE}/api/backoffice/pratiche/${id}/sblocca-pagamento`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
      });
      if (res.ok) {
        setSbloccati(prev => new Set(prev).add(id));
      }
    } catch {}
    finally { setSbloccando(null); }
  };

  const handleRichiamato = async (richiesta: RichiestaContatto) => {
    setRichiamando(richiesta.id);
    try {
      const res = await fetch(`${API_BASE}/api/backoffice/pratiche-dettaglio/${richiesta.contratto_eol.id}/segna-richiamato`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify({ richiesta_id: richiesta.id }),
      });
      if (res.ok) {
        setRichiamati(prev => new Set(prev).add(richiesta.id));
      }
    } catch {}
    finally { setRichiamando(null); }
  };

  // Richiamo sulla scheda del riacquisto. E' distinto dallo sblocco: dopo la
  // telefonata il cliente puo' anche dire "ci penso", e registrare la chiamata
  // non deve voler dire aprirgli il pagamento.
  const handleRichiamatoRiacquisto = async (praticaId: string, richiestaId: string) => {
    setRichiamando(richiestaId);
    try {
      const res = await fetch(`${API_BASE}/api/backoffice/pratiche-dettaglio/${praticaId}/segna-richiamato`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify({ richiesta_id: richiestaId }),
      });
      if (res.ok) setRichiamati(prev => new Set(prev).add(richiestaId));
    } catch {}
    finally { setRichiamando(null); }
  };

  // Chiude la richiesta e fa sparire la scheda da questa vista. La pratica
  // resta dov'e': bloccata finche' non la si sblocca, e visibile in lista
  // pratiche. Qui dentro non serve piu', la telefonata e' stata fatta.
  const handleChiudiRichiesta = async (praticaId: string, richiestaId: string) => {
    setRichiamando(richiestaId);
    try {
      const res = await fetch(`${API_BASE}/api/backoffice/pratiche-dettaglio/${praticaId}/richiesta-gestita`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify({ richiesta_id: richiestaId }),
      });
      if (res.ok) setRiacquisti(prev => prev.filter(x => x.id !== praticaId));
    } catch {}
    finally { setRichiamando(null); }
  };

  // Risposta scritta al cliente, dalla casella aziendale
  const [rispondiA, setRispondiA] = useState<{
    praticaId: string; richiestaId: string; cliente: string; email: string | null; contratto: string;
  } | null>(null);
  const [oggetto, setOggetto] = useState('');
  const [messaggio, setMessaggio] = useState('');
  const [inviando, setInviando] = useState(false);

  const apriRisposta = (praticaId: string, richiestaId: string, cliente: string, email: string | null, contratto: string) => {
    setRispondiA({ praticaId, richiestaId, cliente, email, contratto });
    setOggetto(`Riscontro alla Sua richiesta — contratto ${contratto}`);
    setMessaggio('');
  };

  const inviaRisposta = async () => {
    if (!rispondiA || !messaggio.trim()) return;
    setInviando(true);
    try {
      const res = await fetch(`${API_BASE}/api/backoffice/pratiche-dettaglio/${rispondiA.praticaId}/rispondi-email`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify({ oggetto, messaggio, richiesta_id: rispondiA.richiestaId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Errore');
      toast.success('Risposta inviata al cliente');
      setRispondiA(null);
      fetchDati();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nell'invio");
    } finally {
      setInviando(false);
    }
  };

  const vuoto = riacquisti.length === 0 && richieste.length === 0;

  return (
    <div>
      <Toaster position="top-right" richColors />
      <h1 className="text-xl font-bold text-graphite mb-1">Clienti in attesa di contatto</h1>
      <p className="text-sm text-stone mb-6">Riacquisti da sbloccare e richieste di informazioni che richiedono una chiamata</p>

      {loading ? (
        <div className="text-center py-12 text-stone">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          Caricamento...
        </div>
      ) : vuoto ? (
        <div className="text-center py-12 text-stone">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-ok-text" />
          <p className="font-medium">Nessun cliente in attesa di contatto</p>
        </div>
      ) : (
        <div className="space-y-8">

          {/* ── Richieste di contatto ───────────────────────────── */}
          {richieste.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-graphite mb-3 flex items-center gap-2">
                <MessageCircle className="w-4 h-4" /> Richieste di contatto ({richieste.length})
              </h2>
              <div className="space-y-4">
                {richieste.map(r => {
                  const c = r.contratto_eol;
                  const isRichiamato = richiamati.has(r.id);
                  const nominativo = r.nome_referente || c.cliente.referente_nome || '—';
                  const telefono = r.telefono || c.cliente.referente_telefono || c.cliente.telefono || '—';
                  return (
                    <div key={r.id} className={`bg-card rounded-xl border border-border p-5 ${isRichiamato ? 'opacity-60' : ''}`}>
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h3 className="font-semibold text-graphite">{c.cliente.ragione_sociale}</h3>
                            <span className="text-xs bg-outlier text-outlier-text px-2 py-0.5 rounded-full font-medium">
                              {ORIGINE_LABEL[r.origine] || r.origine}
                            </span>
                          </div>

                          <ReteCommerciale agenzia={c.agenzia} agente={c.agente} />

                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm mb-3">
                            <div>
                              <span className="text-stone text-xs">Contratto Grenke</span>
                              <p className="font-medium font-mono text-xs mt-0.5">{c.contratto_grenke_id}</p>
                            </div>
                            <div>
                              <span className="text-stone text-xs">Scadenza</span>
                              <p className="font-medium">{formatDate(c.data_scadenza)}</p>
                            </div>
                            <div>
                              <span className="text-stone text-xs">Canone</span>
                              <p className="font-medium">&euro; {formatEur(Number(c.canone_mensile))}/mese</p>
                            </div>
                            <div>
                              <span className="text-stone text-xs">Riacquisto</span>
                              <p className="font-medium">&euro; {formatEur(Number(c.pricing_riacquisto))}</p>
                            </div>
                            <div>
                              <span className="text-stone text-xs">Richiesta il</span>
                              <p className="font-medium">{formatDate(r.created_at)}</p>
                            </div>
                          </div>

                          <div className="bg-paper rounded-lg p-3 text-sm space-y-1">
                            <div className="flex items-center gap-2 text-graphite">
                              <User className="w-4 h-4 text-stone" />
                              <span className="font-medium">{nominativo}</span>
                              <Phone className="w-4 h-4 text-stone ml-2" />
                              <span className="font-medium">{telefono}</span>
                            </div>
                            {(r.giorno_preferito || (r.fascia_oraria && r.fascia_oraria !== 'INDIFFERENTE') || r.modalita_preferita) && (
                              <p className="text-stone text-xs">
                                Preferenze:
                                {r.giorno_preferito ? ` ${r.giorno_preferito.toLowerCase()}` : ''}
                                {r.fascia_oraria && r.fascia_oraria !== 'INDIFFERENTE' ? ` — ${r.fascia_oraria.toLowerCase()}` : ''}
                                {r.modalita_preferita ? ` — via ${r.modalita_preferita.toLowerCase()}` : ''}
                              </p>
                            )}
                            {r.note && <p className="text-stone text-xs">Note: {r.note}</p>}
                          </div>
                        </div>

                        <div className="flex-shrink-0 flex flex-col gap-2 items-stretch">
                          {isRichiamato ? (
                            <div className="flex items-center gap-2 text-ok-text text-sm font-medium">
                              <CheckCircle2 className="w-5 h-5" /> Richiamato
                            </div>
                          ) : (
                            <button
                              onClick={() => handleRichiamato(r)}
                              disabled={richiamando === r.id}
                              className="bg-flex text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-flex-dark transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                              {richiamando === r.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Phone className="w-4 h-4" />
                              )}
                              Segna come richiamato
                            </button>
                          )}
                          {c.cliente && (
                            <button
                              onClick={() => apriRisposta(c.id, r.id, c.cliente.ragione_sociale, (c.cliente as { email?: string | null }).email ?? null, c.contratto_grenke_id)}
                              className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-graphite hover:bg-paper transition-colors flex items-center justify-center gap-2"
                            >
                              <Mail className="w-4 h-4" />
                              Rispondi via email
                            </button>
                          )}
                          {/* Prima di telefonare serve il quadro completo:
                              senza questo si tornava indietro a cercarlo in
                              lista. */}
                          <Link
                            to={`/backoffice/pratiche/${c.id}`}
                            className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-graphite hover:bg-paper transition-colors flex items-center justify-center gap-2"
                          >
                            <FileText className="w-4 h-4" />
                            Apri la pratica
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Riacquisti da sbloccare ─────────────────────────── */}
          {riacquisti.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-graphite mb-3 flex items-center gap-2">
                <Unlock className="w-4 h-4" /> Riacquisti da sbloccare ({riacquisti.length})
              </h2>
              <div className="space-y-4">
                {riacquisti.map(p => {
                  const richiesta = p.richieste_contatto[0];
                  const isSbloccato = sbloccati.has(p.id);

                  return (
                    <div key={p.id} className={`bg-card rounded-xl border border-border p-5 ${isSbloccato ? 'opacity-60' : ''}`}>
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-graphite">{p.cliente.ragione_sociale}</h3>
                            <span className="text-xs bg-warn text-warn-text px-2 py-0.5 rounded-full font-medium">
                              In attesa chiamata
                            </span>
                          </div>

                          <ReteCommerciale agenzia={p.agenzia} agente={p.agente} />

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-3">
                            <div>
                              <span className="text-stone text-xs">Contratto NSM</span>
                              <p className="font-medium font-mono text-xs mt-0.5">{p.contratto_nsm_id}</p>
                            </div>
                            <div>
                              <span className="text-stone text-xs">Scadenza</span>
                              <p className="font-medium">{formatDate(p.data_scadenza)}</p>
                            </div>
                            <div>
                              <span className="text-stone text-xs">Riacquisto</span>
                              <p className="font-medium">&euro; {formatEur(Number(p.pricing_riacquisto))}</p>
                            </div>
                            <div>
                              <span className="text-stone text-xs">Richiesta il</span>
                              <p className="font-medium">{richiesta ? formatDate(richiesta.created_at) : '-'}</p>
                            </div>
                          </div>

                          {richiesta && (
                            <div className="bg-warn rounded-lg p-3 text-sm">
                              <div className="flex items-center gap-2 text-warn-text mb-1">
                                <Phone className="w-4 h-4" />
                                <span className="font-medium">Contatto richiesto</span>
                              </div>
                              <p className="text-graphite">
                                {richiesta.nome_referente || '-'} — {richiesta.telefono || p.cliente.telefono || p.cliente.email}
                                {richiesta.fascia_oraria && richiesta.fascia_oraria !== 'INDIFFERENTE' && (
                                  <span className="text-stone"> (preferenza: {richiesta.fascia_oraria.toLowerCase()})</span>
                                )}
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="flex-shrink-0 flex flex-col gap-2 items-stretch">
                          {isSbloccato ? (
                            <div className="flex items-center gap-2 text-ok-text text-sm font-medium">
                              <CheckCircle2 className="w-5 h-5" /> Sbloccato
                            </div>
                          ) : (
                            <button
                              onClick={() => handleSblocca(p.id)}
                              disabled={sbloccando === p.id}
                              className="bg-flex text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-flex-dark transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                              {sbloccando === p.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Unlock className="w-4 h-4" />
                              )}
                              Sblocca pagamento
                            </button>
                          )}
                          {richiesta && (
                            richiesta.stato === 'RICHIAMATO' || richiamati.has(richiesta.id) ? (
                              <>
                                <div className="flex items-center justify-center gap-2 text-ok-text text-sm font-medium py-1">
                                  <CheckCircle2 className="w-4 h-4" />
                                  Richiamato{richiesta.data_richiamato ? ` il ${formatDate(richiesta.data_richiamato)}` : ''}
                                </div>
                                <button
                                  onClick={() => handleChiudiRichiesta(p.id, richiesta.id)}
                                  disabled={richiamando === richiesta.id}
                                  className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-stone hover:bg-paper transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                  title="La pratica resta bloccata e visibile in lista pratiche: sparisce solo da questo elenco"
                                >
                                  {richiamando === richiesta.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <EyeOff className="w-4 h-4" />}
                                  Togli dall&apos;elenco
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleRichiamatoRiacquisto(p.id, richiesta.id)}
                                disabled={richiamando === richiesta.id}
                                className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-graphite hover:bg-paper transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                {richiamando === richiesta.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                                Segna come richiamato
                              </button>
                            )
                          )}
                          <Link
                            to={`/backoffice/pratiche/${p.id}`}
                            className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-graphite hover:bg-paper transition-colors flex items-center justify-center gap-2"
                          >
                            <FileText className="w-4 h-4" />
                            Apri la pratica
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Risposta scritta al cliente. Parte dalla casella aziendale, non da
          quella di chi scrive: se il cliente replica, la risposta rientra fra
          le segnalazioni invece di perdersi in una posta personale. */}
      {rispondiA && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setRispondiA(null)}>
          <div className="bg-card rounded-xl border border-border w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="font-semibold text-graphite">Rispondi a {rispondiA.cliente}</h3>
                <p className="text-xs text-stone mt-1 break-all">
                  Da <strong>info@noleggiosumisura.it</strong> a <strong>{rispondiA.email || 'indirizzo mancante'}</strong>
                </p>
              </div>
              <button onClick={() => setRispondiA(null)} className="text-stone hover:text-graphite shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 overflow-y-auto space-y-3">
              {!rispondiA.email && (
                <p className="text-sm text-red-600">
                  Questo cliente non ha un indirizzo email registrato: l&apos;invio non e&apos; possibile.
                </p>
              )}
              <div>
                <label className="block text-sm font-medium text-graphite mb-1">Oggetto</label>
                <input
                  value={oggetto}
                  onChange={e => setOggetto(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-flex/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-graphite mb-1">Messaggio</label>
                <textarea
                  value={messaggio}
                  onChange={e => setMessaggio(e.target.value)}
                  rows={10}
                  maxLength={10000}
                  placeholder="Scrivi qui la risposta. Intestazione, firma e riferimento al contratto li mette il sistema."
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-flex/30 resize-y"
                />
                <p className="text-xs text-stone mt-1">
                  Testo semplice: gli a capo vengono mantenuti, il resto no. Il cliente potr&agrave; rispondere
                  direttamente a questa email e la sua risposta finir&agrave; fra le segnalazioni.
                </p>
              </div>
            </div>

            <div className="px-6 py-3 border-t border-border flex items-center justify-between gap-3">
              <span className="text-xs text-stone">L&apos;invio segna la richiesta come gestita.</span>
              <div className="flex gap-2">
                <button onClick={() => setRispondiA(null)} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-paper">
                  Annulla
                </button>
                <button
                  onClick={inviaRisposta}
                  disabled={inviando || !messaggio.trim() || !rispondiA.email}
                  className="px-4 py-2 text-sm rounded-lg bg-flex text-white hover:bg-flex-dark disabled:opacity-50 flex items-center gap-2"
                >
                  {inviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  Invia la risposta
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
