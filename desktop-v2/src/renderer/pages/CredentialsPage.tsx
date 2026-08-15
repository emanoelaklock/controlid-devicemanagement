import { useState, useEffect } from 'react';
import { ipc } from '../hooks/useIpc';
import { fmtDate } from '../utils/date';
import { toast } from '../components/Toast';
import { Badge, Button, Card, Eyebrow, StateBlock, TextInput } from '../components/ui';

const thStyle: React.CSSProperties = {
  padding: '10px 12px', fontSize: 11, fontWeight: 600, letterSpacing: '1.1px',
  textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'left', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 12.5, borderTop: '1px solid var(--border)' };

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
    if (!form.name.trim()) { toast('Name is required'); return; }
    if (!form.password.trim()) { toast('Password is required'); return; }
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
      toast(`Error creating credential: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await ipc.setDefaultCredential(id);
      await load();
    } catch (err: any) {
      toast(`Error: ${err.message || err}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await ipc.confirm('Delete this credential?'))) return;
    try {
      await ipc.deleteCredential(id);
      await load();
    } catch (err: any) {
      toast(`Error: ${err.message || err}`);
    }
  };

  return (
    <div style={{ padding: '18px 28px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1 }} />
        <Button variant={showAdd ? 'ghost' : 'primary'} size="sm" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Add credential'}
        </Button>
      </div>

      {error && (
        <div style={{
          background: 'var(--sr-pend-bg)', border: '1px solid var(--border)', borderLeft: '4px solid var(--sr-pend-m)',
          color: 'var(--sr-pend-fg)', padding: '10px 14px', borderRadius: 11, fontSize: 12.5,
        }}>{error}</div>
      )}

      {/* Add form */}
      {showAdd && (
        <Card style={{ padding: '16px 18px' }}>
          <Eyebrow style={{ marginBottom: 10 }}>New credential</Eyebrow>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 14, marginBottom: 14 }}>
            <label>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 4 }}>Name</span>
              <TextInput value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Admin Access" autoFocus style={{ width: '100%', boxSizing: 'border-box' }} />
            </label>
            <label>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 4 }}>Username</span>
              <TextInput value={form.username} onChange={e => setForm({ ...form, username: e.target.value })}
                style={{ width: '100%', boxSizing: 'border-box' }} />
            </label>
            <label>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 4 }}>Password</span>
              <TextInput type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && handleAdd()} style={{ width: '100%', boxSizing: 'border-box' }} />
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, color: 'var(--text)' }}>
              <input type="checkbox" checked={form.isDefault} onChange={e => setForm({ ...form, isDefault: e.target.checked })}
                style={{ accentColor: 'var(--sr-blue)', width: 15, height: 15 }} />
              Use as default credential for network discovery
            </label>
            <Button variant="green" size="sm" disabled={saving} onClick={handleAdd}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </Card>
      )}

      {/* Credentials table */}
      <Card style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--surface-sunken)' }}>
            <tr>
              <th style={{ ...thStyle, width: 80 }}>Default</th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Username</th>
              <th style={thStyle}>Created</th>
              <th style={{ ...thStyle, width: 90 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {creds.map(c => (
              <tr key={c.id}>
                <td style={tdStyle}>
                  <input type="radio" name="default-cred" checked={!!c.is_default}
                    onChange={() => handleSetDefault(c.id)}
                    style={{ accentColor: 'var(--sr-blue)', width: 15, height: 15, cursor: 'pointer' }} />
                </td>
                <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--text)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {c.name}
                    {!!c.is_default && <Badge tone="info">Default</Badge>}
                  </span>
                </td>
                <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{c.username}</td>
                <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{fmtDate(c.created_at)}</td>
                <td style={tdStyle}>
                  <a href="#" onClick={e => { e.preventDefault(); handleDelete(c.id); }}
                    style={{ color: 'var(--sr-pend-fg)', fontSize: 12, fontWeight: 700 }}>Delete</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {creds.length === 0 && (
          <StateBlock variant="empty" compact title="No credentials saved"
            message="Add one to enable auto-connect during discovery." />
        )}
      </Card>
    </div>
  );
}
