import { useEffect, useReducer, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Download,
  Loader2,
  Shield,
  Mail,
  Smartphone,
  CreditCard,
  Landmark,
  MessageCircleQuestion,
  Phone,
} from 'lucide-react';

const API_BASE = '';

// ---- Types ----
interface PraticaData {
  cliente: { ragione_sociale: string };
  contratto: { numero_nsm: string; numero_grenke: string; data_scadenza: string; beni: string[]; stato: string };
  economica: { pricing_riacquisto: number; pricing_riacquisto_iva: number; pricing_riacquisto_totale: number };
}

type Step = 'STEP_A' | 'STEP_A_CONTATTO' | 'STEP_B_OTP_SCELTA' | 'STEP_B_OTP_VERIFICA' | 'STEP_C' | 'STEP_D' | 'STEP_E_SUCCESSO' | 'STEP_E_FALLIMENTO';

type Action =
  | { type: 'SCEGLI_CONTATTATEMI' }
  | { type: 'CONTATTO_INVIATO' }
  | { type: 'SCEGLI_PROCEDI' }
  | { type: 'OTP_INVIATO'; metodo: 'SMS' | 'EMAIL' }
  | { type: 'OTP_VERIFICATO'; decisione_id: string }
  | { type: 'SCEGLI_METODO'; metodo: 'FABRICK' | 'STRIPE'; session_id: string }
  | { type: 'PAGAMENTO_SUCCESSO'; pagamento_id: string; fattura_path: string }
  | { type: 'PAGAMENTO_FALLITO' }
  | { type: 'RIPROVA' };

interface State {
  step: Step;
  tcAccettati: boolean;
  metodoOtp: 'SMS' | 'EMAIL' | null;
  decisione_id: string | null;
  metodo_pagamento: 'FABRICK' | 'STRIPE' | null;
  session_id: string | null;
  pagamento_id: string | null;
  fattura_path: string | null;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SCEGLI_CONTATTATEMI':
      return { ...state, step: 'STEP_A_CONTATTO' };
    case 'CONTATTO_INVIATO':
      return { ...state, step: 'STEP_A_CONTATTO' };
    case 'SCEGLI_PROCEDI':
      return { ...state, step: 'STEP_B_OTP_SCELTA' };
    case 'OTP_INVIATO':
      return { ...state, step: 'STEP_B_OTP_VERIFICA', metodoOtp: action.metodo };
    case 'OTP_VERIFICATO':
      return { ...state, step: 'STEP_C', decisione_id: action.decisione_id };
    case 'SCEGLI_METODO':
      return { ...state, step: 'STEP_D', metodo_pagamento: action.metodo, session_id: action.session_id };
    case 'PAGAMENTO_SUCCESSO':
      return { ...state, step: 'STEP_E_SUCCESSO', pagamento_id: action.pagamento_id, fattura_path: action.fattura_path };
    case 'PAGAMENTO_FALLITO':
      return { ...state, step: 'STEP_E_FALLIMENTO' };
    case 'RIPROVA':
      return { ...state, step: 'STEP_C', session_id: null, metodo_pagamento: null };
    default:
      return state;
  }
}

const initialState: State = {
  step: 'STEP_A',
  tcAccettati: false,
  metodoOtp: null,
  decisione_id: null,
  metodo_pagamento: null,
  session_id: null,
  pagamento_id: null,
  fattura_path: null,
};

