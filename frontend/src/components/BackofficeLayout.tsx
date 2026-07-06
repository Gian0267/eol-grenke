import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import BackofficeSidebar from './BackofficeSidebar';
import { isTest, puoVedereTest } from '../lib/ambiente';

export default function BackofficeLayout() {
  const navigate = useNavigate();

  useEffect(() => {
    const stored = localStorage.getItem('nsm_user');
    if (!stored) navigate('/backoffice/login');
  }, [navigate]);

  let vistaTest = false;
  try {
    const u = JSON.parse(localStorage.getItem('nsm_user') || 'null');
    vistaTest = isTest() && puoVedereTest(u?.ruolo);
  } catch { /* utente non leggibile: vista live */ }

  return (
    <div className="min-h-screen flex bg-paper">
      <BackofficeSidebar />
      <main className="flex-1 min-w-0 overflow-auto">
        {vistaTest && (
          <div className="bg-amber-400 text-amber-950 text-center text-sm font-semibold py-1.5 sticky top-0 z-40">
            AMBIENTE DI TEST — dati finti: tutto ciò che vedi e crei qui è di prova
          </div>
        )}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 lg:pl-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
