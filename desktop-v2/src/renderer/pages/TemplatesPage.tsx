import { useState, useEffect } from 'react';
import { ipc } from '../hooks/useIpc';
import { fmtDate } from '../utils/date';
import { toast } from '../components/Toast';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applyingTemplate, setApplyingTemplate] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);

  const load = () => {
    ipc.listTemplates().then(setTemplates);
    ipc.listDevices().then(setDevices);
  };
  useEffect(() => { load(); }, []);

  const handleCreateFromDevice = async () => {
    const deviceId = await ipc.prompt('Create Template', 'Enter device ID (go to Devices → click device → copy ID)');
    if (!deviceId) return;
    const name = await ipc.prompt('Template Name', 'Enter a name for this template:');
    if (!name) return;
    try {
      await ipc.createTemplateFromDevice(deviceId, name);
      load();
    } catch (err: any) { toast(`Error: ${err.message}`); }
  };

  const handleDelete = async (id: string) => {
    if (!(await ipc.confirm('Delete this template?'))) return;
    await ipc.deleteTemplate(id);
    setDetail(null);
    load();
  };

  const handleApply = async () => {
    if (!applyingTemplate || selected.size === 0) return;
    try {
      await ipc.applyTemplate(applyingTemplate.id, Array.from(selected));
      setApplyingTemplate(null);
      setSelected(new Set());
      toast('Template application started. Check Tasks for progress.');
    } catch (err: any) { toast(`Error: ${err.message}`); }
  };

  const viewConfig = async (id: string) => {
    const t = await ipc.getTemplate(id);
    setDetail(t);
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-3 bg-slate-900/50 flex-shrink-0">
          <h1 className="text-lg font-bold text-white mr-4">Configuration Templates</h1>
          <span className="text-xs text-slate-500">{templates.length} template(s)</span>
          <div className="flex-1" />
          <p className="text-xs text-slate-600 mr-2">Create from: Devices → Detail → Backup Config</p>
        </div>

        {/* Apply template bar */}
        {applyingTemplate && (
          <div className="px-4 py-3 bg-brand-900/30 border-b border-brand-700 flex items-center gap-3 flex-shrink-0">
            <span className="text-sm text-white">Apply "{applyingTemplate.name}" to:</span>
            <span className="text-xs text-brand-400">{selected.size} device(s) selected</span>
            <div className="flex-1" />
            <button onClick={handleApply} disabled={selected.size === 0}
              className="px-4 py-1.5 bg-brand-600 text-white text-xs rounded-lg hover:bg-brand-700 disabled:opacity-40">Apply to Selected</button>
            <button onClick={() => { setApplyingTemplate(null); setSelected(new Set()); }}
              className="px-4 py-1.5 bg-slate-700 text-white text-xs rounded-lg">Cancel</button>
          </div>
        )}

        {/* Show device selection when applying */}
        {applyingTemplate ? (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/80 sticky top-0 z-10">
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2.5 w-8"><input type="checkbox" onChange={() => {
                    if (selected.size === devices.length) setSelected(new Set());
                    else setSelected(new Set(devices.map(d => d.id)));
                  }} className="accent-brand-500" /></th>
                  <th className="px-3 py-2.5">Name</th>
                  <th className="px-3 py-2.5">IP Address</th>
                  <th className="px-3 py-2.5">Model</th>
                  <th className="px-3 py-2.5">Manufacturer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {devices.map(d => (
                  <tr key={d.id} className="hover:bg-slate-800/50">
                    <td className="px-3 py-2"><input type="checkbox" checked={selected.has(d.id)}
                      onChange={() => { const n = new Set(selected); n.has(d.id) ? n.delete(d.id) : n.add(d.id); setSelected(n); }}
                      className="accent-brand-500" /></td>
                    <td className="px-3 py-2 text-white">{d.name}</td>
                    <td className="px-3 py-2 text-slate-400 font-mono text-xs">{d.ip_address}</td>
                    <td className="px-3 py-2 text-slate-400">{d.model || '-'}</td>
                    <td className="px-3 py-2 text-slate-500 capitalize">{d.manufacturer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Templates list */
          <div className="flex-1 overflow-auto p-4">
            {templates.length === 0 && (
              <div className="text-center py-16 text-slate-600">
                <p className="text-lg mb-2">No templates yet</p>
                <p className="text-sm">Go to Devices → select a device → Backup Config to create a template from a device's configuration.</p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map(t => (
                <div key={t.id} className="bg-slate-800 rounded-xl border border-slate-700 p-4 hover:border-slate-600 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white">{t.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5 capitalize">{t.manufacturer} {t.model ? `• ${t.model}` : ''}</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 mb-3">Created: {fmtDate(t.created_at)}</p>
                  <div className="flex gap-2">
                    <button onClick={() => viewConfig(t.id)} className="px-3 py-1 bg-slate-700 text-white text-xs rounded hover:bg-slate-600">View</button>
                    <button onClick={() => { setApplyingTemplate(t); setSelected(new Set()); }}
                      className="px-3 py-1 bg-brand-600 text-white text-xs rounded hover:bg-brand-700">Apply to Devices</button>
                    <button onClick={() => handleDelete(t.id)} className="px-3 py-1 bg-red-700/60 text-red-200 text-xs rounded hover:bg-red-700">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Config viewer panel */}
      {detail && !applyingTemplate && (
        <div className="w-96 border-l border-slate-800 bg-slate-900/80 overflow-auto flex flex-col flex-shrink-0">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">{detail.name}</h2>
            <button onClick={() => setDetail(null)} className="text-slate-500 hover:text-white">&times;</button>
          </div>
          <div className="p-4 flex-1 overflow-auto">
            <pre className="text-xs text-slate-400 font-mono whitespace-pre-wrap break-all bg-slate-950 rounded-lg p-3">
              {JSON.stringify(JSON.parse(detail.config || '{}'), null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
