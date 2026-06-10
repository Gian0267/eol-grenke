import { useEffect, useState } from 'react';
import { Phone, Unlock, Loader2, CheckCircle2 } from 'lucide-react';

const API_BASE = '';
const BACKOFFICE_USER_ID = '00000000-0000-0000-0000-000000000001';

interface Pratica {
  id: string;
  contratto_nsm_id: string;
  contratto_grenke_id: string;
  stato: string;
  data_scadenza: string;
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

function formatEur(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function RiacquistiInAttesa() {
  const [pratiche, setPratiche] = useState<Pratica[]>([]);
  const [loading, setLoading] = useState(true);
  const [sbloccando, setSbloccando] = useState<string | null>(null);
  const [sbloccati, setSbloccati] = useState<Set<string>>(new Set());

  const fetchPratiche = () => {
    setLoading(true);
    fetch(`${API_BASE}/api/backoffice/riacquisti-in-attesa`, {
      headers: { 'x-user-id': BACKOFFICE_USER_ID },
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setPratiche)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPratiche(); }, []);

  const handleSblocca = async (id: string) => {
    setSbloccando(id);
    try {
      const res = await fetch(`${API_BASE}/api/backoffice/pratiche/${id}/sblocca-pagamento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': BACKOFFICE_USER_ID },
      });
      if (res.ok) {
        setSbloccati(prev => new Set(prev).add(id));
      }
    } catch {}
    finally { setSbloccando(null); }
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-graphite mb-1">Riacquisti in attesa di chiamata</h1>
      <p className="text-sm text-stone mb-6">Pratiche che richiedono contatto prima del pagamento</p>

      <div>
        {loading ? (
          <div className="text-center py-12 text-stone">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Caricamento...
          </div>
        ) : pratiche.length === 0 ? (
          <div className="text-center py-12 text-stone">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-ok-text" />
            <p className="font-medium">Nessuna pratica in attesa di chiamata</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pratiche.map(p => {
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
                          <p className="font-medium">{p.contratto_nsm_id}</p>
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
        )}
      </div>
    </div>
  );
}
