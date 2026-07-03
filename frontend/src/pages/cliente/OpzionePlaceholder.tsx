import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Construction } from 'lucide-react';

const nomi: Record<string, string> = {
  rinnovo: 'Rinnovo contratto',
  riacquisto: 'Acquisto bene',
  contatto: 'Contatto personalizzato',
  restituzione: 'Restituzione beni',
};

export default function OpzionePlaceholder() {
  const { token, opzione } = useParams<{ token: string; opzione: string }>();
  const titolo = nomi[opzione || ''] || 'Opzione';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1a3a52] text-white">
        <div className="max-w-4xl mx-auto px-4 py-5 flex items-center gap-3">
          <div className="bg-white rounded-lg px-2.5 py-1.5 flex items-center justify-center">
            <img src="/nsm-logo.png" alt="Noleggio Su Misura" className="h-6" />
          </div>
          <h1 className="text-lg font-semibold">{titolo}</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-xl border p-8 text-center max-w-md mx-auto">
          <Construction className="w-12 h-12 text-[#ca8a04] mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-[#1a3a52] mb-2">Pagina in costruzione</h2>
          <p className="text-gray-600 mb-6">
            La procedura per "{titolo.toLowerCase()}" sarà disponibile a breve.
          </p>
          <Link
            to={`/pratica/${token}`}
            className="inline-flex items-center gap-2 text-[#1a3a52] font-medium hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            Torna alle opzioni
          </Link>
        </div>
      </main>
    </div>
  );
}
