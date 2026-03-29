import { useState } from 'react';
import Sidebar from './components/Sidebar';
import { ToastContainer } from './components/Toast';
import DashboardPage from './pages/DashboardPage';
import DevicesPage from './pages/DevicesPage';
import DiscoveryPage from './pages/DiscoveryPage';
import TemplatesPage from './pages/TemplatesPage';
import FirmwarePage from './pages/FirmwarePage';
import JobsPage from './pages/JobsPage';
import CredentialsPage from './pages/CredentialsPage';
import AuditPage from './pages/AuditPage';

export type Page = 'dashboard' | 'devices' | 'discovery' | 'templates' | 'firmware' | 'jobs' | 'credentials' | 'audit';

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <DashboardPage />;
      case 'devices': return <DevicesPage />;
      case 'discovery': return <DiscoveryPage />;
      case 'templates': return <TemplatesPage />;
      case 'firmware': return <FirmwarePage />;
      case 'jobs': return <JobsPage />;
      case 'credentials': return <CredentialsPage />;
      case 'audit': return <AuditPage />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <ToastContainer />
      <Sidebar currentPage={page} onNavigate={setPage} />
      <main className="flex-1 overflow-auto bg-slate-900">
        {renderPage()}
      </main>
    </div>
  );
}
