import { useState } from 'react';
import { Phone, X, Send, CheckCircle } from 'lucide-react';

const API_BASE = '';

interface WidgetChiamamiProps {
  token: string;
}

export default function WidgetChiamami({ token }: WidgetChiamamiProps) {
  const [aperto, setAperto] = useState(false);
  const [inviato, setInviato] = useState(false);
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome: '',
    telefono: '',
    giorno_preferito: '',
    fascia_oraria: 'INDIFFERENTE' as 'MATTINA' | 'POMERIGGIO' | 'INDIFFERENTE',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInvio(true);
    setErrore(null);

    try {
      const res = await fetch(`${API_BASE}/api/cliente/richiesta-contatto`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.errore || 'Errore nell\'invio');
      }

      setInviato(true);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Errore nell\'invio');
    } finally {
      setInvio(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Expanded card */}
      <div
        className={`absolute bottom-16 right-0 w-80 bg-white rounded-xl shadow-2xl border transition-all duration-300 origin-bottom-right ${
          aperto ? 'scale-100 opacity-100' : 'scale-90 opacity-0 pointer-events-none'
        }`}
      >
        <div className="bg-[#1a3a52] text-white rounded-t-xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4" />
            <span className="font-medium text-sm">Richiedi una chiamata</span>
          </div>
          <button
            onClick={() => setAperto(false)}
            className="text-white/70 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4">
          {inviato ? (
            <div className="text-center py-4">
              <CheckCircle className="w-12 h-12 text-[#16a34a] mx-auto mb-3" />
              <p className="font-semibold text-[#1a3a52]">Richiesta inviata!</p>
              <p className="text-sm text-gray-600 mt-1">Ti richiameremo entro 24 ore</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Nome *</label>
                <input
                  type="text"
                  required
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  className="w-full mt-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a52]/30 focus:border-[#1a3a52]"
                  placeholder="Il tuo nome"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Telefono *</label>
                <input
                  type="tel"
                  required
                  value={form.telefono}
                  onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                  className="w-full mt-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a52]/30 focus:border-[#1a3a52]"
                  placeholder="Es. 333 1234567"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Giorno preferito</label>
                <input
                  type="text"
                  value={form.giorno_preferito}
                  onChange={(e) => setForm({ ...form, giorno_preferito: e.target.value })}
                  className="w-full mt-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a52]/30 focus:border-[#1a3a52]"
                  placeholder="Es. Martedì pomeriggio"
                />
              </div>
              <fieldset>
                <legend className="text-xs font-medium text-gray-600 mb-1.5">Fascia oraria</legend>
                <div className="flex gap-2">
                  {(['MATTINA', 'POMERIGGIO', 'INDIFFERENTE'] as const).map((fascia) => {
                    const label = fascia === 'MATTINA' ? 'Mattina' : fascia === 'POMERIGGIO' ? 'Pomeriggio' : 'Indifferente';
                    return (
                      <label
                        key={fascia}
                        className={`flex-1 text-center text-xs py-1.5 rounded-lg border cursor-pointer transition-colors ${
                          form.fascia_oraria === fascia
                            ? 'bg-[#1a3a52] text-white border-[#1a3a52]'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="fascia_oraria"
                          value={fascia}
                          checked={form.fascia_oraria === fascia}
                          onChange={() => setForm({ ...form, fascia_oraria: fascia })}
                          className="sr-only"
                        />
                        {label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {errore && (
                <p className="text-xs text-red-600">{errore}</p>
              )}

              <button
                type="submit"
                disabled={invio}
                className="w-full bg-[#1a3a52] text-white text-sm font-medium py-2.5 rounded-lg hover:bg-[#1a3a52]/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {invio ? 'Invio in corso...' : (
                  <>
                    <Send className="w-4 h-4" />
                    Invia richiesta
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* FAB button */}
      <button
        onClick={() => { setAperto(!aperto); setErrore(null); }}
        className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 ${
          aperto
            ? 'bg-gray-600 hover:bg-gray-700 rotate-90'
            : 'bg-[#1a3a52] hover:bg-[#1a3a52]/90'
        }`}
      >
        {aperto ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <Phone className="w-6 h-6 text-white" />
        )}
      </button>
    </div>
  );
}
