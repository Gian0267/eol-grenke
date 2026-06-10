import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Loader2, CheckCircle, XCircle, PhoneOff, RotateCcw, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';

const API_BASE = '';

interface StoricoComunicazione {
  tipo: string;
  data: string;
  esito: string;
  canale: string;
}

interface TaskEscalationItem {
  id: string;
  tipo: string;
  stato: string;
  data_creazione: string;
  data_completamento: string | null;
  esito: string | null;
  note: string | null;
  assegnato_a: { nome: string; cognome: string; email: string };
  contratto: {
    id: string;
    contratto_nsm_id: string;
    contratto_grenke_id: string;
    data_scadenza: string;
    monte_canoni: number;
    beni_json: string;
    stato: string;
  };
  cliente: {
    ragione_sociale: string;
    piva: string;
    email: string;
    telefono: string | null;
    referente_nome: string | null;
    referente_telefono: string | null;
  };
  storico_comunicazioni: StoricoComunicazione[];
}

interface Utente {
  id: string;
  nome: string;
  cognome: string;
  email: string;
  ruolo: string;
}

const SCRIPTS_TELEFONICI: Record<string, { titolo: string; sezioni: { titolo: string; contenuto: string }[] }> = {
  T_50: {
    titolo: 'Primo tentativo (T-50)',
    sezioni: [
      { titolo: 'Apertura', contenuto: '"Buongiorno, sono [NOME AGENTE] di Noleggio Su Misura, partner autorizzato Grenke per la gestione dei contratti di locazione operativa. Parlo con il referente per il contratto n. [CONTRATTO_NSM]?"' },
      { titolo: 'Presentazione del motivo', contenuto: '"La contatto perché il Suo contratto di locazione operativa n. [CONTRATTO_NSM], relativo a [BENI], è in scadenza il [DATA_SCADENZA]. Le abbiamo inviato una comunicazione email con tutte le informazioni, ma non avendo ancora ricevuto un Suo riscontro, ho pensato di contattarLa direttamente per assicurarmi che abbia ricevuto tutto e per rispondere a eventuali domande."' },
      { titolo: 'Illustrazione delle opzioni', contenuto: '"Come anticipato nella comunicazione, ha a disposizione quattro opzioni per la gestione del fine contratto:\n\n1. **Rinnovo** — Può stipulare un nuovo contratto FLEX su dispositivi aggiornati. Come premio fedeltà, riceverà una gift card Smartcom Solutions alla firma.\n\n2. **Riacquisto** — Può acquistare i beni attualmente in uso, con pagamento online tramite bonifico o carta.\n\n3. **Contatto personalizzato** — Se preferisce valutare le opzioni con calma, possiamo fissare un appuntamento telefonico o in videochiamata per una consulenza dedicata.\n\n4. **Restituzione** — Può restituire i beni secondo le modalità che Le indicheremo."' },
      { titolo: 'Gestione obiezioni comuni', contenuto: '• **"Non ho ricevuto nulla"** → "Nessun problema, posso reinviarLe la comunicazione adesso. Mi conferma l\'indirizzo email [EMAIL]?"\n\n• **"Devo parlarne con il mio titolare/responsabile"** → "Capisco perfettamente. Le lascio il mio contatto diretto e il link all\'area riservata dove potrà comunicare la scelta quando preferisce. Il termine è il [DEADLINE]."\n\n• **"Non mi interessa, voglio solo restituire"** → "Certamente, è una delle opzioni disponibili. Può procedere direttamente dall\'area riservata oppure, se preferisce, posso registrare la Sua scelta adesso."' },
      { titolo: 'Chiusura', contenuto: '"La ringrazio per il Suo tempo. Le ricordo che il termine per comunicare la Sua scelta è il [DEADLINE]. Può accedere all\'area riservata in qualsiasi momento tramite il link nella email, oppure non esiti a contattarmi per qualsiasi chiarimento. Le auguro una buona giornata."' },
    ],
  },
  T_40: {
    titolo: 'Secondo tentativo (T-40)',
    sezioni: [
      { titolo: 'Apertura', contenuto: '"Buongiorno, sono [NOME AGENTE] di Noleggio Su Misura. La contatto nuovamente in merito al contratto di locazione operativa n. [CONTRATTO_NSM]. Parlo con il referente?"' },
      { titolo: 'Contesto diretto', contenuto: '"Come Le avevo anticipato nella precedente telefonata e nelle comunicazioni email, il Suo contratto relativo a [BENI] è in scadenza il [DATA_SCADENZA]. Il termine per comunicarci la Sua decisione è fissato al [DEADLINE] e rimangono poche settimane."' },
      { titolo: 'Urgenza moderata', contenuto: '"Capisco che possa essere un periodo impegnativo, ma Le chiedo pochi minuti per definire insieme come procedere. È importante che ci comunichi la Sua preferenza entro il termine, perché in caso contrario il contratto proseguirà automaticamente in proroga per 6 mesi con i canoni attuali, e successivamente non sarà più possibile accedere alle opzioni agevolate che Le abbiamo proposto."' },
      { titolo: 'Riepilogo rapido opzioni', contenuto: '"Le ricordo brevemente le possibilità:\n\n1. **Rinnovo** con gift card come premio fedeltà\n2. **Riacquisto** del bene\n3. **Contatto** per una consulenza personalizzata\n4. **Restituzione** del bene\n\nHa già avuto modo di valutare quale opzione preferisce?"' },
      { titolo: 'Gestione obiezioni comuni', contenuto: '• **"Sto ancora decidendo"** → "Comprendo. Posso aiutarLa a chiarire qualche dubbio? Se preferisce il contatto personalizzato, possiamo fissare un appuntamento dedicato con un nostro consulente."\n\n• **"Non ho tempo adesso"** → "Capisco. Quando sarebbe il momento migliore per richiamarLa? Le propongo di fissare un appuntamento in modo da non doverLa disturbare ulteriormente."\n\n• **"Voglio parlarne con qualcuno in azienda"** → "Certamente. Le suggerisco di condividere il link all\'area riservata con il Suo collega, così potrà visionare direttamente le opzioni. Posso inviarglielo adesso se mi indica un indirizzo email."' },
      { titolo: 'Chiusura', contenuto: '"La ringrazio. Le ricordo ancora che il termine è il [DEADLINE]. Sono a Sua disposizione per qualsiasi chiarimento. Buona giornata."' },
    ],
  },
  T_35: {
    titolo: 'Terzo e ultimo tentativo (T-35) — URGENTE',
    sezioni: [
      { titolo: 'Apertura', contenuto: '"Buongiorno, sono [NOME AGENTE] di Noleggio Su Misura. La contatto con urgenza in merito al contratto n. [CONTRATTO_NSM]. Parlo con il referente?"' },
      { titolo: 'Comunicazione di urgenza', contenuto: '"Questa è la mia ultima chiamata relativa al Suo contratto di locazione operativa per [BENI], in scadenza il [DATA_SCADENZA]. Il termine per comunicare la Sua decisione è il [DEADLINE], ovvero tra pochissimi giorni."' },
      { titolo: 'Conseguenze esplicite', contenuto: '"Desidero informarLa chiaramente su cosa accade se non riceviamo la Sua scelta entro il termine:\n\n• Il contratto Grenke proseguirà **automaticamente in proroga per 6 mesi** con canoni invariati\n• Al termine della proroga, **non sarà più possibile** accedere alle opzioni di riacquisto, rinnovo con premio fedeltà o restituzione agevolata attraverso Noleggio Su Misura\n• Grenke proseguirà nella gestione del contratto direttamente con la Sua azienda\n\nQuesto significa che le condizioni vantaggiose che Le abbiamo proposto non saranno più disponibili."' },
      { titolo: 'Proposta di azione immediata', contenuto: '"Possiamo risolvere la questione adesso in pochi minuti. Le riassumo le opzioni:\n\n1. **Rinnovo** — nuovo contratto su dispositivi aggiornati + gift card premio fedeltà\n2. **Riacquisto** — i beni diventano Suoi\n3. **Contatto** — fissiamo subito un appuntamento con un consulente\n4. **Restituzione** — Le indichiamo come procedere alla riconsegna\n\nHa già una preferenza? Posso registrare la Sua scelta direttamente adesso, senza bisogno di accedere alla piattaforma."' },
      { titolo: 'Gestione obiezioni', contenuto: '• **"Non mi interessa, lasciate in proroga"** → "Comprendo la Sua posizione. Tenga presente che la proroga comporta il pagamento di ulteriori 6 mesi di canone. Le opzioni che Le proponiamo potrebbero risultare più convenienti. Desidera valutare?"\n\n• **"Registrate pure la restituzione"** → "Certamente, registro la Sua scelta di restituzione. Riceverà le istruzioni operative via email. Posso procedere?"\n\n• **Nessuna risposta / segreteria** → Lasciare messaggio: "Buongiorno, sono [NOME AGENTE] di Noleggio Su Misura. La contatto urgentemente per il contratto n. [CONTRATTO_NSM] in scadenza. Il termine per la scelta è il [DEADLINE]. La prego di contattarci al 011 4557949 o di accedere all\'area riservata tramite il link nella email. Grazie."' },
      { titolo: 'Chiusura', contenuto: '"La ringrazio per il Suo tempo. Questa è l\'ultima possibilità per comunicarci la Sua preferenza prima del termine del [DEADLINE]. Resto a disposizione al numero 011 4557949. Buona giornata."' },
    ],
  },
};

