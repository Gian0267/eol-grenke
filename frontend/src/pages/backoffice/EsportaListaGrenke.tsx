import { useState, useEffect } from 'react';
import { toast, Toaster } from 'sonner';

interface PreviewRow {
  contratto_id: string;
  contratto_grenke_id: string;
  ragione_sociale: string;
  piva: string;
  data_scadenza: string;
  importo_netto: number;
  importo_iva: number;
  importo_totale: number;
  stato_pagamento: string;
}

interface StoricoItem {
  filename: string;
  data: string;
  size: number;
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const userId = sessionStorage.getItem('nsm_user_id');
  if (userId) headers['x-user-id'] = userId;
  return headers;
}

function formatEur(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function EsportaListaGrenke() {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const [da, setDa] = useState(firstOfMonth.toISOString().substring(0, 10));
  const [a, setA] = useState(lastOfMonth.toISOString().substring(0, 10));
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [esclusi, setEsclusi] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [storico, setStorico] = useState<StoricoItem[]>([]);

  const caricaStorico = async () => {
    try {
      const res = await fetch('/api/backoffice/grenke-export/storico', { headers: getHeaders() });
      if (res.ok) setStorico(await res.json());
    } catch {}
  };

  useEffect(() => { caricaStorico(); }, []);

  const cercaPreview = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/backoffice/grenke-export/preview?da=${da}&a=${a}`, { headers: getHeaders() });
      if (!res.ok) throw new Error('Errore caricamento');
      const data = await res.json();
      setPreview(data);
      setEsclusi(new Set());
    } catch {
      toast.error('Errore nel caricamento anteprima');
    } finally {
      setLoading(false);
    }
  };

  const toggleEscludi = (id: string) => {
    setEsclusi(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const genera = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/backoffice/grenke-export/genera', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ da, a, esclusi: Array.from(esclusi) }),
      });
      if (!res.ok) throw new Error('Errore generazione');
      const data = await res.json();
      toast.success(`File generato: ${data.filename} (${data.righe} righe)`);
      caricaStorico();
    } catch {
      toast.error('Errore nella generazione del file');
    } finally {
      setGenerating(false);
    }
  };

  const inclusi = preview.filter(r => !esclusi.has(r.contratto_id));
  const totale = inclusi.reduce((s, r) => s + r.importo_totale, 0);

  return (
    <div className="max-w-6xl mx-auto">
      <Toaster position="top-right" richColors />
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Export lista riacquisti per Grenke</h1>

      {/* Filtri periodo */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Periodo scadenze</h2>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Da</label>
            <input type="date" value={da} onChange={e => setDa(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">A</label>
            <input type="date" value={a} onChange={e => setA(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <button onClick={cercaPreview} disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Caricamento...' : 'Cerca'}
          </button>
        </div>
      </div>

      {/* Anteprima */}
      {preview.length > 0 && (
        <div className="bg-white rounded-xl border mb-6">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Anteprima: {inclusi.length} pratiche selezionate
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Totale: EUR {formatEur(totale)} — {esclusi.size > 0 && `${esclusi.size} escluse`}
              </p>
            </div>
            <button onClick={genera} disabled={generating || inclusi.length === 0}
              className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {generating ? 'Generazione...' : 'Genera file Excel per Grenke'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-left text-gray-600">
                  <th className="px-4 py-2 font-medium w-10">
                    <input type="checkbox" checked={esclusi.size === 0}
                      onChange={() => esclusi.size > 0 ? setEsclusi(new Set()) : setEsclusi(new Set(preview.map(r => r.contratto_id)))} />
                  </th>
                  <th className="px-4 py-2 font-medium">Contratto Grenke</th>
                  <th className="px-4 py-2 font-medium">Ragione sociale</th>
                  <th className="px-4 py-2 font-medium">P.IVA</th>
                  <th className="px-4 py-2 font-medium">Scadenza</th>
                  <th className="px-4 py-2 font-medium text-right">Netto</th>
                  <th className="px-4 py-2 font-medium text-right">IVA</th>
                  <th className="px-4 py-2 font-medium text-right">Totale</th>
                </tr>
              </thead>
              <tbody>
                {preview.map(r => (
                  <tr key={r.contratto_id} className={`border-b last:border-b-0 hover:bg-gray-50 ${esclusi.has(r.contratto_id) ? 'opacity-40' : ''}`}>
                    <td className="px-4 py-2">
                      <input type="checkbox" checked={!esclusi.has(r.contratto_id)}
                        onChange={() => toggleEscludi(r.contratto_id)} />
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{r.contratto_grenke_id}</td>
                    <td className="px-4 py-2">{r.ragione_sociale}</td>
                    <td className="px-4 py-2 font-mono text-xs">{r.piva}</td>
                    <td className="px-4 py-2">{r.data_scadenza}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatEur(r.importo_netto)}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatEur(r.importo_iva)}</td>
                    <td className="px-4 py-2 text-right font-mono font-medium">{formatEur(r.importo_totale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {preview.length === 0 && !loading && (
        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-300 p-8 text-center mb-6">
          <p className="text-gray-500 text-sm">Seleziona un periodo e clicca "Cerca" per visualizzare le pratiche RIACQUISTO_PAGATO</p>
        </div>
      )}

      {/* Storico export */}
      <div className="bg-white rounded-xl border">
        <div className="px-6 py-4 border-b">
          <h2 className="text-sm font-semibold text-gray-900">Storico export</h2>
        </div>
        {storico.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500 text-sm">Nessun export precedente</div>
        ) : (
          <div className="divide-y">
            {storico.map(s => (
              <div key={s.filename} className="px-6 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{s.filename}</p>
                  <p className="text-xs text-gray-500">{new Date(s.data).toLocaleString('it-IT')} — {Math.round(s.size / 1024)} KB</p>
                </div>
                <a href={`/api/backoffice/grenke-export/download/${s.filename}`}
                  className="text-sm text-blue-600 hover:text-blue-800 underline">
                  Download
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
