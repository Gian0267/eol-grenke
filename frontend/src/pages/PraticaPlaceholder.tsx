import { useParams } from 'react-router-dom';

export default function PraticaPlaceholder() {
  const { token } = useParams<{ token: string }>();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-lg border p-8 max-w-lg text-center">
        <div className="text-5xl mb-4">&#x1F6A7;</div>
        <h1 className="text-xl font-bold text-[#1a3a52] mb-3">Area Cliente — In costruzione</h1>
        <p className="text-gray-600 mb-4">
          Questa pagina sarà disponibile nella prossima versione del portale.
        </p>
        <div className="bg-gray-50 rounded-lg p-4 text-left">
          <p className="text-xs text-gray-500 mb-1">Token di accesso:</p>
          <p className="text-xs font-mono text-gray-700 break-all">{token}</p>
        </div>
        <p className="text-sm text-gray-400 mt-6">
          Noleggio Su Misura — Smartcom Solutions Srl
        </p>
      </div>
    </div>
  );
}
