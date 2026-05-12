import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Gift, Shield, Mail, Smartphone, Loader2, CheckCircle2, ArrowRight } from 'lucide-react';

const API_BASE = '';

interface PraticaData {
  cliente: { ragione_sociale: string };
  contratto: { numero_nsm: string; numero_grenke: string; data_scadenza: string; beni: string[]; monte_canoni: number };
  economica: { valore_gift_card: number; abilita_gift_card?: boolean };
}

interface ConfigPubblica {
  abilita_gift_card: boolean;
}

const TIPI_DEVICE = ['Apple MacBook', 'Apple iPad', 'PC Windows', 'Smartphone', 'Altro'] as const;
const DURATE = ['24', '36', '48'] as const;

function formatEur(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function FlussoRinnovo() {
  const { token } = useParams<{ token: string }>();
  const [step, setStep] = useState(1);
  const [pratica, setPratica] = useState<PraticaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [tipoDevice, setTipoDevice] = useState<string>('Apple MacBook');
  const [numDevice, setNumDevice] = useState(1);
  const [durata, setDurata] = useState<string>('36');
  const [budget, setBudget] = useState<string>('');
  const [note, setNote] = useState('');

  // OTP state
  const [metodoOtp, setMetodoOtp] = useState<'SMS' | 'EMAIL' | null>(null);
  const [codiceOtp, setCodiceOtp] = useState('');
  const [countdown, setCountdown] = useState(600);
  const otpInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Conferma
  const [valoreGiftCard, setValoreGiftCard] = useState(0);
  const [giftCardAbilitata, setGiftCardAbilitata] = useState(true);

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch(`${API_BASE}/api/cliente/pratica`, { headers })
        .then(r => r.ok ? r.json() : Promise.reject(new Error('Errore caricamento'))),
      fetch(`${API_BASE}/api/cliente/configurazione`, { headers })
        .then(r => r.ok ? r.json() as Promise<ConfigPubblica> : null)
        .catch(() => null),
    ])
      .then(([praticaData, configData]) => {
        setPratica(praticaData);
        setValoreGiftCard(praticaData.economica.valore_gift_card);
        // Priorità: config endpoint > campo in pratica > default true
        const flagAbilitato = configData?.abilita_gift_card ?? praticaData.economica.abilita_gift_card ?? true;
        setGiftCardAbilitata(flagAbilitato);
      })
      .catch(err => setErrore(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (step === 2 && metodoOtp) {
      timerRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) { if (timerRef.current) clearInterval(timerRef.current); return 0; }
          return prev - 1;
        });
      }, 1000);
      otpInputRef.current?.focus();
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [step, metodoOtp]);

  const inviaOtpERiepilogo = async (metodo: 'SMS' | 'EMAIL') => {
    setMetodoOtp(metodo);
    setErrore(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/cliente/decisione/rinnovo/inizia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tipo_device: tipoDevice,
          numero_device: numDevice,
          durata_desiderata: durata,
          budget_mensile: budget ? Number(budget) : undefined,
          note: note || undefined,
          metodo_otp: metodo,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.errore || 'Errore invio OTP');
      setCountdown(600);
    } catch (err: any) {
      setErrore(err.message);
      setMetodoOtp(null);
    } finally {
      setSubmitting(false);
    }
  };

  const confermaRinnovo = async () => {
    if (codiceOtp.length !== 6 || !metodoOtp) return;
    setErrore(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/cliente/decisione/rinnovo/conferma`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          codice: codiceOtp,
          metodo_otp: metodoOtp,
          tipo_device: tipoDevice,
          numero_device: numDevice,
          durata_desiderata: Number(durata),
          budget_mensile: budget ? Number(budget) : undefined,
          note: note || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.errore || 'Errore conferma');
      setValoreGiftCard(body.valore_gift_card || valoreGiftCard);
      if (timerRef.current) clearInterval(timerRef.current);
      setStep(3);
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
            <h1 className="text-lg font-semibold">Rinnovo contratto</h1>
            <p className="text-sm text-white/70">{pratica.cliente.ragione_sociale}</p>
          </div>
        </div>
      </header>

      {/* Progress */}
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <div className="flex items-center gap-1 mb-6">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${s <= step ? 'bg-[#16a34a]' : 'bg-gray-200'}`} />
          ))}
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 pb-12">
        {/* STEP 1 — Pre-qualificazione */}
        {step === 1 && (
          <div className="space-y-6">
            {/* Banner gift card — visibile solo se flag abilitato */}
            {giftCardAbilitata && pratica.economica.valore_gift_card > 0 && (
              <div className="bg-green-50 border-2 border-[#16a34a] rounded-xl p-5 text-center">
                <Gift className="w-10 h-10 text-[#16a34a] mx-auto mb-2" />
                <p className="font-bold text-[#16a34a] text-lg">
                  Rinnova e ricevi una gift card Smartcom Solutions
                </p>
                <p className="text-[#16a34a] text-2xl font-bold mt-1">
                  da &euro; {formatEur(pratica.economica.valore_gift_card)}
                </p>
                <p className="text-sm text-green-700 mt-1">alla firma del nuovo contratto FLEX!</p>
              </div>
            )}

            <div className="bg-white rounded-xl border p-6 space-y-5">
              <h2 className="font-semibold text-[#1a3a52] text-lg">Dicci le tue esigenze</h2>

              {/* Tipo device */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tipo device desiderato</label>
                <div className="space-y-2">
                  {TIPI_DEVICE.map(tipo => (
                    <label key={tipo} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio" name="tipo_device" value={tipo}
                        checked={tipoDevice === tipo}
                        onChange={() => setTipoDevice(tipo)}
                        className="w-4 h-4 text-[#16a34a] border-gray-300"
                      />
                      <span className="text-sm">{tipo}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Numero device */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Numero device desiderati</label>
                <input
                  type="number" min={1} value={numDevice}
                  onChange={e => setNumDevice(Math.max(1, Number(e.target.value)))}
                  className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-[#16a34a] focus:outline-none"
                />
              </div>

              {/* Durata */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Durata desiderata</label>
                <div className="flex gap-3">
                  {DURATE.map(d => (
                    <label key={d} className={`flex-1 text-center cursor-pointer border-2 rounded-lg py-2.5 text-sm font-medium transition-colors ${durata === d ? 'border-[#16a34a] bg-green-50 text-[#16a34a]' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      <input type="radio" name="durata" value={d} checked={durata === d} onChange={() => setDurata(d)} className="sr-only" />
                      {d} mesi
                    </label>
                  ))}
                </div>
              </div>

              {/* Budget */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Budget orientativo mensile <span className="text-gray-400">(opzionale)</span>
                </label>
                <div className="relative w-40">
                  <span className="absolute left-3 top-2 text-gray-400 text-sm">&euro;</span>
                  <input
                    type="number" min={0} value={budget}
                    onChange={e => setBudget(e.target.value)}
                    placeholder="es. 80"
                    className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:border-[#16a34a] focus:outline-none"
                  />
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Note <span className="text-gray-400">(opzionale)</span>
                </label>
                <textarea
                  value={note} onChange={e => setNote(e.target.value)}
                  rows={3} placeholder="Esigenze particolari, preferenze..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-[#16a34a] focus:outline-none resize-none"
                />
              </div>
            </div>

            {errore && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{errore}</div>
            )}

            <button
              onClick={() => setStep(2)}
              className="w-full bg-[#16a34a] text-white py-3 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
            >
              Procedi <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STEP 2 — Riepilogo + OTP */}
        {step === 2 && (
          <div className="space-y-6">
            {/* Riepilogo scelte */}
            <div className="bg-white rounded-xl border p-6">
              <h2 className="font-semibold text-[#1a3a52] text-lg mb-4">Riepilogo richiesta</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="text-gray-500">Tipo device</div>
                <div className="font-medium">{tipoDevice}</div>
                <div className="text-gray-500">Quantita</div>
                <div className="font-medium">{numDevice}</div>
                <div className="text-gray-500">Durata</div>
                <div className="font-medium">{durata} mesi</div>
                {budget && <>
                  <div className="text-gray-500">Budget mensile</div>
                  <div className="font-medium">&euro; {budget}</div>
                </>}
                {note && <>
                  <div className="text-gray-500">Note</div>
                  <div className="font-medium">{note}</div>
                </>}
              </div>
            </div>

            {!metodoOtp ? (
              <>
                <div className="bg-white rounded-xl border p-6 text-center">
                  <Shield className="w-12 h-12 text-[#16a34a] mx-auto mb-4" />
                  <h2 className="font-semibold text-[#1a3a52] text-lg mb-2">Conferma con OTP</h2>
                  <p className="text-sm text-gray-600">
                    Per confermare la richiesta di rinnovo, inviamo un codice di verifica a 6 cifre.
                  </p>
                </div>

                {errore && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{errore}</div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    onClick={() => inviaOtpERiepilogo('EMAIL')}
                    disabled={submitting}
                    className="bg-white border-2 border-[#2563eb] rounded-xl p-5 text-center hover:bg-blue-50 transition-colors disabled:opacity-50"
                  >
                    <Mail className="w-8 h-8 text-[#2563eb] mx-auto mb-2" />
                    <p className="font-semibold text-[#2563eb]">Ricevi via Email</p>
                  </button>
                  <button
                    onClick={() => inviaOtpERiepilogo('SMS')}
                    disabled={submitting}
                    className="bg-white border-2 border-[#16a34a] rounded-xl p-5 text-center hover:bg-green-50 transition-colors disabled:opacity-50"
                  >
                    <Smartphone className="w-8 h-8 text-[#16a34a] mx-auto mb-2" />
                    <p className="font-semibold text-[#16a34a]">Ricevi via SMS</p>
                  </button>
                </div>
                {submitting && (
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" /> Invio in corso...
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="bg-white rounded-xl border p-6 text-center">
                  <h2 className="font-semibold text-[#1a3a52] text-lg mb-2">Inserisci il codice</h2>
                  <p className="text-sm text-gray-600 mb-6">
                    Abbiamo inviato un codice a 6 cifre via {metodoOtp === 'EMAIL' ? 'email' : 'SMS'}.
                  </p>
                  <input
                    ref={otpInputRef}
                    type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                    value={codiceOtp}
                    onChange={e => { setCodiceOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setErrore(null); }}
                    className="w-48 mx-auto block text-center text-3xl tracking-[0.5em] font-mono border-2 border-gray-300 rounded-lg py-3 focus:border-[#16a34a] focus:outline-none"
                    placeholder="______"
                  />
                  <div className={`mt-4 text-sm ${countdown <= 60 ? 'text-red-500' : 'text-gray-500'}`}>
                    {countdown > 0 ? `Codice valido per ${formatCountdown()}` : 'Codice scaduto'}
                  </div>
                  <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700">
                    Modalita test: usa il codice <strong>123456</strong>
                  </div>
                </div>

                {errore && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{errore}</div>
                )}

                <button
                  onClick={confermaRinnovo}
                  disabled={codiceOtp.length !== 6 || submitting}
                  className="w-full bg-[#16a34a] text-white py-3 rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                >
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Conferma in corso...</> : 'Conferma rinnovo'}
                </button>

                <button
                  onClick={() => { setMetodoOtp(null); setCodiceOtp(''); setErrore(null); }}
                  className="w-full text-sm text-[#2563eb] hover:underline"
                >
                  Cambia metodo di verifica
                </button>
              </>
            )}

            <button
              onClick={() => { setStep(1); setMetodoOtp(null); setCodiceOtp(''); setErrore(null); }}
              className="w-full text-sm text-gray-500 hover:underline"
            >
              Torna indietro
            </button>
          </div>
        )}

        {/* STEP 3 — Conferma finale */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border p-6 text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Gift className="w-10 h-10 text-[#16a34a]" />
              </div>
              <h2 className="font-semibold text-[#1a3a52] text-xl mb-2">Richiesta di rinnovo inviata!</h2>
              <p className="text-sm text-gray-600">
                Un nostro agente ti contatterà entro <strong>5 giorni lavorativi</strong> per definire i dettagli del nuovo contratto FLEX.
              </p>
            </div>

            {/* Gift card reminder — visibile solo se flag abilitato */}
            {giftCardAbilitata && valoreGiftCard > 0 && (
              <div className="bg-green-50 border-2 border-[#16a34a] rounded-xl p-5 text-center">
                <Gift className="w-8 h-8 text-[#16a34a] mx-auto mb-2" />
                <p className="font-bold text-[#16a34a]">
                  Alla firma del nuovo contratto riceverai una gift card Smartcom Solutions
                </p>
                <p className="text-[#16a34a] text-2xl font-bold mt-1">
                  da &euro; {formatEur(valoreGiftCard)}
                </p>
                <p className="text-xs text-green-700 mt-1">Spendibile sul catalogo Smartcom Distribution</p>
              </div>
            )}

            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-semibold text-[#1a3a52] mb-3">Prossimi passi</h3>
              <ol className="space-y-3 text-sm text-gray-700">
                <li className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-green-100 text-[#16a34a] text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                  Un agente NSM ti contattera entro 5 giorni lavorativi
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-green-100 text-[#16a34a] text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                  Riceverai una proposta personalizzata per il nuovo contratto
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-green-100 text-[#16a34a] text-xs font-bold flex items-center justify-center flex-shrink-0">3</span>
                  {giftCardAbilitata
                    ? 'Alla firma riceverai la gift card Smartcom Solutions'
                    : 'Alla firma del nuovo contratto sarai subito operativo'}
                </li>
              </ol>
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
