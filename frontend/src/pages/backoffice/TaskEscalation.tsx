import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Phone, LogOut, Loader2, CheckCircle, XCircle, PhoneOff, RotateCcw } from 'lucide-react';

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

const PRIORITA_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  T_35: { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-300', label: 'URGENTE' },
  T_40: { color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-300', label: 'MEDIA' },
  T_50: { color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-300', label: 'NORMALE' },
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

  const handleLogout = () => {
    localStorage.removeItem('nsm_user');
    localStorage.removeItem('nsm_token');
    navigate('/backoffice/login');
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const formatEur = (n: number) => Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const parseBeni = (json: string) => {
    try {
      const beni = JSON.parse(json);
      return beni.map((b: any) => b.descrizione || 'N/D').join(', ');
    } catch { return 'N/D'; }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#1a3a52] text-white px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Escalation Telefoniche</h1>
            <p className="text-sm text-slate-300">
              {utente?.nome} {utente?.cognome} — {utente?.ruolo}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/backoffice/miei-task" className="text-sm text-slate-300 hover:text-white">I miei task</Link>
            <Link to="/backoffice/pratiche" className="text-sm text-slate-300 hover:text-white">Pratiche</Link>
            <button onClick={handleLogout} className="flex items-center gap-1 text-sm text-slate-300 hover:text-white">
              <LogOut className="w-4 h-4" /> Esci
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {errore && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700">{errore}</p>
          </div>
        )}

        {tasks.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Phone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">Nessun task di escalation da gestire</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">{tasks.length} task da gestire</p>

            {tasks.map(task => {
              const priorita = PRIORITA_CONFIG[task.tipo] || PRIORITA_CONFIG['T_50'];
              const isOpen = taskAperto === task.id;

              return (
                <div key={task.id} className={`bg-white rounded-lg shadow border-l-4 ${priorita.border}`}>
                  {/* Header task */}
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${priorita.bg} ${priorita.color}`}>
                          {priorita.label} — {task.tipo.replace('_', '-')}
                        </span>
                        <span className="text-xs text-gray-400">
                          Creato il {formatDate(task.data_creazione)}
                        </span>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                        {task.stato}
                      </span>
                    </div>

                    {/* Dati cliente */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-lg font-semibold text-gray-900">{task.cliente.ragione_sociale}</p>
                        <p className="text-sm text-gray-500">P.IVA: {task.cliente.piva}</p>
                        {task.cliente.referente_nome && (
                          <p className="text-sm text-gray-600 mt-1">Referente: {task.cliente.referente_nome}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">
                          <strong>Telefono:</strong>{' '}
                          <a href={`tel:${task.cliente.telefono || ''}`} className="text-blue-600 font-semibold text-lg hover:underline">
                            {task.cliente.telefono || 'N/D'}
                          </a>
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          <strong>Email:</strong> {task.cliente.email}
                        </p>
                      </div>
                    </div>

                    {/* Dati contratto */}
                    <div className="bg-gray-50 rounded p-3 mb-4 text-sm">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div><span className="text-gray-500">Contratto:</span> <strong>{task.contratto.contratto_nsm_id}</strong></div>
                        <div><span className="text-gray-500">Scadenza:</span> <strong>{formatDate(task.contratto.data_scadenza)}</strong></div>
                        <div><span className="text-gray-500">Monte canoni:</span> <strong>&euro;{formatEur(task.contratto.monte_canoni)}</strong></div>
                        <div><span className="text-gray-500">Beni:</span> {parseBeni(task.contratto.beni_json)}</div>
                      </div>
                    </div>

                    {/* Storico comunicazioni */}
                    {task.storico_comunicazioni.length > 0 && (
                      <details className="mb-4">
                        <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
                          Storico comunicazioni ({task.storico_comunicazioni.length})
                        </summary>
                        <div className="mt-2 pl-4 border-l-2 border-gray-200 space-y-1">
                          {task.storico_comunicazioni.map((c, i) => (
                            <p key={i} className="text-xs text-gray-600">
                              {formatDate(c.data)} — {c.tipo} ({c.canale}) — {c.esito}
                            </p>
                          ))}
                        </div>
                      </details>
                    )}

                    {/* Azioni */}
                    {(task.stato === 'DA_CHIAMARE' || task.stato === 'RICHIAMARE') && !isOpen && (
                      <button
                        onClick={() => { setTaskAperto(task.id); setEsitoForm({ esito: '', note: '', decisione_cliente: '' }); }}
                        className="flex items-center gap-2 px-4 py-2 bg-[#1a3a52] text-white rounded-lg hover:bg-[#244d6b] transition-colors text-sm font-medium"
                      >
                        <Phone className="w-4 h-4" /> Registra esito chiamata
                      </button>
                    )}

                    {/* Form esito */}
                    {isOpen && (
                      <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <h4 className="font-semibold text-gray-900 mb-3">Registra esito chiamata</h4>

                        <div className="space-y-3">
                          {/* Radio esito */}
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { value: 'RISPOSTA_POSITIVA', label: 'Risposta positiva', icon: CheckCircle, color: 'text-green-600' },
                              { value: 'RISPOSTA_NEGATIVA', label: 'Risposta negativa', icon: XCircle, color: 'text-red-600' },
                              { value: 'NON_RAGGIUNTO', label: 'Non raggiunto', icon: PhoneOff, color: 'text-gray-600' },
                              { value: 'RICHIAMARE', label: 'Richiamare', icon: RotateCcw, color: 'text-yellow-600' },
                            ].map(opt => (
                              <label
                                key={opt.value}
                                className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                                  esitoForm.esito === opt.value
                                    ? 'bg-white border-blue-400 shadow-sm'
                                    : 'bg-white/50 border-gray-200 hover:border-gray-300'
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
                              <label className="block text-sm font-medium text-gray-700 mb-1">Decisione del cliente</label>
                              <select
                                value={esitoForm.decisione_cliente}
                                onChange={e => setEsitoForm(f => ({ ...f, decisione_cliente: e.target.value }))}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
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
                            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                            <textarea
                              value={esitoForm.note}
                              onChange={e => setEsitoForm(f => ({ ...f, note: e.target.value }))}
                              rows={2}
                              placeholder="Note sulla chiamata..."
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            />
                          </div>

                          {/* Bottoni */}
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSubmitEsito(task.id)}
                              disabled={!esitoForm.esito || (esitoForm.esito === 'RISPOSTA_POSITIVA' && !esitoForm.decisione_cliente) || submitting}
                              className="flex items-center gap-2 px-4 py-2 bg-[#1a3a52] text-white rounded-lg hover:bg-[#244d6b] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                            >
                              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                              Conferma
                            </button>
                            <button
                              onClick={() => setTaskAperto(null)}
                              className="px-4 py-2 text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
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
      </main>
    </div>
  );
}
