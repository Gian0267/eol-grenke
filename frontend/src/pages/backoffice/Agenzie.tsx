/**
 * Anagrafica delle agenzie e dei loro link di registrazione a un nuovo noleggio.
 *
 * Il link porta l'identificativo dell'agente: il contatto che ne nasce viene
 * attribuito a lui. Per questo la pagina insiste su chi il link non ce l'ha —
 * senza, la proposta di nuovo noleggio a quei clienti non parte.
 */
import { useEffect, useState } from 'react';
import { toast, Toaster } from 'sonner';
import { Loader2, Save, Plus, Trash2, AlertTriangle, Link2, Search } from 'lucide-react';

interface Agenzia {
  id: string;
  nome: string;
  link_onboarding: string | null;
  note: string | null;
  pratiche: number;
}

interface Orfana {
  nome: string;
  pratiche: number;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const u = JSON.parse(localStorage.getItem('nsm_user') || 'null');
    if (u?.id) h['x-user-id'] = u.id;
  } catch { /* nessun utente in cache: ci pensa la sessione */ }
  return h;
}

export default function Agenzie() {
  const [agenzie, setAgenzie] = useState<Agenzia[]>([]);
  const [orfane, setOrfane] = useState<Orfana[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');
  const [soloSenzaLink, setSoloSenzaLink] = useState(false);

  // Valori in modifica, per non rimandare al server a ogni tasto premuto
  const [bozza, setBozza] = useState<Record<string, string>>({});

  const [nuovoNome, setNuovoNome] = useState('');
  const [nuovoLink, setNuovoLink] = useState('');
  const [creando, setCreando] = useState(false);

  const carica = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/backoffice/agenzie', { credentials: 'include', headers: headers() });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setAgenzie(d.agenzie);
      setOrfane(d.orfane);
      setBozza({});
    } catch {
      toast.error('Errore nel caricamento delle agenzie');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carica(); }, []);

  const salva = async (a: Agenzia) => {
    const valore = bozza[a.id];
    if (valore === undefined) return;
    setSalvando(a.id);
    try {
      const res = await fetch(`/api/backoffice/agenzie/${a.id}`, {
        method: 'POST',
        credentials: 'include',
        headers: headers(),
        body: JSON.stringify({ link_onboarding: valore }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Errore');
      toast.success(`${a.nome}: link ${valore.trim() ? 'salvato' : 'rimosso'}`);
      carica();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore nel salvataggio');
    } finally {
      setSalvando(null);
    }
  };

  const crea = async () => {
    if (!nuovoNome.trim()) return;
    setCreando(true);
    try {
      const res = await fetch('/api/backoffice/agenzie', {
        method: 'POST',
        credentials: 'include',
        headers: headers(),
        body: JSON.stringify({ nome: nuovoNome, link_onboarding: nuovoLink }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Errore');
      toast.success(`${nuovoNome.trim()} aggiunta`);
      setNuovoNome('');
      setNuovoLink('');
      carica();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore');
    } finally {
      setCreando(false);
    }
  };

  const elimina = async (a: Agenzia) => {
    const avviso = a.pratiche > 0
      ? `\n\nAttenzione: ${a.pratiche} pratiche indicano questa agenzia. Non verranno modificate, ma resteranno senza link e la proposta di nuovo noleggio non potra' partire.`
      : '';
    if (!confirm(`Eliminare "${a.nome}" dall'anagrafica?${avviso}`)) return;
    setSalvando(a.id);
    try {
      const res = await fetch(`/api/backoffice/agenzie/${a.id}/elimina`, {
        method: 'POST',
        credentials: 'include',
        headers: headers(),
      });
      if (!res.ok) throw new Error();
      toast.success(`${a.nome} eliminata`);
      carica();
    } catch {
      toast.error("Errore nell'eliminazione");
    } finally {
      setSalvando(null);
    }
  };

  const visibili = agenzie.filter(a => {
    if (soloSenzaLink && a.link_onboarding) return false;
    if (!filtro.trim()) return true;
    return a.nome.toLowerCase().includes(filtro.trim().toLowerCase());
  });

  const senzaLink = agenzie.filter(a => !a.link_onboarding).length;
  const senzaLinkConPratiche = agenzie.filter(a => !a.link_onboarding && a.pratiche > 0);

  return (
    <div className="max-w-6xl mx-auto">
      <Toaster position="top-right" richColors />

      <h1 className="text-2xl font-bold text-graphite mb-2">Agenzie e link di registrazione</h1>
      <p className="text-sm text-stone mb-6">
        Il link porta l&apos;identificativo dell&apos;agente: il cliente che si registra da l&igrave; viene attribuito a lui.
        La mail &quot;Proposta di nuovo noleggio&quot; usa il link dell&apos;agenzia indicata sulla pratica, e senza quel
        link non parte &mdash; meglio non mandarla che attribuire il contatto alla persona sbagliata.
        I clienti Italiaonline fanno eccezione: hanno un link unico, in Impostazioni.
      </p>

      {/* Chi ha pratiche ma non ha link: sono i casi che bloccano davvero */}
      {senzaLinkConPratiche.length > 0 && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-900 mb-1">
                {senzaLinkConPratiche.length === 1
                  ? "Un'agenzia con pratiche in corso non ha il link"
                  : `${senzaLinkConPratiche.length} agenzie con pratiche in corso non hanno il link`}
              </p>
              <p className="text-sm text-amber-800">
                {senzaLinkConPratiche.map(a => `${a.nome} (${a.pratiche})`).join(', ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Nomi che compaiono sulle pratiche ma non sono in anagrafica */}
      {orfane.length > 0 && (
        <div className="mb-5 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium text-graphite mb-2">
            Nomi presenti sulle pratiche ma non in anagrafica
          </p>
          <div className="flex flex-wrap gap-2">
            {orfane.map(o => (
              <button
                key={o.nome}
                onClick={() => { setNuovoNome(o.nome); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }}
                className="text-xs px-2.5 py-1 rounded-full border border-border hover:bg-paper"
                title="Aggiungila in anagrafica"
              >
                {o.nome} <span className="text-stone">({o.pratiche})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filtri */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-stone absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
            placeholder="Cerca un'agenzia"
            className="pl-9 pr-3 py-2 text-sm border border-border rounded-lg w-64"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-graphite">
          <input
            type="checkbox"
            checked={soloSenzaLink}
            onChange={e => setSoloSenzaLink(e.target.checked)}
            className="w-4 h-4 accent-[var(--color-flex)]"
          />
          Solo quelle senza link ({senzaLink})
        </label>
        <span className="text-sm text-stone ml-auto">{agenzie.length} agenzie</span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-stone text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Caricamento…
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-paper text-stone text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Agenzia</th>
                <th className="px-4 py-3 text-left">Link di registrazione</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Pratiche</th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {visibili.map(a => {
                const valore = bozza[a.id] ?? a.link_onboarding ?? '';
                const modificato = bozza[a.id] !== undefined && bozza[a.id] !== (a.link_onboarding ?? '');
                return (
                  <tr key={a.id} className="border-t border-border align-middle">
                    <td className="px-4 py-3 text-graphite break-words max-w-[200px]">
                      {a.nome}
                      {!a.link_onboarding && (
                        <span className="ml-2 text-xs text-amber-700">senza link</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={valore}
                        onChange={e => setBozza({ ...bozza, [a.id]: e.target.value })}
                        placeholder="https://app.noleggiosumisura.it/start?agente=…"
                        className={`w-full px-3 py-2 text-xs font-mono border rounded-lg ${
                          modificato ? 'border-flex ring-1 ring-flex/30' : 'border-border'
                        }`}
                      />
                    </td>
                    <td className="px-4 py-3 text-right text-stone">{a.pratiche || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {modificato && (
                          <button
                            onClick={() => salva(a)}
                            disabled={salvando === a.id}
                            className="p-2 rounded-lg bg-flex text-white hover:bg-flex-dark disabled:opacity-50"
                            title="Salva"
                          >
                            {salvando === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          </button>
                        )}
                        {a.link_onboarding && !modificato && (
                          <a
                            href={a.link_onboarding}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 rounded-lg border border-border hover:bg-paper text-stone"
                            title="Apri il link"
                          >
                            <Link2 className="w-4 h-4" />
                          </a>
                        )}
                        <button
                          onClick={() => elimina(a)}
                          disabled={salvando === a.id}
                          className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                          title="Elimina"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visibili.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-stone text-sm">
                    Nessuna agenzia corrisponde ai filtri.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Nuova agenzia */}
      <div className="mt-6 bg-card rounded-xl border border-border p-5">
        <h2 className="text-sm font-semibold text-graphite mb-3">Aggiungi un&apos;agenzia</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-stone mb-1">Nome</label>
            <input
              value={nuovoNome}
              onChange={e => setNuovoNome(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg"
            />
          </div>
          <div className="flex-[2] min-w-[260px]">
            <label className="block text-xs text-stone mb-1">Link di registrazione (facoltativo)</label>
            <input
              value={nuovoLink}
              onChange={e => setNuovoLink(e.target.value)}
              placeholder="https://app.noleggiosumisura.it/start?agente=…"
              className="w-full px-3 py-2 text-xs font-mono border border-border rounded-lg"
            />
          </div>
          <button
            onClick={crea}
            disabled={creando || !nuovoNome.trim()}
            className="px-4 py-2 rounded-lg bg-flex text-white text-sm font-medium hover:bg-flex-dark disabled:opacity-50 flex items-center gap-2"
          >
            {creando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Aggiungi
          </button>
        </div>
      </div>
    </div>
  );
}
