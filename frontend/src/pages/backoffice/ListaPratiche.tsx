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
  LISTA_RICEVUTA: 'bg-gray-100 text-gray-700',
  COMUNICAZIONE_INVIATA: 'bg-blue-100 text-blue-700',
  IN_ATTESA_DECISIONE: 'bg-amber-100 text-amber-700',
  DECISIONE_RINNOVO: 'bg-green-100 text-green-700',
  DECISIONE_RIACQUISTO: 'bg-emerald-100 text-emerald-700',
  DECISIONE_CONTATTO: 'bg-cyan-100 text-cyan-700',
  DECISIONE_RESTITUZIONE: 'bg-orange-100 text-orange-700',
  RIACQUISTO_IN_ATTESA_CHIAMATA: 'bg-purple-100 text-purple-700',
  RIACQUISTO_PAGATO: 'bg-teal-100 text-teal-700',
  SILENZIO_PERDITA_DEFINITIVA: 'bg-red-100 text-red-700',
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

  /* --- Derived --- */
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const items = data?.items ?? [];

  /* --- Sort icon helper --- */
  function SortIcon({ columnKey }: { columnKey: string }) {
    const apiField = SORTABLE_COLUMNS[columnKey];
    if (sortBy !== apiField) return <ChevronsUpDown className="w-3.5 h-3.5 text-gray-400" />;
    return sortOrder === 'asc' ? (
      <ChevronUp className="w-3.5 h-3.5 text-[#1a3a52]" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 text-[#1a3a52]" />
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Lista pratiche</h1>
        <p className="text-sm text-gray-500 mt-1">Gestione contratti end-of-lease</p>
      </div>

      {/* ---- Filter bar ---- */}
      <div className="bg-white rounded-xl border p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Stato */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Stato</label>
            <select
              value={stato}
              onChange={(e) => setStato(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a52]/30 focus:border-[#1a3a52]"
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Agente</label>
            <select
              value={agenteId}
              onChange={(e) => setAgenteId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a52]/30 focus:border-[#1a3a52]"
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Scadenza da</label>
            <input
              type="date"
              value={dataScadenzaFrom}
              onChange={(e) => setDataScadenzaFrom(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a52]/30 focus:border-[#1a3a52]"
            />
          </div>

          {/* Scadenza a */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Scadenza a</label>
            <input
              type="date"
              value={dataScadenzaTo}
              onChange={(e) => setDataScadenzaTo(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a52]/30 focus:border-[#1a3a52]"
            />
          </div>

          {/* Origine */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Origine</label>
            <select
              value={origine}
              onChange={(e) => setOrigine(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a52]/30 focus:border-[#1a3a52]"
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Decisione</label>
            <select
              value={decisione}
              onChange={(e) => setDecisione(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a52]/30 focus:border-[#1a3a52]"
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
                className="w-4 h-4 rounded border-gray-300 text-[#1a3a52] focus:ring-[#1a3a52]/30"
              />
              <span className="text-sm text-gray-700">Rischio silenzio</span>
            </label>
          </div>
        </div>

        {/* Filter actions */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            onClick={handleFilter}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1a3a52] rounded-lg hover:bg-[#243f55] transition-colors"
          >
            <Search className="w-4 h-4" />
            Filtra
          </button>
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <div className="flex-1" />
          <button
            onClick={handleExportCsv}
            disabled={exporting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Esporta CSV
          </button>
        </div>
      </div>

      {/* ---- Table ---- */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-24 text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">Nessuna pratica trovata</p>
            <p className="text-sm mt-1">Prova a modificare i filtri di ricerca.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-left">
                  <ThSortable columnKey="contratto_nsm" label="Contr. NSM" onSort={handleSort}>
                    <SortIcon columnKey="contratto_nsm" />
                  </ThSortable>
                  <th className="px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Contr. Grenke</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Cliente</th>
                  <ThSortable columnKey="data_scadenza" label="Scadenza" onSort={handleSort}>
                    <SortIcon columnKey="data_scadenza" />
                  </ThSortable>
                  <ThSortable columnKey="stato" label="Stato" onSort={handleSort}>
                    <SortIcon columnKey="stato" />
                  </ThSortable>
                  <th className="px-4 py-3 font-medium text-gray-600">Agente</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-right whitespace-nowrap">
                    Pricing riacquisto
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-600">Decisione</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-center">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p, idx) => (
                  <tr
                    key={p.id}
                    className={`border-b last:border-b-0 hover:bg-gray-50 transition-colors ${idx % 2 === 1 ? 'bg-gray-50/50' : ''}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{p.contratto_nsm}</td>
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{p.contratto_grenke}</td>
                    <td className="px-4 py-3 font-medium max-w-[200px] truncate" title={p.cliente}>
                      {p.cliente}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(p.data_scadenza)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${STATO_BADGE_COLORS[p.stato] ?? 'bg-gray-100 text-gray-700'}`}
                      >
                        {statoLabel(p.stato)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{p.agente || '—'}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{formatCurrency(p.pricing_riacquisto)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{p.decisione || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <Link
                        to={`/backoffice/pratiche/${p.id}`}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-[#1a3a52] hover:bg-gray-100 transition-colors"
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
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-600">
          <p>
            {data.total} {data.total === 1 ? 'risultato' : 'risultati'} totali
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Precedente
            </button>
            <span className="px-3 py-1.5">
              Pagina {page} di {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
    <th className="px-4 py-3 font-medium text-gray-600 whitespace-nowrap">
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className="inline-flex items-center gap-1 hover:text-[#1a3a52] transition-colors"
      >
        {label}
        {children}
      </button>
    </th>
  );
}
