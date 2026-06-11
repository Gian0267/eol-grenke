import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { differenceInCalendarDays, format } from 'date-fns';
import { it } from 'date-fns/locale';
import { ArrowRight, Gift, ShoppingCart, Phone, RotateCcw, Clock, Building2 } from 'lucide-react';

const API_BASE = '';

interface PraticaData {
  cliente: {
    ragione_sociale: string;
    piva: string;
    citta: string | null;
  };
  contratto: {
    numero_nsm: string;
    numero_grenke: string;
    data_scadenza: string;
    beni: string[];
    monte_canoni: number;
    numero_mesi: number;
    stato: string;
  };
  economica: {
    pricing_riacquisto: number;
    pricing_riacquisto_iva: number;
    pricing_riacquisto_totale: number;
    valore_gift_card: number;
    abilita_gift_card?: boolean;
  };
  deadline_decisione: string;
}

interface ConfigPubblica {
  abilita_gift_card: boolean;
  titolo_opzione_rinnovo: string;
  desc_opzione_rinnovo: string;
  titolo_opzione_riacquisto: string;
  desc_opzione_riacquisto: string;
  titolo_opzione_contatto: string;
  desc_opzione_contatto: string;
  titolo_opzione_restituzione: string;
  desc_opzione_restituzione: string;
  testo_widget_chiamami: string;
  testo_avviso_proroga: string;
}

