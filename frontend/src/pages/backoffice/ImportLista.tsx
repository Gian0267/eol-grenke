import { useState, useRef } from 'react';
import {
  Upload, Loader2, CheckCircle2, AlertTriangle, FileSpreadsheet,
  Smartphone, ArrowRight, XCircle, SkipForward,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const API_BASE = '';
const BACKOFFICE_USER_ID = '00000000-0000-0000-0000-000000000001';

type RowStatus = 'PRONTO' | 'SENZA_NSM' | 'GIA_PRESENTE' | 'ERRORE';

interface Dispositivo {
  descrizione: string;
  quantita: number;
  seriale?: string;
  canone_unitario: number;
}

interface CombinedRow {
  index: number;
  status: RowStatus;
  contratto_grenke_id: string;
  contratto_nsm_id?: string;
  denominazione: string;
  origine?: string;
  data_scadenza?: string;
  pricing_grenke?: number;
  canone_mensile?: number;
  numero_mesi?: number;
  dispositivi?: Dispositivo[];
  pricing?: {
    monte_canoni: number;
    pricing_grenke: number;
    pricing_riacquisto: number;
    margine_lordo: number;
    valore_gift_card: number;
  };
  errors?: string[];
}

interface CombinedPreview {
  grenke_righe: number;
  nsm_contratti: number;
  nsm_scartati: number;
  pronti: number;
  senza_nsm: number;
  gia_presenti: number;
  errori: number;
  rows: CombinedRow[];
}

function fmt(n: number | undefined | null): string {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getHeaders(): HeadersInit {
  const raw = localStorage.getItem('nsm_user');
  const id = raw ? (JSON.parse(raw).id as string) : BACKOFFICE_USER_ID;
  return { 'x-user-id': id };
}

const STATUS_UI: Record<RowStatus, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  PRONTO: { label: 'Pronto', cls: 'bg-ok text-ok-text', icon: CheckCircle2 },
  SENZA_NSM: { label: 'Senza dati NSM', cls: 'bg-outlier text-outlier-text', icon: AlertTriangle },
  GIA_PRESENTE: { label: 'Già presente', cls: 'bg-paper text-stone', icon: SkipForward },
  ERRORE: { label: 'Errore', cls: 'bg-err text-err-text', icon: XCircle },
};

interface DropZoneProps {
  label: string;
  sublabel: string;
  file: File | null;
  onFile: (f: File) => void;
  highlight?: boolean;
}

function DropZone({ label, sublabel, file, onFile, highlight }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`border-2 border-dashed rounded-xl p-8 text-center bg-card cursor-pointer transition-colors ${
        highlight ? 'border-flex' : 'border-border hover:border-flex'
      } ${file ? 'border-ok-border bg-ok/30' : ''}`}
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
          e.target.value = '';
        }}
      />
      {file ? (
        <>
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-ok-text" />
          <p className="font-medium text-graphite">{file.name}</p>
          <p className="text-xs text-stone mt-1">clicca per sostituire</p>
        </>
      ) : (
        <>
          <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-stone" />
          <p className="font-medium text-graphite">{label}</p>
          <p className="text-sm text-stone mt-1">{sublabel}</p>
        </>
      )}
    </div>
  );
}

