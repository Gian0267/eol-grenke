import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, Loader2, CheckCircle2, Search, Trash2, X, Mail } from 'lucide-react';
import { toast, Toaster } from 'sonner';

interface Segnalazione {
  id: string;
  received_at: string;
  from_address: string;
  from_name: string | null;
  subject: string;
  snippet: string;
  keywords: string[];
  status: 'NEW' | 'NOTIFIED' | 'HANDLED';
  casella: string | null;
  contratto: { id: string; contratto_nsm: string; data_scadenza: string | null } | null;
}

interface CorpoMail {
  corpo: string | null;
  origine: 'archivio' | 'casella' | 'non_recuperabile';
  messaggio?: string;
  snippet?: string;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  NEW: { label: 'Nuova', cls: 'bg-amber-100 text-amber-800' },
  NOTIFIED: { label: 'Notificata', cls: 'bg-blue-100 text-blue-800' },
  HANDLED: { label: 'Gestita', cls: 'bg-green-100 text-green-800' },
};

function getUtenteId(): string | null {
  try {
    return JSON.parse(localStorage.getItem('nsm_user') || 'null')?.id ?? null;
  } catch {
    return null;
  }
}

export default function SegnalazioniCasella() {
  const [items, setItems] = useState<Segnalazione[]>([]);
  const [total, setTotal] = useState(0);
  const [daGestire, setDaGestire] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [keyword, setKeyword] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [dataFrom, setDataFrom] = useState('');
  const [dataTo, setDataTo] = useState('');
  const [marking, setMarking] = useState<string | null>(null);
  // Selezione per l'eliminazione in blocco. Vale solo sulla pagina a video:
  // cambiando pagina o filtro si azzera, cosi' non si cancella per sbaglio
  // roba che non si sta guardando.
  const [selezionate, setSelezionate] = useState<Set<string>>(new Set());
  const [eliminandoBlocco, setEliminandoBlocco] = useState(false);

  const eliminaSelezionate = async () => {
    const ids = [...selezionate];
    if (ids.length === 0) return;
    if (!confirm(
      `Eliminare ${ids.length} ${ids.length === 1 ? 'segnalazione' : 'segnalazioni'}?\n\n` +
      'Spariranno da elenco, conteggi e digest. Le mail nelle caselle non vengono toccate.',
    )) return;
    setEliminandoBlocco(true);
    try {
      const res = await fetch('/api/backoffice/segnalazioni-casella/elimina', {
        method: 'POST',
        credentials: 'include',
        headers: headers(),
        body: JSON.stringify({ ids }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Errore');
      toast.success(`${d.eliminate} ${d.eliminate === 1 ? 'segnalazione eliminata' : 'segnalazioni eliminate'}`);
      setSelezionate(new Set());
      carica();
    } catch {
      toast.error('Impossibile eliminare le segnalazioni selezionate');
    } finally {
      setEliminandoBlocco(false);
    }
  };
  // Lettura della mail per intero
  const [aperta, setAperta] = useState<Segnalazione | null>(null);
  const [corpo, setCorpo] = useState<CorpoMail | null>(null);
  const [caricandoCorpo, setCaricandoCorpo] = useState(false);

  async function apri(m: Segnalazione) {
    setAperta(m);
    setCorpo(null);
    setCaricandoCorpo(true);
    try {
      const res = await fetch(`/api/backoffice/segnalazioni-casella/${m.id}/corpo`, {
        credentials: 'include',
        headers: headers(),
      });
      if (!res.ok) throw new Error();
      setCorpo(await res.json());
    } catch {
      toast.error('Non sono riuscito a caricare il testo della mail');
      setCorpo({ corpo: null, origine: 'non_recuperabile', snippet: m.snippet });
    } finally {
      setCaricandoCorpo(false);
    }
  }
  const pageSize = 25;

  const headers = (): HeadersInit => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const id = getUtenteId();
    if (id) h['x-user-id'] = id;
    return h;
  };

  const carica = () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status) params.set('status', status);
    if (keyword) params.set('keyword', keyword);
    if (dataFrom) params.set('data_from', dataFrom);
    if (dataTo) params.set('data_to', dataTo);
    fetch(`/api/backoffice/segnalazioni-casella?${params}`, { credentials: 'include', headers: headers() })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Errore caricamento'))))
      .then(d => {
        setItems(d.items);
        setTotal(d.total);
        setDaGestire(d.da_gestire);
      })
      .catch(() => toast.error('Errore nel caricamento delle segnalazioni'))
      .finally(() => setLoading(false));
  };

  useEffect(carica, [page, status, keyword, dataFrom, dataTo]);
  useEffect(() => { setSelezionate(new Set()); }, [page, status, keyword, dataFrom, dataTo]);

  const elimina = async (id: string, oggetto: string) => {
    if (!confirm(`Eliminare la segnalazione "${oggetto}"?\n\nSparirà da elenco, conteggi e digest (la mail nella casella non viene toccata).`)) return;
    setMarking(id);
    try {
      const res = await fetch(`/api/backoffice/segnalazioni-casella/${id}/elimina`, {
        method: 'POST',
        credentials: 'include',
        headers: headers(),
      });
      if (!res.ok) throw new Error('Errore');
      toast.success('Segnalazione eliminata');
      carica();
    } catch {
      toast.error('Impossibile eliminare la segnalazione');
    } finally {
      setMarking(null);
    }
  };

  const segnaGestita = async (id: string) => {
    setMarking(id);
    try {
      const res = await fetch(`/api/backoffice/segnalazioni-casella/${id}/gestita`, {
        method: 'POST',
        credentials: 'include',
        headers: headers(),
      });
      if (!res.ok) throw new Error('Errore');
      toast.success('Segnalazione marcata come gestita');
      carica();
    } catch {
      toast.error('Impossibile aggiornare la segnalazione');
    } finally {
      setMarking(null);
    }
  };

  const totPagine = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <Toaster richColors position="top-right" />
      <div className="flex items-center gap-3 mb-1">
        <Inbox className="w-6 h-6 text-flex" />
        <h1 className="text-2xl font-bold text-graphite">Segnalazioni casella info@</h1>
        {daGestire > 0 && (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">{daGestire} da gestire</span>
        )}
      </div>
      <p className="text-sm text-stone mb-4">
        Mail rilevanti intercettate sulle caselle di contatto monitorate (lettura ogni 15 minuti, caselle mai modificate).
      </p>

      {/* Filtri */}
      <div className="bg-card rounded-xl border border-border p-4 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-stone mb-1">Status</label>
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="border border-border rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">Tutti</option>
            <option value="NEW">Nuova</option>
            <option value="NOTIFIED">Notificata</option>
            <option value="HANDLED">Gestita</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-stone mb-1">Dal</label>
          <input type="date" value={dataFrom} onChange={e => { setDataFrom(e.target.value); setPage(1); }} className="border border-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-stone mb-1">Al</label>
          <input type="date" value={dataTo} onChange={e => { setDataTo(e.target.value); setPage(1); }} className="border border-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex-1 min-w-44">
          <label className="block text-xs font-medium text-stone mb-1">Keyword</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={keywordInput}
              onChange={e => setKeywordInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setKeyword(keywordInput.trim()); setPage(1); } }}
              placeholder="Es. fine contratto"
              className="flex-1 border border-border rounded-lg px-3 py-2 text-sm"
            />
            <button onClick={() => { setKeyword(keywordInput.trim()); setPage(1); }} className="px-3 py-2 rounded-lg bg-flex text-white text-sm hover:bg-flex-dark">
              <Search className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Tabella */}
      {/* Barra della selezione: compare solo quando serve, cosi' l'eliminazione
          in blocco non sta li' a portata di clic distratto. */}
      {selezionate.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-paper px-4 py-3">
          <span className="text-sm text-graphite">
            <strong>{selezionate.size}</strong> {selezionate.size === 1 ? 'segnalazione selezionata' : 'segnalazioni selezionate'}
            <button onClick={() => setSelezionate(new Set())} className="ml-3 text-stone underline hover:text-graphite">
              annulla
            </button>
          </span>
          <button
            onClick={eliminaSelezionate}
            disabled={eliminandoBlocco}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-700 border border-red-300 bg-white hover:bg-red-50 disabled:opacity-50"
          >
            {eliminandoBlocco ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Elimina selezionate
          </button>
        </div>
      )}

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-stone">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Caricamento…
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-stone text-sm">
            Nessuna segnalazione. Le mail che contengono le keyword configurate compariranno qui entro 15 minuti dall'arrivo.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-paper text-left text-xs uppercase tracking-wide text-stone">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={items.length > 0 && items.every(m => selezionate.has(m.id))}
                      onChange={e => setSelezionate(e.target.checked ? new Set(items.map(m => m.id)) : new Set())}
                      className="w-4 h-4 accent-[var(--color-flex)] cursor-pointer"
                      title="Seleziona tutte le segnalazioni di questa pagina"
                    />
                  </th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Mittente</th>
                  <th className="px-4 py-3">Casella</th>
                  <th className="px-4 py-3">Oggetto</th>
                  <th className="px-4 py-3">Keyword</th>
                  <th className="px-4 py-3">Contratto</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-center">Azione</th>
                </tr>
              </thead>
              <tbody>
                {items.map(m => (
                  <tr key={m.id} className={`border-t border-border hover:bg-paper align-top ${selezionate.has(m.id) ? 'bg-paper' : ''}`}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selezionate.has(m.id)}
                        onChange={e => {
                          const next = new Set(selezionate);
                          if (e.target.checked) next.add(m.id); else next.delete(m.id);
                          setSelezionate(next);
                        }}
                        className="w-4 h-4 accent-[var(--color-flex)] cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-graphite">
                      {new Date(m.received_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      <p className="font-medium text-graphite truncate" title={m.from_address}>{m.from_name || m.from_address}</p>
                      {m.from_name && <p className="text-xs text-stone truncate">{m.from_address}</p>}
                    </td>
                    <td className="px-4 py-3 max-w-[180px]">
                      <span className="text-xs text-stone truncate block" title={m.casella ?? undefined}>{m.casella ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 max-w-[320px]">
                      <button
                        onClick={() => apri(m)}
                        className="text-left w-full group"
                        title="Apri la mail per intero"
                      >
                        <p className="font-medium text-graphite truncate group-hover:text-flex group-hover:underline">{m.subject}</p>
                        <p className="text-xs text-stone truncate">{m.snippet}</p>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {m.keywords.map(k => (
                          <span key={k} className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 text-xs">{k}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {m.contratto ? (
                        <Link to={`/backoffice/pratiche/${m.contratto.id}`} className="text-flex hover:underline font-mono text-xs">
                          {m.contratto.contratto_nsm}
                        </Link>
                      ) : (
                        <span className="text-stone text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[m.status]?.cls || 'bg-paper text-stone'}`}>
                        {STATUS_BADGE[m.status]?.label || m.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {m.status !== 'HANDLED' && (
                        <button
                          onClick={() => segnaGestita(m.id)}
                          disabled={marking === m.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-green-700 border border-green-300 hover:bg-green-50 disabled:opacity-50"
                        >
                          {marking === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          Segna gestita
                        </button>
                      )}
                      <button
                        onClick={() => elimina(m.id, m.subject)}
                        disabled={marking === m.id}
                        title="Elimina segnalazione"
                        className="inline-flex items-center justify-center w-8 h-8 ml-2 rounded-lg text-stone hover:text-red-600 hover:bg-red-50 disabled:opacity-50 align-middle"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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
          <span>{total} segnalazioni</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-paper">Precedente</button>
            <span>Pagina {page} di {totPagine}</span>
            <button disabled={page >= totPagine} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-paper">Successiva</button>
          </div>
        </div>
      )}

      {/* Lettura della mail per intero: fino al 18/09/2026 in elenco c'erano
          solo i primi 300 caratteri, e le risposte dei clienti finivano
          tagliate a meta' frase. */}
      {aperta && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setAperta(null)}>
          <div
            className="bg-card rounded-xl border border-border w-full max-w-3xl max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="font-semibold text-graphite break-words">{aperta.subject}</h3>
                <p className="text-xs text-stone mt-1 break-all">
                  Da <strong>{aperta.from_name || aperta.from_address}</strong>
                  {aperta.from_name && ` <${aperta.from_address}>`}
                  {' — '}
                  {new Date(aperta.received_at).toLocaleString('it-IT')}
                  {aperta.casella && ` — ricevuta su ${aperta.casella}`}
                </p>
              </div>
              <button onClick={() => setAperta(null)} className="text-stone hover:text-graphite shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 overflow-y-auto">
              {caricandoCorpo ? (
                <div className="flex items-center gap-2 text-sm text-stone">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carico il testo…
                </div>
              ) : corpo?.corpo ? (
                <pre className="whitespace-pre-wrap break-words font-sans text-sm text-graphite leading-relaxed">
                  {corpo.corpo}
                </pre>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2 items-start bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
                    <Mail className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>{corpo?.messaggio || 'Testo completo non disponibile.'}</p>
                  </div>
                  {(corpo?.snippet || aperta.snippet) && (
                    <pre className="whitespace-pre-wrap break-words font-sans text-sm text-stone leading-relaxed">
                      {corpo?.snippet || aperta.snippet}
                    </pre>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-border flex items-center justify-between gap-3">
              <span className="text-xs text-stone">
                {corpo?.origine === 'casella' && 'Testo ripescato dalla casella e ora conservato.'}
              </span>
              <div className="flex gap-2">
                {aperta.contratto && (
                  <Link
                    to={`/backoffice/pratiche/${aperta.contratto.id}`}
                    className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-paper"
                  >
                    Apri la pratica
                  </Link>
                )}
                <button onClick={() => setAperta(null)} className="px-4 py-1.5 text-sm rounded-lg bg-flex text-white hover:bg-flex-dark">
                  Chiudi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
