import { useState, useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import { Send, RefreshCw, FileText, CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react';

const BACKOFFICE_USER_ID = '00000000-0000-0000-0000-000000000001';

interface Cliente {
  ragione_sociale: string;
  piva: string;
  email: string;
}

interface Pratica {
  id: string;
  contratto_nsm_id: string;
  contratto_grenke_id: string;
  cliente: Cliente;
  stato: string;
  stato_riconciliazione: string;
  canone_mensile: number;
  numero_mesi: number;
  monte_canoni: number;
  pricing_riacquisto: number;
  valore_gift_card: number;
  data_scadenza: string;
  data_importazione: string;
}

interface BatchResult {
  message: string;
  totale: number;
  inviati: number;
  saltati: number;
  errori: number;
}

const statoBadge: Record<string, { bg: string; text: string; icon: typeof Clock }> = {
  LISTA_RICEVUTA: { bg: 'bg-gray-100 text-gray-700', text: 'Lista ricevuta', icon: Clock },
  COMUNICAZIONE_INVIATA: { bg: 'bg-green-100 text-green-700', text: 'Comunicazione inviata', icon: CheckCircle2 },
  FLEX_ATTIVO: { bg: 'bg-blue-100 text-blue-700', text: 'Flex attivo', icon: FileText },
};

function formatEur(n: number): string {
  return Number(n).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('it-IT');
}

export default function ListaPratiche() {
  const [pratiche, setPratiche] = useState<Pratica[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);

  async function loadPratiche() {
    setLoading(true);
    try {
      const res = await fetch('/api/backoffice/pratiche', {
        headers: { 'x-user-id': BACKOFFICE_USER_ID },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPratiche(data);
    } catch (err) {
      toast.error(`Errore caricamento: ${err instanceof Error ? err.message : 'Errore'}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadPratiche(); }, []);

  async function handleBatchSend() {
    setSending(true);
    setBatchResult(null);
    try {
      const res = await fetch('/api/backoffice/pratiche/invia-comunicazione-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': BACKOFFICE_USER_ID },
      });
      if (!res.ok) throw new Error(await res.text());
      const data: BatchResult = await res.json();
      setBatchResult(data);
      toast.success(`${data.inviati} comunicazioni inviate con successo`);
      await loadPratiche();
    } catch (err) {
      toast.error(`Errore invio batch: ${err instanceof Error ? err.message : 'Errore'}`);
    } finally {
      setSending(false);
    }
  }

  const listaRicevutaCount = pratiche.filter(p => p.stato === 'LISTA_RICEVUTA').length;
  const comunicazioneInviataCount = pratiche.filter(p => p.stato === 'COMUNICAZIONE_INVIATA').length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" richColors />

      {/* Header */}
      <header className="bg-[#1a3a52] text-white px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Noleggio Su Misura — Backoffice</h1>
            <p className="text-sm text-slate-300">Gestione pratiche EOL Grenke</p>
          </div>
          <nav className="flex gap-4 text-sm">
            <a href="/backoffice/import" className="text-slate-300 hover:text-white transition-colors">Importazione</a>
            <a href="/backoffice/pratiche" className="text-white font-semibold border-b-2 border-white pb-0.5">Pratiche</a>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg border p-4 flex items-center gap-4">
            <div className="bg-gray-100 rounded-full p-3"><FileText className="w-5 h-5 text-gray-600" /></div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{pratiche.length}</p>
              <p className="text-sm text-gray-500">Pratiche totali</p>
            </div>
          </div>
          <div className="bg-white rounded-lg border p-4 flex items-center gap-4">
            <div className="bg-amber-100 rounded-full p-3"><Clock className="w-5 h-5 text-amber-600" /></div>
            <div>
              <p className="text-2xl font-bold text-amber-700">{listaRicevutaCount}</p>
              <p className="text-sm text-gray-500">Da inviare</p>
            </div>
          </div>
          <div className="bg-white rounded-lg border p-4 flex items-center gap-4">
            <div className="bg-green-100 rounded-full p-3"><CheckCircle2 className="w-5 h-5 text-green-600" /></div>
            <div>
              <p className="text-2xl font-bold text-green-700">{comunicazioneInviataCount}</p>
              <p className="text-sm text-gray-500">Comunicazioni inviate</p>
            </div>
          </div>
        </div>

        {/* Actions bar */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Lista pratiche</h2>
          <div className="flex gap-3">
            <button
              onClick={loadPratiche}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Aggiorna
            </button>
            <button
              onClick={handleBatchSend}
              disabled={sending || listaRicevutaCount === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-[#1a3a52] text-white rounded-lg hover:bg-[#243f55] disabled:opacity-50 transition-colors"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? 'Invio in corso...' : `Invia comunicazione iniziale a tutti (${listaRicevutaCount})`}
            </button>
          </div>
        </div>

        {/* Batch result banner */}
        {batchResult && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold">{batchResult.message}</p>
              <p className="mt-1">
                Totale: {batchResult.totale} | Inviati: {batchResult.inviati} | Saltati: {batchResult.saltati} | Errori: {batchResult.errori}
              </p>
            </div>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : pratiche.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Nessuna pratica trovata. Importa un file Excel dalla pagina di importazione.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Contratto NSM</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Contratto Grenke</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">P.IVA</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Monte canoni</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Gift Card</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Scadenza</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {pratiche.map((p) => {
                    const badge = statoBadge[p.stato] || { bg: 'bg-gray-100 text-gray-700', text: p.stato, icon: FileText };
                    const Icon = badge.icon;
                    return (
                      <tr key={p.id} className="border-b last:border-b-0 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs">{p.contratto_nsm_id}</td>
                        <td className="px-4 py-3 font-mono text-xs">{p.contratto_grenke_id}</td>
                        <td className="px-4 py-3 font-medium">{p.cliente.ragione_sociale}</td>
                        <td className="px-4 py-3 text-gray-600">{p.cliente.piva}</td>
                        <td className="px-4 py-3 text-right">{formatEur(p.monte_canoni)}</td>
                        <td className="px-4 py-3 text-right text-green-700 font-medium">{formatEur(p.valore_gift_card)}</td>
                        <td className="px-4 py-3">{formatDate(p.data_scadenza)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${badge.bg}`}>
                            <Icon className="w-3.5 h-3.5" />
                            {badge.text}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
