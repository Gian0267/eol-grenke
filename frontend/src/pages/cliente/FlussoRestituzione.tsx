import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Download, Mail, Smartphone, Loader2, RotateCcw, Shield } from 'lucide-react';

const API_BASE = '';

const ISTRUZIONI = [
  { titolo: 'Disabilita Find My / Knox', testo: 'Disabilita "Trova il mio iPhone" (Apple) o Samsung Knox / Google FRP su tutti i dispositivi.' },
  { titolo: 'Factory reset', testo: 'Esegui il ripristino alle impostazioni di fabbrica (factory reset) di ogni dispositivo.' },
  { titolo: 'Verifica integrità', testo: 'Il dispositivo deve essere funzionante, privo di danni evidenti, e comprensivo di tutti gli accessori originali.' },
  { titolo: 'Imballa adeguatamente', testo: 'Imballa ogni dispositivo nel packaging originale o, in assenza, in un imballo adeguato.' },
  { titolo: 'Spedisci a Collegno', testo: 'Spedisci a: Smartcom Solutions Srl, Via Tunisia 5, 10093 Collegno (TO). Spese a carico del cliente.' },
];

interface PraticaData {
  cliente: { ragione_sociale: string };
  contratto: { numero_nsm: string; numero_grenke: string; data_scadenza: string; beni: string[] };
}

