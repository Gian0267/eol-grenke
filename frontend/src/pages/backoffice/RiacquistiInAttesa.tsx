import { useEffect, useState } from 'react';
import { Phone, Unlock, Loader2, CheckCircle2, MessageCircle, User } from 'lucide-react';

const API_BASE = '';
const BACKOFFICE_USER_ID = '00000000-0000-0000-0000-000000000001';

interface PraticaRiacquisto {
  id: string;
  contratto_nsm_id: string;
  contratto_grenke_id: string;
  stato: string;
  data_scadenza: string | null;
  monte_canoni: string;
  pricing_riacquisto: string;
  updated_at: string;
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
    contratto_grenke_id: string;
    data_scadenza: string | null;
    canone_mensile: string;
    numero_mesi: number;
    pricing_riacquisto: string;
    stato: string;
    cliente: {
      ragione_sociale: string;
      piva: string;
      telefono: string | null;
      referente_nome: string | null;
      referente_telefono: string | null;
    };
  };
}

const ORIGINE_LABEL: Record<string, string> = {
  OPZIONE_CONTATTO_PERSONALIZZATO: 'Contatto personalizzato',
  WIDGET_CHIAMAMI: 'Widget "Chiamami"',
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

  const vuoto = riacquisti.length === 0 && richieste.length === 0;

  return (
    <div>
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

                        <div className="flex-shrink-0">
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

                        <div className="flex-shrink-0">
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
    </div>
  );
}
