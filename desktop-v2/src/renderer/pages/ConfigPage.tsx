import { useState, useEffect } from 'react';
import { ipc } from '../hooks/useIpc';
import { fmtDate } from '../utils/date';
import { toast } from '../components/Toast';
import ConfigEditor, { ConfigValues, countFields, stripEmpty } from '../components/ConfigEditor';
import { Button, Card, Eyebrow, Modal, ModalTitle, Select, StateBlock, TextInput } from '../components/ui';

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
    <div style={{ padding: '18px 28px 28px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0,1fr)', gap: 14, alignItems: 'start' }}>
        {/* Left column: templates + scheduled backup */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card style={{ padding: '14px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Eyebrow>Templates</Eyebrow>
              <Button variant="ghost" size="sm" style={{ padding: '4px 10px' }} onClick={newTemplate}>+ New</Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 380, overflowY: 'auto' }}>
              {templates.map(t => {
                const active = selectedId === t.id;
                return (
                  <button key={t.id} onClick={() => openTemplate(t.id)} style={{
                    textAlign: 'left', padding: '8px 10px', borderRadius: 10, border: 'none',
                    cursor: 'pointer', fontFamily: 'inherit',
                    background: active ? 'var(--sr-blue)' : 'transparent',
                    color: active ? '#fff' : 'var(--text)',
                    boxShadow: active ? 'var(--sr-shadow-pop)' : 'none',
                    transition: 'background .12s ease',
                  }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                    <span style={{ display: 'block', fontSize: 10.5, marginTop: 1, color: active ? 'rgba(255,255,255,.75)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtDate(t.updated_at || t.created_at)}
                    </span>
                  </button>
                );
              })}
              {templates.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 2px', lineHeight: 1.5 }}>
                  No templates yet. Create one here, or open a device's configuration
                  and use "Save as Template".
                </p>
              )}
            </div>
          </Card>

          {/* Scheduled backup */}
          <Card style={{ padding: '14px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Eyebrow>Scheduled backup</Eyebrow>
              <button onClick={() => updateSched('backup_enabled', sched.backup_enabled === '1' ? '0' : '1')} style={{
                width: 36, height: 20, borderRadius: 999, position: 'relative', border: 'none', cursor: 'pointer',
                background: sched.backup_enabled === '1' ? 'var(--sr-green)' : 'var(--surface-sunken)',
                transition: 'background .12s ease', padding: 0,
              }}>
                <span style={{
                  position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  boxShadow: '0 1px 2px rgba(16,24,40,.2)', transition: 'left .12s ease',
                  left: sched.backup_enabled === '1' ? 18 : 2,
                }} />
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
              Backs up the configuration of every device with a credential once a day
              (at or after the hour below, while the app is open).
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 64, flex: 'none' }}>Run at</span>
              <Select value={sched.backup_hour} onChange={e => updateSched('backup_hour', e.target.value)}
                disabled={sched.backup_enabled !== '1'} style={{ flex: 1, opacity: sched.backup_enabled !== '1' ? .5 : 1 }}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={String(h)}>{String(h).padStart(2, '0')}:00</option>
                ))}
              </Select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 64, flex: 'none' }}>Keep last</span>
              <Select value={sched.backup_retention} onChange={e => updateSched('backup_retention', e.target.value)}
                disabled={sched.backup_enabled !== '1'} style={{ flex: 1, opacity: sched.backup_enabled !== '1' ? .5 : 1 }}>
                {['3', '5', '10', '20', '30', '50'].map(n => (
                  <option key={n} value={n}>{n} backups/device</option>
                ))}
              </Select>
            </div>
            {sched.backup_last_run && (
              <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: '8px 0 0', fontVariantNumeric: 'tabular-nums' }}>Last run: {sched.backup_last_run}</p>
            )}
          </Card>
        </div>

        {/* Editor */}
        {selectedId ? (
          <Card style={{ padding: '16px 18px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingBottom: 14, borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
              <TextInput value={name} onChange={e => { setName(e.target.value); setDirty(true); }}
                style={{ width: 210, fontWeight: 700 }} />
              <TextInput value={description} onChange={e => { setDescription(e.target.value); setDirty(true); }}
                placeholder="Description (optional)" style={{ flex: 1, minWidth: 160 }} />
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fieldCount} field(s) enforced</span>
              <Button variant="green" size="sm" disabled={!dirty || saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</Button>
              <Button variant="primary" size="sm" onClick={() => openPicker('apply')}>Apply to devices…</Button>
              <Button variant="ghost" size="sm" onClick={() => openPicker('compliance')}>Compliance check…</Button>
              <Button variant="danger" size="sm" onClick={remove}>Delete</Button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
              Only filled-in fields are part of the template — they are the settings it applies
              and checks. Leave a field empty to ignore it.
            </p>
            <ConfigEditor values={config} emptyHint="— not enforced —"
              onChange={(mod, key, value) => {
                setConfig(c => ({ ...c, [mod]: { ...(c[mod] || {}), [key]: value } }));
                setDirty(true);
              }} />
          </Card>
        ) : (
          <Card style={{ overflow: 'hidden' }}>
            <StateBlock variant="empty" title="No template selected"
              message="Select or create a template to edit its settings." />
          </Card>
        )}
      </div>

      {/* Device picker modal */}
      {picker && (
        <Modal onClose={() => setPicker(null)} width={480}>
          <ModalTitle sub={`"${name}" · ${fieldCount} setting(s) · devices without a credential are hidden`}>
            {picker === 'apply' ? 'Apply template to devices' : 'Compliance check'}
          </ModalTitle>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 2px 8px', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" style={{ accentColor: 'var(--sr-blue)' }}
              checked={picked.size === devices.length && devices.length > 0}
              onChange={() => setPicked(picked.size === devices.length ? new Set() : new Set(devices.map((d: any) => d.id)))} />
            Select all ({devices.length})
          </label>
          <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 11 }}>
            {devices.map((d: any, i: number) => (
              <label key={d.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: 12.5,
                color: 'var(--text)', cursor: 'pointer',
                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
              }}>
                <input type="checkbox" style={{ accentColor: 'var(--sr-blue)' }} checked={picked.has(d.id)}
                  onChange={() => { const n = new Set(picked); n.has(d.id) ? n.delete(d.id) : n.add(d.id); setPicked(n); }} />
                <span style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: d.status === 'online' ? 'var(--sr-exec-m)' : 'var(--sr-pend-m)' }} />
                <span style={{ flex: 1, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name || d.ip_address}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11.5, fontVariantNumeric: 'tabular-nums' }}>{d.ip_address}</span>
              </label>
            ))}
            {devices.length === 0 && <p style={{ padding: '18px 12px', fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>No devices with a credential assigned.</p>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button variant="ghost" size="sm" onClick={() => setPicker(null)}>Cancel</Button>
            <Button variant="green" size="sm" disabled={picked.size === 0} onClick={runPicker}>
              {picker === 'apply' ? `Apply to ${picked.size}` : `Check ${picked.size}`}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
