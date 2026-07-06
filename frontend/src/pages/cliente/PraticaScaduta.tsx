import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock, Phone, FileText } from 'lucide-react';

const API_BASE = '';

interface ScadutaInfo {
  numero_contratto_grenke: string;
  ragione_sociale: string;
  data_fine_noleggio: string | null;
  telefono_grenke: string;
}

export default function PraticaScaduta() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [info, setInfo] = useState<ScadutaInfo | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/cliente/pratica-scaduta-info?token=${encodeURIComponent(token)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setInfo(data); })
      .catch(() => { /* senza info si mostra il testo generico */ });
  }, [token]);

  const telefono = info?.telefono_grenke || '02-30082525';
  const telHref = `tel:${telefono.replace(/[^\d+]/g, '')}`;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border p-8 max-w-md text-center">
        <div className="bg-white inline-flex items-center justify-center mb-5">
          <img src="/nsm-logo.png" alt="Noleggio Su Misura" className="h-9" />
        </div>
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <Clock className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-[#1a3a52] mb-3">
          Termini di gestione scaduti
        </h1>
        <p className="text-gray-600 mb-4">
          {info ? <>Gentile <strong>{info.ragione_sociale}</strong>, i</> : 'I'} termini per la
          gestione del fine noleggio tramite <strong>Smartcom Solutions Srl</strong> sono
          scaduti{info?.data_fine_noleggio ? <> (fine noleggio: <strong>{info.data_fine_noleggio}</strong>)</> : null}.
          Per la gestione del Suo fine noleggio La invitiamo a contattare
          direttamente <strong>Grenke Italia S.p.A.</strong>
        </p>

        <a
          href={telHref}
          className="inline-flex items-center gap-2 bg-[#1a3a52] text-white font-medium py-3 px-6 rounded-lg hover:bg-[#1a3a52]/90 transition-colors"
        >
          <Phone className="w-5 h-5" />
          Chiama Grenke Italia S.p.A. — {telefono}
        </a>

        {info && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6 text-left">
            <p className="text-xs font-semibold text-[#1a3a52] uppercase tracking-wide mb-1 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Tenga a portata di mano
            </p>
            <p className="text-sm text-gray-700">
              Numero di contratto Grenke:{' '}
              <span className="font-mono font-bold text-[#1a3a52] text-base">{info.numero_contratto_grenke}</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Le verrà richiesto dall'operatore telefonico di Grenke Italia S.p.A.
            </p>
          </div>
        )}
        {!info && (
          <p className="text-xs text-gray-500 mt-6">
            Tenga a portata di mano il numero di contratto Grenke (lo trova nelle
            comunicazioni ricevute): Le verrà richiesto dall'operatore telefonico.
          </p>
        )}

        <p className="text-xs text-gray-400 mt-8">
          Noleggio Su Misura — Smartcom Solutions Srl
        </p>
      </div>
    </div>
  );
}