function formatEur(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AreaPratica() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<PraticaData | null>(null);
  const [config, setConfig] = useState<ConfigPubblica | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;

    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch(`${API_BASE}/api/cliente/pratica`, { headers }).then(async (res) => {
        if (res.ok) return res.json();
        const body = await res.json().catch(() => ({}));
        if (body.codice === 'TOKEN_SCADUTO') {
          navigate('/pratica/scaduta', { replace: true });
          return null;
        }
        throw new Error(body.messaggio || 'Errore nel caricamento');
      }),
      fetch(`${API_BASE}/api/cliente/configurazione`, { headers })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
    ])
      .then(([praticaJson, configJson]) => {
        if (praticaJson) setData(praticaJson);
        if (configJson) setConfig(configJson);
      })
      .catch((err) => setErrore(err.message))
      .finally(() => setLoading(false));
  }, [token, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Caricamento pratica...</div>
      </div>
    );
  }

  if (errore || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border p-8 max-w-md text-center">
          <div className="text-5xl mb-4">&#x274C;</div>
          <h1 className="text-xl font-bold text-[#1a3a52] mb-3">Accesso non valido</h1>
          <p className="text-gray-600">{errore || 'Impossibile caricare i dati della pratica.'}</p>
          <p className="text-sm text-gray-400 mt-6">Contatta NSM al 011 4557949</p>
        </div>
      </div>
    );
  }

  const deadline = new Date(data.deadline_decisione);
  const giorniMancanti = differenceInCalendarDays(deadline, new Date());
  const deadlineColor =
    giorniMancanti > 30 ? 'text-green-600 bg-green-50' :
    giorniMancanti > 15 ? 'text-yellow-600 bg-yellow-50' :
    'text-red-600 bg-red-50';

  // Determina se mostrare il badge Premio Fedeltà (Sconto Copertura Bronze):
  // priorità: config.abilita_gift_card (dal nuovo endpoint), fallback su data.economica.abilita_gift_card
  const giftCardAbilitata = config?.abilita_gift_card ?? data.economica.abilita_gift_card ?? true;

  const rinnovoBadges: { testo: string; stile: string }[] = [];
  if (giftCardAbilitata && data.economica.valore_gift_card > 0) {
    rinnovoBadges.push({ testo: `Premio Fedeltà € ${formatEur(data.economica.valore_gift_card)}`, stile: 'bg-green-100 text-green-800' });
  }
  rinnovoBadges.push({ testo: 'Consigliata', stile: 'bg-[#16a34a] text-white' });

  const opzioni = [
    {
      id: 'rinnovo',
      titolo: config?.titolo_opzione_rinnovo || 'Fai un nuovo contratto con noi',
      descrizione: config?.desc_opzione_rinnovo || 'Prosegui con un nuovo contratto FLEX scegliendo dispositivi, quantità e durata in base alle tue esigenze: grazie al Premio Fedeltà ricevi uno sconto sulla copertura danni accidentali BRONZE.',
      icona: <Gift className="w-6 h-6" />,
      colore: 'border-[#16a34a]',
      bgColore: 'bg-green-50',
      testoColore: 'text-[#16a34a]',
      btnColore: 'bg-[#16a34a] hover:bg-green-700',
      badges: rinnovoBadges,
    },
    {
      id: 'riacquisto',
      titolo: config?.titolo_opzione_riacquisto || 'Prenota l\'acquisto del bene',
      descrizione: config?.desc_opzione_riacquisto || 'Prenota l\'acquisto dei beni in locazione al prezzo di acquisto indicato. NON paghi ora! Il pagamento ti sarà richiesto 21 giorni prima della scadenza del contratto.',
      icona: <ShoppingCart className="w-6 h-6" />,
      colore: 'border-[#2563eb]',
      bgColore: 'bg-blue-50',
      testoColore: 'text-[#2563eb]',
      btnColore: 'bg-[#2563eb] hover:bg-blue-700',
      badges: [
        { testo: `€ ${formatEur(data.economica.pricing_riacquisto)} + IVA`, stile: 'bg-blue-100 text-blue-800' },
      ],
    },
    {
      id: 'contatto',
      titolo: config?.titolo_opzione_contatto || 'Contatto personalizzato',
      descrizione: config?.desc_opzione_contatto || 'Hai dubbi o esigenze particolari? Un nostro consulente ti ricontatterà.',
      icona: <Phone className="w-6 h-6" />,
      colore: 'border-[#ca8a04]',
      bgColore: 'bg-yellow-50',
      testoColore: 'text-[#ca8a04]',
      btnColore: 'bg-[#ca8a04] hover:bg-yellow-700',
      badges: [],
    },
    {
      id: 'restituzione',
      titolo: config?.titolo_opzione_restituzione || 'Restituisci i beni',
      descrizione: config?.desc_opzione_restituzione || 'Concludi il contratto e restituisci i beni alla società di leasing.',
      icona: <RotateCcw className="w-6 h-6" />,
      colore: 'border-[#6b7280]',
      bgColore: 'bg-gray-50',
      testoColore: 'text-[#6b7280]',
      btnColore: 'bg-[#6b7280] hover:bg-gray-600',
      badges: [],
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#1a3a52] text-white">
        <div className="max-w-4xl mx-auto px-4 py-5 flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center font-bold text-lg">
            NSM
          </div>
          <div>
            <h1 className="text-lg font-semibold">Area Cliente — Fine Contratto</h1>
            <p className="text-sm text-white/70">{data.cliente.ragione_sociale}</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6 pb-24">
        {/* Card dati pratica */}
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-[#1a3a52]" />
            <h2 className="font-semibold text-[#1a3a52]">Dati del contratto</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Contratto NSM</span>
              <p className="font-medium">{data.contratto.numero_nsm}</p>
            </div>
            <div>
              <span className="text-gray-500">Contratto Grenke</span>
              <p className="font-medium">{data.contratto.numero_grenke}</p>
            </div>
            <div>
              <span className="text-gray-500">Scadenza contratto</span>
              <p className="font-medium">
                {format(new Date(data.contratto.data_scadenza), 'dd MMMM yyyy', { locale: it })}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Durata</span>
              <p className="font-medium">{data.contratto.numero_mesi} mesi</p>
            </div>
            <div>
              <span className="text-gray-500">Monte canoni</span>
              <p className="font-medium">€ {formatEur(data.contratto.monte_canoni)}</p>
            </div>
            <div className="sm:col-span-2">
              <span className="text-gray-500">Beni in locazione</span>
              <p className="font-medium">{data.contratto.beni.join(', ') || 'Come da contratto'}</p>
            </div>
          </div>
        </div>

        {/* Countdown */}
        <div className={`rounded-xl border p-4 flex items-center gap-3 ${deadlineColor}`}>
          <Clock className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-semibold">
              {giorniMancanti > 0
                ? `Mancano ${giorniMancanti} giorni alla deadline`
                : giorniMancanti === 0
                  ? 'La deadline è oggi'
                  : 'La deadline è scaduta'}
            </p>
            <p className="text-sm opacity-80">
              Scelta da comunicare entro il {format(deadline, 'dd MMMM yyyy', { locale: it })}
            </p>
          </div>
        </div>

        {/* 4 opzioni */}
        <div>
          <h2 className="font-semibold text-[#1a3a52] mb-4">Scegli cosa fare</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {opzioni.map((opzione) => (
              <div
                key={opzione.id}
                className={`bg-white rounded-xl border-2 ${opzione.colore} p-5 flex flex-col`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-lg ${opzione.bgColore} ${opzione.testoColore} flex items-center justify-center flex-shrink-0`}>
                    {opzione.icona}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-semibold ${opzione.testoColore}`}>{opzione.titolo}</h3>
                    {opzione.badges.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {opzione.badges.map((badge, i) => (
                          <span
                            key={i}
                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.stile}`}
                          >
                            {badge.testo}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-4 flex-1">{opzione.descrizione}</p>
                <Link
                  to={`/pratica/${token}/${opzione.id}`}
                  className={`${opzione.btnColore} text-white text-sm font-medium py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors`}
                >
                  Scegli <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-gray-400 pt-4">
          Noleggio Su Misura — Smartcom Solutions Srl — 011 4557949
        </p>
      </main>
    </div>
  );
}
