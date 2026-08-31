import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, Loader2, CheckCircle2, Search, Trash2 } from 'lucide-react';
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
                  <tr key={m.id} className="border-t border-border hover:bg-paper align-top">
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
                      <p className="font-medium text-graphite truncate" title={m.subject}>{m.subject}</p>
                      <p className="text-xs text-stone truncate" title={m.snippet}>{m.snippet}</p>
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
    </div>
  );
}
