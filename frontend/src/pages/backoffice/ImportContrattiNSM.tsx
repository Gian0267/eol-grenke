import { useState, useRef } from 'react';
import { Upload, Loader2, CheckCircle2, AlertTriangle, FileSpreadsheet, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = '';
const BACKOFFICE_USER_ID = '00000000-0000-0000-0000-000000000001';

interface DispositivoNsm {
  descrizione: string;
  quantita: number;
  seriale?: string;
  canone_unitario: number;
}

interface NsmContractPreview {
  contratto_nsm_id: string;
  contratto_grenke_id: string;
  ragione_sociale: string;
  piva: string;
  email: string;
  numero_mesi: number;
  canone_mensile: number;
  dispositivi: DispositivoNsm[];
  azione: 'CREA' | 'AGGIORNA';
  errors: string[];
}

interface NsmImportPreview {
  totalRows: number;
  righe_non_grenke: number;
  contratti: NsmContractPreview[];
  validi: number;
  errori: number;
}

function fmt(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getHeaders(): HeadersInit {
  const raw = localStorage.getItem('nsm_user');
  const id = raw ? (JSON.parse(raw).id as string) : BACKOFFICE_USER_ID;
  return { 'x-user-id': id };
}

export default function ImportContrattiNSM() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<NsmImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = async (f: File) => {
    setFile(f);
    setPreview(null);
    setDone(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch(`${API_BASE}/api/backoffice/import-nsm/preview`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: fd,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Errore anteprima');
      setPreview(body);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore caricamento file');
      setFile(null);
    } finally {
      setLoading(false);
    }
  };

  const conferma = async () => {
    if (!file) return;
    setConfirming(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API_BASE}/api/backoffice/import-nsm/confirm`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: fd,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Errore importazione');
      const msg = `Import completato: ${body.creati} contratti creati, ${body.aggiornati} aggiornati, ${body.scartati} scartati`;
      setDone(msg);
      toast.success(msg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore importazione');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-graphite mb-1">Importa contratti NSM</h1>
      <p className="text-sm text-stone mb-6">
        Export della piattaforma di noleggio: crea/aggiorna i contratti attivi con dispositivi,
        firmatario e canone reale. Va importato <strong>prima</strong> della lista Grenke.
        Vengono considerate solo le righe con finanziaria GRENKE.
      </p>

      {/* Upload */}
      <div
        className="border-2 border-dashed border-border rounded-xl p-10 text-center bg-card cursor-pointer hover:border-flex transition-colors mb-6"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        {loading ? (
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-flex" />
        ) : (
          <>
            <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-stone" />
            <p className="font-medium text-graphite">
              {file ? file.name : 'Trascina qui il file Excel della piattaforma NSM'}
            </p>
            <p className="text-sm text-stone mt-1">oppure clicca per selezionarlo (.xlsx)</p>
          </>
        )}
      </div>

      {/* Esito */}
      {done && (
        <div className="bg-ok border border-ok-border/40 rounded-xl p-4 mb-6 flex items-center gap-3 text-ok-text">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <p className="font-medium">{done}</p>
        </div>
      )}

      {/* Anteprima */}
      {preview && !done && (
        <>
          <div className="flex flex-wrap gap-3 mb-4 text-sm">
            <span className="px-3 py-1.5 rounded-full bg-paper border">{preview.totalRows} righe nel file</span>
            <span className="px-3 py-1.5 rounded-full bg-ok text-ok-text border border-ok-border/40">{preview.validi} contratti validi</span>
            {preview.errori > 0 && (
              <span className="px-3 py-1.5 rounded-full bg-err text-err-text border border-err-border/40">{preview.errori} con errori</span>
            )}
            {preview.righe_non_grenke > 0 && (
              <span className="px-3 py-1.5 rounded-full bg-paper border text-stone">{preview.righe_non_grenke} righe non-Grenke ignorate</span>
            )}
          </div>

          <div className="bg-card rounded-xl border border-border overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-paper/60 text-left">
                  <th className="px-4 py-3 font-medium text-stone">Azione</th>
                  <th className="px-4 py-3 font-medium text-stone whitespace-nowrap">Contratto NSM</th>
                  <th className="px-4 py-3 font-medium text-stone whitespace-nowrap">Contratto Grenke</th>
                  <th className="px-4 py-3 font-medium text-stone">Ragione Sociale</th>
                  <th className="px-4 py-3 font-medium text-stone text-right">Mesi</th>
                  <th className="px-4 py-3 font-medium text-stone text-right whitespace-nowrap">Canone calcolato</th>
                  <th className="px-4 py-3 font-medium text-stone">Dispositivi</th>
                </tr>
              </thead>
              <tbody>
                {preview.contratti.map((c, i) => (
                  <tr key={i} className={`border-b last:border-b-0 ${c.errors.length > 0 ? 'bg-err/40' : ''}`}>
                    <td className="px-4 py-3">
                      {c.errors.length > 0 ? (
                        <span className="inline-flex items-center gap-1 text-err-text text-xs font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" /> Errore
                        </span>
                      ) : (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${c.azione === 'CREA' ? 'bg-ok text-ok-text' : 'bg-outlier text-outlier-text'}`}>
                          {c.azione === 'CREA' ? 'Nuovo' : 'Aggiorna'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{c.contratto_nsm_id}</td>
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{c.contratto_grenke_id}</td>
                    <td className="px-4 py-3 font-medium max-w-[220px] truncate" title={c.ragione_sociale}>{c.ragione_sociale}</td>
                    <td className="px-4 py-3 text-right">{c.numero_mesi}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{fmt(c.canone_mensile)} €</td>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-1.5 text-xs text-stone">
                        <Smartphone className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>
                          {c.dispositivi.map((d, j) => (
                            <span key={j} className="block">
                              {d.quantita}× {d.descrizione} ({fmt(d.canone_unitario)} €/mese)
                            </span>
                          ))}
                        </span>
                      </div>
                      {c.errors.length > 0 && (
                        <ul className="mt-1 text-xs text-err-text list-disc list-inside">
                          {c.errors.map((e, j) => <li key={j}>{e}</li>)}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={conferma}
            disabled={confirming || preview.validi === 0}
            className="bg-flex text-white px-6 py-2.5 rounded-lg font-medium hover:bg-flex-dark transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Conferma importazione ({preview.validi} contratti)
          </button>
        </>
      )}
    </div>
  );
}
