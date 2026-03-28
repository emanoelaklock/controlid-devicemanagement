import { useState, useEffect } from 'react';
import { ipc } from '../hooks/useIpc';

export default function CredentialsPage() {
  const [creds, setCreds] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', username: 'admin', password: '' });

  const load = () => ipc.listCredentials().then(setCreds).catch(err => console.error('Load credentials failed:', err));
  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!form.name.trim() || !form.password.trim()) {
      alert('Name and password are required');
      return;
    }
    setSaving(true);
    try {
      await ipc.createCredential({ name: form.name.trim(), username: form.username.trim(), password: form.password });
      setShowAdd(false);
      setForm({ name: '', username: 'admin', password: '' });
      await load();
    } catch (err: any) {
      alert(`Error creating credential: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this credential?')) return;
    try {
      await ipc.deleteCredential(id);
      await load();
    } catch (err: any) {
      alert(`Error: ${err.message || err}`);
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

      {showAdd && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 mb-6 flex items-end gap-4">
          <div className="flex-1">
            <label className="text-xs text-slate-500 block mb-1">Name</label>
            <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Default Admin"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-500 block mb-1">Username</label>
            <input value={form.username} onChange={e => setForm({...form, username: e.target.value})}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-500 block mb-1">Password</label>
            <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white" />
          </div>
          <button onClick={handleAdd} disabled={saving}
            className="px-5 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/80">
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {creds.map(c => (
              <tr key={c.id} className="hover:bg-slate-800/50">
                <td className="px-4 py-3 text-white font-medium">{c.name}</td>
                <td className="px-4 py-3 text-slate-400">{c.username}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{new Date(c.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDelete(c.id)} className="text-red-500 text-xs hover:underline">Delete</button>
                </td>
              </tr>
            ))}
            {creds.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-600">No credentials saved</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