export default function ImportLista() {
  const navigate = useNavigate();
  const [fileGrenke, setFileGrenke] = useState<File | null>(null);
  const [fileNsm, setFileNsm] = useState<File | null>(null);
  const [preview, setPreview] = useState<CombinedPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const caricaPreview = async (grenke: File, nsm: File) => {
    setLoading(true);
    setPreview(null);
    setDone(null);
    try {
      const fd = new FormData();
      fd.append('grenke', grenke);
      fd.append('nsm', nsm);
      const res = await fetch(`${API_BASE}/api/backoffice/import/preview`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: fd,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Errore anteprima');
      setPreview(body);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore caricamento');
    } finally {
      setLoading(false);
    }
  };

  const onGrenke = (f: File) => {
    setFileGrenke(f);
    setPreview(null);
    setDone(null);
    if (fileNsm) caricaPreview(f, fileNsm);
  };

  const onNsm = (f: File) => {
    setFileNsm(f);
    if (fileGrenke) caricaPreview(fileGrenke, f);
  };

  const conferma = async () => {
    if (!fileGrenke || !fileNsm) return;
    setConfirming(true);
    try {
      const fd = new FormData();
      fd.append('grenke', fileGrenke);
      fd.append('nsm', fileNsm);
      const res = await fetch(`${API_BASE}/api/backoffice/import/confirm`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: fd,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Errore importazione');
      setDone(body.message);
      toast.success(body.message, { duration: 8000 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore importazione');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-graphite mb-1">Importazione contratti</h1>
      <p className="text-sm text-stone mb-6">
        Carica la <strong>lista Grenke</strong> e l'<strong>export della piattaforma NSM</strong>:
        il sistema abbina i contratti per numero Grenke e crea le pratiche complete
        (numero NSM, dispositivi, canone, scadenza, importo Grenke).
        I record NSM non presenti nella lista Grenke vengono scartati.
      </p>

      {/* Step 1 + 2: upload */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <p className="text-sm font-semibold text-graphite mb-2">1. File Grenke</p>
          <DropZone
            label="Trascina qui la lista Grenke"
            sublabel="contratti in scadenza (.xlsx)"
            file={fileGrenke}
            onFile={onGrenke}
          />
        </div>
        <div className={fileGrenke ? '' : 'opacity-40 pointer-events-none'}>
          <p className="text-sm font-semibold text-graphite mb-2">
            2. File NSM {fileGrenke && !fileNsm && <span className="text-flex font-bold">← ora carica questo</span>}
          </p>
          <DropZone
            label="Trascina qui l'export NSM"
            sublabel="contratti della piattaforma di noleggio (.xlsx)"
            file={fileNsm}
            onFile={onNsm}
            highlight={!!fileGrenke && !fileNsm}
          />
        </div>
      </div>

      {loading && (
        <div className="text-center py-10 text-stone">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          Abbinamento dei due file in corso...
        </div>
      )}

      {done && (
        <div className="bg-ok border border-ok-border/40 rounded-xl p-4 mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-ok-text">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <p className="font-medium">{done}</p>
          </div>
          <button
            onClick={() => navigate('/backoffice/pratiche')}
            className="shrink-0 bg-flex text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-flex-dark transition-colors flex items-center gap-2"
          >
            Vai alle pratiche <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Step 3: anteprima */}
      {preview && !done && (
        <>
          <div className="flex flex-wrap gap-2 mb-4 text-sm">
            <span className="px-3 py-1.5 rounded-full bg-ok text-ok-text border border-ok-border/40 font-medium">{preview.pronti} pronte</span>
            {preview.senza_nsm > 0 && (
              <span className="px-3 py-1.5 rounded-full bg-outlier text-outlier-text border border-outlier-border/40">{preview.senza_nsm} senza dati NSM</span>
            )}
            {preview.gia_presenti > 0 && (
              <span className="px-3 py-1.5 rounded-full bg-paper border text-stone">{preview.gia_presenti} già presenti</span>
            )}
            {preview.errori > 0 && (
              <span className="px-3 py-1.5 rounded-full bg-err text-err-text border border-err-border/40">{preview.errori} errori</span>
            )}
            {preview.nsm_scartati > 0 && (
              <span className="px-3 py-1.5 rounded-full bg-paper border text-stone">
                {preview.nsm_scartati} record NSM scartati (non in lista Grenke)
              </span>
            )}
          </div>

          <div className="bg-card rounded-xl border border-border overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-paper/60 text-left">
                  <th className="px-4 py-3 font-medium text-stone">Stato</th>
                  <th className="px-4 py-3 font-medium text-stone whitespace-nowrap">Contr. Grenke</th>
                  <th className="px-4 py-3 font-medium text-stone whitespace-nowrap">Contr. NSM</th>
                  <th className="px-4 py-3 font-medium text-stone">Denominazione</th>
                  <th className="px-4 py-3 font-medium text-stone">Origine</th>
                  <th className="px-4 py-3 font-medium text-stone whitespace-nowrap">Scadenza</th>
                  <th className="px-4 py-3 font-medium text-stone text-right">Canone</th>
                  <th className="px-4 py-3 font-medium text-stone text-right">Mesi</th>
                  <th className="px-4 py-3 font-medium text-stone">Dispositivi</th>
                  <th className="px-4 py-3 font-medium text-stone text-right whitespace-nowrap">Ns. costo</th>
                  <th className="px-4 py-3 font-medium text-stone text-right whitespace-nowrap">Riacquisto cliente</th>
                  <th className="px-4 py-3 font-medium text-stone text-right">Margine</th>
                  <th className="px-4 py-3 font-medium text-stone text-right whitespace-nowrap">Gift card</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => {
                  const ui = STATUS_UI[r.status];
                  const Icon = ui.icon;
                  return (
                    <tr key={r.index} className={`border-b last:border-b-0 ${r.status === 'ERRORE' ? 'bg-err/30' : r.status === 'SENZA_NSM' ? 'bg-outlier/30' : ''}`}>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${ui.cls}`}>
                          <Icon className="w-3.5 h-3.5" /> {ui.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{r.contratto_grenke_id}</td>
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{r.contratto_nsm_id || '—'}</td>
                      <td className="px-4 py-3 font-medium max-w-[200px]">
                        <span className="block truncate" title={r.denominazione}>{r.denominazione}</span>
                        {r.errors && r.errors.length > 0 && (
                          <ul className="mt-1 text-xs text-err-text list-disc list-inside font-normal">
                            {r.errors.map((e, j) => <li key={j}>{e}</li>)}
                          </ul>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">{r.origine || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{fmtDate(r.data_scadenza)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{r.canone_mensile !== undefined ? `${fmt(r.canone_mensile)} €` : '—'}</td>
                      <td className="px-4 py-3 text-right">{r.numero_mesi ?? '—'}</td>
                      <td className="px-4 py-3">
                        {r.dispositivi && r.dispositivi.length > 0 ? (
                          <div className="flex items-start gap-1.5 text-xs text-stone">
                            <Smartphone className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span>
                              {r.dispositivi.map((d, j) => (
                                <span key={j} className="block whitespace-nowrap">
                                  {d.quantita}× {d.descrizione}
                                </span>
                              ))}
                            </span>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{r.pricing_grenke !== undefined ? `${fmt(r.pricing_grenke)} €` : '—'}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{r.pricing ? `${fmt(r.pricing.pricing_riacquisto)} €` : '—'}</td>
                      <td className={`px-4 py-3 text-right whitespace-nowrap ${r.pricing && r.pricing.margine_lordo <= 0 ? 'text-err-text font-medium' : ''}`}>
                        {r.pricing ? `${fmt(r.pricing.margine_lordo)} €` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {r.pricing ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-ok text-ok-text">
                            {fmt(r.pricing.valore_gift_card)} €
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            onClick={conferma}
            disabled={confirming || preview.pronti === 0}
            className="bg-flex text-white px-6 py-2.5 rounded-lg font-medium hover:bg-flex-dark transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Conferma importazione ({preview.pronti} pratiche)
          </button>
        </>
      )}
    </div>
  );
}
