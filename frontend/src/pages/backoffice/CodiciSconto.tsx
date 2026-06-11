import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Loader2, Download, RotateCcw, Search, Tag, CheckCircle2, XCircle, Eye, X } from 'lucide-react';
import { toast } from 'sonner';

interface Utente {
  id: string;
  nome: string;
  cognome: string;
  email: string;
  ruolo: string;
}

interface CodiceSconto {
  id: string;
  codice: string;
  valore_eur: number;
  stato: string;
  piva_cliente: string;
  cliente: string;
  contratto_eol_id: string;
  contratto_nsm_id: string;
  data_generazione: string;
  data_scadenza: string;
  data_utilizzo: string | null;
  note: string | null;
}

interface ListResponse {
  codici: CodiceSconto[];
  total: number;
  page: number;
  pageSize: number;
}

const STATI = [
  { value: 'GENERATO', label: 'Generato' },
  { value: 'UTILIZZATO', label: 'Utilizzato' },
  { value: 'SCADUTO', label: 'Scaduto' },
  { value: 'ANNULLATO', label: 'Annullato' },
] as const;

const STATO_BADGE_COLORS: Record<string, string> = {
  GENERATO: 'bg-flex-light text-flex-dark',
  UTILIZZATO: 'bg-ok text-ok-text',
  SCADUTO: 'bg-paper text-stone',
  ANNULLATO: 'bg-danger text-danger-text',
};

function getUtente(): Utente {
  const raw = localStorage.getItem('nsm_user');
  if (!raw) throw new Error('Utente non autenticato');
  return JSON.parse(raw) as Utente;
}

function statoLabel(stato: string): string {
  return STATI.find((s) => s.value === stato)?.label ?? stato;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return format(new Date(dateStr), 'dd/MM/yyyy', { locale: it });
  } catch {
    return '—';
  }
}

