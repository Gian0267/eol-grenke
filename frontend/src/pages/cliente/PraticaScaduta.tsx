import { Clock, Phone } from 'lucide-react';

export default function PraticaScaduta() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border p-8 max-w-md text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <Clock className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-[#1a3a52] mb-3">
          Termine scaduto
        </h1>
        <p className="text-gray-600 mb-6">
          Il termine per la scelta relativa al Suo contratto è scaduto.
          Per qualsiasi esigenza, La invitiamo a contattarci direttamente.
        </p>
        <a
          href="tel:0114557949"
          className="inline-flex items-center gap-2 bg-[#1a3a52] text-white font-medium py-3 px-6 rounded-lg hover:bg-[#1a3a52]/90 transition-colors"
        >
          <Phone className="w-5 h-5" />
          Contatta NSM — 011 4557949
        </a>
        <p className="text-xs text-gray-400 mt-8">
          Noleggio Su Misura — Smartcom Solutions Srl
        </p>
      </div>
    </div>
  );
}
