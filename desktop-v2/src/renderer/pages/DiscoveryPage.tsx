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
    const unsub = ipc.on('discovery:progress', (data: any) => {
      setProgress(data);
    });
    const unsub2 = ipc.on('discovery:complete', (data: any) => {
      setResults(data.devices || []);
      setScanning(false);
    });
    return () => { unsub?.(); unsub2?.(); };
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
      name: device.model ? `${device.model} - ${device.ipAddress}` : device.ipAddress,
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
    // Mark as managed
    setResults(prev => prev.map(r =>
      r.ipAddress === device.ipAddress ? { ...r, alreadyManaged: true } : r
    ));
  };

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-white mb-6">Network Discovery</h1>

      {/* Scan form */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 mb-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wide block mb-1">IP Range</label>
            <input value={ipRange} onChange={e => setIpRange(e.target.value)} placeholder="192.168.1.* or 10.0.0.1-254"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white" />
          </div>
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wide block mb-1">Ports</label>
            <input value={ports} onChange={e => setPorts(e.target.value)} placeholder="443, 80"
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
          {scanning && (
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>{progress.completed}/{progress.total} scanned</span>
                <span>{progress.found} found</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-brand-500 rounded-full transition-all duration-300" style={{ width: `${progress.progress}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700">
            <h2 className="text-sm font-semibold text-slate-300">{results.length} device(s) found</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-800/80">
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-2.5">IP Address</th>
                <th className="px-4 py-2.5">Manufacturer</th>
                <th className="px-4 py-2.5">Model</th>
                <th className="px-4 py-2.5">Firmware</th>
                <th className="px-4 py-2.5">MAC</th>
                <th className="px-4 py-2.5">Response</th>
                <th className="px-4 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {results.map((d, i) => (
                <tr key={i} className="hover:bg-slate-800/50">
                  <td className="px-4 py-2.5 font-mono text-xs text-white">{d.ipAddress}:{d.port}</td>
                  <td className="px-4 py-2.5 text-slate-400 capitalize">{d.manufacturer || 'Unknown'}</td>
                  <td className="px-4 py-2.5 text-slate-400">{d.model || '-'}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{d.firmwareVersion || '-'}</td>
                  <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{d.macAddress || '-'}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{d.responseTimeMs}ms</td>
                  <td className="px-4 py-2.5">
                    {d.alreadyManaged ? (
                      <span className="text-xs text-slate-600">Already managed</span>
                    ) : (
                      <button onClick={() => addDevice(d)} className="px-3 py-1 bg-brand-600 text-white text-xs rounded hover:bg-brand-700">
                        Add
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
