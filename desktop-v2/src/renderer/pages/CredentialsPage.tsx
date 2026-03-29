import { useState, useEffect } from 'react';
import { ipc } from '../hooks/useIpc';
import { fmtDate } from '../utils/date';

export default function CredentialsPage() {
  const [creds, setCreds] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', username: 'admin', password: '', isDefault: false });
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const data = await ipc.listCredentials();
      setCreds(data);
    } catch (err: any) {
      console.error('Load credentials failed:', err);
      setError(`Failed to load: ${err.message}`);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!form.name.trim()) { ipc.confirm('Name is required'); return; }
    if (!form.password.trim()) { ipc.confirm('Password is required'); return; }
    setSaving(true);
    setError('');
    try {
      await ipc.createCredential({
        name: form.name.trim(),
        username: form.username.trim() || 'admin',
        password: form.password,
        isDefault: form.isDefault,
      });
      setShowAdd(false);
      setForm({ name: '', username: 'admin', password: '', isDefault: false });
      await load();
    } catch (err: any) {
      setError(`Error creating credential: ${err.message || err}`);
      ipc.confirm(`Error creating credential: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await ipc.invoke('credentials:set-default', id);
      await load();
    } catch (err: any) {
      ipc.confirm(`Error: ${err.message || err}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await ipc.confirm('Delete this credential?'))) return;
    try {
      await ipc.deleteCredential(id);
      await load();
    } catch (err: any) {
      ipc.confirm(`Error: ${err.message || err}`);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">Credentials</h1>
        <button onClick={() => setShowAdd(!showAdd)} className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700">
          {showAdd ? 'Cancel' : '+ Add Credential'}
        </button>
      </div>

      {error && <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-2 rounded-lg mb-4 text-sm">{error}</div>}

      {showAdd && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 mb-6">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Name</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Admin Access"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white" autoFocus />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Username</label>
              <input value={form.username} onChange={e => setForm({...form, username: e.target.value})}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Password</label>
              <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white"
                onKeyDown={e => e.key === 'Enter' && handleAdd()} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isDefault} onChange={e => setForm({...form, isDefault: e.target.checked})}
                className="accent-brand-500 w-4 h-4" />
              <span className="text-sm text-slate-300">Use as default credential for network discovery</span>
            </label>
            <button onClick={handleAdd} disabled={saving}
              className="px-5 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/80">
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-3">Default</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {creds.map(c => (
              <tr key={c.id} className="hover:bg-slate-800/50">
                <td className="px-4 py-3">
                  <input type="radio" name="default-cred" checked={!!c.is_default}
                    onChange={() => handleSetDefault(c.id)}
                    className="accent-brand-500 w-4 h-4 cursor-pointer" />
                </td>
                <td className="px-4 py-3 text-white font-medium">
                  {c.name}
                  {!!c.is_default && <span className="ml-2 text-xs text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full">Default</span>}
                </td>
                <td className="px-4 py-3 text-slate-400">{c.username}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(c.created_at)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDelete(c.id)} className="text-red-500 text-xs hover:underline">Delete</button>
                </td>
              </tr>
            ))}
            {creds.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-600">No credentials saved. Add one to enable auto-connect during discovery.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
