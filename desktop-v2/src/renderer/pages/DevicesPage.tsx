import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [editing, setEditing] = useState<string | null>(null); // field being edited
  const [editValue, setEditValue] = useState('');
  const [groups, setGroups] = useState<any[]>([]);
  const [addForm, setAddForm] = useState({ name: '', ip_address: '', port: 80, manufacturer: 'controlid', model: '' });
  const [history, setHistory] = useState<any[]>([]);
  const detailRef = useRef<any>(null); // keep detail in sync

  const load = useCallback(async () => {
    const [devs, creds, grps] = await Promise.all([ipc.listDevices(), ipc.listCredentials(), ipc.listGroups()]);
    setDevices(devs);
    setCredentials(creds);
    setGroups(grps);
    // Update detail panel if open
    if (detailRef.current) {
      const updated = devs.find((d: any) => d.id === detailRef.current.id);
      if (updated) {
        setDetail(updated);
        detailRef.current = updated;
      }
    }
  }, []);

  useEffect(() => {
    load();
    // Poll device list every 3 seconds to keep status in sync
    const interval = setInterval(() => {
      ipc.listDevices().then(devs => {
        setDevices(devs);
        if (detailRef.current) {
          const updated = devs.find((d: any) => d.id === detailRef.current.id);
          if (updated) { setDetail(updated); detailRef.current = updated; }
        }
      });
    }, 3000);
    // Also listen for heartbeat events
    const unsub = ipc.on('heartbeat:update', () => {
      ipc.listDevices().then(devs => {
        setDevices(devs);
        if (detailRef.current) {
          const updated = devs.find((d: any) => d.id === detailRef.current.id);
          if (updated) { setDetail(updated); detailRef.current = updated; }
        }
      });
    });
    return () => { clearInterval(interval); unsub?.(); };
  }, []);

  const filtered = devices.filter(d =>
    !search || d.name?.toLowerCase().includes(search.toLowerCase()) ||
    d.ip_address?.includes(search) || d.model?.toLowerCase().includes(search.toLowerCase()) ||
    d.firmware_version?.includes(search) || d.mac_address?.toLowerCase().includes(search.toLowerCase())
  );

  const setDetailAndRef = (d: any) => {
    setDetail(d);
    detailRef.current = d;
    if (d?.id) ipc.deviceHistory(d.id, 90).then(setHistory).catch(() => setHistory([]));
    else setHistory([]);
  };

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
    if (!addForm.ip_address) return;
    await ipc.createDevice({ ...addForm, name: addForm.name || addForm.ip_address });
    setShowAdd(false);
    setAddForm({ name: '', ip_address: '', port: 80, manufacturer: 'controlid', model: '' });
    load();
  };

  const handleBatchReboot = async () => {
    if (!(await ipc.confirm(`Reboot ${selected.size} device(s)?`))) return;
    await ipc.batchReboot(Array.from(selected));
    setSelected(new Set());
  };

  const handleBatchTest = async () => {
    await ipc.batchTestConnection(Array.from(selected));
    setSelected(new Set());
    setTimeout(load, 2000);
  };

  const handleDelete = async (id: string) => {
    if (!(await ipc.confirm('Delete this device?'))) return;
    await ipc.deleteDevice(id);
    setDetailAndRef(null);
    load();
  };

  const handleTestConnection = async (deviceId: string) => {
    setTesting(true);
    try {
      const result = await ipc.testConnection(deviceId);
      await load();
      if (!result.connected) await ipc.confirm('Could not connect. Check credentials and port.');
    } catch (err: any) {
      await ipc.confirm(`Connection failed: ${err.message || err}`);
    } finally {
      setTesting(false);
    }
  };

  const handleAssignCredential = async (deviceId: string, credentialId: string) => {
    await ipc.updateDevice(deviceId, { credential_id: credentialId || null });
    await load();
  };

  const startEdit = (field: string, currentValue: string) => {
    setEditing(field);
    setEditValue(currentValue || '');
  };

  const saveEdit = async () => {
    if (!detail || !editing) return;
    await ipc.updateDevice(detail.id, { [editing]: editValue });
    setEditing(null);
    await load();
  };

  const cancelEdit = () => { setEditing(null); setEditValue(''); };

  return (
    <div className="flex h-full">
      {/* Main table area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-3 bg-slate-900/50 flex-shrink-0">
          <h1 className="text-lg font-bold text-white mr-4">Devices</h1>
          <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 w-64" />
          <span className="text-xs text-slate-500">{filtered.length} device(s)</span>
          <div className="flex-1" />
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-brand-400">{selected.size} selected</span>
              <button onClick={handleBatchTest} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">Test</button>
              <button onClick={() => ipc.batchBackup(Array.from(selected))} className="px-3 py-1.5 bg-slate-600 text-white text-xs rounded-lg hover:bg-slate-500">Backup</button>
              <button onClick={handleBatchReboot} className="px-3 py-1.5 bg-amber-600 text-white text-xs rounded-lg hover:bg-amber-700">Reboot</button>
            </div>
          )}
          <button onClick={() => ipc.exportDevicesCsv()} className="px-3 py-1.5 bg-slate-700 text-white text-xs rounded-lg hover:bg-slate-600">
            Export CSV
          </button>
          <button onClick={() => setShowAdd(!showAdd)} className="px-3 py-1.5 bg-brand-600 text-white text-xs rounded-lg hover:bg-brand-700">
            {showAdd ? 'Cancel' : '+ Add Device'}
          </button>
        </div>

        {showAdd && (
          <div className="px-4 py-3 bg-slate-800/50 border-b border-slate-700 flex items-center gap-3 flex-shrink-0">
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
                <th className="px-3 py-2.5">Serial</th>
                <th className="px-3 py-2.5">Firmware</th>
                <th className="px-3 py-2.5">MAC Address</th>
                <th className="px-3 py-2.5">DHCP</th>
                <th className="px-3 py-2.5">Last Heartbeat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filtered.map(d => (
                <tr key={d.id} onClick={() => setDetailAndRef(d)}
                  className={`cursor-pointer transition-colors ${detail?.id === d.id ? 'bg-slate-800' : 'hover:bg-slate-800/50'}`}>
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelect(d.id)} className="accent-brand-500" />
                  </td>
                  <td className="px-3 py-2"><span className={`inline-block w-2.5 h-2.5 rounded-full ${STATUS_COLORS[d.status] || 'bg-slate-500'}`} /></td>
                  <td className="px-3 py-2 font-medium text-white">{d.name || d.ip_address}</td>
                  <td className="px-3 py-2 font-mono text-xs" onClick={e => e.stopPropagation()}>
                    <a href="#" onClick={e => { e.preventDefault(); window.api.invoke('shell:open-url', `http://${d.ip_address}:${d.port}`); }}
                      className="text-brand-400 hover:text-brand-300 hover:underline">{d.ip_address}:{d.port}</a>
                  </td>
                  <td className="px-3 py-2 text-slate-400">{d.model || '-'}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{d.serial_number || '-'}</td>
                  <td className="px-3 py-2 text-slate-400 text-xs">{d.firmware_version || '-'}</td>
                  <td className="px-3 py-2 text-slate-500 font-mono text-xs">{d.mac_address || '-'}</td>
                  <td className="px-3 py-2 text-xs">{d.dhcp_enabled ? <span className="text-emerald-400">Yes</span> : <span className="text-slate-500">No</span>}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{d.last_heartbeat ? new Date(d.last_heartbeat).toLocaleString() : 'Never'}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="px-4 py-12 text-center text-slate-600">No devices found. Use Discovery to scan your network.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail panel */}
      {detail && (
        <div className="w-80 border-l border-slate-800 bg-slate-900/80 overflow-auto flex flex-col flex-shrink-0">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white truncate mr-2">{detail.name || detail.ip_address}</h2>
            <button onClick={() => setDetailAndRef(null)} className="text-slate-500 hover:text-white text-lg">&times;</button>
          </div>
          <div className="p-4 space-y-3 text-sm flex-1 overflow-auto">
            {/* Status */}
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[detail.status]} animate-pulse`} />
              <span className="text-slate-300 capitalize font-medium">{detail.status}</span>
            </div>

            {/* Editable fields */}
            <EditableField label="Name" value={detail.name} field="name" editing={editing} editValue={editValue}
              onStart={startEdit} onChange={setEditValue} onSave={saveEdit} onCancel={cancelEdit} />
            <div>
              <span className="text-xs text-slate-600 uppercase tracking-wide">IP Address</span>
              <div className="flex items-center gap-2 mt-0.5">
                <a href="#" onClick={e => { e.preventDefault(); window.api.invoke('shell:open-url', `http://${detail.ip_address}:${detail.port}`); }}
                  className="text-brand-400 hover:text-brand-300 hover:underline font-mono text-sm">
                  {detail.ip_address}:{detail.port}
                </a>
                <button onClick={() => startEdit('ip_address', detail.ip_address)}
                  className="text-xs text-slate-700 hover:text-brand-400">edit</button>
              </div>
              {editing === 'ip_address' && (
                <div className="flex gap-1 mt-1">
                  <input value={editValue} onChange={e => setEditValue(e.target.value)}
                    className="flex-1 px-2 py-1 bg-slate-800 border border-brand-500 rounded text-sm text-white" autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') { ipc.updateDevice(detail.id, { ip_address: editValue }).then(() => { setEditing(null); load(); }); } if (e.key === 'Escape') cancelEdit(); }} />
                  <button onClick={() => { ipc.updateDevice(detail.id, { ip_address: editValue }).then(() => { setEditing(null); load(); }); }} className="px-2 py-1 bg-emerald-600 text-white text-xs rounded">OK</button>
                  <button onClick={cancelEdit} className="px-2 py-1 bg-slate-700 text-white text-xs rounded">X</button>
                </div>
              )}
            </div>

            {/* Read-only fields */}
            {[
              ['Model', detail.model],
              ['Serial', detail.serial_number],
              ['MAC', detail.mac_address],
              ['Firmware', detail.firmware_version],
              ['Manufacturer', detail.manufacturer],
              ['HTTPS', detail.https_enabled ? 'Yes' : 'No'],
              ['DHCP', detail.dhcp_enabled ? 'Yes' : 'No'],
              ['Last Heartbeat', detail.last_heartbeat ? new Date(detail.last_heartbeat).toLocaleString() : 'Never'],
            ].map(([label, value]) => (
              <div key={label as string}>
                <span className="text-xs text-slate-600 uppercase tracking-wide">{label}</span>
                <p className="text-slate-300 mt-0.5">{(value as string) || '-'}</p>
              </div>
            ))}

            {/* Notes - editable */}
            <EditableField label="Notes" value={detail.notes} field="notes" editing={editing} editValue={editValue}
              onStart={startEdit} onChange={setEditValue} onSave={saveEdit} onCancel={cancelEdit} multiline />

            {/* Group assignment */}
            <div className="pt-2 border-t border-slate-800">
              <span className="text-xs text-slate-600 uppercase tracking-wide">Group</span>
              <div className="flex gap-1 mt-1">
                <select value={detail.group_id || ''} onChange={e => { ipc.updateDevice(detail.id, { group_id: e.target.value || null }); load(); }}
                  className="flex-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white">
                  <option value="">-- No group --</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <button onClick={async () => {
                  const name = await ipc.prompt('New Group', 'Enter group name:');
                  if (name) { await ipc.createGroup({ name }); load(); }
                }} className="px-2 py-1.5 bg-slate-700 text-white text-xs rounded hover:bg-slate-600">+</button>
              </div>
            </div>

            {/* Credential assignment */}
            <div className="pt-2 border-t border-slate-800">
              <span className="text-xs text-slate-600 uppercase tracking-wide">Credential</span>
              <select value={detail.credential_id || ''} onChange={e => handleAssignCredential(detail.id, e.target.value)}
                className="mt-1 w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white">
                <option value="">-- No credential --</option>
                {credentials.map(c => <option key={c.id} value={c.id}>{c.name} ({c.username})</option>)}
              </select>
              {!detail.credential_id && <p className="text-xs text-amber-400 mt-1">Assign a credential to enable actions</p>}
            </div>
          </div>

          {/* Connection History */}
          {history.length > 0 && (
            <div className="px-4 py-3 border-t border-slate-800 max-h-48 overflow-auto">
              <h3 className="text-xs text-slate-600 uppercase tracking-wide mb-2">Connection History (90 days)</h3>
              <div className="space-y-1">
                {history.slice(0, 50).map((h: any) => (
                  <div key={h.id} className="flex items-center gap-2 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${h.event === 'online' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className="text-slate-500 flex-1">{h.event === 'online' ? 'Connected' : 'Disconnected'}</span>
                    <span className="text-slate-600 text-[10px]">{new Date(h.timestamp).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="p-4 border-t border-slate-800 space-y-2 flex-shrink-0">
            <button onClick={() => handleTestConnection(detail.id)} disabled={testing || !detail.credential_id}
              className="w-full px-3 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
              {testing ? 'Testing...' : 'Test Connection'}</button>
            <button onClick={() => ipc.openDoor(detail.id)} disabled={!detail.credential_id}
              className="w-full px-3 py-2 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">Open Door</button>
            <button onClick={async () => { if (await ipc.confirm('Reboot this device?')) ipc.rebootDevice(detail.id); }} disabled={!detail.credential_id}
              className="w-full px-3 py-2 bg-amber-600 text-white text-xs rounded-lg hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed">Reboot</button>
            <button onClick={async () => {
              const name = await ipc.prompt('Save as Template', 'Enter template name:', `${detail.model || 'Device'} Config`);
              if (!name) return;
              try { await ipc.createTemplateFromDevice(detail.id, name); await ipc.confirm(`Template "${name}" created successfully.`); } catch (e: any) { await ipc.confirm(`Error: ${e.message}`); }
            }} disabled={!detail.credential_id}
              className="w-full px-3 py-2 bg-slate-700 text-white text-xs rounded-lg hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed">Save as Template</button>
            <button onClick={() => handleDelete(detail.id)}
              className="w-full px-3 py-2 bg-red-700/60 text-red-200 text-xs rounded-lg hover:bg-red-700">Delete Device</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Editable field component ─────────────────────────────────────
function EditableField({ label, value, field, editing, editValue, onStart, onChange, onSave, onCancel, multiline }: {
  label: string; value: string; field: string; editing: string | null; editValue: string;
  onStart: (field: string, value: string) => void; onChange: (v: string) => void;
  onSave: () => void; onCancel: () => void; multiline?: boolean;
}) {
  if (editing === field) {
    return (
      <div>
        <span className="text-xs text-slate-600 uppercase tracking-wide">{label}</span>
        <div className="flex gap-1 mt-1">
          {multiline ? (
            <textarea value={editValue} onChange={e => onChange(e.target.value)} rows={3}
              className="flex-1 px-2 py-1 bg-slate-800 border border-brand-500 rounded text-sm text-white" autoFocus />
          ) : (
            <input value={editValue} onChange={e => onChange(e.target.value)}
              className="flex-1 px-2 py-1 bg-slate-800 border border-brand-500 rounded text-sm text-white" autoFocus
              onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }} />
          )}
          <button onClick={onSave} className="px-2 py-1 bg-emerald-600 text-white text-xs rounded">OK</button>
          <button onClick={onCancel} className="px-2 py-1 bg-slate-700 text-white text-xs rounded">X</button>
        </div>
      </div>
    );
  }

  return (
    <div className="group cursor-pointer" onClick={() => onStart(field, value || '')}>
      <span className="text-xs text-slate-600 uppercase tracking-wide">{label}</span>
      <div className="flex items-center gap-1">
        <p className="text-slate-300 mt-0.5 flex-1">{value || '-'}</p>
        <span className="text-xs text-slate-700 group-hover:text-brand-400 transition-colors">edit</span>
      </div>
    </div>
  );
}
