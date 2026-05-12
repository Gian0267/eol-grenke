import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import BackofficeSidebar from './BackofficeSidebar';

export default function BackofficeLayout() {
  const navigate = useNavigate();

  useEffect(() => {
    const stored = localStorage.getItem('nsm_user');
    if (!stored) navigate('/backoffice/login');
  }, [navigate]);

  return (
    <div className="min-h-screen flex bg-gray-50">
      <BackofficeSidebar />
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 lg:pl-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
