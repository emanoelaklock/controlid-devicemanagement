import { useState, useEffect } from 'react';
import { ipc } from '../hooks/useIpc';

export default function DiscoveryPage() {
  const [ipRange, setIpRange] = useState('192.168.1.*');
  const [ports, setPorts] = useState('80, 443');
  const [timeout, setTimeout_] = useState(3000);
  const [concurrency, setConcurrency] = useState(20);
  const [scanning, setScanning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0, progress: 0, found: 0 });
  const [results, setResults] = useState<any[]>([]);

  useEffect(() => {
    const unsub1 = ipc.on('discovery:progress', (data: any) => {
      setProgress(data);
    });

    // Devices appear in real-time as they're found
    const unsub2 = ipc.on('discovery:device-found', (device: any) => {
      setResults(prev => {
        // Avoid duplicates
        if (prev.some(d => d.ipAddress === device.ipAddress && d.port === device.port)) return prev;
        return [...prev, device];
      });
    });

    const unsub3 = ipc.on('discovery:complete', () => {
      setScanning(false);
    });

    return () => { unsub1?.(); unsub2?.(); unsub3?.(); };
  }, []);

  const startScan = async () => {
    setScanning(true);
    setResults([]);
    setProgress({ completed: 0, total: 0, progress: 0, found: 0 });
    const ranges = ipRange.split(',').map(r => r.trim());
    const portList = ports.split(',').map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p));
    const id = await ipc.startScan({ ranges, ports: portList, timeout, concurrency });
    setJobId(id);
  };

  const cancelScan = () => {
    if (jobId) { ipc.cancelScan(jobId); setScanning(false); }
  };

  const addDevice = async (device: any) => {
    await ipc.createDevice({
      name: device.model ? `${device.model} - ${device.ipAddress}` : `Control iD Device - ${device.ipAddress}`,
      ip_address: device.ipAddress,
      port: device.port,
      manufacturer: device.manufacturer || 'controlid',
      model: device.model || '',
      serial_number: device.serialNumber || '',
      mac_address: device.macAddress || null,
      firmware_version: device.firmwareVersion || null,
      status: 'online',
      https_enabled: device.httpsEnabled ? 1 : 0,
    });
    setResults(prev => prev.map(r =>
      r.ipAddress === device.ipAddress ? { ...r, alreadyManaged: true } : r
    ));
  };

  const addAll = async () => {
    const unmanaged = results.filter(r => !r.alreadyManaged);
    for (const device of unmanaged) {
      await addDevice(device);
    }
  };

  return (
    <div className="p-6 flex flex-col h-full">
      <h1 className="text-xl font-bold text-white mb-4">Network Discovery</h1>

      {/* Scan form */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 mb-4 flex-shrink-0">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wide block mb-1">IP Range</label>
            <input value={ipRange} onChange={e => setIpRange(e.target.value)} placeholder="192.168.1.* or 10.0.0.1-254"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white" />
          </div>
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wide block mb-1">Ports</label>
            <input value={ports} onChange={e => setPorts(e.target.value)} placeholder="80, 443"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white" />
          </div>
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wide block mb-1">Timeout (ms)</label>
            <input type="number" value={timeout} onChange={e => setTimeout_(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white" />
          </div>
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wide block mb-1">Concurrency</label>
            <input type="number" value={concurrency} onChange={e => setConcurrency(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!scanning ? (
            <button onClick={startScan} className="px-5 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 font-medium">
              Start Scan
            </button>
          ) : (
            <button onClick={cancelScan} className="px-5 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 font-medium">
              Cancel
            </button>
          )}
          {(scanning || results.length > 0) && (
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>{progress.completed}/{progress.total} scanned</span>
                <span className="text-emerald-400 font-medium">{results.length} found</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-brand-500 rounded-full transition-all duration-200" style={{ width: `${progress.progress}%` }} />
              </div>
            </div>
          )}
          {results.length > 0 && !scanning && (
            <button onClick={addAll} className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700">
              Add All ({results.filter(r => !r.alreadyManaged).length})
            </button>
          )}
        </div>
      </div>

      {/* Results - shows in real-time as devices are found */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden flex-1 flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
          <h2 className="text-sm font-semibold text-slate-300">
            {scanning ? `Scanning... ${results.length} device(s) found` : `${results.length} device(s) found`}
          </h2>
          {scanning && <span className="inline-block w-2 h-2 rounded-full bg-brand-500 animate-pulse" />}
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/80 sticky top-0 z-10">
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-2.5">IP Address</th>
                <th className="px-4 py-2.5">Model</th>
                <th className="px-4 py-2.5">Serial</th>
                <th className="px-4 py-2.5">Firmware</th>
                <th className="px-4 py-2.5">MAC</th>
                <th className="px-4 py-2.5">Response</th>
                <th className="px-4 py-2.5 w-28">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {results.map((d, i) => (
                <tr key={i} className="hover:bg-slate-800/50 animate-fadeIn">
                  <td className="px-4 py-2.5 font-mono text-xs text-white">{d.ipAddress}:{d.port}</td>
                  <td className="px-4 py-2.5 text-slate-300">{d.model || 'Control iD Device'}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{d.serialNumber || '-'}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{d.firmwareVersion || '-'}</td>
                  <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{d.macAddress || '-'}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{d.responseTimeMs}ms</td>
                  <td className="px-4 py-2.5">
                    {d.alreadyManaged ? (
                      <span className="text-xs text-emerald-500">Added</span>
                    ) : (
                      <button onClick={() => addDevice(d)} className="px-3 py-1 bg-brand-600 text-white text-xs rounded hover:bg-brand-700">
                        Add
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {results.length === 0 && !scanning && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-600">Click "Start Scan" to discover devices on your network</td></tr>
              )}
              {results.length === 0 && scanning && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">Scanning network... devices will appear here as they are found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
