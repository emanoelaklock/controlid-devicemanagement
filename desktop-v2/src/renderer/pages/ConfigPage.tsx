import { useState, useEffect } from 'react';
import { ipc } from '../hooks/useIpc';
import { fmtDate } from '../utils/date';
import { toast } from '../components/Toast';
import ConfigEditor, { ConfigValues, countFields, stripEmpty } from '../components/ConfigEditor';

/**
 * Configuration templates: friendly catalog-driven editor over
 * get/set_configuration.fcgi. A template only enforces the fields that are
 * filled in; empty fields are ignored on apply and on compliance checks.
 */
export default function ConfigPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [config, setConfig] = useState<ConfigValues>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // Device picker modal: which action it will run
  const [picker, setPicker] = useState<null | 'apply' | 'compliance'>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Scheduled backup settings (stored in app_settings, read by the scheduler)
  const [sched, setSched] = useState({ backup_enabled: '0', backup_hour: '3', backup_retention: '10', backup_last_run: '' });

  const loadList = () => ipc.listTemplates().then(setTemplates);
  useEffect(() => {
    loadList();
    ipc.getSettings().then((s: any) => setSched(prev => ({ ...prev, ...s })));
  }, []);

  const updateSched = async (key: string, value: string) => {
    setSched(prev => ({ ...prev, [key]: value }));
    try { await ipc.setSetting(key, value); }
    catch (e: any) { toast(`Could not save setting: ${e.message || e}`, 'error'); }
  };

  const openTemplate = async (id: string) => {
    const t = await ipc.getTemplate(id);
    if (!t) return;
    setSelectedId(id);
    setName(t.name || '');
    setDescription(t.description || '');
    setConfig(t.config || {});
    setDirty(false);
  };

  const newTemplate = async () => {
    const n = await ipc.prompt('New Template', 'Template name:');
    if (!n) return;
    const t = await ipc.createTemplate({ name: n, config: {} });
    await loadList();
    openTemplate(t.id);
  };

  const save = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await ipc.updateTemplate(selectedId, { name, description, config: stripEmpty(config) });
      setDirty(false);
      toast('Template saved.', 'success');
      loadList();
    } catch (e: any) { toast(`Save failed: ${e.message || e}`, 'error'); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!selectedId) return;
    if (!(await ipc.confirm(`Delete template "${name}"?`))) return;
    await ipc.deleteTemplate(selectedId);
    setSelectedId(null);
    loadList();
  };

  const openPicker = async (mode: 'apply' | 'compliance') => {
    if (countFields(config) === 0) { toast('Template has no fields set.', 'warning'); return; }
    if (dirty) { toast('Save the template first.', 'warning'); return; }
    const devs = await ipc.listDevices();
    setDevices(devs.filter((d: any) => d.credential_id));
    setPicked(new Set());
    setPicker(mode);
  };

  const runPicker = async () => {
    if (!selectedId || picked.size === 0) return;
    const ids = Array.from(picked);
    try {
      if (picker === 'apply') {
        if (!(await ipc.confirm(`Apply ${countFields(config)} setting(s) from "${name}" to ${ids.length} device(s)?`))) return;
        await ipc.applyTemplate(selectedId, ids);
        toast('Template application started — see Tasks page.', 'info');
      } else {
        await ipc.complianceCheck(selectedId, ids);
        toast('Compliance check started — non-compliant devices show as FAILED on the Tasks page, with the differences.', 'info');
      }
      setPicker(null);
    } catch (e: any) { toast(`Error: ${e.message || e}`, 'error'); }
  };

  const fieldCount = countFields(config);

  return (
    <div className="flex h-full">
      {/* Template list */}
      <div className="w-64 border-r border-slate-800 bg-slate-900/50 flex flex-col flex-shrink-0">
        <div className="px-3 py-3 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Templates</span>
          <button onClick={newTemplate} className="text-xs text-brand-400 hover:text-brand-300">+ New</button>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-0.5">
          {templates.map(t => (
            <button key={t.id} onClick={() => openTemplate(t.id)}
              className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                selectedId === t.id ? 'bg-brand-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
              <span className="block truncate font-medium">{t.name}</span>
              <span className={`block text-[10px] ${selectedId === t.id ? 'text-brand-200' : 'text-slate-600'}`}>
                {fmtDate(t.updated_at || t.created_at)}
              </span>
            </button>
          ))}
          {templates.length === 0 && (
            <p className="px-3 py-6 text-xs text-slate-600">
              No templates yet. Create one here, or open a device's configuration
              on the Devices page and use "Save as Template".
            </p>
          )}
        </div>

        {/* Scheduled backup */}
        <div className="p-3 border-t border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Scheduled Backup</span>
            <button onClick={() => updateSched('backup_enabled', sched.backup_enabled === '1' ? '0' : '1')}
              className={`w-9 h-5 rounded-full relative transition-colors ${sched.backup_enabled === '1' ? 'bg-emerald-600' : 'bg-slate-700'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${sched.backup_enabled === '1' ? 'left-4' : 'left-0.5'}`} />
            </button>
          </div>
          <p className="text-[10px] text-slate-600 leading-snug">
            Backs up the configuration of every device with a credential once a day
            (at or after the hour below, while the app is open).
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 w-20">Run at</span>
            <select value={sched.backup_hour} onChange={e => updateSched('backup_hour', e.target.value)}
              disabled={sched.backup_enabled !== '1'}
              className="flex-1 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-white disabled:opacity-40">
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={String(h)}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 w-20">Keep last</span>
            <select value={sched.backup_retention} onChange={e => updateSched('backup_retention', e.target.value)}
              disabled={sched.backup_enabled !== '1'}
              className="flex-1 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-white disabled:opacity-40">
              {['3', '5', '10', '20', '30', '50'].map(n => (
                <option key={n} value={n}>{n} backups/device</option>
              ))}
            </select>
          </div>
          {sched.backup_last_run && (
            <p className="text-[10px] text-slate-600">Last run: {sched.backup_last_run}</p>
          )}
        </div>
      </div>

      {/* Editor */}
      {selectedId ? (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50 flex items-center gap-3 flex-shrink-0">
            <input value={name} onChange={e => { setName(e.target.value); setDirty(true); }}
              className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white font-semibold w-56" />
            <input value={description} onChange={e => { setDescription(e.target.value); setDirty(true); }}
              placeholder="Description (optional)"
              className="flex-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-slate-300 min-w-0" />
            <span className="text-xs text-slate-500 whitespace-nowrap">{fieldCount} field(s) enforced</span>
            <button onClick={save} disabled={!dirty || saving}
              className="px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 disabled:opacity-40">
              {saving ? 'Saving...' : 'Save'}</button>
            <button onClick={() => openPicker('apply')}
              className="px-3 py-1.5 bg-brand-600 text-white text-xs rounded-lg hover:bg-brand-700">Apply to devices…</button>
            <button onClick={() => openPicker('compliance')}
              className="px-3 py-1.5 bg-cyan-700 text-white text-xs rounded-lg hover:bg-cyan-600">Compliance check…</button>
            <button onClick={remove}
              className="px-3 py-1.5 bg-red-900/60 text-red-300 text-xs rounded-lg hover:bg-red-800">Delete</button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <p className="text-xs text-slate-600 mb-3">
              Only filled-in fields are part of the template — they are the settings it applies
              and checks. Leave a field empty to ignore it.
            </p>
            <ConfigEditor values={config} emptyHint="— not enforced —"
              onChange={(mod, key, value) => {
                setConfig(c => ({ ...c, [mod]: { ...(c[mod] || {}), [key]: value } }));
                setDirty(true);
              }} />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
          Select or create a template to edit its settings.
        </div>
      )}

      {/* Device picker modal */}
      {picker && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setPicker(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-[30rem] max-h-[70vh] flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-1">
              {picker === 'apply' ? 'Apply template to devices' : 'Compliance check'}
            </h3>
            <p className="text-xs text-slate-500 mb-3">"{name}" · {fieldCount} setting(s) · devices without a credential are hidden</p>
            <label className="flex items-center gap-2 px-2 py-1 text-xs text-slate-400">
              <input type="checkbox" className="accent-brand-500"
                checked={picked.size === devices.length && devices.length > 0}
                onChange={() => setPicked(picked.size === devices.length ? new Set() : new Set(devices.map((d: any) => d.id)))} />
              Select all ({devices.length})
            </label>
            <div className="flex-1 overflow-auto border border-slate-800 rounded-lg divide-y divide-slate-800/60">
              {devices.map((d: any) => (
                <label key={d.id} className="flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800/50 cursor-pointer">
                  <input type="checkbox" className="accent-brand-500" checked={picked.has(d.id)}
                    onChange={() => { const n = new Set(picked); n.has(d.id) ? n.delete(d.id) : n.add(d.id); setPicked(n); }} />
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${d.status === 'online' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <span className="flex-1 truncate">{d.name || d.ip_address}</span>
                  <span className="text-slate-600 font-mono">{d.ip_address}</span>
                </label>
              ))}
              {devices.length === 0 && <p className="px-3 py-6 text-xs text-slate-600">No devices with a credential assigned.</p>}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setPicker(null)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg hover:bg-slate-700">Cancel</button>
              <button onClick={runPicker} disabled={picked.size === 0}
                className="px-4 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 disabled:opacity-40">
                {picker === 'apply' ? `Apply to ${picked.size}` : `Check ${picked.size}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