function formatEur(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---- Step labels for progress bar ----
const STEP_MAP: Record<Step, number> = {
  STEP_A: 1, STEP_A_CONTATTO: 1,
  STEP_B_OTP_SCELTA: 2, STEP_B_OTP_VERIFICA: 2,
  STEP_C: 3, STEP_D: 4,
  STEP_E_SUCCESSO: 5, STEP_E_FALLIMENTO: 5,
};

export default function FlussoRiacquisto() {
  const { token } = useParams<{ token: string }>();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [pratica, setPratica] = useState<PraticaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Contatto form
  const [contattoNome, setContattoNome] = useState('');
  const [contattoTel, setContattoTel] = useState('');
  const [contattoFascia, setContattoFascia] = useState<'MATTINA' | 'POMERIGGIO' | 'INDIFFERENTE'>('INDIFFERENTE');
  const [contattoInviato, setContattoInviato] = useState(false);

  // T&C + OTP
  const [tcAccettati, setTcAccettati] = useState(false);
  const [codiceOtp, setCodiceOtp] = useState('');
  const [countdown, setCountdown] = useState(600);
  const otpInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch pratica
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/cliente/pratica`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Errore caricamento')))
      .then(setPratica)
      .catch(err => setErrore(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  // OTP timer
  useEffect(() => {
    if (state.step === 'STEP_B_OTP_VERIFICA') {
      timerRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) { if (timerRef.current) clearInterval(timerRef.current); return 0; }
          return prev - 1;
        });
      }, 1000);
      otpInputRef.current?.focus();
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state.step]);

  // ---- API calls ----
  const apiCall = async (url: string, body: object) => {
    const res = await fetch(`${API_BASE}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.errore || 'Errore');
    return data;
  };

  const handleIniziaContattatemi = async () => {
    if (!contattoNome.trim() || !contattoTel.trim()) {
      setErrore('Nome e telefono sono obbligatori');
      return;
    }
    setSubmitting(true); setErrore(null);
    try {
      await apiCall('/api/cliente/decisione/riacquisto/inizia', {
        choice: 'contattatemi',
        nome: contattoNome,
        telefono: contattoTel,
        fascia_oraria: contattoFascia,
      });
      setContattoInviato(true);
      dispatch({ type: 'CONTATTO_INVIATO' });
    } catch (err: any) { setErrore(err.message); }
    finally { setSubmitting(false); }
  };

  const handleIniziaProcedi = async () => {
    setSubmitting(true); setErrore(null);
    try {
      await apiCall('/api/cliente/decisione/riacquisto/inizia', { choice: 'procedi' });
      dispatch({ type: 'SCEGLI_PROCEDI' });
    } catch (err: any) { setErrore(err.message); }
    finally { setSubmitting(false); }
  };

  const handleInviaOtp = async (metodo: 'SMS' | 'EMAIL') => {
    setSubmitting(true); setErrore(null);
    try {
      await apiCall('/api/cliente/decisione/riacquisto/richiedi-otp', { metodo });
      setCountdown(600);
      dispatch({ type: 'OTP_INVIATO', metodo });
    } catch (err: any) { setErrore(err.message); }
    finally { setSubmitting(false); }
  };

  const handleVerificaOtp = async () => {
    if (codiceOtp.length !== 6 || !state.metodoOtp) return;
    setSubmitting(true); setErrore(null);
    try {
      const data = await apiCall('/api/cliente/decisione/riacquisto/conferma-tc', {
        codice: codiceOtp,
        metodo: state.metodoOtp,
      });
      if (timerRef.current) clearInterval(timerRef.current);
      dispatch({ type: 'OTP_VERIFICATO', decisione_id: data.decisione_id });
    } catch (err: any) { setErrore(err.message); }
    finally { setSubmitting(false); }
  };

  const handleScegliMetodo = async (metodo: 'FABRICK' | 'STRIPE') => {
    setSubmitting(true); setErrore(null);
    try {
      const data = await apiCall('/api/cliente/decisione/riacquisto/scegli-metodo', { metodo });
      dispatch({ type: 'SCEGLI_METODO', metodo, session_id: data.session_id });
    } catch (err: any) { setErrore(err.message); }
    finally { setSubmitting(false); }
  };

  const handleSimulaPagamento = async (esito: 'success' | 'failure') => {
    if (!state.session_id || !state.metodo_pagamento) return;
    setSubmitting(true); setErrore(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/pagamenti/callback/${state.metodo_pagamento.toLowerCase()}/${state.session_id}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ esito }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.errore || 'Errore callback');

      if (data.stato === 'COMPLETATO') {
        dispatch({ type: 'PAGAMENTO_SUCCESSO', pagamento_id: data.pagamento_id || '', fattura_path: data.fattura_path || '' });
      } else {
        dispatch({ type: 'PAGAMENTO_FALLITO' });
      }
    } catch (err: any) { setErrore(err.message); }
    finally { setSubmitting(false); }
  };

  const formatCountdown = () => {
    const m = Math.floor(countdown / 60);
    const s = countdown % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // ---- Render ----
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

  const currentStep = STEP_MAP[state.step];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1a3a52] text-white">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to={`/pratica/${token}`} className="text-white/70 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Riacquisto del bene</h1>
            <p className="text-sm text-white/70">{pratica.cliente.ragione_sociale}</p>
          </div>
        </div>
      </header>

      {/* Progress bar */}
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <div className="flex items-center gap-1 mb-6">
          {[1, 2, 3, 4, 5].map(s => (
            <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${s <= currentStep ? 'bg-[#2563eb]' : 'bg-gray-200'}`} />
          ))}
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 pb-12">
        {errore && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm mb-4">{errore}</div>
        )}

        {/* ===== STEP A — Hai dubbi? ===== */}
        {state.step === 'STEP_A' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border p-6">
              <h2 className="font-semibold text-[#1a3a52] text-lg mb-4">Stai per acquistare:</h2>
              <ul className="space-y-2 mb-6">
                {pratica.contratto.beni.map((bene, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <CreditCard className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <span>{bene}</span>
                  </li>
                ))}
              </ul>

              <div className="bg-blue-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Prezzo netto</span>
                  <span className="font-medium">&euro; {formatEur(pratica.economica.pricing_riacquisto)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">IVA 22%</span>
                  <span className="font-medium">&euro; {formatEur(pratica.economica.pricing_riacquisto_iva)}</span>
                </div>
                <div className="border-t border-blue-200 pt-2 flex justify-between">
                  <span className="font-semibold text-[#1a3a52]">Totale</span>
                  <span className="font-bold text-[#2563eb] text-lg">&euro; {formatEur(pratica.economica.pricing_riacquisto_totale)}</span>
                </div>
              </div>
            </div>

            {/* Box Hai dubbi? */}
            <div className="bg-white rounded-xl border-2 border-blue-200 p-6">
              <div className="flex items-start gap-3 mb-4">
                <MessageCircleQuestion className="w-7 h-7 text-[#2563eb] flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-[#1a3a52] text-lg">Hai dubbi?</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Sappiamo che potresti volerci conoscere meglio prima di completare il pagamento.
                    Vuoi chiarire qualcosa prima di procedere?
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => dispatch({ type: 'SCEGLI_CONTATTATEMI' })}
                  className="border-2 border-[#ca8a04] text-[#ca8a04] font-medium py-3 px-4 rounded-lg hover:bg-yellow-50 transition-colors flex items-center justify-center gap-2"
                >
                  <Phone className="w-4 h-4" /> Si, contattatemi prima
                </button>
                <button
                  onClick={handleIniziaProcedi}
                  disabled={submitting}
                  className="bg-[#2563eb] text-white font-medium py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  No, procedo con il pagamento
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== STEP A — Form contatto ===== */}
        {state.step === 'STEP_A_CONTATTO' && !contattoInviato && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border p-6">
              <h2 className="font-semibold text-[#1a3a52] text-lg mb-4">Richiedi un contatto</h2>
              <p className="text-sm text-gray-600 mb-6">
                Un nostro consulente ti richiamera per chiarire tutti i tuoi dubbi prima del pagamento.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome referente *</label>
                  <input
                    type="text"
                    value={contattoNome}
                    onChange={e => setContattoNome(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:border-[#2563eb] focus:outline-none"
                    placeholder="Mario Rossi"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefono *</label>
                  <input
                    type="tel"
                    value={contattoTel}
                    onChange={e => setContattoTel(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:border-[#2563eb] focus:outline-none"
                    placeholder="+39 333 1234567"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Fascia oraria preferita</label>
                  <div className="flex gap-3">
                    {(['MATTINA', 'POMERIGGIO', 'INDIFFERENTE'] as const).map(f => (
                      <label key={f} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="fascia"
                          checked={contattoFascia === f}
                          onChange={() => setContattoFascia(f)}
                          className="w-4 h-4"
                        />
                        {f === 'MATTINA' ? 'Mattina' : f === 'POMERIGGIO' ? 'Pomeriggio' : 'Indifferente'}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleIniziaContattatemi}
              disabled={submitting}
              className="w-full bg-[#ca8a04] text-white py-3 rounded-lg font-medium hover:bg-yellow-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
              Invia richiesta di contatto
            </button>
          </div>
        )}

        {state.step === 'STEP_A_CONTATTO' && contattoInviato && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border p-6 text-center">
              <CheckCircle2 className="w-16 h-16 text-[#16a34a] mx-auto mb-4" />
              <h2 className="font-semibold text-[#1a3a52] text-xl mb-2">Richiesta inviata</h2>
              <p className="text-sm text-gray-600">
                Ti contatteremo a breve. Riceverai un'email per riprendere il pagamento quando vorrai.
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

        {/* ===== STEP B — T&C + OTP ===== */}
        {state.step === 'STEP_B_OTP_SCELTA' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border p-6">
              <h2 className="font-semibold text-[#1a3a52] text-lg mb-4">Termini e condizioni di riacquisto</h2>
              <div className="bg-gray-50 rounded-lg p-4 max-h-48 overflow-y-auto text-xs text-gray-600 leading-relaxed mb-4">
                <p className="mb-2"><strong>CONDIZIONI GENERALI DI RIACQUISTO BENI</strong></p>
                <p className="mb-2">Con la presente accettazione, il Cliente conferma la volonta di riacquistare i beni oggetto del contratto di locazione operativa, al prezzo indicato (acconto), con le seguenti condizioni:</p>
                <p className="mb-2">1. Il pagamento dell'acconto non comporta l'immediato trasferimento di proprieta del bene, che avverra alla data T+11 dalla scadenza del contratto Grenke.</p>
                <p className="mb-2">2. La fattura elettronica sara emessa tramite Sistema di Interscambio (SDI) dall'ERP aziendale entro i termini di legge.</p>
                <p className="mb-2">3. Alla conferma del pagamento verra generata una ricevuta di conferma (non fiscale).</p>
                <p className="mb-2">4. I beni vengono ceduti nello stato di fatto in cui si trovano al momento della scadenza del contratto.</p>
                <p className="mb-2">5. Smartcom Solutions Srl non presta garanzia sui beni ceduti, fatta salva la garanzia di legge per vizi occulti.</p>
                <p>6. Il presente accordo e soggetto alla legge italiana. Per qualsiasi controversia sara competente il Foro di Torino.</p>
              </div>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tcAccettati}
                  onChange={e => setTcAccettati(e.target.checked)}
                  className="mt-0.5 w-5 h-5 rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">
                  Dichiaro di aver letto e accettato le condizioni generali di riacquisto.
                </span>
              </label>
            </div>

            {tcAccettati && (
              <div className="bg-white rounded-xl border p-6 text-center">
                <Shield className="w-12 h-12 text-[#1a3a52] mx-auto mb-4" />
                <h2 className="font-semibold text-[#1a3a52] text-lg mb-2">Verifica la tua identita</h2>
                <p className="text-sm text-gray-600 mb-6">
                  Per confermare il riacquisto, inviamo un codice di verifica a 6 cifre.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    onClick={() => handleInviaOtp('EMAIL')}
                    disabled={submitting}
                    className="border-2 border-[#2563eb] rounded-xl p-5 text-center hover:bg-blue-50 transition-colors disabled:opacity-50"
                  >
                    <Mail className="w-8 h-8 text-[#2563eb] mx-auto mb-2" />
                    <p className="font-semibold text-[#2563eb]">Ricevi via Email</p>
                  </button>
                  <button
                    onClick={() => handleInviaOtp('SMS')}
                    disabled={submitting}
                    className="border-2 border-[#16a34a] rounded-xl p-5 text-center hover:bg-green-50 transition-colors disabled:opacity-50"
                  >
                    <Smartphone className="w-8 h-8 text-[#16a34a] mx-auto mb-2" />
                    <p className="font-semibold text-[#16a34a]">Ricevi via SMS</p>
                  </button>
                </div>

                {submitting && (
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mt-4">
                    <Loader2 className="w-4 h-4 animate-spin" /> Invio in corso...
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* STEP B — OTP verifica */}
        {state.step === 'STEP_B_OTP_VERIFICA' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border p-6 text-center">
              <h2 className="font-semibold text-[#1a3a52] text-lg mb-2">Inserisci il codice</h2>
              <p className="text-sm text-gray-600 mb-6">
                Abbiamo inviato un codice a 6 cifre via {state.metodoOtp === 'EMAIL' ? 'email' : 'SMS'}.
              </p>

              <input
                ref={otpInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={codiceOtp}
                onChange={e => { setCodiceOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setErrore(null); }}
                className="w-48 mx-auto block text-center text-3xl tracking-[0.5em] font-mono border-2 border-gray-300 rounded-lg py-3 focus:border-[#2563eb] focus:outline-none"
                placeholder="______"
              />

              <div className={`mt-4 text-sm ${countdown <= 60 ? 'text-red-500' : 'text-gray-500'}`}>
                {countdown > 0 ? `Codice valido per ${formatCountdown()}` : 'Codice scaduto'}
              </div>

              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700">
                Modalita test: usa il codice <strong>123456</strong>
              </div>
            </div>

            <button
              onClick={handleVerificaOtp}
              disabled={codiceOtp.length !== 6 || submitting}
              className="w-full bg-[#2563eb] text-white py-3 rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifica in corso...</> : 'Verifica codice'}
            </button>
          </div>
        )}

        {/* ===== STEP C — Scelta metodo pagamento ===== */}
        {state.step === 'STEP_C' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border p-6 text-center">
              <h2 className="font-semibold text-[#1a3a52] text-lg mb-2">Scegli il metodo di pagamento</h2>
              <p className="text-sm text-gray-600">
                Totale da pagare: <strong className="text-[#2563eb]">&euro; {formatEur(pratica.economica.pricing_riacquisto_totale)}</strong>
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => handleScegliMetodo('FABRICK')}
                disabled={submitting}
                className="bg-white border-2 border-[#2563eb] rounded-xl p-6 text-center hover:bg-blue-50 transition-colors disabled:opacity-50"
              >
                <Landmark className="w-10 h-10 text-[#2563eb] mx-auto mb-3" />
                <p className="font-bold text-[#2563eb] text-lg">Fabrick</p>
                <p className="text-sm text-gray-500 mt-1">Bonifico istantaneo</p>
                <p className="text-xs text-gray-400 mt-2">Open Banking PSD2</p>
              </button>

              <button
                onClick={() => handleScegliMetodo('STRIPE')}
                disabled={submitting}
                className="bg-white border-2 border-[#7c3aed] rounded-xl p-6 text-center hover:bg-purple-50 transition-colors disabled:opacity-50"
              >
                <CreditCard className="w-10 h-10 text-[#7c3aed] mx-auto mb-3" />
                <p className="font-bold text-[#7c3aed] text-lg">Stripe</p>
                <p className="text-sm text-gray-500 mt-1">Carta di credito / debito</p>
                <p className="text-xs text-gray-400 mt-2">Visa, Mastercard, Amex</p>
              </button>
            </div>

            {submitting && (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Inizializzazione pagamento...
              </div>
            )}
          </div>
        )}

        {/* ===== STEP D — Mock pagamento ===== */}
        {state.step === 'STEP_D' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border p-6 text-center">
              <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
                state.metodo_pagamento === 'FABRICK' ? 'bg-blue-100' : 'bg-purple-100'
              }`}>
                {state.metodo_pagamento === 'FABRICK'
                  ? <Landmark className="w-8 h-8 text-[#2563eb]" />
                  : <CreditCard className="w-8 h-8 text-[#7c3aed]" />
                }
              </div>
              <h2 className="font-semibold text-[#1a3a52] text-lg mb-1">
                {state.metodo_pagamento === 'FABRICK' ? 'Pagamento Fabrick' : 'Pagamento Stripe'}
              </h2>
              <p className="text-sm text-gray-500 mb-2">
                {state.metodo_pagamento === 'FABRICK' ? 'Bonifico istantaneo' : 'Carta di credito / debito'}
              </p>
              <p className="text-2xl font-bold text-[#1a3a52] mb-6">
                &euro; {formatEur(pratica.economica.pricing_riacquisto_totale)}
              </p>

              {/* Mock UI */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <p className="text-xs text-gray-400 mb-3 uppercase tracking-wider">Simulazione ambiente di test</p>
                {state.metodo_pagamento === 'FABRICK' ? (
                  <div className="space-y-2 text-sm text-left">
                    <div className="bg-white border rounded p-2"><span className="text-gray-400">IBAN:</span> IT60X0542811101000000123456</div>
                    <div className="bg-white border rounded p-2"><span className="text-gray-400">Beneficiario:</span> Smartcom Solutions Srl</div>
                    <div className="bg-white border rounded p-2"><span className="text-gray-400">Causale:</span> Riacquisto {pratica.contratto.numero_nsm}</div>
                  </div>
                ) : (
                  <div className="space-y-2 text-sm text-left">
                    <div className="bg-white border rounded p-2"><span className="text-gray-400">Numero carta:</span> 4242 4242 4242 4242</div>
                    <div className="flex gap-2">
                      <div className="bg-white border rounded p-2 flex-1"><span className="text-gray-400">Scadenza:</span> 12/28</div>
                      <div className="bg-white border rounded p-2 flex-1"><span className="text-gray-400">CVC:</span> 123</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleSimulaPagamento('success')}
                  disabled={submitting}
                  className="bg-[#16a34a] text-white py-3 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Simula successo
                </button>
                <button
                  onClick={() => handleSimulaPagamento('failure')}
                  disabled={submitting}
                  className="bg-[#dc2626] text-white py-3 rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  Simula fallimento
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== STEP E — Successo ===== */}
        {state.step === 'STEP_E_SUCCESSO' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border p-6 text-center">
              <CheckCircle2 className="w-16 h-16 text-[#16a34a] mx-auto mb-4" />
              <h2 className="font-semibold text-[#1a3a52] text-xl mb-2">Pagamento completato</h2>
              <p className="text-sm text-gray-600">
                Il pagamento di <strong>&euro; {formatEur(pratica.economica.pricing_riacquisto_totale)}</strong> e' stato registrato con successo.
              </p>
            </div>

            <a
              href={`${API_BASE}/api/cliente/decisione/pdf?token=${token}`}
              className="w-full bg-[#2563eb] text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5" /> Scarica ricevuta di pagamento
            </a>

            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-semibold text-[#1a3a52] mb-3">Prossimi passi</h3>
              <ul className="space-y-3 text-sm text-gray-700">
                <li className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                  <span>Riceverai la fattura elettronica tramite SDI entro i termini di legge.</span>
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                  <span>Il bene sara tuo alla scadenza del contratto (T+11 dalla data di scadenza).</span>
                </li>
              </ul>
            </div>

            <Link
              to={`/pratica/${token}`}
              className="block text-center text-sm text-[#2563eb] hover:underline"
            >
              Torna all'area cliente
            </Link>
          </div>
        )}

        {/* ===== STEP E — Fallimento ===== */}
        {state.step === 'STEP_E_FALLIMENTO' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border p-6 text-center">
              <XCircle className="w-16 h-16 text-[#dc2626] mx-auto mb-4" />
              <h2 className="font-semibold text-[#1a3a52] text-xl mb-2">Pagamento non riuscito</h2>
              <p className="text-sm text-gray-600">
                Il pagamento non e' andato a buon fine. Nessun addebito e' stato effettuato.
              </p>
            </div>

            <button
              onClick={() => dispatch({ type: 'RIPROVA' })}
              className="w-full bg-[#2563eb] text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              Riprova il pagamento
            </button>

            <Link
              to={`/pratica/${token}`}
              className="block text-center text-sm text-gray-500 hover:underline"
            >
              Torna all'area cliente
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
