/**
 * Invio della proposta di nuovo noleggio ai clienti Italiaonline.
 *
 * Campagna commerciale separata dal fine contratto. Parte solo da qui, a mano:
 * niente scheduler, e niente pulsante "manda a tutti" che non mostri prima chi
 * riceverebbe. L'operatore vede la lista, toglie chi non vuole, conferma.
 */
import { useState, useEffect } from 'react';
import { toast, Toaster } from 'sonner';
import { Send, Loader2, AlertTriangle } from 'lucide-react';

interface Destinatario {
  contratto_eol_id: string;
  ragione_sociale: string;
  email: string | null;
  origine: string;
  contratto_grenke_id: string;
  data_scadenza: string | null;
  ha_deciso: boolean;
  gia_inviata: boolean;
  opt_out: boolean;
  senza_email: boolean;
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const userId = sessionStorage.getItem('nsm_user_id');
  if (userId) headers['x-user-id'] = userId;
  return headers;
}

function formatData(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('it-IT') : '—';
}

export default function PropostaNuovoNoleggio() {
  const [righe, setRighe] = useState<Destinatario[]>([]);
  const [ambiente, setAmbiente] = useState('');
  const [esclusi, setEsclusi] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [invio, setInvio] = useState(false);
  const [conferma, setConferma] = useState(false);

  const carica = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/backoffice/proposta-noleggio/destinatari', { headers: getHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRighe(data.destinatari);
      setAmbiente(data.ambiente);
      setEsclusi(new Set());
    } catch {
      toast.error('Errore nel caricamento dei destinatari');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carica(); }, []);

  const bloccato = (r: Destinatario) => r.gia_inviata || r.opt_out || r.senza_email;
  const motivoBlocco = (r: Destinatario) =>
    r.gia_inviata ? 'proposta gia inviata' : r.opt_out ? 'opt-out' : r.senza_email ? 'senza email' : '';

  const selezionati = righe.filter(r => !bloccato(r) && !esclusi.has(r.contratto_eol_id));

  const toggle = (id: string) => {
    setEsclusi(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const invia = async () => {
    setInvio(true);
    try {
      const res = await fetch('/api/backoffice/proposta-noleggio/invia', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ contratti: selezionati.map(r => r.contratto_eol_id) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Errore');
      toast.success(data.messaggio);
      if (data.errori?.length) data.errori.forEach((e: string) => toast.error(e));
      setConferma(false);
      carica();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nell'invio");
    } finally {
      setInvio(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <Toaster position="top-right" richColors />
      <h1 className="text-2xl font-bold text-graphite mb-2">Proposta di nuovo noleggio</h1>
      <p className="text-sm text-stone mb-6">
        Comunicazione commerciale ai clienti Italiaonline: propone di attivare un nuovo noleggio,
        indipendentemente da come decideranno per il contratto in scadenza. Parte solo da qui, una
        volta per cliente. A chi non ha ancora deciso sul fine contratto la mail lo ricorda,
        rimandando all&apos;area riservata. Italiaonline ha autorizzato la proposta ai propri clienti
        il 24/09/2026.
      </p>

      {ambiente === 'TEST' && (
        <div className="mb-6 flex gap-3 items-start bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            Stai lavorando sull&apos;ambiente <strong>TEST</strong>: le mail non raggiungono i clienti,
            vengono dirottate sulla casella di raccolta. Per inviare davvero, passa alla vista LIVE.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-stone text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Caricamento…
        </div>
      ) : righe.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-8 text-center text-stone text-sm">
          Nessun cliente Italiaonline in questo ambiente.
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-sm font-semibold text-graphite">
                {selezionati.length} destinatari selezionati su {righe.length}
              </h2>
              <p className="text-xs text-stone mt-1">
                {righe.filter(bloccato).length > 0 &&
                  `${righe.filter(bloccato).length} esclusi dal sistema — `}
                {esclusi.size > 0 && `${esclusi.size} tolti a mano`}
              </p>
            </div>
            <button
              onClick={() => setConferma(true)}
              disabled={selezionati.length === 0}
              className="bg-flex text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-flex-dark disabled:opacity-50 flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              Invia la proposta
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-paper text-stone text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left w-10"></th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Contratto</th>
                  <th className="px-4 py-3 text-left">Scadenza</th>
                  <th className="px-4 py-3 text-left">Fine contratto</th>
                </tr>
              </thead>
              <tbody>
                {righe.map(r => {
                  const off = bloccato(r) || esclusi.has(r.contratto_eol_id);
                  return (
                    <tr key={r.contratto_eol_id} className={`border-t border-border ${off ? 'opacity-45' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={!off}
                          disabled={bloccato(r)}
                          onChange={() => toggle(r.contratto_eol_id)}
                          className="w-4 h-4 accent-[var(--color-flex)]"
                        />
                      </td>
                      <td className="px-4 py-3 text-graphite break-words max-w-xs">
                        {r.ragione_sociale}
                        {bloccato(r) && (
                          <span className="ml-2 text-xs text-stone">({motivoBlocco(r)})</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-stone break-all">{r.email || '—'}</td>
                      <td className="px-4 py-3 text-stone">{r.contratto_grenke_id}</td>
                      <td className="px-4 py-3 text-stone">{formatData(r.data_scadenza)}</td>
                      <td className="px-4 py-3">
                        {r.ha_deciso ? (
                          <span className="text-xs text-stone">deciso</span>
                        ) : (
                          <span className="text-xs text-amber-700 font-medium">non ha ancora deciso</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Conferma */}
      {conferma && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-xl border border-border p-6 max-w-md w-full">
            <h3 className="text-base font-semibold text-graphite mb-3">Confermi l&apos;invio?</h3>
            <p className="text-sm text-stone mb-2">
              Stai per mandare la proposta di nuovo noleggio a <strong>{selezionati.length} clienti</strong>
              {ambiente === 'LIVE' ? ' reali.' : ' (ambiente TEST: le mail restano in casa).'}
            </p>
            <p className="text-sm text-stone mb-5">
              {selezionati.filter(r => !r.ha_deciso).length} di loro non hanno ancora deciso sul fine contratto.
              L&apos;operazione non si puo&apos; annullare.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConferma(false)}
                className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-paper"
              >
                Annulla
              </button>
              <button
                onClick={invia}
                disabled={invio}
                className="px-4 py-2 text-sm rounded-lg bg-flex text-white hover:bg-flex-dark disabled:opacity-50 flex items-center gap-2"
              >
                {invio && <Loader2 className="w-4 h-4 animate-spin" />}
                Invia ora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
