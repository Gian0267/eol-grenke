/**
 * Quarta opzione: acquisto a prezzo ridotto attivando un nuovo noleggio.
 *
 * A differenza delle altre tre opzioni non c'e' una decisione di fine contratto
 * da registrare qui: il cliente dichiara che attivera' un nuovo noleggio e
 * riceve il link. Il link NON compare in nessun altro posto — ne' nelle mail ne'
 * nell'elenco delle opzioni — cosi' ogni registrazione sulla piattaforma resta
 * riconducibile a questo cliente e, tramite la pratica, al suo agente.
 *
 * Lo sconto NON e' concesso qui: la condizione e' la spedizione, che il
 * backoffice conferma quando avviene. La pagina lo dice senza giri di parole,
 * per non far credere al cliente di avere gia' il prezzo ridotto in tasca.
 */
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Sparkles, ArrowLeft, ExternalLink, Loader2, Check, Phone } from 'lucide-react';

interface Esito {
  link: string;
  data_limite: string;
  richiesto_il: string;
}

function formatEur(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function FlussoNuovoNoleggio() {
  const { token } = useParams<{ token: string }>();
  const [dati, setDati] = useState<{
    prezzo_pieno: number;
    prezzo_scontato: number;
    risparmio: number;
    data_limite: string | null;
    disponibile: boolean;
    richiesto_il: string | null;
  } | null>(null);
  const [esito, setEsito] = useState<Esito | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  // Assistenza: chi non vuole configurarsi il noleggio da solo lascia un recapito
  // e viene richiamato. E' una richiesta di contatto come le altre, con
  // un'origine sua, cosi' l'agente sa di cosa si parla prima di alzare il telefono.
  const [assistenza, setAssistenza] = useState<'chiusa' | 'form' | 'inviata'>('chiusa');
  const [nome, setNome] = useState('');
  const [telefono, setTelefono] = useState('');
  const [fascia, setFascia] = useState<'MATTINA' | 'POMERIGGIO' | 'INDIFFERENTE'>('INDIFFERENTE');
  const [invioAssistenza, setInvioAssistenza] = useState(false);
  const [erroreAssistenza, setErroreAssistenza] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/cliente/pratica?token=${encodeURIComponent(token || '')}`);
        if (!res.ok) throw new Error();
        const d = await res.json();
        const nn = d.nuovo_noleggio;
        setDati({
          prezzo_pieno: d.economica.prezzo_listino ?? d.economica.pricing_riacquisto,
          prezzo_scontato: nn?.prezzo_scontato ?? 0,
          risparmio: nn?.risparmio ?? 0,
          data_limite: nn?.data_limite ?? null,
          disponibile: !!nn?.disponibile,
          richiesto_il: nn?.richiesto_il ?? null,
        });
        // Gia' dichiarato in passato: il link si rimostra senza registrare nulla.
        if (nn?.richiesto_il && nn?.link) {
          setEsito({ link: nn.link, data_limite: nn.data_limite, richiesto_il: nn.richiesto_il });
        }
      } catch {
        setErrore('Non riusciamo a caricare i dati della pratica.');
      } finally {
        setCaricamento(false);
      }
    })();
  }, [token]);

  const dichiara = async () => {
    setInvio(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/cliente/decisione/nuovo-noleggio?token=${encodeURIComponent(token || '')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.errore || 'Non riusciamo a procedere.');
      setEsito({ link: d.link, data_limite: d.data_limite, richiesto_il: d.richiesto_il });
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Non riusciamo a procedere.');
    } finally {
      setInvio(false);
    }
  };

  const chiediAssistenza = async () => {
    setInvioAssistenza(true);
    setErroreAssistenza(null);
    try {
      const res = await fetch(`/api/cliente/richiesta-contatto?token=${encodeURIComponent(token || '')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome,
          telefono,
          fascia_oraria: fascia,
          origine: 'ASSISTENZA_NUOVO_NOLEGGIO',
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.errore || 'Non riusciamo a registrare la richiesta.');
      setAssistenza('inviata');
    } catch (e) {
      setErroreAssistenza(e instanceof Error ? e.message : 'Non riusciamo a registrare la richiesta.');
    } finally {
      setInvioAssistenza(false);
    }
  };

  const dataLimite = (dati?.data_limite || esito?.data_limite)
    ? new Date((dati?.data_limite || esito?.data_limite)!).toLocaleDateString('it-IT')
    : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1a3a52] text-white">
        <div className="max-w-3xl mx-auto px-4 py-5">
          <Link to={`/pratica/${token}`} className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm">
            <ArrowLeft className="w-4 h-4" /> Torna alle opzioni
          </Link>
          <h1 className="text-xl font-semibold mt-3">Acquista a prezzo ridotto con un nuovo noleggio</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {caricamento ? (
          <p className="flex items-center gap-2 text-gray-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Caricamento…
          </p>
        ) : !dati?.disponibile && !esito ? (
          <div className="bg-white rounded-xl border p-6">
            <p className="text-gray-700">
              Questa opzione non &egrave; al momento disponibile per il Suo contratto.
              {dataLimite && <> Il termine era il <strong>{dataLimite}</strong>.</>}
            </p>
            <Link to={`/pratica/${token}`} className="inline-block mt-4 text-[#0B7FA6] hover:underline text-sm">
              Torna alle opzioni
            </Link>
          </div>
        ) : esito ? (
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center gap-2 text-emerald-700 mb-4">
              <Check className="w-5 h-5" />
              <span className="font-medium">Richiesta registrata</span>
            </div>
            <p className="text-gray-700 mb-5">
              Da qui pu&ograve; configurare il nuovo noleggio. Perch&eacute; il prezzo di acquisto sia
              <strong> &euro; {formatEur(dati?.prezzo_scontato ?? 0)}</strong> invece di
              &euro; {formatEur(dati?.prezzo_pieno ?? 0)}, i dispositivi devono esserLe
              <strong> spediti entro il {new Date(esito.data_limite).toLocaleDateString('it-IT')}</strong>:
              fa fede la spedizione, non l&rsquo;ordine.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href={esito.link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-[#0B7FA6] hover:bg-[#075F7D] text-white font-medium py-3 px-6 rounded-lg"
              >
                Mi configuro da solo il nuovo noleggio <ExternalLink className="w-4 h-4" />
              </a>
              {assistenza === 'chiusa' && (
                <button
                  onClick={() => setAssistenza('form')}
                  className="inline-flex items-center justify-center gap-2 border border-[#0B7FA6] text-[#0B7FA6] hover:bg-cyan-50 font-medium py-3 px-6 rounded-lg"
                >
                  <Phone className="w-4 h-4" /> Desidero assistenza per un nuovo noleggio
                </button>
              )}
            </div>

            {assistenza === 'form' && (
              <div className="mt-5 border border-gray-200 rounded-lg p-5 bg-gray-50">
                <p className="text-sm text-gray-700 mb-4">
                  Ci lasci un recapito: un nostro consulente La richiama e configura il noleggio
                  con Lei.
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="text-sm text-gray-600">
                    Nome e cognome
                    <input
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
                      placeholder="Mario Rossi"
                    />
                  </label>
                  <label className="text-sm text-gray-600">
                    Telefono
                    <input
                      value={telefono}
                      onChange={(e) => setTelefono(e.target.value)}
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
                      placeholder="333 1234567"
                    />
                  </label>
                  <label className="text-sm text-gray-600 sm:col-span-2">
                    Quando preferisce essere chiamato
                    <select
                      value={fascia}
                      onChange={(e) => setFascia(e.target.value as typeof fascia)}
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 bg-white"
                    >
                      <option value="INDIFFERENTE">Indifferente</option>
                      <option value="MATTINA">Mattina</option>
                      <option value="POMERIGGIO">Pomeriggio</option>
                    </select>
                  </label>
                </div>
                {erroreAssistenza && <p className="text-sm text-red-600 mt-3">{erroreAssistenza}</p>}
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={chiediAssistenza}
                    disabled={invioAssistenza || !nome.trim() || telefono.trim().length < 5}
                    className="inline-flex items-center gap-2 bg-[#0B7FA6] hover:bg-[#075F7D] text-white font-medium py-2.5 px-5 rounded-lg disabled:opacity-50"
                  >
                    {invioAssistenza && <Loader2 className="w-4 h-4 animate-spin" />}
                    Richiedi assistenza
                  </button>
                  <button
                    onClick={() => setAssistenza('chiusa')}
                    className="text-sm text-gray-500 hover:text-gray-700 px-2"
                  >
                    Annulla
                  </button>
                </div>
              </div>
            )}

            {assistenza === 'inviata' && (
              <div className="mt-5 border border-emerald-200 bg-emerald-50 rounded-lg p-5">
                <p className="text-sm text-emerald-800 flex items-center gap-2">
                  <Check className="w-4 h-4" /> Richiesta di assistenza registrata: La
                  richiamiamo entro 24 ore lavorative.
                </p>
              </div>
            )}

            <p className="text-sm text-gray-500 mt-5">
              Le confermeremo il prezzo ridotto per email appena la spedizione risulta effettuata.
              Nel frattempo pu&ograve; tornare alle opzioni e completare la scelta sui beni attuali.
            </p>
            <Link to={`/pratica/${token}`} className="inline-block mt-3 text-[#0B7FA6] hover:underline text-sm">
              Torna alle opzioni
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center gap-2 text-[#0B7FA6] mb-4">
              <Sparkles className="w-5 h-5" />
              <span className="font-medium">Come funziona</span>
            </div>
            <ul className="text-gray-700 space-y-2 mb-6 list-disc list-inside">
              <li>Configura un nuovo noleggio di dispositivi.</li>
              <li>
                Se glieli spediamo entro il <strong>{dataLimite}</strong>, il prezzo di acquisto dei beni attuali
                Le costa <strong>&euro; {formatEur(dati?.prezzo_scontato ?? 0)}</strong> invece di
                &euro; {formatEur(dati?.prezzo_pieno ?? 0)}: risparmia
                <strong> &euro; {formatEur(dati?.risparmio ?? 0)}</strong>.
              </li>
              <li>Fa fede la data di spedizione, non quella dell&rsquo;ordine.</li>
            </ul>
            <p className="text-sm text-gray-500 mb-6">
              Proseguendo registriamo la Sua intenzione e Le mostriamo il link per configurare il
              noleggio. Il prezzo ridotto Le sar&agrave; confermato quando la spedizione risulta
              effettuata: fino ad allora vale il prezzo pieno.
            </p>
            {errore && <p className="text-sm text-red-600 mb-4">{errore}</p>}
            <button
              onClick={dichiara}
              disabled={invio}
              className="inline-flex items-center gap-2 bg-[#0B7FA6] hover:bg-[#075F7D] text-white font-medium py-3 px-6 rounded-lg disabled:opacity-50"
            >
              {invio && <Loader2 className="w-4 h-4 animate-spin" />}
              Voglio un nuovo noleggio
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
