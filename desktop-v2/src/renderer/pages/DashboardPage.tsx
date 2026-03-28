import { useState, useEffect } from 'react';
import { ipc } from '../hooks/useIpc';

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    ipc.getStats().then(setStats);
    const interval = setInterval(() => ipc.getStats().then(setStats), 10000);
    return () => clearInterval(interval);
  }, []);

  if (!stats) return <div className="p-6 text-slate-500">Loading...</div>;

  const cards = [
    { label: 'Total Devices', value: stats.devices.total, color: 'bg-slate-700' },
    { label: 'Online', value: stats.devices.online, color: 'bg-emerald-600' },
    { label: 'Offline', value: stats.devices.offline, color: 'bg-red-600' },
    { label: 'Error', value: stats.devices.error, color: 'bg-amber-600' },
    { label: 'Unknown', value: stats.devices.unknown, color: 'bg-slate-600' },
    { label: 'Jobs Running', value: stats.jobsRunning, color: 'bg-brand-600' },
  ];

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-white mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className={`w-2.5 h-2.5 rounded-full ${c.color} mb-2`} />
            <p className="text-xs text-slate-500 uppercase tracking-wide">{c.label}</p>
            <p className="text-2xl font-bold text-white mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      {stats.lastScanAt && (
        <p className="text-xs text-slate-600 mb-4">Last network scan: {new Date(stats.lastScanAt).toLocaleString()}</p>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700">
        <div className="px-4 py-3 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-slate-300">Recent Alerts</h2>
        </div>
        <div className="divide-y divide-slate-700/50">
          {stats.recentAlerts.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-600">No recent alerts</p>
          )}
          {stats.recentAlerts.map((a: any) => (
            <div key={a.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                a.severity === 'critical' ? 'bg-red-500' : a.severity === 'error' ? 'bg-red-400' :
                a.severity === 'warning' ? 'bg-amber-400' : 'bg-blue-400'
              }`} />
              <span className="text-slate-400 flex-1">{a.action}: {a.details || a.device_name || ''}</span>
              <span className="text-xs text-slate-600">{new Date(a.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
