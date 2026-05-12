import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Phone, CheckCircle2, Loader2 } from 'lucide-react';

const API_BASE = '';

interface PraticaData {
  cliente: { ragione_sociale: string };
  contratto: { numero_nsm: string };
}

const FASCE_ORARIE = [
  { value: 'MATTINA', label: 'Mattina (9:00 - 12:30)' },
  { value: 'POMERIGGIO', label: 'Pomeriggio (14:00 - 18:00)' },
  { value: 'INDIFFERENTE', label: 'Indifferente' },
] as const;

const MODALITA = [
  { value: 'TELEFONO', label: 'Telefono' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'VIDEOCALL', label: 'Videocall' },
] as const;

export default function FlussoContatto() {
  const { token } = useParams<{ token: string }>();
  const [pratica, setPratica] = useState<PraticaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confermato, setConfermato] = useState(false);

  // Form
  const [fasciaOraria, setFasciaOraria] = useState('INDIFFERENTE');
  const [modalita, setModalita] = useState('TELEFONO');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/cliente/pratica`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Errore caricamento')))
      .then(setPratica)
      .catch(err => setErrore(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const inviaRichiesta = async () => {
    setErrore(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/cliente/decisione/contatto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          fascia_oraria: fasciaOraria,
          modalita_preferita: modalita,
          note: note || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.errore || 'Errore invio richiesta');
      setConfermato(true);
    } catch (err: any) {
      setErrore(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse text-gray-500">Caricamento...</div>
      </div>
    );
  }

  if (!pratica) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border p-8 max-w-md text-center">
          <p className="text-red-600">{errore || 'Impossibile caricare la pratica'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1a3a52] text-white">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to={`/pratica/${token}`} className="text-white/70 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Contatto personalizzato</h1>
            <p className="text-sm text-white/70">{pratica.cliente.ragione_sociale}</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-12">
        {!confermato ? (
          <div className="space-y-6">
            <div className="bg-yellow-50 border-2 border-[#ca8a04] rounded-xl p-5 text-center">
              <Phone className="w-10 h-10 text-[#ca8a04] mx-auto mb-2" />
              <p className="font-semibold text-[#ca8a04] text-lg">
                Parliamo delle tue esigenze
              </p>
              <p className="text-sm text-yellow-800 mt-1">
                Un nostro consulente ti contatterà per valutare insieme la soluzione migliore
              </p>
            </div>

            <div className="bg-white rounded-xl border p-6 space-y-5">
              {/* Fascia oraria */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Disponibilità oraria</label>
                <div className="space-y-2">
                  {FASCE_ORARIE.map(f => (
                    <label key={f.value} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio" name="fascia" value={f.value}
                        checked={fasciaOraria === f.value}
                        onChange={() => setFasciaOraria(f.value)}
                        className="w-4 h-4 text-[#ca8a04] border-gray-300"
                      />
                      <span className="text-sm">{f.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Modalità preferita */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Modalita di contatto preferita</label>
                <div className="flex gap-3">
                  {MODALITA.map(m => (
                    <label key={m.value} className={`flex-1 text-center cursor-pointer border-2 rounded-lg py-2.5 text-sm font-medium transition-colors ${modalita === m.value ? 'border-[#ca8a04] bg-yellow-50 text-[#ca8a04]' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      <input type="radio" name="modalita" value={m.value} checked={modalita === m.value} onChange={() => setModalita(m.value)} className="sr-only" />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Note <span className="text-gray-400">(opzionale)</span>
                </label>
                <textarea
                  value={note} onChange={e => setNote(e.target.value)}
                  rows={3}
                  placeholder="Es. vorrei valutare un mix di rinnovo e riacquisto, oppure ho bisogno di informazioni sui tempi..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-[#ca8a04] focus:outline-none resize-none"
                />
              </div>
            </div>

            {errore && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{errore}</div>
            )}

            <button
              onClick={inviaRichiesta}
              disabled={submitting}
              className="w-full bg-[#ca8a04] text-white py-3 rounded-lg font-medium hover:bg-yellow-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Invio in corso...</> : 'Invia richiesta'}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border p-6 text-center">
              <CheckCircle2 className="w-16 h-16 text-[#16a34a] mx-auto mb-4" />
              <h2 className="font-semibold text-[#1a3a52] text-xl mb-2">Richiesta inviata!</h2>
              <p className="text-sm text-gray-600">
                Ti contatteremo a breve secondo le tue preferenze.
              </p>
            </div>

            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-semibold text-[#1a3a52] mb-3">Riepilogo</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="text-gray-500">Fascia oraria</div>
                <div className="font-medium">{FASCE_ORARIE.find(f => f.value === fasciaOraria)?.label}</div>
                <div className="text-gray-500">Modalità</div>
                <div className="font-medium">{MODALITA.find(m => m.value === modalita)?.label}</div>
                {note && <>
                  <div className="text-gray-500">Note</div>
                  <div className="font-medium">{note}</div>
                </>}
              </div>
            </div>

            <Link
              to={`/pratica/${token}`}
              className="block w-full bg-[#1a3a52] text-white py-3 rounded-lg font-medium hover:bg-[#15304a] transition-colors text-center"
            >
              Torna all'area cliente
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
