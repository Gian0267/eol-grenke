import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import {
  Loader2,
  Eye,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Download,
  RotateCcw,
  Search,
  FileText,
  Send,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Utente {
  id: string;
  nome: string;
  cognome: string;
  email: string;
  ruolo: string;
}

interface Agente {
  id: string;
  nome: string;
  cognome: string;
  email: string;
  ruolo: string;
}

interface PraticaItem {
  id: string;
  contratto_nsm: string;
  contratto_grenke: string;
  cliente: string;
  data_scadenza: string;
  stato: string;
  agente: string;
  pricing_grenke: number | null;
  pricing_riacquisto: number | null;
  decisione: string | null;
  giorni_a_scadenza: number | null;
  origine: string | null;
}

interface PaginatedResponse {
  items: PraticaItem[];
  total: number;
  page: number;
  pageSize: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STATI = [
  { value: 'LISTA_RICEVUTA', label: 'Lista ricevuta' },
  { value: 'COMUNICAZIONE_INVIATA', label: 'Comunicazione inviata' },
  { value: 'IN_ATTESA_DECISIONE', label: 'In attesa decisione' },
  { value: 'DECISIONE_RINNOVO', label: 'Decisione rinnovo' },
  { value: 'DECISIONE_RIACQUISTO', label: 'Decisione riacquisto' },
  { value: 'DECISIONE_CONTATTO', label: 'Decisione contatto' },
  { value: 'DECISIONE_RESTITUZIONE', label: 'Decisione restituzione' },
  { value: 'RIACQUISTO_IN_ATTESA_CHIAMATA', label: 'Riacquisto in attesa chiamata' },
  { value: 'RIACQUISTO_PAGATO', label: 'Riacquisto pagato' },
  { value: 'SILENZIO_PERDITA_DEFINITIVA', label: 'Silenzio / Perdita definitiva' },
] as const;

const ORIGINI = ['Smartcom', 'IOL'] as const;

const DECISIONI = [
  { value: 'RINNOVO', label: 'Rinnovo' },
  { value: 'RIACQUISTO', label: 'Riacquisto' },
  { value: 'CONTATTO', label: 'Contatto' },
  { value: 'RESTITUZIONE', label: 'Restituzione' },
] as const;

const STATO_BADGE_COLORS: Record<string, string> = {
  LISTA_RICEVUTA: 'bg-paper text-stone',
  COMUNICAZIONE_INVIATA: 'bg-flex-light text-flex-dark',
  IN_ATTESA_DECISIONE: 'bg-warn text-warn-text',
  DECISIONE_RINNOVO: 'bg-ok text-ok-text',
  DECISIONE_RIACQUISTO: 'bg-ok text-ok-text',
  DECISIONE_CONTATTO: 'bg-flex-light text-flex-dark',
  DECISIONE_RESTITUZIONE: 'bg-warn text-warn-text',
  RIACQUISTO_IN_ATTESA_CHIAMATA: 'bg-outlier text-outlier-text',
  RIACQUISTO_PAGATO: 'bg-ok text-ok-text',
  SILENZIO_PERDITA_DEFINITIVA: 'bg-danger text-danger-text',
};

const SORTABLE_COLUMNS: Record<string, string> = {
  contratto_nsm: 'contratto_nsm_id',
  data_scadenza: 'data_scadenza',
  stato: 'stato',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  return `€ ${Number(value).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ListaPratiche() {
  const [searchParams, setSearchParams] = useSearchParams();

  /* --- Auth --- */
  const utente = useMemo(() => {
    try {
      return getUtente();
    } catch {
      return null;
    }
  }, []);

  /* --- Filter state --- */
  const [stato, setStato] = useState(searchParams.get('stato') ?? '');
  const [agenteId, setAgenteId] = useState(searchParams.get('agente_id') ?? '');
  const [dataScadenzaFrom, setDataScadenzaFrom] = useState(searchParams.get('data_scadenza_from') ?? '');
  const [dataScadenzaTo, setDataScadenzaTo] = useState(searchParams.get('data_scadenza_to') ?? '');
  const [origine, setOrigine] = useState(searchParams.get('origine') ?? '');
  const [decisione, setDecisione] = useState(searchParams.get('decisione') ?? '');
  const [rischioSilenzio, setRischioSilenzio] = useState(searchParams.get('rischio_silenzio') === 'true');

  /* --- Table state --- */
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') ?? 'updated_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(
    (searchParams.get('sortOrder') as 'asc' | 'desc') ?? 'desc',
  );
  const [page, setPage] = useState(Number(searchParams.get('page') ?? '1'));
  const pageSize = 20;

  /* --- Data state --- */
  const [data, setData] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [agenti, setAgenti] = useState<Agente[]>([]);
  const [exporting, setExporting] = useState(false);
  const [sendingBatch, setSendingBatch] = useState(false);
  const [batchResult, setBatchResult] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  /* --- Build query string (shared between list + export) --- */
  const buildQueryString = useCallback(
    (includePageInfo: boolean) => {
      const params = new URLSearchParams();
      if (includePageInfo) {
        params.set('page', String(page));
        params.set('pageSize', String(pageSize));
        params.set('sortBy', sortBy);
        params.set('sortOrder', sortOrder);
      }
      if (stato) params.set('stato', stato);
      if (agenteId) params.set('agente_id', agenteId);
      if (dataScadenzaFrom) params.set('data_scadenza_from', dataScadenzaFrom);
      if (dataScadenzaTo) params.set('data_scadenza_to', dataScadenzaTo);
      if (origine) params.set('origine', origine);
      if (decisione) params.set('decisione', decisione);
      if (rischioSilenzio) params.set('rischio_silenzio', 'true');
      return params.toString();
    },
    [stato, agenteId, dataScadenzaFrom, dataScadenzaTo, origine, decisione, rischioSilenzio, page, sortBy, sortOrder],
  );

  /* --- Fetch pratiche --- */
  const fetchPratiche = useCallback(async () => {
    if (!utente) return;
    setLoading(true);
    try {
      const qs = buildQueryString(true);
      const res = await fetch(`/api/backoffice/pratiche-avanzate?${qs}`, {
        credentials: 'include',
        headers: { 'x-user-id': utente.id },
      });
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const json: PaginatedResponse = await res.json();
      setData(json);
    } catch (err) {
      console.error('Errore caricamento pratiche:', err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [utente, buildQueryString]);

  /* --- Fetch agenti --- */
  useEffect(() => {
    if (!utente) return;
    (async () => {
      try {
        const res = await fetch('/api/backoffice/agenti', {
          credentials: 'include',
          headers: { 'x-user-id': utente.id },
        });
        if (res.ok) {
          const json: Agente[] = await res.json();
          setAgenti(json);
        }
      } catch {
        /* silent */
      }
    })();
  }, [utente]);

  /* --- Load data on mount + when deps change --- */
  useEffect(() => {
    fetchPratiche();
  }, [fetchPratiche]);

  /* --- Sync filters to URL --- */
  useEffect(() => {
    const params = new URLSearchParams();
    if (stato) params.set('stato', stato);
    if (agenteId) params.set('agente_id', agenteId);
    if (dataScadenzaFrom) params.set('data_scadenza_from', dataScadenzaFrom);
    if (dataScadenzaTo) params.set('data_scadenza_to', dataScadenzaTo);
    if (origine) params.set('origine', origine);
    if (decisione) params.set('decisione', decisione);
    if (rischioSilenzio) params.set('rischio_silenzio', 'true');
    if (page > 1) params.set('page', String(page));
    if (sortBy !== 'updated_at') params.set('sortBy', sortBy);
    if (sortOrder !== 'desc') params.set('sortOrder', sortOrder);
    setSearchParams(params, { replace: true });
  }, [stato, agenteId, dataScadenzaFrom, dataScadenzaTo, origine, decisione, rischioSilenzio, page, sortBy, sortOrder, setSearchParams]);

  /* --- Handlers --- */
  function handleFilter() {
    setPage(1);
  }

  function handleReset() {
    setStato('');
    setAgenteId('');
    setDataScadenzaFrom('');
    setDataScadenzaTo('');
    setOrigine('');
    setDecisione('');
    setRischioSilenzio(false);
    setSortBy('updated_at');
    setSortOrder('desc');
    setPage(1);
  }

  function handleSort(columnKey: string) {
    const apiField = SORTABLE_COLUMNS[columnKey];
    if (!apiField) return;
    if (sortBy === apiField) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(apiField);
      setSortOrder('asc');
    }
    setPage(1);
  }

  async function handleExportCsv() {
    if (!utente) return;
    setExporting(true);
    try {
      const qs = buildQueryString(false);
      const res = await fetch(`/api/backoffice/pratiche-avanzate/export-csv?${qs}`, {
        credentials: 'include',
        headers: { 'x-user-id': utente.id },
      });
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pratiche_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Errore export CSV:', err);
    } finally {
      setExporting(false);
    }
  }

  async function handleInviaComunicazioneBatch() {
    if (!utente) return;
    const listaRicevutaCount = items.filter(p => p.stato === 'LISTA_RICEVUTA').length;
    const msg = listaRicevutaCount > 0
      ? `Inviare la comunicazione iniziale a tutte le pratiche in stato "Lista ricevuta"?`
      : 'Inviare la comunicazione iniziale a tutte le pratiche in stato "Lista ricevuta"?';
    if (!confirm(msg)) return;

    setSendingBatch(true);
    setBatchResult(null);
    try {
      const res = await fetch('/api/backoffice/pratiche/invia-comunicazione-batch', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-user-id': utente.id },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Errore invio');
      setBatchResult({ message: body.message, type: 'success' });
      fetchPratiche(); // ricarica la lista
    } catch (err: any) {
      setBatchResult({ message: err.message, type: 'error' });
    } finally {
      setSendingBatch(false);
    }
  }

  /* --- Derived --- */
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const items = data?.items ?? [];

  /* --- Sort icon helper --- */
  function SortIcon({ columnKey }: { columnKey: string }) {
    const apiField = SORTABLE_COLUMNS[columnKey];
    if (sortBy !== apiField) return <ChevronsUpDown className="w-3.5 h-3.5 text-stone" />;
    return sortOrder === 'asc' ? (
      <ChevronUp className="w-3.5 h-3.5 text-graphite" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 text-graphite" />
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-graphite">Lista pratiche</h1>
        <p className="text-sm text-stone mt-1">Gestione contratti end-of-lease</p>
      </div>

      {/* ---- Filter bar ---- */}
      <div className="bg-white rounded-xl border border-border p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Stato */}
          <div>
            <label className="block text-xs font-medium text-stone mb-1">Stato</label>
            <select
              value={stato}
              onChange={(e) => setStato(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-flex/30 focus:border-flex"
            >
              <option value="">Tutti gli stati</option>
              {STATI.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Agente */}
          <div>
            <label className="block text-xs font-medium text-stone mb-1">Agente</label>
            <select
              value={agenteId}
              onChange={(e) => setAgenteId(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-flex/30 focus:border-flex"
            >
              <option value="">Tutti gli agenti</option>
              {agenti.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome} {a.cognome}
                </option>
              ))}
            </select>
          </div>

          {/* Scadenza da */}
          <div>
            <label className="block text-xs font-medium text-stone mb-1">Scadenza da</label>
            <input
              type="date"
              value={dataScadenzaFrom}
              onChange={(e) => setDataScadenzaFrom(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-flex/30 focus:border-flex"
            />
          </div>

          {/* Scadenza a */}
          <div>
            <label className="block text-xs font-medium text-stone mb-1">Scadenza a</label>
            <input
              type="date"
              value={dataScadenzaTo}
              onChange={(e) => setDataScadenzaTo(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-flex/30 focus:border-flex"
            />
          </div>

          {/* Origine */}
          <div>
            <label className="block text-xs font-medium text-stone mb-1">Origine</label>
            <select
              value={origine}
              onChange={(e) => setOrigine(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-flex/30 focus:border-flex"
            >
              <option value="">Tutte le origini</option>
              {ORIGINI.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          {/* Decisione */}
          <div>
            <label className="block text-xs font-medium text-stone mb-1">Decisione</label>
            <select
              value={decisione}
              onChange={(e) => setDecisione(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-flex/30 focus:border-flex"
            >
              <option value="">Tutte le decisioni</option>
              {DECISIONI.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          {/* Rischio silenzio */}
          <div className="flex items-end pb-1">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rischioSilenzio}
                onChange={(e) => setRischioSilenzio(e.target.checked)}
                className="w-4 h-4 rounded border-border text-flex focus:ring-flex/30"
              />
              <span className="text-sm text-graphite">Rischio silenzio</span>
            </label>
          </div>
        </div>

        {/* Filter actions */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            onClick={handleFilter}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-flex rounded-lg hover:bg-flex-dark transition-colors"
          >
            <Search className="w-4 h-4" />
            Filtra
          </button>
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-graphite bg-white border border-border rounded-lg hover:bg-paper/60 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <div className="flex-1" />
          <button
            onClick={handleInviaComunicazioneBatch}
            disabled={sendingBatch}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-flex rounded-lg hover:bg-flex-dark disabled:opacity-50 transition-colors"
          >
            {sendingBatch ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Invia comunicazione
          </button>
          <button
            onClick={handleExportCsv}
            disabled={exporting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-graphite bg-white border border-border rounded-lg hover:bg-paper/60 disabled:opacity-50 transition-colors"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Esporta CSV
          </button>
        </div>

        {/* Batch result banner */}
        {batchResult && (
          <div className={`flex items-center justify-between rounded-lg px-4 py-3 text-sm ${batchResult.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            <span>{batchResult.message}</span>
            <button onClick={() => setBatchResult(null)} className="text-current opacity-60 hover:opacity-100 ml-3">&times;</button>
          </div>
        )}
      </div>

      {/* ---- Table ---- */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-stone" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-24 text-stone">
            <FileText className="w-12 h-12 mx-auto mb-3 text-stone/40" />
            <p className="font-medium">Nessuna pratica trovata</p>
            <p className="text-sm mt-1">Prova a modificare i filtri di ricerca.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-paper border-b border-border text-left">
                  <ThSortable columnKey="contratto_nsm" label="Contr. NSM" onSort={handleSort}>
                    <SortIcon columnKey="contratto_nsm" />
                  </ThSortable>
                  <th className="px-4 py-3 font-medium text-stone whitespace-nowrap">Contr. Grenke</th>
                  <th className="px-4 py-3 font-medium text-stone">Cliente</th>
                  <ThSortable columnKey="data_scadenza" label="Scadenza" onSort={handleSort}>
                    <SortIcon columnKey="data_scadenza" />
                  </ThSortable>
                  <ThSortable columnKey="stato" label="Stato" onSort={handleSort}>
                    <SortIcon columnKey="stato" />
                  </ThSortable>
                  <th className="px-4 py-3 font-medium text-stone">Agente</th>
                  <th className="px-4 py-3 font-medium text-stone text-right whitespace-nowrap">
                    Ns. costo
                  </th>
                  <th className="px-4 py-3 font-medium text-stone text-right whitespace-nowrap">
                    Riacquisto cliente
                  </th>
                  <th className="px-4 py-3 font-medium text-stone">Decisione</th>
                  <th className="px-4 py-3 font-medium text-stone text-center">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p, idx) => (
                  <tr
                    key={p.id}
                    className={`border-b last:border-b-0 hover:bg-paper/60 transition-colors ${idx % 2 === 1 ? 'bg-paper/30' : ''}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{p.contratto_nsm}</td>
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{p.contratto_grenke}</td>
                    <td className="px-4 py-3 font-medium max-w-[200px] truncate" title={p.cliente}>
                      {p.cliente}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{formatDate(p.data_scadenza)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${STATO_BADGE_COLORS[p.stato] ?? 'bg-paper text-stone'}`}
                      >
                        {statoLabel(p.stato)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{p.agente || '—'}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{formatCurrency(p.pricing_grenke)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{formatCurrency(p.pricing_riacquisto)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{p.decisione || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <Link
                        to={`/backoffice/pratiche/${p.id}`}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-stone hover:text-graphite hover:bg-paper/60 transition-colors"
                        title="Dettaglio pratica"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- Pagination ---- */}
      {data && data.total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-stone">
          <p>
            {data.total} {data.total === 1 ? 'risultato' : 'risultati'} totali
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-paper/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Precedente
            </button>
            <span className="px-3 py-1.5">
              Pagina {page} di {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-paper/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Successiva
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sortable table header                                              */
/* ------------------------------------------------------------------ */

function ThSortable({
  columnKey,
  label,
  onSort,
  children,
}: {
  columnKey: string;
  label: string;
  onSort: (key: string) => void;
  children: React.ReactNode;
}) {
  return (
    <th className="px-4 py-3 font-medium text-stone whitespace-nowrap">
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className="inline-flex items-center gap-1 hover:text-graphite transition-colors"
      >
        {label}
        {children}
      </button>
    </th>
  );
}
