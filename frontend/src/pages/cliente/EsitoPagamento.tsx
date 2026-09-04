/**
 * Pagina di ritorno da Stripe.
 *
 * Attenzione: questa pagina NON decide nulla. La conferma dell'incasso arriva
 * dal webhook checkout.session.completed, che il nostro server riceve anche se
 * il cliente chiude la scheda subito dopo aver pagato. Qui diamo solo un
 * riscontro visivo, senza promettere esiti che non abbiamo verificato.
 */
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';

export default function EsitoPagamento() {
  const [params] = useSearchParams();
  const annullato = params.get('stato') === 'annullato';

  return (
    <div className="min-h-screen bg-[#f4f4f2] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border max-w-lg w-full p-8 text-center">
        {annullato ? (
          <>
            <XCircle className="w-14 h-14 text-amber-500 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-[#1a3a52] mb-2">Pagamento non completato</h1>
            <p className="text-gray-600 mb-6">
              Hai interrotto il pagamento e non è stato addebitato nulla. Puoi riprendere
              quando vuoi dal link che trovi nella nostra email, oppure scegliere il bonifico bancario.
            </p>
          </>
        ) : (
          <>
            <CheckCircle2 className="w-14 h-14 text-green-600 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-[#1a3a52] mb-2">Grazie, pagamento ricevuto</h1>
            <p className="text-gray-600 mb-6">
              Stiamo registrando l'incasso: riceverai a breve un'email con la ricevuta in allegato.
              Se non dovesse arrivare entro qualche minuto, scrivici — l'operazione risulta comunque
              tracciata e non serve ripeterla.
            </p>
          </>
        )}
        <p className="text-sm text-gray-500">
          Noleggio Su Misura — Integra Solutions Srl<br />
          <a href="mailto:info@noleggiosumisura.it" className="text-[#2563eb]">info@noleggiosumisura.it</a> — 011 4557949
        </p>
        <Link to="/" className="hidden">home</Link>
      </div>
    </div>
  );
}
