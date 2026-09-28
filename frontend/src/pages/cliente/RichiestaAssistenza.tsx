/**
 * Richiesta di assistenza per un nuovo noleggio, aperta dalla proposta
 * commerciale.
 *
 * Non passa da /contatto, che registra una decisione di fine contratto: questa
 * e' un'altra cosa, il cliente chiede aiuto sul noleggio nuovo e sul contratto
 * in scadenza deve decidere lo stesso. La richiesta nasce con la sua origine e
 * finisce in "Clienti in attesa", dove la gestisce il backoffice.
 */
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Phone, ArrowLeft, Loader2, Check } from 'lucide-react';

export default function RichiestaAssistenza() {
  const { token } = useParams<{ token: string }>();
  const [nome, setNome] = useState('');
  const [telefono, setTelefono] = useState('');
  const [fascia, setFascia] = useState<'MATTINA' | 'POMERIGGIO' | 'INDIFFERENTE'>('INDIFFERENTE');
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [inviata, setInviata] = useState(false);

  const invia = async () => {
    setInvio(true);
    setErrore(null);
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
      setInviata(true);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Non riusciamo a registrare la richiesta.');
    } finally {
      setInvio(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#0B7FA6] text-white">
        <div className="max-w-2xl mx-auto px-4 py-5">
          <Link to={`/pratica/${token}`} className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm">
            <ArrowLeft className="w-4 h-4" /> Vai alla Sua area riservata
          </Link>
          <h1 className="text-xl font-semibold mt-3">La richiamiamo noi</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl border p-6">
          {inviata ? (
            <>
              <div className="flex items-center gap-2 text-emerald-700 mb-3">
                <Check className="w-5 h-5" />
                <span className="font-medium">Richiesta registrata</span>
              </div>
              <p className="text-gray-700">
                Un nostro consulente La contatter&agrave; entro 24 ore lavorative per configurare
                insieme il nuovo noleggio.
              </p>
              <Link to={`/pratica/${token}`} className="inline-block mt-5 text-[#0B7FA6] hover:underline text-sm">
                Vai alla Sua area riservata
              </Link>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-[#0B7FA6] mb-4">
                <Phone className="w-5 h-5" />
                <span className="font-medium">Ci lasci un recapito</span>
              </div>
              <p className="text-sm text-gray-600 mb-5">
                Un nostro consulente La richiama e configura il nuovo noleggio con Lei, senza
                che debba occuparsene da solo.
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
              {errore && <p className="text-sm text-red-600 mt-3">{errore}</p>}
              <button
                onClick={invia}
                disabled={invio || !nome.trim() || telefono.trim().length < 5}
                className="mt-5 inline-flex items-center gap-2 bg-[#0B7FA6] hover:bg-[#075F7D] text-white font-medium py-3 px-6 rounded-lg disabled:opacity-50"
              >
                {invio && <Loader2 className="w-4 h-4 animate-spin" />}
                Mi faccia ricontattare
              </button>
              <p className="text-xs text-gray-500 mt-4">
                La richiesta riguarda il nuovo noleggio. Per il contratto in scadenza la Sua scelta
                va comunque indicata nell&rsquo;area riservata.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
