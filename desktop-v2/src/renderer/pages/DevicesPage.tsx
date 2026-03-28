import { useState, useEffect, useCallback } from 'react';
import { ipc } from '../hooks/useIpc';

const STATUS_COLORS: Record<string, string> = {
  online: 'bg-emerald-500', offline: 'bg-red-500', error: 'bg-amber-500',
  syncing: 'bg-blue-500', unknown: 'bg-slate-500', unreachable: 'bg-red-400',
};

export default function DevicesPage() {
  const [devices, setDevices] = useState<any[]>([]);
  const [credentials, setCredentials] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [testing, setTesting] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', ip_address: '', port: 80, manufacturer: 'controlid', model: '' });

  const load = useCallback(() => {
    ipc.listDevices().then(setDevices);
    ipc.listCredentials().then(setCredentials);
  }, []);
  useEffect(() => {
    load();
    // Listen for heartbeat updates to refresh device statuses
    const unsub = ipc.on('heartbeat:update', () => {
      ipc.listDevices().then(setDevices);
    });
    return () => { unsub?.(); };
  }, [load]);

  const filtered = devices.filter(d =>
    !search || d.name?.toLowerCase().includes(search.toLowerCase()) ||
    d.ip_address?.includes(search) || d.model?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(d => d.id)));
  };

  const handleAdd = async () => {
    await ipc.createDevice(addForm);
    setShowAdd(false);
    setAddForm({ name: '', ip_address: '', port: 80, manufacturer: 'controlid', model: '' });
    load();
  };

  const handleBatchReboot = async () => {
    if (!confirm(`Reboot ${selected.size} device(s)?`)) return;
    await ipc.batchReboot(Array.from(selected));
    setSelected(new Set());
  };

  const handleBatchTest = async () => {
    await ipc.batchTestConnection(Array.from(selected));
    setSelected(new Set());
    setTimeout(load, 2000);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this device?')) return;
    await ipc.deleteDevice(id);
    setDetail(null);
    load();
  };

  const handleTestConnection = async (deviceId: string) => {
    setTesting(true);
    try {
      const result = await ipc.testConnection(deviceId);
      const updated = await ipc.getDevice(deviceId);
      setDetail(updated);
      load();
      if (!result.connected) {
        alert('Could not connect. Check credentials and port.');
      }
    } catch (err: any) {
      alert(`Connection failed: ${err.message || err}`);
    } finally {
      setTesting(false);
    }
  };

  const handleAssignCredential = async (deviceId: string, credentialId: string) => {
    await ipc.updateDevice(deviceId, { credential_id: credentialId || null });
    const updated = await ipc.getDevice(deviceId);
    setDetail(updated);
    load();
  };

  return (
    <div className="flex h-full">
      {/* Main table area */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-3 bg-slate-900/50">
          <h1 className="text-lg font-bold text-white mr-4">Devices</h1>
          <input
            placeholder="Search devices..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 w-64"
          />
          <span className="text-xs text-slate-500">{filtered.length} device(s)</span>
          <div className="flex-1" />

          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-brand-400">{selected.size} selected</span>
              <button onClick={handleBatchTest} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">Test Connection</button>
              <button onClick={handleBatchReboot} className="px-3 py-1.5 bg-amber-600 text-white text-xs rounded-lg hover:bg-amber-700">Reboot</button>
            </div>
          )}
          <button onClick={() => setShowAdd(!showAdd)} className="px-3 py-1.5 bg-brand-600 text-white text-xs rounded-lg hover:bg-brand-700">
            {showAdd ? 'Cancel' : '+ Add Device'}
          </button>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="px-4 py-3 bg-slate-800/50 border-b border-slate-700 flex items-center gap-3">
            <input placeholder="Name" value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})} className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white w-40" />
            <input placeholder="IP Address" value={addForm.ip_address} onChange={e => setAddForm({...addForm, ip_address: e.target.value})} className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white w-40" />
            <input placeholder="Port" type="number" value={addForm.port} onChange={e => setAddForm({...addForm, port: Number(e.target.value)})} className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white w-20" />
            <input placeholder="Model" value={addForm.model} onChange={e => setAddForm({...addForm, model: e.target.value})} className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white w-32" />
            <button onClick={handleAdd} className="px-4 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700">Save</button>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/80 sticky top-0 z-10">
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-3 py-2.5 w-8"><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={selectAll} className="accent-brand-500" /></th>
                <th className="px-3 py-2.5 w-8">Status</th>
                <th className="px-3 py-2.5">Name</th>
                <th className="px-3 py-2.5">IP Address</th>
                <th className="px-3 py-2.5">Model</th>
                <th className="px-3 py-2.5">Firmware</th>
                <th className="px-3 py-2.5">MAC Address</th>
                <th className="px-3 py-2.5">Credential</th>
                <th className="px-3 py-2.5">Last Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filtered.map(d => (
                <tr key={d.id} onClick={() => setDetail(d)} className={`cursor-pointer transition-colors ${detail?.id === d.id ? 'bg-slate-800' : 'hover:bg-slate-800/50'}`}>
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelect(d.id)} className="accent-brand-500" />
                  </td>
                  <td className="px-3 py-2"><span className={`inline-block w-2.5 h-2.5 rounded-full ${STATUS_COLORS[d.status] || 'bg-slate-500'}`} /></td>
                  <td className="px-3 py-2 font-medium text-white">{d.name || d.ip_address}</td>
                  <td className="px-3 py-2 text-slate-400 font-mono text-xs">{d.ip_address}:{d.port}</td>
                  <td className="px-3 py-2 text-slate-400">{d.model || '-'}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{d.firmware_version || '-'}</td>
                  <td className="px-3 py-2 text-slate-500 font-mono text-xs">{d.mac_address || '-'}</td>
                  <td className="px-3 py-2 text-xs">{d.credential_name ? <span className="text-emerald-400">{d.credential_name}</span> : <span className="text-red-400">None</span>}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{d.last_heartbeat ? new Date(d.last_heartbeat).toLocaleString() : 'Never'}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-600">No devices found. Use Discovery to scan your network.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail panel */}
      {detail && (
        <div className="w-80 border-l border-slate-800 bg-slate-900/80 overflow-auto flex flex-col">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">{detail.name || detail.ip_address}</h2>
            <button onClick={() => setDetail(null)} className="text-slate-500 hover:text-white text-lg">&times;</button>
          </div>
          <div className="p-4 space-y-3 text-sm flex-1 overflow-auto">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[detail.status]}`} />
              <span className="text-slate-300 capitalize">{detail.status}</span>
            </div>
            {[
              ['IP', `${detail.ip_address}:${detail.port}`],
              ['Model', detail.model], ['Serial', detail.serial_number],
              ['MAC', detail.mac_address], ['Firmware', detail.firmware_version],
              ['Manufacturer', detail.manufacturer], ['HTTPS', detail.https_enabled ? 'Yes' : 'No'],
              ['DHCP', detail.dhcp_enabled ? 'Yes' : 'No'],
              ['Last Heartbeat', detail.last_heartbeat ? new Date(detail.last_heartbeat).toLocaleString() : 'Never'],
              ['Group', detail.group_name], ['Notes', detail.notes],
            ].map(([label, value]) => (
              <div key={label as string}>
                <span className="text-xs text-slate-600 uppercase tracking-wide">{label}</span>
                <p className="text-slate-300 mt-0.5">{(value as string) || '-'}</p>
              </div>
            ))}

            {/* Credential assignment */}
            <div className="pt-2 border-t border-slate-800">
              <span className="text-xs text-slate-600 uppercase tracking-wide">Credential</span>
              <select
                value={detail.credential_id || ''}
                onChange={e => handleAssignCredential(detail.id, e.target.value)}
                className="mt-1 w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white"
              >
                <option value="">-- No credential --</option>
                {credentials.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.username})</option>
                ))}
              </select>
              {!detail.credential_id && (
                <p className="text-xs text-amber-400 mt-1">Assign a credential to test connection</p>
              )}
            </div>
          </div>

          <div className="p-4 border-t border-slate-800 space-y-2">
            <button
              onClick={() => handleTestConnection(detail.id)}
              disabled={testing || !detail.credential_id}
              className="w-full px-3 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button onClick={() => ipc.openDoor(detail.id)} disabled={!detail.credential_id}
              className="w-full px-3 py-2 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">Open Door</button>
            <button onClick={() => ipc.rebootDevice(detail.id)} disabled={!detail.credential_id}
              className="w-full px-3 py-2 bg-amber-600 text-white text-xs rounded-lg hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed">Reboot</button>
            <button onClick={() => ipc.backupConfig(detail.id)} disabled={!detail.credential_id}
              className="w-full px-3 py-2 bg-slate-700 text-white text-xs rounded-lg hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed">Backup Config</button>
            <button onClick={() => handleDelete(detail.id)}
              className="w-full px-3 py-2 bg-red-700 text-white text-xs rounded-lg hover:bg-red-600">Delete Device</button>
          </div>
        </div>
      )}
    </div>
  );
}
