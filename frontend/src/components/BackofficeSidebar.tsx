import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, List, Bell, Phone, AlertTriangle,
  BarChart3, LogOut, Menu, X, Upload, CreditCard, FileSpreadsheet, Settings, Users,
} from 'lucide-react';

interface Utente {
  id: string;
  nome: string;
  cognome: string;
  email: string;
  ruolo: string;
}

const API_BASE = '';

export default function BackofficeSidebar() {
  const navigate = useNavigate();
  const [utente, setUtente] = useState<Utente | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('nsm_user');
    if (stored) setUtente(JSON.parse(stored));
  }, []);

  const logout = async () => {
    await fetch(`${API_BASE}/api/backoffice/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    localStorage.removeItem('nsm_user');
    navigate('/backoffice/login');
  };

  const ruolo = utente?.ruolo || '';
  const isAgenteOrCapo = ['AGENTE', 'JUNIOR_AGENT', 'CAPO_AREA', 'GROUP_MANAGER', 'AGENZIA'].includes(ruolo);
  const isInternoOrAdmin = ['BACKOFFICE_INTERNO', 'ADMIN'].includes(ruolo);
  const isAdmin = ruolo === 'ADMIN';

  const menuItems = [
    { to: '/backoffice/dashboard', label: 'Dashboard', icon: LayoutDashboard, visible: true },
    { to: '/backoffice/pratiche', label: 'Pratiche', icon: List, visible: true },
    { to: '/backoffice/export-grenke', label: 'Export Grenke', icon: FileSpreadsheet, visible: isInternoOrAdmin },
    { to: '/backoffice/miei-task', label: 'I miei Task', icon: Bell, visible: isAgenteOrCapo },
    { to: '/backoffice/task-escalation', label: 'Task Escalation', icon: Phone, visible: isAgenteOrCapo || isInternoOrAdmin },
    { to: '/backoffice/riacquisti-in-attesa', label: 'Riacquisti in attesa', icon: CreditCard, visible: true },
    { to: '/backoffice/import', label: 'Importa lista', icon: Upload, visible: isInternoOrAdmin },
    { to: '/backoffice/outlier', label: 'Outlier', icon: AlertTriangle, visible: isInternoOrAdmin },
    { to: '/backoffice/reportistica', label: 'Reportistica', icon: BarChart3, visible: true },
    { to: '/backoffice/utenti', label: 'Utenti', icon: Users, visible: isAdmin },
    { to: '/backoffice/impostazioni', label: 'Impostazioni', icon: Settings, visible: isAdmin },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo + brand */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-flex-light rounded-xl flex items-center justify-center font-mono font-bold text-sm text-flex-dark shrink-0">
            NSM
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-medium text-sm truncate text-white">Backoffice NSM</p>
              <p className="text-xs text-white/50 truncate">EOL Grenke — FLEX</p>
            </div>
          )}
        </div>
      </div>

      {/* FLEX accent stripe */}
      <div className="h-0.5 bg-flex" />

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {menuItems.filter(m => m.visible).map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-flex text-white font-medium'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <item.icon className="w-5 h-5 shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      {utente && (
        <div className="p-3 border-t border-white/10">
          {!collapsed && (
            <div className="mb-2 px-2">
              <p className="text-sm font-medium truncate text-white">{utente.nome} {utente.cognome}</p>
              <p className="text-xs text-white/50">{utente.ruolo.replace(/_/g, ' ')}</p>
            </div>
          )}
          <button
            onClick={logout}
            className="flex items-center gap-2 px-3 py-2 w-full rounded-lg text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && 'Esci'}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 bg-flex-dark text-white p-2 rounded-lg shadow-lg"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-flex-dark text-white z-50">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 text-white/70 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div
        className={`hidden lg:flex flex-col bg-flex-dark text-white shrink-0 transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-3 -right-3 z-10 bg-flex-dark text-white/70 hover:text-white w-6 h-6 rounded-full border border-white/20 flex items-center justify-center text-xs"
          style={{ position: 'relative', alignSelf: 'flex-end', marginRight: '-12px', marginTop: '12px' }}
        >
          {collapsed ? '›' : '‹'}
        </button>
        {sidebarContent}
      </div>
    </>
  );
}
