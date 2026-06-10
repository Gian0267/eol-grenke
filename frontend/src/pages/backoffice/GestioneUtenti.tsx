import { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, Plus, Pencil, X, Check, Power, PowerOff, KeyRound, Save, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

interface Utente {
  id: string;
  nome: string;
  cognome: string;
  email: string;
  ruolo: string;
  attivo: boolean;
  created_at: string;
  superiore_id: string | null;
  superiore: { id: string; nome: string; cognome: string; ruolo: string } | null;
}

// Ordine gerarchico (dal più alto al più basso)
const RUOLI = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'BACKOFFICE_INTERNO', label: 'Backoffice Interno' },
  { value: 'AGENZIA', label: 'Agenzia' },
  { value: 'CAPO_AREA', label: 'Capo Area' },
  { value: 'GROUP_MANAGER', label: 'Group Manager' },
  { value: 'AGENTE', label: 'Agente' },
  { value: 'JUNIOR_AGENT', label: 'Junior Agent' },
];

// Chi può essere superiore di chi
const GERARCHIA_SUPERIORE: Record<string, string[]> = {
  CAPO_AREA: ['AGENZIA'],
  GROUP_MANAGER: ['CAPO_AREA'],
  AGENTE: ['GROUP_MANAGER'],
  JUNIOR_AGENT: ['GROUP_MANAGER'],
};

const RUOLO_COLORS: Record<string, string> = {
  ADMIN: 'bg-purple-100 text-purple-700',
  BACKOFFICE_INTERNO: 'bg-blue-100 text-blue-700',
  AGENZIA: 'bg-amber-100 text-amber-700',
  CAPO_AREA: 'bg-indigo-100 text-indigo-700',
  GROUP_MANAGER: 'bg-cyan-100 text-cyan-700',
  AGENTE: 'bg-green-100 text-green-700',
  JUNIOR_AGENT: 'bg-teal-100 text-teal-700',
};

function getHeaders() {
  const stored = localStorage.getItem('nsm_user');
  const user = stored ? JSON.parse(stored) : null;
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (user?.id) h['x-user-id'] = user.id;
  return h;
}

function ruoloLabel(ruolo: string) {
  return RUOLI.find(r => r.value === ruolo)?.label ?? ruolo;
}

// ─── Modale creazione / modifica ────────────────────────────────
interface ModalProps {
  utente?: Utente | null;
  tuttiUtenti: Utente[];
  onClose: () => void;
  onSaved: () => void;
}