function formatCurrency(value: number): string {
  return `€ ${Number(value).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CodiciSconto() {
  const utente = useMemo(() => {
    try {
      return getUtente();
    } catch {
      return null;
    }
  }, []);

  /* --- Filter state --- */
  const [stato, setStato] = useState('');
  const [dataFrom, setDataFrom] = useState('');
  const [dataTo, setDataTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  /* --- Data state --- */
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [azioneInCorso, setAzioneInCorso] = useState<string | null>(null);

  /* --- Modal annulla --- */
  const [annullaTarget, setAnnullaTarget] = useState<CodiceSconto | null>(null);
  const [motivoAnnullo, setMotivoAnnullo] = useState('');

  const buildQueryString = useCallback(
    (includePageInfo: boolean) => {
      const params = new URLSearchParams();
      if (includePageInfo) {
        params.set('page', String(page));
        params.set('pageSize', String(pageSize));
      }
      if (stato) params.set('stato', stato);
      if (dataFrom) params.set('data_from', dataFrom);
      if (dataTo) params.set('data_to', dataTo);
      if (search.trim()) params.set('search', search.trim());
      return params.toString();
    },
    [stato, dataFrom, dataTo, search, page],
  );

  const fetchCodici = useCallback(async () => {
    if (!utente) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/backoffice/codici-sconto?${buildQueryString(true)}`, {
        credentials: 'include',
        headers: { 'x-user-id': utente.id },
      });
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const json: ListResponse = await res.json();
      setData(json);
    } catch (err) {
      console.error('Errore caricamento codici sconto:', err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [utente, buildQueryString]);

  useEffect(() => {
    fetchCodici();
  }, [fetchCodici]);

  function handleReset() {
    setStato('');
    setDataFrom('');
    setDataTo('');
    setSearch('');
    setPage(1);
  }

  async function handleExportCsv() {
    if (!utente) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/backoffice/codici-sconto/export-csv?${buildQueryString(false)}`, {
        credentials: 'include',
        headers: { 'x-user-id': utente.id },
      });
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `codici_sconto_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Errore export CSV:', err);
      toast.error('Errore durante l\'esportazione CSV');
    } finally {
      setExporting(false);
    }
  }

  async function handleSegnaUtilizzato(codice: CodiceSconto) {
    if (!utente) return;
    const ok = window.confirm(
      `Segnare il codice ${codice.codice} (${formatCurrency(codice.valore_eur)} — ${codice.cliente}) come UTILIZZATO?\n\nL'operazione viene registrata nell'audit log e non è reversibile.`,
    );
    if (!ok) return;

    setAzioneInCorso(codice.id);
    try {
      const res = await fetch(`/api/backoffice/codici-sconto/${codice.id}/segna-utilizzato`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-user-id': utente.id },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Errore ${res.status}`);
      toast.success(body.messaggio || 'Codice segnato come utilizzato');
      fetchCodici();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore');
    } finally {
      setAzioneInCorso(null);
    }
  }

  async function handleAnnulla() {
    if (!utente || !annullaTarget) return;
    if (!motivoAnnullo.trim()) {
      toast.error('Il motivo è obbligatorio');
      return;
    }

    setAzioneInCorso(annullaTarget.id);
    try {
      const res = await fetch(`/api/backoffice/codici-sconto/${annullaTarget.id}/annulla`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-user-id': utente.id },
        body: JSON.stringify({ motivo: motivoAnnullo.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Errore ${res.status}`);
      toast.success(body.messaggio || 'Codice annullato');
      setAnnullaTarget(null);
      setMotivoAnnullo('');
      fetchCodici();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore');
    } finally {
      setAzioneInCorso(null);
    }
  }

  const codici = data?.codici ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-graphite flex items-center gap-2">
            <Tag className="w-6 h-6 text-flex" /> Codici Sconto
          </h1>
          <p className="text-sm text-stone mt-1">
            Premio Fedeltà: Sconto Copertura Bronze — codici generati alla conferma del rinnovo
          </p>
        </div>
        <button
          onClick={handleExportCsv}
          disabled={exporting || loading}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-graphite bg-white border border-border rounded-lg hover:bg-paper transition-colors disabled:opacity-50"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Esporta CSV
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-border p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-stone mb-1">Stato</label>
            <select
              value={stato}
              onChange={(e) => { setStato(e.target.value); setPage(1); }}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-flex/30 focus:border-flex"
            >
              <option value="">Tutti gli stati</option>
              {STATI.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone mb-1">Generato dal</label>
            <input
              type="date"
              value={dataFrom}
              onChange={(e) => { setDataFrom(e.target.value); setPage(1); }}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-flex/30 focus:border-flex"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone mb-1">Generato fino al</label>
            <input
              type="date"
              value={dataTo}
              onChange={(e) => { setDataTo(e.target.value); setPage(1); }}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-flex/30 focus:border-flex"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone mb-1">Ricerca codice / P.IVA</label>
            <div className="relative">
              <Search className="w-4 h-4 text-stone absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="NSM-XXXX-XXXX o P.IVA"
                className="w-full rounded-lg border border-border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-flex/30 focus:border-flex"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-graphite bg-white border border-border rounded-lg hover:bg-paper transition-colors"
          >
            <RotateCcw className="w-4 h-4" /> Azzera filtri
          </button>
          {data && (
            <span className="text-sm text-stone ml-auto">{data.total} codici trovati</span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-flex" />
          </div>
        ) : codici.length === 0 ? (
          <div className="text-center py-16 text-stone text-sm">Nessun codice sconto trovato</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-paper text-left text-xs text-stone uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Codice</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">P.IVA</th>
                  <th className="px-4 py-3 font-medium text-right">Valore</th>
                  <th className="px-4 py-3 font-medium">Stato</th>
                  <th className="px-4 py-3 font-medium">Generato</th>
                  <th className="px-4 py-3 font-medium">Scadenza</th>
                  <th className="px-4 py-3 font-medium">Pratica</th>
                  <th className="px-4 py-3 font-medium text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {codici.map((c) => (
                  <tr key={c.id} className="hover:bg-paper/50 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-graphite whitespace-nowrap">{c.codice}</td>
                    <td className="px-4 py-3 text-graphite max-w-[200px] truncate" title={c.cliente}>{c.cliente}</td>
                    <td className="px-4 py-3 text-stone whitespace-nowrap">{c.piva_cliente}</td>
                    <td className="px-4 py-3 text-right font-medium text-graphite whitespace-nowrap">{formatCurrency(c.valore_eur)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATO_BADGE_COLORS[c.stato] || 'bg-paper text-stone'}`}
                        title={c.stato === 'ANNULLATO' && c.note ? `Motivo: ${c.note}` : c.data_utilizzo ? `Utilizzato il ${formatDate(c.data_utilizzo)}` : undefined}
                      >
                        {statoLabel(c.stato)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-stone whitespace-nowrap">{formatDate(c.data_generazione)}</td>
                    <td className="px-4 py-3 text-stone whitespace-nowrap">{formatDate(c.data_scadenza)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link
                        to={`/backoffice/pratiche/${c.contratto_eol_id}`}
                        className="inline-flex items-center gap-1 text-flex hover:text-flex-dark hover:underline"
                      >
                        <Eye className="w-3.5 h-3.5" /> {c.contratto_nsm_id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {c.stato === 'GENERATO' && (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleSegnaUtilizzato(c)}
                            disabled={azioneInCorso === c.id}
                            title="Segna come utilizzato"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-ok-text bg-ok rounded-lg hover:opacity-80 transition-opacity disabled:opacity-50"
                          >
                            {azioneInCorso === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            Utilizzato
                          </button>
                          <button
                            onClick={() => { setAnnullaTarget(c); setMotivoAnnullo(''); }}
                            disabled={azioneInCorso === c.id}
                            title="Annulla codice"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-danger-text bg-danger rounded-lg hover:opacity-80 transition-opacity disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Annulla
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && codici.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-xs text-stone">
              Pagina {page} di {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-xs font-medium text-graphite bg-white border border-border rounded-lg hover:bg-paper transition-colors disabled:opacity-50"
              >
                Precedente
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-xs font-medium text-graphite bg-white border border-border rounded-lg hover:bg-paper transition-colors disabled:opacity-50"
              >
                Successiva
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal annulla */}
      {annullaTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setAnnullaTarget(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <button
              onClick={() => setAnnullaTarget(null)}
              className="absolute top-3 right-3 text-stone hover:text-graphite"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-graphite">Annulla codice sconto</h2>
            <p className="text-sm text-stone">
              Stai annullando il codice <span className="font-mono font-semibold text-graphite">{annullaTarget.codice}</span>{' '}
              ({formatCurrency(annullaTarget.valore_eur)} — {annullaTarget.cliente}). L'operazione viene registrata
              nell'audit log e non è reversibile.
            </p>
            <div>
              <label className="block text-xs font-medium text-stone mb-1">Motivo (obbligatorio)</label>
              <textarea
                value={motivoAnnullo}
                onChange={(e) => setMotivoAnnullo(e.target.value)}
                rows={3}
                placeholder="Es. decisione rinnovo annullata dal cliente"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-flex/30 focus:border-flex"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setAnnullaTarget(null)}
                className="px-4 py-2 text-sm font-medium text-graphite bg-white border border-border rounded-lg hover:bg-paper transition-colors"
              >
                Chiudi
              </button>
              <button
                onClick={handleAnnulla}
                disabled={!motivoAnnullo.trim() || azioneInCorso === annullaTarget.id}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {azioneInCorso === annullaTarget.id && <Loader2 className="w-4 h-4 animate-spin" />}
                Annulla codice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
