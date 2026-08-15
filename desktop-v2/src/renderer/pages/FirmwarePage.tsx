import { useState, useEffect } from 'react';
import { ipc } from '../hooks/useIpc';
import { toast } from '../components/Toast';

export default function FirmwarePage() {
  const [summary, setSummary] = useState<any>(null);
  const [checking, setChecking] = useState(false);

  const load = () => ipc.firmwareSummary().then(setSummary);
  useEffect(() => { load(); }, []);

  const handleCheckAll = async () => {
    if (!summary) return;
    setChecking(true);
    const allIds = summary.versions.flatMap((v: any) => v.devices.map((d: any) => d.id));
    try {
      await ipc.firmwareCheckAll(allIds);
      setTimeout(() => { load(); setChecking(false); }, 3000);
    } catch { setChecking(false); }
  };

  const handleRepair = async (d: any) => {
    if (!(await ipc.confirm(`Reinstall the current firmware on "${d.name}" via recovery mode? Settings and users are KEPT. The device stays offline for several minutes while it reboots into recovery, reapplies its firmware image and boots back.`))) return;
    try {
      await ipc.firmwareRepair([d.id]);
      toast('Firmware repair started — follow progress on the Tasks page.', 'info');
    } catch (e: any) { toast(`Could not start repair: ${e.message || e}`, 'error'); }
  };

  if (!summary) return <div className="p-6 text-slate-500">Loading...</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">Firmware Management</h1>
        <button onClick={handleCheckAll} disabled={checking}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {checking ? 'Checking...' : 'Check All Devices'}
        </button>
      </div>

      {/* How firmware installs work on Control iD devices */}
      <div className="mb-6 px-4 py-3 bg-slate-800/60 border border-slate-700 rounded-xl text-xs text-slate-400">
        <span className="text-slate-300 font-semibold">Repair</span> reinstalls the firmware image already
        stored on the device through its recovery mode (settings and users are kept) — use it for corrupted
        installs or boot loops. Control iD devices download <span className="text-slate-300">new</span> firmware
        versions themselves via the update option on the device's About screen / web interface; the API does
        not accept firmware uploads.
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Total Devices</p>
          <p className="text-2xl font-bold text-white mt-1">{summary.total}</p>
        </div>
        <div className="bg-emerald-900/30 rounded-xl border border-emerald-700/50 p-4">
          <p className="text-xs text-emerald-400 uppercase tracking-wide">Latest Version</p>
          <p className="text-2xl font-bold text-emerald-300 mt-1 font-mono">{summary.latest || 'N/A'}</p>
        </div>
        <div className={`rounded-xl border p-4 ${summary.outdated.length > 0 ? 'bg-amber-900/30 border-amber-700/50' : 'bg-slate-800 border-slate-700'}`}>
          <p className={`text-xs uppercase tracking-wide ${summary.outdated.length > 0 ? 'text-amber-400' : 'text-slate-500'}`}>Outdated</p>
          <p className={`text-2xl font-bold mt-1 ${summary.outdated.length > 0 ? 'text-amber-300' : 'text-white'}`}>{summary.outdated.length}</p>
        </div>
      </div>

      {/* Version breakdown */}
      <div className="space-y-4">
        {summary.versions.map((v: any) => (
          <div key={v.version} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`w-3 h-3 rounded-full ${v.isLatest ? 'bg-emerald-500' : v.version === 'Unknown' ? 'bg-slate-500' : 'bg-amber-500'}`} />
                <span className="text-sm font-semibold text-white font-mono">{v.version}</span>
                {v.isLatest && <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">Latest</span>}
                {!v.isLatest && v.version !== 'Unknown' && (
                  <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">Outdated</span>
                )}
              </div>
              <span className="text-xs text-slate-500">{v.count} device(s)</span>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-700/50">
                {v.devices.map((d: any) => (
                  <tr key={d.id} className="hover:bg-slate-800/50">
                    <td className="px-4 py-2 text-white">{d.name}</td>
                    <td className="px-4 py-2 text-slate-400 font-mono text-xs">{d.ip_address}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block w-2 h-2 rounded-full ${d.status === 'online' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => handleRepair(d)}
                        className="px-2.5 py-1 bg-slate-700 text-slate-300 text-xs rounded hover:bg-rose-700 hover:text-white transition-colors">
                        Repair
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {summary.versions.length === 0 && (
        <div className="text-center py-16 text-slate-600">
          <p className="text-lg mb-2">No firmware data</p>
          <p className="text-sm">Click "Check All Devices" to query firmware versions from all managed devices.</p>
        </div>
      )}
    </div>
  );
}
