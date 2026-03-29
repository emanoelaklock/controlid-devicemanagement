import { useState, useEffect, useCallback } from 'react';
import { ipc } from '../hooks/useIpc';

export default function PeoplePage() {
  const [people, setPeople] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ name: '', registration: '', card_number: '', pin_code: '', group_name: '' });

  const load = useCallback(async () => {
    const [p, d] = await Promise.all([ipc.listPeople({ search: search || undefined }), ipc.listDevices()]);
    setPeople(p);
    setDevices(d);
    if (detail) {
      const updated = await ipc.getPerson(detail.id);
      if (updated) setDetail(updated);
    }
  }, [search, detail?.id]);

  useEffect(() => { load(); }, [search]);

  const handleAdd = async () => {
    if (!form.name || !form.registration) { alert('Name and Registration are required'); return; }
    try {
      await ipc.createPerson(form);
      setShowAdd(false);
      setForm({ name: '', registration: '', card_number: '', pin_code: '', group_name: '' });
      load();
    } catch (err: any) { alert(`Error: ${err.message}`); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this person?')) return;
    await ipc.deletePerson(id);
    setDetail(null);
    load();
  };

  const handleAssignDevices = async () => {
    if (!detail || selected.size === 0) return;
    await ipc.assignDevices(detail.id, Array.from(selected));
    setShowAssign(false);
    setSelected(new Set());
    const updated = await ipc.getPerson(detail.id);
    setDetail(updated);
    load();
  };

  const handleUnassign = async (deviceId: string) => {
    if (!detail) return;
    await ipc.unassignDevice(detail.id, deviceId);
    const updated = await ipc.getPerson(detail.id);
    setDetail(updated);
    load();
  };

  const handleSync = async (deviceId: string) => {
    if (!detail) return;
    try {
      await ipc.syncPersonToDevice(detail.id, deviceId);
      const updated = await ipc.getPerson(detail.id);
      setDetail(updated);
    } catch (err: any) { alert(`Sync failed: ${err.message}`); }
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-3 bg-slate-900/50 flex-shrink-0">
          <h1 className="text-lg font-bold text-white mr-4">People</h1>
          <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 w-64" />
          <span className="text-xs text-slate-500">{people.length} person(s)</span>
          <div className="flex-1" />
          <button onClick={() => setShowAdd(!showAdd)} className="px-3 py-1.5 bg-brand-600 text-white text-xs rounded-lg hover:bg-brand-700">
            {showAdd ? 'Cancel' : '+ Add Person'}
          </button>
        </div>

        {showAdd && (
          <div className="px-4 py-3 bg-slate-800/50 border-b border-slate-700 flex items-center gap-3 flex-shrink-0">
            <input placeholder="Name *" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white w-40" />
            <input placeholder="Registration *" value={form.registration} onChange={e => setForm({...form, registration: e.target.value})} className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white w-32" />
            <input placeholder="Card Number" value={form.card_number} onChange={e => setForm({...form, card_number: e.target.value})} className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white w-32" />
            <input placeholder="PIN" value={form.pin_code} onChange={e => setForm({...form, pin_code: e.target.value})} className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white w-20" />
            <input placeholder="Group" value={form.group_name} onChange={e => setForm({...form, group_name: e.target.value})} className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white w-28" />
            <button onClick={handleAdd} className="px-4 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700">Save</button>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/80 sticky top-0 z-10">
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-3 py-2.5">Name</th>
                <th className="px-3 py-2.5">Registration</th>
                <th className="px-3 py-2.5">Card</th>
                <th className="px-3 py-2.5">Group</th>
                <th className="px-3 py-2.5">Devices</th>
                <th className="px-3 py-2.5">Synced</th>
                <th className="px-3 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {people.map(p => (
                <tr key={p.id} onClick={() => ipc.getPerson(p.id).then(setDetail)}
                  className={`cursor-pointer transition-colors ${detail?.id === p.id ? 'bg-slate-800' : 'hover:bg-slate-800/50'}`}>
                  <td className="px-3 py-2 text-white font-medium">{p.name}</td>
                  <td className="px-3 py-2 text-slate-400 font-mono text-xs">{p.registration}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{p.card_number || '-'}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{p.group_name || '-'}</td>
                  <td className="px-3 py-2 text-slate-400 text-xs">{p.deviceCount}</td>
                  <td className="px-3 py-2 text-xs">{p.syncedCount}/{p.deviceCount}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${p.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {p.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
              {people.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-600">No people registered</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail panel */}
      {detail && (
        <div className="w-80 border-l border-slate-800 bg-slate-900/80 overflow-auto flex flex-col flex-shrink-0">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white truncate mr-2">{detail.name}</h2>
            <button onClick={() => setDetail(null)} className="text-slate-500 hover:text-white">&times;</button>
          </div>
          <div className="p-4 space-y-3 text-sm flex-1 overflow-auto">
            {[['Registration', detail.registration], ['Card Number', detail.card_number], ['PIN Code', detail.pin_code ? '****' : null],
              ['Group', detail.group_name], ['Status', detail.active ? 'Active' : 'Inactive'], ['Notes', detail.notes],
            ].map(([label, value]) => (
              <div key={label as string}>
                <span className="text-xs text-slate-600 uppercase tracking-wide">{label}</span>
                <p className="text-slate-300 mt-0.5">{(value as string) || '-'}</p>
              </div>
            ))}

            {/* Assigned devices */}
            <div className="pt-3 border-t border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-600 uppercase tracking-wide">Assigned Devices</span>
                <button onClick={() => setShowAssign(true)} className="text-xs text-brand-400 hover:underline">+ Assign</button>
              </div>
              {detail.devices?.length === 0 && <p className="text-xs text-slate-600">No devices assigned</p>}
              {detail.devices?.map((pd: any) => (
                <div key={pd.id} className="flex items-center justify-between py-1.5 border-b border-slate-800/50">
                  <div>
                    <p className="text-xs text-white">{pd.device_name}</p>
                    <p className="text-xs text-slate-500">{pd.ip_address}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {pd.synced ? (
                      <span className="text-xs text-emerald-400">Synced</span>
                    ) : (
                      <button onClick={() => handleSync(pd.device_id)} className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">Sync</button>
                    )}
                    <button onClick={() => handleUnassign(pd.device_id)} className="text-xs text-red-500 hover:underline ml-1">×</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Assign devices modal */}
            {showAssign && (
              <div className="pt-3 border-t border-slate-800">
                <p className="text-xs text-slate-400 mb-2">Select devices to assign:</p>
                <div className="max-h-40 overflow-auto space-y-1">
                  {devices.filter(d => !detail.devices?.some((pd: any) => pd.device_id === d.id)).map(d => (
                    <label key={d.id} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input type="checkbox" checked={selected.has(d.id)} onChange={() => {
                        const next = new Set(selected);
                        next.has(d.id) ? next.delete(d.id) : next.add(d.id);
                        setSelected(next);
                      }} className="accent-brand-500" />
                      {d.name} ({d.ip_address})
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={handleAssignDevices} className="px-3 py-1 bg-emerald-600 text-white text-xs rounded">Assign</button>
                  <button onClick={() => { setShowAssign(false); setSelected(new Set()); }} className="px-3 py-1 bg-slate-700 text-white text-xs rounded">Cancel</button>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-800 space-y-2 flex-shrink-0">
            <button onClick={() => handleDelete(detail.id)} className="w-full px-3 py-2 bg-red-700/60 text-red-200 text-xs rounded-lg hover:bg-red-700">Delete Person</button>
          </div>
        </div>
      )}
    </div>
  );
}