const PRIORITA_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  T_35: { color: 'text-danger-text', bg: 'bg-danger', border: 'border-danger-border', label: 'URGENTE' },
  T_40: { color: 'text-warn-text', bg: 'bg-warn', border: 'border-warn-border', label: 'MEDIA' },
  T_50: { color: 'text-ok-text', bg: 'bg-ok', border: 'border-ok-border', label: 'NORMALE' },
};

export default function TaskEscalation() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskEscalationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [utente, setUtente] = useState<Utente | null>(null);
  const [taskAperto, setTaskAperto] = useState<string | null>(null);
  const [esitoForm, setEsitoForm] = useState<{
    esito: string;
    note: string;
    decisione_cliente: string;
  }>({ esito: '', note: '', decisione_cliente: '' });
  const [submitting, setSubmitting] = useState(false);
  const [scriptAperto, setScriptAperto] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('nsm_user');
    if (!stored) {
      navigate('/backoffice/login');
      return;
    }
    setUtente(JSON.parse(stored));
  }, [navigate]);

  const fetchTasks = async () => {
    if (!utente) return;
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/backoffice/task-escalation`, {
        headers: { 'x-user-id': utente.id },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Errore caricamento task');
      const data = await res.json();
      setTasks(data);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Errore sconosciuto');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (utente) fetchTasks();
  }, [utente]);

  const handleSubmitEsito = async (taskId: string) => {
    if (!utente || !esitoForm.esito) return;
    setSubmitting(true);
    try {
      const body: any = { esito: esitoForm.esito, note: esitoForm.note || undefined };
      if (esitoForm.esito === 'RISPOSTA_POSITIVA' && esitoForm.decisione_cliente) {
        body.decisione_cliente = esitoForm.decisione_cliente;
      }
      const res = await fetch(`${API_BASE}/api/backoffice/task-escalation/${taskId}/esito`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': utente.id },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Errore registrazione esito');
      }
      setTaskAperto(null);
      setEsitoForm({ esito: '', note: '', decisione_cliente: '' });
      await fetchTasks();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Errore');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const formatEur = (n: number) => Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const parseBeni = (json: string) => {
    try {
      const beni = JSON.parse(json);
      return beni.map((b: any) => b.descrizione || 'N/D').join(', ');
    } catch { return 'N/D'; }
  };

  const sostituisciVariabili = (testo: string, task: TaskEscalationItem) => {
    const scadenza = new Date(task.contratto.data_scadenza);
    const deadline = new Date(scadenza);
    deadline.setDate(deadline.getDate() - 30);
    return testo
      .replace(/\[NOME AGENTE\]/g, `${task.assegnato_a.nome} ${task.assegnato_a.cognome}`)
      .replace(/\[CONTRATTO_NSM\]/g, task.contratto.contratto_nsm_id)
      .replace(/\[BENI\]/g, parseBeni(task.contratto.beni_json))
      .replace(/\[DATA_SCADENZA\]/g, formatDate(task.contratto.data_scadenza))
      .replace(/\[DEADLINE\]/g, formatDate(deadline.toISOString()))
      .replace(/\[EMAIL\]/g, task.cliente.email);
  };

  const renderScriptText = (testo: string) => {
    const parts = testo.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-flex" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-graphite mb-6">Escalation Telefoniche</h1>
        {errore && (
          <div className="bg-danger border border-danger-border/30 rounded-lg p-4 mb-6">
            <p className="text-danger-text">{errore}</p>
          </div>
        )}

        {tasks.length === 0 ? (
          <div className="bg-card rounded-lg shadow p-12 text-center">
            <Phone className="w-12 h-12 text-stone mx-auto mb-4" />
            <p className="text-stone text-lg">Nessun task di escalation da gestire</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-stone">{tasks.length} task da gestire</p>

            {tasks.map(task => {
              const priorita = PRIORITA_CONFIG[task.tipo] || PRIORITA_CONFIG['T_50'];
              const isOpen = taskAperto === task.id;

              return (
                <div key={task.id} className={`bg-card rounded-lg shadow border-l-4 ${priorita.border}`}>
                  {/* Header task */}
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${priorita.bg} ${priorita.color}`}>
                          {priorita.label} — {task.tipo.replace('_', '-')}
                        </span>
                        <span className="text-xs text-stone">
                          Creato il {formatDate(task.data_creazione)}
                        </span>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded bg-paper text-stone">
                        {task.stato}
                      </span>
                    </div>

                    {/* Dati cliente */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-lg font-semibold text-graphite">{task.cliente.ragione_sociale}</p>
                        <p className="text-sm text-stone">P.IVA: {task.cliente.piva}</p>
                        {task.cliente.referente_nome && (
                          <p className="text-sm text-stone mt-1">Referente: {task.cliente.referente_nome}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-sm text-stone">
                          <strong>Telefono:</strong>{' '}
                          <a href={`tel:${task.cliente.telefono || ''}`} className="text-flex font-semibold text-lg hover:underline">
                            {task.cliente.telefono || 'N/D'}
                          </a>
                        </p>
                        <p className="text-sm text-stone mt-1">
                          <strong>Email:</strong> {task.cliente.email}
                        </p>
                      </div>
                    </div>

                    {/* Dati contratto */}
                    <div className="bg-paper rounded p-3 mb-4 text-sm">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div><span className="text-stone">Contratto:</span> <strong>{task.contratto.contratto_nsm_id}</strong></div>
                        <div><span className="text-stone">Scadenza:</span> <strong>{formatDate(task.contratto.data_scadenza)}</strong></div>
                        <div><span className="text-stone">Monte canoni:</span> <strong>&euro;{formatEur(task.contratto.monte_canoni)}</strong></div>
                        <div><span className="text-stone">Beni:</span> {parseBeni(task.contratto.beni_json)}</div>
                      </div>
                    </div>

                    {/* Storico comunicazioni */}
                    {task.storico_comunicazioni.length > 0 && (
                      <details className="mb-4">
                        <summary className="text-sm text-stone cursor-pointer hover:text-graphite">
                          Storico comunicazioni ({task.storico_comunicazioni.length})
                        </summary>
                        <div className="mt-2 pl-4 border-l-2 border-border space-y-1">
                          {task.storico_comunicazioni.map((c, i) => (
                            <p key={i} className="text-xs text-stone">
                              {formatDate(c.data)} — {c.tipo} ({c.canale}) — {c.esito}
                            </p>
                          ))}
                        </div>
                      </details>
                    )}

                    {/* Azioni */}
                    {(task.stato === 'DA_CHIAMARE' || task.stato === 'RICHIAMARE') && !isOpen && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setTaskAperto(task.id); setEsitoForm({ esito: '', note: '', decisione_cliente: '' }); }}
                          className="flex items-center gap-2 px-4 py-2 bg-flex text-white rounded-lg hover:bg-flex-dark transition-colors text-sm font-medium"
                        >
                          <Phone className="w-4 h-4" /> Registra esito chiamata
                        </button>
                        <button
                          onClick={() => setScriptAperto(scriptAperto === task.id ? null : task.id)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium border ${
                            scriptAperto === task.id
                              ? 'bg-warn border-warn-border text-warn-text'
                              : 'bg-card border-border text-graphite hover:bg-paper'
                          }`}
                        >
                          <BookOpen className="w-4 h-4" />
                          Script telefonico
                          {scriptAperto === task.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      </div>
                    )}

                    {/* Script telefonico */}
                    {scriptAperto === task.id && SCRIPTS_TELEFONICI[task.tipo] && (
                      <div className="mt-4 border border-warn-border rounded-lg overflow-hidden">
                        <div className="bg-warn px-4 py-3 flex items-center justify-between border-b border-warn-border">
                          <h4 className="font-semibold text-warn-text flex items-center gap-2">
                            <BookOpen className="w-4 h-4" />
                            {SCRIPTS_TELEFONICI[task.tipo].titolo}
                          </h4>
                          <button onClick={() => setScriptAperto(null)} className="text-warn-text hover:text-warn-text/80 text-xs">
                            Chiudi
                          </button>
                        </div>
                        <div className="p-4 bg-white space-y-4 max-h-[500px] overflow-y-auto">
                          {SCRIPTS_TELEFONICI[task.tipo].sezioni.map((sezione, i) => (
                            <div key={i}>
                              <h5 className="text-xs font-bold text-warn-text uppercase tracking-wide mb-1.5">{sezione.titolo}</h5>
                              <div className="text-sm text-graphite leading-relaxed whitespace-pre-line">
                                {sostituisciVariabili(sezione.contenuto, task).split('\n').map((line, j) => (
                                  <p key={j} className={line === '' ? 'h-2' : ''}>{renderScriptText(line)}</p>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Form esito */}
                    {isOpen && (
                      <div className="mt-4 p-4 bg-flex-light rounded-lg border border-flex/20">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-graphite">Registra esito chiamata</h4>
                          <button
                            onClick={() => setScriptAperto(scriptAperto === task.id ? null : task.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                              scriptAperto === task.id
                                ? 'bg-warn border-warn-border text-warn-text'
                                : 'bg-card border-border text-stone hover:bg-paper'
                            }`}
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            Script
                            {scriptAperto === task.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        </div>

                        <div className="space-y-3">
                          {/* Radio esito */}
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { value: 'RISPOSTA_POSITIVA', label: 'Risposta positiva', icon: CheckCircle, color: 'text-ok-text' },
                              { value: 'RISPOSTA_NEGATIVA', label: 'Risposta negativa', icon: XCircle, color: 'text-danger-text' },
                              { value: 'NON_RAGGIUNTO', label: 'Non raggiunto', icon: PhoneOff, color: 'text-stone' },
                              { value: 'RICHIAMARE', label: 'Richiamare', icon: RotateCcw, color: 'text-warn-text' },
                            ].map(opt => (
                              <label
                                key={opt.value}
                                className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                                  esitoForm.esito === opt.value
                                    ? 'bg-card border-flex shadow-sm'
                                    : 'bg-white/50 border-border hover:border-stone'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="esito"
                                  value={opt.value}
                                  checked={esitoForm.esito === opt.value}
                                  onChange={e => setEsitoForm(f => ({ ...f, esito: e.target.value, decisione_cliente: '' }))}
                                  className="sr-only"
                                />
                                <opt.icon className={`w-4 h-4 ${opt.color}`} />
                                <span className="text-sm font-medium">{opt.label}</span>
                              </label>
                            ))}
                          </div>

                          {/* Decisione cliente (solo se positiva) */}
                          {esitoForm.esito === 'RISPOSTA_POSITIVA' && (
                            <div>
                              <label className="block text-sm font-medium text-graphite mb-1">Decisione del cliente</label>
                              <select
                                value={esitoForm.decisione_cliente}
                                onChange={e => setEsitoForm(f => ({ ...f, decisione_cliente: e.target.value }))}
                                className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                              >
                                <option value="">— Seleziona —</option>
                                <option value="RINNOVO">Rinnovo</option>
                                <option value="RIACQUISTO">Riacquisto</option>
                                <option value="CONTATTO">Contatto personalizzato</option>
                                <option value="RESTITUZIONE">Restituzione</option>
                              </select>
                            </div>
                          )}

                          {/* Note */}
                          <div>
                            <label className="block text-sm font-medium text-graphite mb-1">Note</label>
                            <textarea
                              value={esitoForm.note}
                              onChange={e => setEsitoForm(f => ({ ...f, note: e.target.value }))}
                              rows={2}
                              placeholder="Note sulla chiamata..."
                              className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                            />
                          </div>

                          {/* Bottoni */}
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSubmitEsito(task.id)}
                              disabled={!esitoForm.esito || (esitoForm.esito === 'RISPOSTA_POSITIVA' && !esitoForm.decisione_cliente) || submitting}
                              className="flex items-center gap-2 px-4 py-2 bg-flex text-white rounded-lg hover:bg-flex-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                            >
                              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                              Conferma
                            </button>
                            <button
                              onClick={() => setTaskAperto(null)}
                              className="px-4 py-2 text-stone bg-card border border-border rounded-lg hover:bg-paper text-sm"
                            >
                              Annulla
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