function UtenteModal({ utente, tuttiUtenti, onClose, onSaved }: ModalProps) {
  const isEdit = !!utente;
  const [form, setForm] = useState({
    nome: utente?.nome ?? '',
    cognome: utente?.cognome ?? '',
    email: utente?.email ?? '',
    ruolo: utente?.ruolo ?? 'AGENTE',
    superiore_id: utente?.superiore_id ?? '',
    password: '',
    conferma: '',
  });
  const [loading, setLoading] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Determina i possibili superiori in base al ruolo selezionato
  const superioriPossibili = useMemo(() => {
    const ruoliSuperiore = GERARCHIA_SUPERIORE[form.ruolo];
    if (!ruoliSuperiore) return [];
    return tuttiUtenti.filter(u =>
      ruoliSuperiore.includes(u.ruolo) && u.attivo && u.id !== utente?.id
    );
  }, [form.ruolo, tuttiUtenti, utente?.id]);

  // Reset superiore quando cambia ruolo e non è più compatibile
  useEffect(() => {
    if (form.superiore_id && superioriPossibili.length > 0) {
      const valido = superioriPossibili.some(s => s.id === form.superiore_id);
      if (!valido) setForm(f => ({ ...f, superiore_id: '' }));
    }
    if (superioriPossibili.length === 0 && form.superiore_id) {
      setForm(f => ({ ...f, superiore_id: '' }));
    }
  }, [form.ruolo, superioriPossibili, form.superiore_id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEdit && !form.password) { toast.error('Inserisci una password'); return; }
    if (form.password && form.password !== form.conferma) { toast.error('Le password non coincidono'); return; }
    if (form.password && form.password.length < 8) { toast.error('Password minimo 8 caratteri'); return; }

    setLoading(true);
    try {
      const body: Record<string, any> = {
        nome: form.nome,
        cognome: form.cognome,
        email: form.email,
        ruolo: form.ruolo,
        superiore_id: form.superiore_id || null,
      };
      if (form.password) body.password = form.password;

      const url = isEdit ? `/api/admin/utenti/${utente!.id}` : '/api/admin/utenti';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: getHeaders(), credentials: 'include', body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.errore || 'Errore'); return; }
      toast.success(isEdit ? 'Utente aggiornato' : 'Utente creato');
      onSaved();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const needsSuperiore = superioriPossibili.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold text-slate-800">
            {isEdit ? 'Modifica utente' : 'Nuovo utente'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Nome *</label>
              <input required value={form.nome} onChange={e => set('nome', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Cognome *</label>
              <input required value={form.cognome} onChange={e => set('cognome', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email *</label>
            <input required type="email" value={form.email} onChange={e => set('email', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Ruolo *</label>
            <select required value={form.ruolo} onChange={e => set('ruolo', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              {RUOLI.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          {/* Selezione superiore — appare solo per ruoli che hanno un superiore */}
          {needsSuperiore && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Superiore ({GERARCHIA_SUPERIORE[form.ruolo]?.map(ruoloLabel).join(' / ')})
              </label>
              <select value={form.superiore_id} onChange={e => set('superiore_id', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <option value="">— Nessun superiore —</option>
                {superioriPossibili.map(s => (
                  <option key={s.id} value={s.id}>{s.nome} {s.cognome} ({ruoloLabel(s.ruolo)})</option>
                ))}
              </select>
            </div>
          )}

          <div className="border-t pt-4">
            <p className="text-xs text-slate-400 mb-3 flex items-center gap-1">
              <KeyRound size={12} />
              {isEdit ? 'Lascia vuoto per non cambiare la password' : 'Password obbligatoria (min. 8 caratteri)'}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {isEdit ? 'Nuova password' : 'Password *'}
                </label>
                <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Conferma</label>
                <input type="password" value={form.conferma} onChange={e => set('conferma', e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
              Annulla
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              <Save size={14} />
              {loading ? 'Salvataggio...' : isEdit ? 'Salva modifiche' : 'Crea utente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Pagina principale ───────────────────────────────────────────
export default function GestioneUtenti() {
  const [utenti, setUtenti] = useState<Utente[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'new' | Utente | null>(null);
  const [filterRuolo, setFilterRuolo] = useState('');
  const [filterAttivo, setFilterAttivo] = useState<'tutti' | 'attivi' | 'disattivi'>('tutti');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/utenti', { headers: getHeaders(), credentials: 'include' });
      const data = await res.json();
      if (res.ok) setUtenti(data);
      else toast.error(data.errore || 'Errore caricamento utenti');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleAttivo = async (u: Utente) => {
    const label = u.attivo ? 'disattivare' : 'attivare';
    if (!confirm(`Vuoi ${label} l'utente ${u.nome} ${u.cognome}?`)) return;
    try {
      const res = await fetch(`/api/admin/utenti/${u.id}/attivo`, {
        method: 'PATCH', headers: getHeaders(), credentials: 'include',
        body: JSON.stringify({ attivo: !u.attivo }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.errore || 'Errore'); return; }
      toast.success(u.attivo ? 'Utente disattivato' : 'Utente riattivato');
      load();
    } catch { toast.error('Errore di rete'); }
  };

  const filtered = utenti.filter(u => {
    if (filterRuolo && u.ruolo !== filterRuolo) return false;
    if (filterAttivo === 'attivi' && !u.attivo) return false;
    if (filterAttivo === 'disattivi' && u.attivo) return false;
    return true;
  });

  const attivi = utenti.filter(u => u.attivo).length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="text-slate-700" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Gestione Utenti</h1>
            <p className="text-sm text-slate-400">{attivi} attivi su {utenti.length} totali</p>
          </div>
        </div>
        <button
          onClick={() => setModal('new')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} /> Nuovo utente
        </button>
      </div>

      {/* Gerarchia visiva */}
      <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Gerarchia agenti</h3>
        <div className="flex items-center gap-1.5 text-sm flex-wrap">
          {['AGENZIA', 'CAPO_AREA', 'GROUP_MANAGER', 'AGENTE', 'JUNIOR_AGENT'].map((r, i) => (
            <span key={r} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight size={14} className="text-slate-300" />}
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${RUOLO_COLORS[r]}`}>
                {ruoloLabel(r)}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Filtri */}
      <div className="flex gap-3 mb-4">
        <select value={filterRuolo} onChange={e => setFilterRuolo(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500">
          <option value="">Tutti i ruoli</option>
          {RUOLI.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <select value={filterAttivo} onChange={e => setFilterAttivo(e.target.value as typeof filterAttivo)}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500">
          <option value="tutti">Tutti</option>
          <option value="attivi">Solo attivi</option>
          <option value="disattivi">Solo disattivi</option>
        </select>
      </div>

      {/* Tabella */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Users size={40} className="mx-auto mb-3 opacity-30" />
            <p>Nessun utente trovato</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Utente</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ruolo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Superiore</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Stato</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(u => (
                <tr key={u.id} className={`hover:bg-slate-50 transition-colors ${!u.attivo ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
                        {u.nome[0]}{u.cognome[0]}
                      </div>
                      <span className="font-medium text-slate-800">{u.nome} {u.cognome}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${RUOLO_COLORS[u.ruolo] ?? 'bg-slate-100 text-slate-600'}`}>
                      {ruoloLabel(u.ruolo)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {u.superiore
                      ? <span>{u.superiore.nome} {u.superiore.cognome} <span className="text-slate-400">({ruoloLabel(u.superiore.ruolo)})</span></span>
                      : <span className="text-slate-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    {u.attivo
                      ? <span className="flex items-center gap-1 text-green-600 text-xs"><Check size={12} /> Attivo</span>
                      : <span className="flex items-center gap-1 text-slate-400 text-xs"><X size={12} /> Disattivato</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setModal(u)}
                        title="Modifica"
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => toggleAttivo(u)}
                        title={u.attivo ? 'Disattiva' : 'Riattiva'}
                        className={`p-1.5 rounded transition-colors ${u.attivo
                          ? 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                          : 'text-slate-400 hover:text-green-600 hover:bg-green-50'
                        }`}
                      >
                        {u.attivo ? <PowerOff size={15} /> : <Power size={15} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modale */}
      {modal && (
        <UtenteModal
          utente={modal === 'new' ? null : modal}
          tuttiUtenti={utenti}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
