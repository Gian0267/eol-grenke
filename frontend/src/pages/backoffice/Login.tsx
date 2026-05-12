import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const API_BASE = '';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrore(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/backoffice/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.errore || 'Credenziali non valide');

      localStorage.setItem('nsm_user', JSON.stringify(body.utente));
      navigate('/backoffice/dashboard');
    } catch (err: any) {
      setErrore(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#1a3a52] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">NSM</span>
          </div>
          <h1 className="text-2xl font-bold text-[#1a3a52]">Backoffice NSM</h1>
          <p className="text-sm text-gray-500 mt-1">Accedi alla gestione EOL Grenke</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white rounded-xl border p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="agente@nsm.it"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:border-[#1a3a52] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:border-[#1a3a52] focus:outline-none"
            />
          </div>

          {errore && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{errore}</div>
          )}

          <button
            type="submit"
            disabled={submitting || !email || !password}
            className="w-full bg-[#1a3a52] text-white py-2.5 rounded-lg font-medium hover:bg-[#15304a] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Accesso in corso...</> : 'Accedi'}
          </button>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
            <p className="font-semibold mb-1">Credenziali di test:</p>
            <p>agente@nsm.it / test1234</p>
            <p>capoarea@nsm.it / test1234</p>
            <p>backoffice@nsm.it / test1234</p>
          </div>
        </form>
      </div>
    </div>
  );
}
