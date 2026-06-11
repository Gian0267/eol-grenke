import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Gift, Shield, Mail, Smartphone, Loader2, CheckCircle2,
  ArrowRight, ShoppingBag, Undo2, Package, AlertTriangle,
} from 'lucide-react';

const API_BASE = '';

interface PraticaData {
  cliente: { ragione_sociale: string };
  contratto: { numero_nsm: string; numero_grenke: string; data_scadenza: string; beni: string[]; monte_canoni: number };
  economica: {
    pricing_riacquisto: number;
    pricing_riacquisto_iva: number;
    pricing_riacquisto_totale: number;
    valore_gift_card: number;
    abilita_gift_card?: boolean;
  };
}

interface ConfigPubblica {
  abilita_gift_card: boolean;
}

const TIPI_DEVICE = ['Prodotti Apple', 'Prodotti Samsung', 'Computer Windows', 'Laptop Windows', 'Altro'] as const;
const DURATE = ['24', '36', '48'] as const;

const ISTRUZIONI_RESTITUZIONE = [
  'Disabilita "Trova il mio iPhone" (Apple) o Samsung Knox / Google FRP su tutti i dispositivi.',
  'Esegui il ripristino alle impostazioni di fabbrica (factory reset).',
  'Verifica l\'integrità: il dispositivo deve essere funzionante, senza danni, con tutti gli accessori originali.',
  'Imballa ogni dispositivo nel packaging originale o in un imballo adeguato.',
  'Spedisci a: Smartcom Solutions Srl, Via Tunisia 5, 10093 Collegno (TO). Spese a carico del cliente.',
];

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

  // Step 1 — Goods choice
  const [sceltaBeni, setSceltaBeni] = useState<'TENGO' | 'RESTITUISCO' | null>(null);
  const [confermaRestituzione, setConfermaRestituzione] = useState(false);

  // Step 2 — Renewal preferences
  const [tipoDevice, setTipoDevice] = useState<string>('Prodotti Apple');
  const [numDevice, setNumDevice] = useState(1);
  const [durata, setDurata] = useState<string>('36');
  const [note, setNote] = useState('');

  // Step 3 — OTP
  const [metodoOtp, setMetodoOtp] = useState<'EMAIL' | null>(null);
  const [codiceOtp, setCodiceOtp] = useState('');
  const [countdown, setCountdown] = useState(600);
  const otpInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Step 4 — Confirmation
  const [valoreGiftCard, setValoreGiftCard] = useState(0);
  const [giftCardAbilitata, setGiftCardAbilitata] = useState(true);
  const [risultatoSceltaBeni, setRisultatoSceltaBeni] = useState<'TENGO' | 'RESTITUISCO' | null>(null);
  const [pagamentoDifferito, setPagamentoDifferito] = useState<{ differito: boolean; data?: string } | null>(null);

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
        const flagAbilitato = configData?.abilita_gift_card ?? praticaData.economica.abilita_gift_card ?? true;
        setGiftCardAbilitata(flagAbilitato);
      })
      .catch(err => setErrore(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (step === 3 && metodoOtp) {
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

  const inviaOtp = async (metodo: 'EMAIL') => {
    setMetodoOtp(metodo);
    setErrore(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/cliente/decisione/rinnovo-completo/inizia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          scelta_beni: sceltaBeni,
          tipo_device: tipoDevice,
          numero_device: numDevice,
          durata_desiderata: durata,
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
    if (codiceOtp.length !== 6 || !metodoOtp || !sceltaBeni) return;
    setErrore(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/cliente/decisione/rinnovo-completo/conferma`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          codice: codiceOtp,
          metodo_otp: metodoOtp,
          scelta_beni: sceltaBeni,
          tipo_device: tipoDevice,
          numero_device: numDevice,
          durata_desiderata: Number(durata),
          note: note || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.errore || 'Errore conferma');
      setValoreGiftCard(body.valore_gift_card || valoreGiftCard);
      setRisultatoSceltaBeni(body.scelta_beni || sceltaBeni);
      if (body.pagamento_differito) {
        setPagamentoDifferito({ differito: true, data: body.data_pagamento });
      } else if (body.pagamento_immediato) {
        setPagamentoDifferito({ differito: false });
      }
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
            <h1 className="text-lg font-semibold">Rinnovo contratto</h1>
            <p className="text-sm text-white/70">{pratica.cliente.ragione_sociale}</p>
          </div>
        </div>
      </header>

      {/* Progress — 4 steps */}
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <div className="flex items-center gap-1 mb-6">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${s <= step ? 'bg-[#16a34a]' : 'bg-gray-200'}`} />
          ))}
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 pb-12">

        {/* ═══════════ STEP 1 — Scelta beni ═══════════ */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border p-6">
              <h2 className="font-semibold text-[#1a3a52] text-lg mb-2">Cosa vuoi fare con i beni attuali?</h2>
              <p className="text-sm text-gray-600 mb-5">
                Prima di procedere con un nuovo contratto, scegli se tenere o restituire i dispositivi attualmente in uso.
              </p>

              {/* Elenco beni */}
              {pratica.contratto.beni.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 mb-5">
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Beni in locazione:</p>
                  <ul className="text-sm text-gray-700 space-y-1">
                    {pratica.contratto.beni.map((b, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Package className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Card: Li tengo (recommended) */}
              <div
                onClick={() => { setSceltaBeni('TENGO'); setConfermaRestituzione(false); }}
                className={`cursor-pointer border-2 rounded-xl p-5 mb-4 transition-all ${
                  sceltaBeni === 'TENGO'
                    ? 'border-[#16a34a] bg-green-50 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                    sceltaBeni === 'TENGO' ? 'bg-[#16a34a] text-white' : 'bg-gray-100 text-gray-500'
                  }`}>
                    <ShoppingBag className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-[#1a3a52]">Li tengo</h3>
                      <span className="text-xs bg-[#16a34a] text-white px-2 py-0.5 rounded-full font-medium">Consigliato</span>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">
                      Acquista i beni attuali al prezzo di riacquisto e procedi con un nuovo contratto.
                    </p>
                    <div className="bg-white rounded-lg border border-green-200 p-3">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-xs text-gray-500">Netto</p>
                          <p className="font-bold text-[#1a3a52]">&euro; {formatEur(pratica.economica.pricing_riacquisto)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">IVA</p>
                          <p className="font-bold text-[#1a3a52]">&euro; {formatEur(pratica.economica.pricing_riacquisto_iva)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Totale</p>
                          <p className="font-bold text-[#16a34a]">&euro; {formatEur(pratica.economica.pricing_riacquisto_totale)}</p>
                        </div>
                      </div>
                      <p className="text-xs text-amber-700 bg-amber-50 rounded mt-2 px-2 py-1 text-center">
                        <AlertTriangle className="w-3 h-3 inline mr-1" />
                        NON paghi ora! Il pagamento ti sarà richiesto 21 giorni prima della scadenza.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card: Li restituisco */}
              <div
                onClick={() => setSceltaBeni('RESTITUISCO')}
                className={`cursor-pointer border-2 rounded-xl p-5 transition-all ${
                  sceltaBeni === 'RESTITUISCO'
                    ? 'border-[#2563eb] bg-blue-50 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                    sceltaBeni === 'RESTITUISCO' ? 'bg-[#2563eb] text-white' : 'bg-gray-100 text-gray-500'
                  }`}>
                    <Undo2 className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-[#1a3a52] mb-1">Li restituisco</h3>
                    <p className="text-sm text-gray-600 mb-3">
                      Restituisci i beni attuali e procedi con un nuovo contratto con nuovi dispositivi.
                    </p>

                    {sceltaBeni === 'RESTITUISCO' && (
                      <div className="space-y-3">
                        <div className="bg-white rounded-lg border border-blue-200 p-3">
                          <p className="text-xs font-semibold text-[#1a3a52] mb-2">Procedura di restituzione:</p>
                          <ol className="space-y-2">
                            {ISTRUZIONI_RESTITUZIONE.map((istr, i) => (
                              <li key={i} className="flex gap-2 text-xs text-gray-700">
                                <span className="w-5 h-5 rounded-full bg-blue-100 text-[#2563eb] text-xs font-bold flex items-center justify-center flex-shrink-0">
                                  {i + 1}
                                </span>
                                <span>{istr}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={confermaRestituzione}
                            onChange={e => setConfermaRestituzione(e.target.checked)}
                            className="mt-0.5 w-4 h-4 text-[#2563eb] border-gray-300 rounded"
                          />
                          <span className="text-xs text-gray-700">
                            Ho letto e accetto la procedura di restituzione. Mi impegno a completare tutti i passaggi entro la data di scadenza del contratto.
                          </span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {errore && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{errore}</div>
            )}

            <button
              onClick={() => { setErrore(null); setStep(2); }}
              disabled={!sceltaBeni || (sceltaBeni === 'RESTITUISCO' && !confermaRestituzione)}
              className="w-full bg-[#16a34a] text-white py-3 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Procedi con la richiesta di un nuovo contratto <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ═══════════ STEP 2 — Pre-qualificazione rinnovo ═══════════ */}
        {step === 2 && (
          <div className="space-y-6">
            {/* Banner gift card */}
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
              <h2 className="font-semibold text-[#1a3a52] text-lg">Dicci le tue esigenze per il nuovo contratto <span className="text-sm font-normal text-gray-500">(indicazioni non vincolanti)</span></h2>

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
              onClick={() => { setErrore(null); setStep(3); }}
              className="w-full bg-[#16a34a] text-white py-3 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
            >
              Procedi <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => { setStep(1); setErrore(null); }}
              className="w-full text-sm text-gray-500 hover:underline"
            >
              Torna indietro
            </button>
          </div>
        )}

        {/* ═══════════ STEP 3 — Riepilogo + OTP ═══════════ */}
        {step === 3 && (
          <div className="space-y-6">
            {/* Riepilogo completo */}
            <div className="bg-white rounded-xl border p-6">
              <h2 className="font-semibold text-[#1a3a52] text-lg mb-4">Riepilogo richiesta</h2>

              {/* Scelta beni */}
              <div className="mb-4 pb-4 border-b border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-1">Beni attuali</p>
                <div className="flex items-center gap-2">
                  {sceltaBeni === 'TENGO' ? (
                    <>
                      <ShoppingBag className="w-4 h-4 text-[#16a34a]" />
                      <span className="font-medium text-[#16a34a]">Li tengo (acquisto a &euro; {formatEur(pratica.economica.pricing_riacquisto_totale)} IVA incl.)</span>
                    </>
                  ) : (
                    <>
                      <Undo2 className="w-4 h-4 text-[#2563eb]" />
                      <span className="font-medium text-[#2563eb]">Li restituisco</span>
                    </>
                  )}
                </div>
              </div>

              {/* Preferenze rinnovo */}
              <p className="text-xs font-medium text-gray-500 mb-2">Nuovo contratto</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="text-gray-500">Tipo device</div>
                <div className="font-medium">{tipoDevice}</div>
                <div className="text-gray-500">Quantità</div>
                <div className="font-medium">{numDevice}</div>
                <div className="text-gray-500">Durata</div>
                <div className="font-medium">{durata} mesi</div>
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
                    Per confermare la scelta e la richiesta di rinnovo, inviamo un codice di verifica a 6 cifre.
                  </p>
                </div>

                {errore && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{errore}</div>
                )}

                <div className="max-w-xs mx-auto">
                  <button
                    onClick={() => inviaOtp('EMAIL')}
                    disabled={submitting}
                    className="bg-white border-2 border-[#2563eb] rounded-xl p-5 text-center hover:bg-blue-50 transition-colors disabled:opacity-50"
                  >
                    <Mail className="w-8 h-8 text-[#2563eb] mx-auto mb-2" />
                    <p className="font-semibold text-[#2563eb]">Ricevi via Email</p>
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
                    Abbiamo inviato un codice a 6 cifre via email.
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
              onClick={() => { setStep(2); setMetodoOtp(null); setCodiceOtp(''); setErrore(null); }}
              className="w-full text-sm text-gray-500 hover:underline"
            >
              Torna indietro
            </button>
          </div>
        )}

        {/* ═══════════ STEP 4 — Conferma finale ═══════════ */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border p-6 text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-10 h-10 text-[#16a34a]" />
              </div>
              <h2 className="font-semibold text-[#1a3a52] text-xl mb-2">Richiesta di rinnovo inviata!</h2>
              <p className="text-sm text-gray-600">
                Un nostro agente ti contatterà entro <strong>5 giorni lavorativi</strong> per definire i dettagli del nuovo contratto FLEX.
              </p>
            </div>

            {/* Riepilogo scelta beni */}
            <div className="bg-white rounded-xl border p-5">
              <h3 className="font-semibold text-[#1a3a52] mb-3 text-sm">Riepilogo delle tue scelte</h3>

              <div className={`rounded-lg p-4 mb-3 ${
                (risultatoSceltaBeni || sceltaBeni) === 'TENGO'
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-blue-50 border border-blue-200'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  {(risultatoSceltaBeni || sceltaBeni) === 'TENGO' ? (
                    <>
                      <ShoppingBag className="w-5 h-5 text-[#16a34a]" />
                      <span className="font-semibold text-[#16a34a]">Beni attuali: li tengo</span>
                    </>
                  ) : (
                    <>
                      <Undo2 className="w-5 h-5 text-[#2563eb]" />
                      <span className="font-semibold text-[#2563eb]">Beni attuali: li restituisco</span>
                    </>
                  )}
                </div>
                {(risultatoSceltaBeni || sceltaBeni) === 'TENGO' && (
                  <p className="text-xs text-gray-600 ml-7">
                    Prezzo riacquisto: &euro; {formatEur(pratica.economica.pricing_riacquisto_totale)} IVA incl.
                    {pagamentoDifferito?.differito && pagamentoDifferito.data && (
                      <> — Pagamento previsto il <strong>{new Date(pagamentoDifferito.data).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}</strong></>
                    )}
                  </p>
                )}
                {(risultatoSceltaBeni || sceltaBeni) === 'RESTITUISCO' && (
                  <p className="text-xs text-gray-600 ml-7">
                    Ricordati di seguire la procedura di restituzione entro la scadenza del contratto.
                  </p>
                )}
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Gift className="w-5 h-5 text-[#16a34a]" />
                  <span className="font-semibold text-[#1a3a52]">Nuovo contratto FLEX</span>
                </div>
                <p className="text-xs text-gray-600 ml-7">
                  {tipoDevice} × {numDevice} — {durata} mesi
                </p>
              </div>
            </div>

            {/* Gift card reminder */}
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
                  Un agente NSM ti contatterà entro 5 giorni lavorativi
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-green-100 text-[#16a34a] text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                  Riceverai una proposta personalizzata per il nuovo contratto
                </li>
                {(risultatoSceltaBeni || sceltaBeni) === 'TENGO' && (
                  <li className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-green-100 text-[#16a34a] text-xs font-bold flex items-center justify-center flex-shrink-0">3</span>
                    Riceverai il link per il pagamento dei beni 21 giorni prima della scadenza
                  </li>
                )}
                {(risultatoSceltaBeni || sceltaBeni) === 'RESTITUISCO' && (
                  <li className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-[#2563eb] text-xs font-bold flex items-center justify-center flex-shrink-0">3</span>
                    Completa la procedura di restituzione entro la data di scadenza
                  </li>
                )}
                <li className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-green-100 text-[#16a34a] text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {(risultatoSceltaBeni || sceltaBeni) ? '4' : '3'}
                  </span>
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