export default function FlussoRestituzione() {
  const { token } = useParams<{ token: string }>();
  const [step, setStep] = useState(1);
  const [pratica, setPratica] = useState<PraticaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [confermaLetto, setConfermaLetto] = useState(false);
  const [metodoOtp, setMetodoOtp] = useState<'SMS' | 'EMAIL' | null>(null);
  const [codiceOtp, setCodiceOtp] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(600);
  const [decisioneId, setDecisioneId] = useState<string | null>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/cliente/pratica`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Errore caricamento')))
      .then(setPratica)
      .catch(err => setErrore(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (step === 3) {
      timerRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      otpInputRef.current?.focus();
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [step]);

  const inviaOtp = async (metodo: 'SMS' | 'EMAIL') => {
    setMetodoOtp(metodo);
    setErrore(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/cliente/decisione/restituzione/inizia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ metodo }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.errore || 'Errore invio OTP');
      setCountdown(600);
      setStep(3);
    } catch (err: any) {
      setErrore(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const reinviaOtp = async () => {
    if (!metodoOtp) return;
    setErrore(null);
    setCodiceOtp('');
    setCountdown(600);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/cliente/decisione/restituzione/inizia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ metodo: metodoOtp }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.errore || 'Errore reinvio OTP');
    } catch (err: any) {
      setErrore(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const verificaOtp = async () => {
    if (codiceOtp.length !== 6 || !metodoOtp) return;
    setErrore(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/cliente/decisione/restituzione/conferma`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ codice: codiceOtp, metodo: metodoOtp }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.errore || 'Errore verifica OTP');
      setDecisioneId(body.decisione_id);
      if (timerRef.current) clearInterval(timerRef.current);
      setStep(4);
    } catch (err: any) {
      setErrore(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const formatCountdown = () => {
    const m = Math.floor(countdown / 60);
    const s = countdown % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
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
            <h1 className="text-lg font-semibold">Restituzione beni</h1>
            <p className="text-sm text-white/70">{pratica.cliente.ragione_sociale}</p>
          </div>
        </div>
      </header>

      {/* Progress bar */}
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <div className="flex items-center gap-1 mb-6">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${s <= step ? 'bg-[#1a3a52]' : 'bg-gray-200'}`} />
          ))}
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 pb-12">
        {/* STEP 1 — Conferma */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border p-6">
              <h2 className="font-semibold text-[#1a3a52] text-lg mb-4">Beni in restituzione</h2>
              <ul className="space-y-2">
                {pratica.contratto.beni.map((bene, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <RotateCcw className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span>{bene}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white rounded-xl border p-6">
              <h2 className="font-semibold text-[#1a3a52] text-lg mb-4">Istruzioni operative</h2>
              <ol className="space-y-4">
                {ISTRUZIONI.map((ist, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-7 h-7 rounded-full bg-[#1a3a52] text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-medium text-sm text-[#1a3a52]">{ist.titolo}</p>
                      <p className="text-sm text-gray-600">{ist.testo}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <label className="flex items-start gap-3 bg-white rounded-xl border p-4 cursor-pointer">
              <input
                type="checkbox"
                checked={confermaLetto}
                onChange={e => setConfermaLetto(e.target.checked)}
                className="mt-0.5 w-5 h-5 rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">
                Confermo di aver letto e compreso le istruzioni di restituzione e mi impegno a restituire i beni in stato integro e conforme.
              </span>
            </label>

            <button
              onClick={() => setStep(2)}
              disabled={!confermaLetto}
              className="w-full bg-[#1a3a52] text-white py-3 rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#15304a] transition-colors"
            >
              Procedi
            </button>
          </div>
        )}

        {/* STEP 2 — Scelta OTP */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border p-6 text-center">
              <Shield className="w-12 h-12 text-[#1a3a52] mx-auto mb-4" />
              <h2 className="font-semibold text-[#1a3a52] text-lg mb-2">Verifica la tua identità</h2>
              <p className="text-sm text-gray-600">
                Per confermare la restituzione, inviamo un codice di verifica a 6 cifre.
              </p>
            </div>

            {errore && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{errore}</div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => inviaOtp('EMAIL')}
                disabled={submitting}
                className="bg-white border-2 border-[#2563eb] rounded-xl p-5 text-center hover:bg-blue-50 transition-colors disabled:opacity-50"
              >
                <Mail className="w-8 h-8 text-[#2563eb] mx-auto mb-2" />
                <p className="font-semibold text-[#2563eb]">Ricevi via Email</p>
                <p className="text-xs text-gray-500 mt-1">{pratica.cliente.ragione_sociale}</p>
              </button>

              <button
                onClick={() => inviaOtp('SMS')}
                disabled={submitting}
                className="bg-white border-2 border-[#16a34a] rounded-xl p-5 text-center hover:bg-green-50 transition-colors disabled:opacity-50"
              >
                <Smartphone className="w-8 h-8 text-[#16a34a] mx-auto mb-2" />
                <p className="font-semibold text-[#16a34a]">Ricevi via SMS</p>
                <p className="text-xs text-gray-500 mt-1">Sul numero registrato</p>
              </button>
            </div>

            {submitting && (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Invio in corso...
              </div>
            )}
          </div>
        )}

        {/* STEP 3 — Inserimento OTP */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border p-6 text-center">
              <h2 className="font-semibold text-[#1a3a52] text-lg mb-2">Inserisci il codice</h2>
              <p className="text-sm text-gray-600 mb-6">
                Abbiamo inviato un codice a 6 cifre via {metodoOtp === 'EMAIL' ? 'email' : 'SMS'}.
              </p>

              <input
                ref={otpInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={codiceOtp}
                onChange={e => { setCodiceOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setErrore(null); }}
                className="w-48 mx-auto block text-center text-3xl tracking-[0.5em] font-mono border-2 border-gray-300 rounded-lg py-3 focus:border-[#1a3a52] focus:outline-none"
                placeholder="______"
              />

              <div className={`mt-4 text-sm ${countdown <= 60 ? 'text-red-500' : 'text-gray-500'}`}>
                {countdown > 0
                  ? `Codice valido per ${formatCountdown()}`
                  : 'Codice scaduto — richiedine uno nuovo'}
              </div>

              {/* Hint test mode */}
              {import.meta.env.DEV && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700">
                  Modalità test: usa il codice <strong>123456</strong>
                </div>
              )}
            </div>

            {errore && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{errore}</div>
            )}

            <button
              onClick={verificaOtp}
              disabled={codiceOtp.length !== 6 || submitting}
              className="w-full bg-[#1a3a52] text-white py-3 rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#15304a] transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifica in corso...</> : 'Verifica codice'}
            </button>

            <button
              onClick={reinviaOtp}
              disabled={submitting}
              className="w-full text-sm text-[#2563eb] hover:underline disabled:opacity-50"
            >
              Non hai ricevuto il codice? Reinvia
            </button>
          </div>
        )}

        {/* STEP 4 — Conferma finale */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border p-6 text-center">
              <CheckCircle2 className="w-16 h-16 text-[#16a34a] mx-auto mb-4" />
              <h2 className="font-semibold text-[#1a3a52] text-xl mb-2">Restituzione confermata</h2>
              <p className="text-sm text-gray-600">
                La tua decisione è stata registrata. Riceverai un'email di conferma con il verbale in allegato.
              </p>
            </div>

            <a
              href={`${API_BASE}/api/cliente/decisione/pdf?token=${token}`}
              className="w-full bg-[#1a3a52] text-white py-3 rounded-lg font-medium hover:bg-[#15304a] transition-colors flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5" /> Scarica verbale di restituzione
            </a>

            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-semibold text-[#1a3a52] mb-3">Prossimi passi</h3>
              <ol className="space-y-3">
                {ISTRUZIONI.map((ist, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-gray-700">{ist.titolo}</span>
                  </li>
                ))}
              </ol>
              <p className="text-sm text-gray-500 mt-4 border-t pt-3">
                Hai tempo fino a <strong>10 giorni dalla scadenza del contratto</strong> per consegnare i beni.
              </p>
            </div>

            <Link
              to={`/pratica/${token}`}
              className="block text-center text-sm text-[#2563eb] hover:underline"
            >
              Torna all'area cliente
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
