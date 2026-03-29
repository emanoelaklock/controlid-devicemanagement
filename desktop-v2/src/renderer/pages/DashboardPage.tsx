import { useState, useEffect } from 'react';
import { ipc } from '../hooks/useIpc';

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [devices, setDevices] = useState<any[]>([]);

  useEffect(() => {
    const load = () => {
      ipc.getStats().then(setStats);
      ipc.listDevices().then(setDevices);
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!stats) return <div className="p-6 text-slate-500">Loading...</div>;

  // Security analysis
  const noCredential = devices.filter(d => !d.credential_id);
  const noHttps = devices.filter(d => !d.https_enabled && d.status === 'online');
  const firmwareVersions = new Map<string, any[]>();
  devices.forEach(d => {
    if (d.firmware_version) {
      const list = firmwareVersions.get(d.firmware_version) || [];
      list.push(d);
      firmwareVersions.set(d.firmware_version, list);
    }
  });
  const uniqueFirmwares = Array.from(firmwareVersions.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  const latestFirmware = uniqueFirmwares[0]?.[0];
  const outdatedFirmware = devices.filter(d => d.firmware_version && d.firmware_version !== latestFirmware);

  const statusCards = [
    { label: 'Total Devices', value: stats.devices.total, color: 'bg-slate-600', textColor: 'text-white' },
    { label: 'Online', value: stats.devices.online, color: 'bg-emerald-600', textColor: 'text-emerald-50' },
    { label: 'Offline', value: stats.devices.offline, color: 'bg-red-600', textColor: 'text-red-50' },
    { label: 'Error', value: stats.devices.error, color: 'bg-amber-600', textColor: 'text-amber-50' },
    { label: 'Unknown', value: stats.devices.unknown, color: 'bg-slate-700', textColor: 'text-slate-300' },
    { label: 'Jobs Running', value: stats.jobsRunning, color: 'bg-brand-600', textColor: 'text-brand-50' },
  ];

  const securityIssues = [
    ...noCredential.length > 0 ? [{ severity: 'warning' as const, text: `${noCredential.length} device(s) without credentials`, detail: noCredential.map(d => d.name).join(', ') }] : [],
    ...noHttps.length > 0 ? [{ severity: 'info' as const, text: `${noHttps.length} device(s) without HTTPS`, detail: noHttps.map(d => d.name).join(', ') }] : [],
    ...outdatedFirmware.length > 0 ? [{ severity: 'warning' as const, text: `${outdatedFirmware.length} device(s) with outdated firmware (latest: ${latestFirmware})`, detail: outdatedFirmware.map(d => `${d.name}: ${d.firmware_version}`).join(', ') }] : [],
  ];

  const onlinePercent = stats.devices.total > 0 ? Math.round((stats.devices.online / stats.devices.total) * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold text-white">Dashboard</h1>

      {/* Status cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statusCards.map((c) => (
          <div key={c.label} className={`${c.color} rounded-xl p-4`}>
            <p className={`text-xs ${c.textColor} opacity-80 uppercase tracking-wide`}>{c.label}</p>
            <p className={`text-3xl font-bold ${c.textColor} mt-1`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fleet health */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Fleet Health</h2>
          <div className="flex items-center gap-6">
            <div className="relative w-24 h-24">
              <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1e293b" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#10b981" strokeWidth="3"
                  strokeDasharray={`${onlinePercent} ${100 - onlinePercent}`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-bold text-white">{onlinePercent}%</span>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-slate-400">Online: {stats.devices.online}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-slate-400">Offline: {stats.devices.offline}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500" />
                <span className="text-slate-400">Error: {stats.devices.error}</span>
              </div>
            </div>
          </div>
          {stats.lastScanAt && (
            <p className="text-xs text-slate-600 mt-4">Last network scan: {new Date(stats.lastScanAt).toLocaleString()}</p>
          )}
        </div>

        {/* Security posture */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Security Posture</h2>
          {securityIssues.length === 0 ? (
            <div className="flex items-center gap-3 text-emerald-400">
              <span className="text-2xl">✓</span>
              <span className="text-sm">All devices are properly configured</span>
            </div>
          ) : (
            <div className="space-y-3">
              {securityIssues.map((issue, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    issue.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                  }`} />
                  <div>
                    <p className="text-sm text-slate-300">{issue.text}</p>
                    <p className="text-xs text-slate-600 mt-0.5 truncate max-w-sm" title={issue.detail}>{issue.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Firmware versions */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Firmware Versions</h2>
          {uniqueFirmwares.length === 0 ? (
            <p className="text-sm text-slate-600">No firmware data. Run Test Connection on devices.</p>
          ) : (
            <div className="space-y-2">
              {uniqueFirmwares.map(([version, devs]) => (
                <div key={version} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${version === latestFirmware ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <span className="text-sm text-white font-mono">{version}</span>
                    {version === latestFirmware && <span className="text-xs text-emerald-400">(latest)</span>}
                  </div>
                  <span className="text-xs text-slate-500">{devs.length} device(s)</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent alerts */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Recent Activity</h2>
          <div className="space-y-2 max-h-48 overflow-auto">
            {stats.recentAlerts.length === 0 && <p className="text-sm text-slate-600">No recent activity</p>}
            {stats.recentAlerts.map((a: any) => (
              <div key={a.id} className="flex items-center gap-2 text-xs">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  a.severity === 'critical' ? 'bg-red-500' : a.severity === 'error' ? 'bg-red-400' :
                  a.severity === 'warning' ? 'bg-amber-400' : 'bg-blue-400'
                }`} />
                <span className="text-slate-400 flex-1 truncate">{a.action}{a.device_name ? `: ${a.device_name}` : ''}</span>
                <span className="text-slate-600 flex-shrink-0">{new Date(a.created_at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
