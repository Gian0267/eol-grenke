import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Gift, Phone, LogOut, Loader2, Filter } from 'lucide-react';

const API_BASE = '';

interface Task {
  contratto_id: string;
  contratto_nsm: string;
  contratto_grenke: string;
  cliente: {
    ragione_sociale: string;
    piva: string;
    email: string;
    telefono: string | null;
  };
  tipo: string;
  stato_pratica: string;
  data_creazione: string;
  note_cliente: string | null;
  prequalificazione: {
    tipo_device: string;
    numero_device: number;
    durata_desiderata: number;
    budget_mensile?: number;
    note?: string;
  } | null;
  richiesta_contatto: {
    fascia_oraria: string;
    modalita_preferita: string;
    stato: string;
  } | null;
}

interface Utente {
  id: string;
  nome: string;
  cognome: string;
  email: string;
  ruolo: string;
}

export default function MieiTask() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [utente, setUtente] = useState<Utente | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<string>('TUTTI');

  useEffect(() => {
    const stored = localStorage.getItem('nsm_user');
    if (!stored) {
      navigate('/backoffice/login');
      return;
    }
    setUtente(JSON.parse(stored));
  }, [navigate]);

  useEffect(() => {
    if (!utente) return;
    fetchTasks();
  }, [utente, filtroTipo]);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroTipo !== 'TUTTI') params.set('tipo', filtroTipo);

      const res = await fetch(`${API_BASE}/api/backoffice/miei-task?${params}`, {
        credentials: 'include',
        headers: { 'x-user-id': utente!.id },
      });
      if (!res.ok) {
        if (res.status === 401) { navigate('/backoffice/login'); return; }
        throw new Error('Errore caricamento task');
      }
      const data = await res.json();
      setTasks(data);
    } catch (err: any) {
      setErrore(err.message);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await fetch(`${API_BASE}/api/backoffice/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    localStorage.removeItem('nsm_user');
    navigate('/backoffice/login');
  };

  const formatData = (d: string) =>
    new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1a3a52] text-white">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center font-bold text-sm">
              NSM
            </div>
            <div>
              <h1 className="text-lg font-semibold">I miei task</h1>
              {utente && (
                <p className="text-sm text-white/70">
                  {utente.nome} {utente.cognome} ({utente.ruolo})
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/backoffice/pratiche" className="text-sm text-white/70 hover:text-white">
              Pratiche
            </Link>
            <button onClick={logout} className="text-white/70 hover:text-white flex items-center gap-1 text-sm">
              <LogOut className="w-4 h-4" /> Esci
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Filtri */}
        <div className="flex items-center gap-3 mb-6">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-500">Filtra per tipo:</span>
          {['TUTTI', 'RINNOVO', 'CONTATTO'].map(f => (
            <button
              key={f}
              onClick={() => setFiltroTipo(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filtroTipo === f
                  ? f === 'RINNOVO' ? 'bg-green-100 text-green-800'
                    : f === 'CONTATTO' ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-[#1a3a52] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === 'TUTTI' ? 'Tutti' : f === 'RINNOVO' ? 'Rinnovi' : 'Contatti'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : errore ? (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">{errore}</div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg font-medium">Nessun task assegnato</p>
            <p className="text-sm mt-1">I task appariranno quando un cliente sceglie rinnovo o contatto personalizzato</p>
          </div>
        ) : (
          <div className="space-y-4">
            {tasks.map(task => (
              <div key={task.contratto_id} className="bg-white rounded-xl border p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      task.tipo === 'RINNOVO' ? 'bg-green-100' : 'bg-yellow-100'
                    }`}>
                      {task.tipo === 'RINNOVO'
                        ? <Gift className="w-5 h-5 text-green-700" />
                        : <Phone className="w-5 h-5 text-yellow-700" />
                      }
                    </div>
                    <div>
                      <h3 className="font-semibold text-[#1a3a52]">{task.cliente.ragione_sociale}</h3>
                      <p className="text-xs text-gray-500">
                        {task.contratto_nsm} | {task.contratto_grenke}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    task.tipo === 'RINNOVO' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {task.tipo === 'RINNOVO' ? 'Rinnovo' : 'Contatto'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-3">
                  <div>
                    <span className="text-gray-500 text-xs">Email</span>
                    <p className="font-medium truncate">{task.cliente.email}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Telefono</span>
                    <p className="font-medium">{task.cliente.telefono || 'N/D'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Data</span>
                    <p className="font-medium">{formatData(task.data_creazione)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Stato</span>
                    <p className="font-medium">{task.stato_pratica.replace(/_/g, ' ')}</p>
                  </div>
                </div>

                {/* Dettagli rinnovo */}
                {task.prequalificazione && (
                  <div className="bg-green-50 rounded-lg p-3 text-sm mb-3">
                    <p className="font-medium text-green-800 mb-1">Pre-qualificazione rinnovo:</p>
                    <div className="grid grid-cols-2 gap-2 text-green-700 text-xs">
                      <span>Device: {task.prequalificazione.tipo_device}</span>
                      <span>Quantita: {task.prequalificazione.numero_device}</span>
                      <span>Durata: {task.prequalificazione.durata_desiderata} mesi</span>
                      {task.prequalificazione.budget_mensile && (
                        <span>Budget: EUR {task.prequalificazione.budget_mensile}</span>
                      )}
                    </div>
                    {task.prequalificazione.note && (
                      <p className="text-xs text-green-700 mt-1">Note: {task.prequalificazione.note}</p>
                    )}
                  </div>
                )}

                {/* Dettagli contatto */}
                {task.richiesta_contatto && (
                  <div className="bg-yellow-50 rounded-lg p-3 text-sm mb-3">
                    <p className="font-medium text-yellow-800 mb-1">Preferenze contatto:</p>
                    <div className="text-yellow-700 text-xs space-y-0.5">
                      <p>Fascia oraria: {task.richiesta_contatto.fascia_oraria}</p>
                      <p>Modalita: {task.richiesta_contatto.modalita_preferita}</p>
                    </div>
                  </div>
                )}

                {task.note_cliente && !task.prequalificazione && (
                  <p className="text-sm text-gray-600 italic">"{task.note_cliente}"</p>
                )}

                <div className="mt-3 pt-3 border-t flex justify-end">
                  <button
                    className="bg-[#1a3a52] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#15304a] transition-colors"
                    onClick={() => {/* placeholder */}}
                  >
                    Apri pratica
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
