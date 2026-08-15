import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import { ToastContainer } from './components/Toast';
import DashboardPage from './pages/DashboardPage';
import DevicesPage from './pages/DevicesPage';
import DeviceDetailPage from './pages/DeviceDetailPage';
import ConnectionHealthPage from './pages/ConnectionHealthPage';
import DiscoveryPage from './pages/DiscoveryPage';
import FirmwarePage from './pages/FirmwarePage';
import ConfigPage from './pages/ConfigPage';
import JobsPage from './pages/JobsPage';
import CredentialsPage from './pages/CredentialsPage';
import AuditPage from './pages/AuditPage';

export type Page =
  | 'dashboard' | 'devices' | 'device-detail' | 'connection-health'
  | 'discovery' | 'firmware' | 'config' | 'jobs' | 'credentials' | 'audit';

export type Theme = 'light' | 'dark';

const PAGE_TITLES: Record<Page, string> = {
  dashboard: 'Dashboard',
  devices: 'Devices',
  'device-detail': 'Device detail',
  'connection-health': 'Connection health',
  discovery: 'Discovery',
  firmware: 'Firmware',
  config: 'Configuration',
  jobs: 'Tasks',
  credentials: 'Credentials',
  audit: 'Audit log',
};

export default function App() {
  const [page, setPage] = useState<Page>('devices');
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(() =>
    (localStorage.getItem('ui-theme') === 'dark' ? 'dark' : 'light'));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('ui-theme', theme);
  }, [theme]);

  const openDevice = (id: string) => { setDeviceId(id); setPage('device-detail'); };

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <DashboardPage />;
      case 'devices': return <DevicesPage onOpenDevice={openDevice} />;
      case 'device-detail':
        return deviceId
          ? <DeviceDetailPage deviceId={deviceId} onBack={() => setPage('devices')} />
          : <DevicesPage onOpenDevice={openDevice} />;
      case 'connection-health': return <ConnectionHealthPage onOpenDevice={openDevice} />;
      case 'discovery': return <DiscoveryPage />;
      case 'firmware': return <FirmwarePage />;
      case 'config': return <ConfigPage />;
      case 'jobs': return <JobsPage />;
      case 'credentials': return <CredentialsPage />;
      case 'audit': return <AuditPage />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--surface)', color: 'var(--text)' }}>
      <ToastContainer />
      <Sidebar currentPage={page} onNavigate={setPage} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar title={PAGE_TITLES[page]} theme={theme}
          onToggleTheme={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))} />
        <main className="flex-1 overflow-auto">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
