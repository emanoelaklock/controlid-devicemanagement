import { useState, useEffect, useCallback } from 'react';
import { ipc } from '../hooks/useIpc';
import { fmtDate } from '../utils/date';
import { toast } from '../components/Toast';
import { Badge, BadgeTone, Button, Card, Modal, ModalTitle, StateBlock, TextInput, UptimeBar, Select } from '../components/ui';

export type DeviceHealth = { drops_24h: number; drops_7d: number; availability_7d: number; unstable: boolean };

// Devices and Device detail show only Online/Offline; instability (3+ drops
// in 24h) is surfaced on the Connection health page instead.
export function statusInfo(device: any): { label: string; tone: BadgeTone } {
  return device.status === 'online'
    ? { label: 'Online', tone: 'exec' }
    : { label: 'Offline', tone: 'pend' };
}

const GRID_COLUMNS = '44px 122px minmax(210px,1.4fr) 148px 105px 138px 96px 172px 60px 118px minmax(160px,1fr) 30px';

export default function DevicesPage({ onOpenDevice }: { onOpenDevice: (id: string) => void }) {
  const [devices, setDevices] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [health, setHealth] = useState<Record<string, DeviceHealth>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState<string | null>(null); // null=All, '__none__'=Ungrouped
  const [addModal, setAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', ip_address: '', port: 80, manufacturer: 'controlid', model: '' });
  const [ntpModal, setNtpModal] = useState(false);
  const [ntpForm, setNtpForm] = useState({ enabled: true, timezone: 'UTC-3' });
  const [hardenModal, setHardenModal] = useState(false);
  const [hardenForm, setHardenForm] = useState<{ https: 'enable' | 'disable' | 'keep'; ssh: 'enable' | 'disable' | 'keep' }>({ https: 'keep', ssh: 'disable' });
  const [sortCol, setSortCol] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const load = useCallback(() => {
    ipc.listDevices().then(setDevices).catch(() => {});
    ipc.listGroups().then(setGroups).catch(() => {});
    ipc.devicesHealth().then(setHealth).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    const unsub = ipc.on('heartbeat:update', load);
    return () => { clearInterval(interval); unsub?.(); };
  }, [load]);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('asc'); }
  };
  const sortIcon = (col: string) => (sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  const filtered = devices
    .filter(d => {
      if (filterGroup === '__none__') return !d.group_id;
      if (filterGroup) return d.group_id === filterGroup;
      return true;
    })
    .filter(d => {
      if (!search) return true;
      const q = search.toLowerCase();
      return d.name?.toLowerCase().includes(q) || d.ip_address?.includes(search)
        || d.mac_address?.toLowerCase().includes(q) || d.serial_number?.toLowerCase().includes(q)
        || d.model?.toLowerCase().includes(q) || d.firmware_version?.includes(search);
    })
    .sort((a, b) => {
      const va = (a[sortCol] ?? '') as string;
      const vb = (b[sortCol] ?? '') as string;
      const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    if (selected.size === filtered.length && filtered.length > 0) setSelected(new Set());
    else setSelected(new Set(filtered.map(d => d.id)));
  };

  const groupLabel = filterGroup === '__none__' ? 'Ungrouped'
    : filterGroup ? (groups.find(g => g.id === filterGroup)?.name ?? 'group') : 'All devices';

  // ─── Batch actions (same semantics as before the redesign) ────────

  const handleBatchTest = async () => {
    await ipc.batchTestConnection(Array.from(selected));
    setSelected(new Set());
    setTimeout(load, 2000);
  };

  const handleBatchCredentials = async () => {
    const username = await ipc.prompt('Set Credentials', `New login for ${selected.size} device(s) (web + API):`, 'admin');
    if (!username) return;
    const password = await ipc.prompt('Set Credentials', `New password for user "${username}":`);
    if (!password) return;
    const country = await ipc.prompt('Set Credentials',
      'Country code — only used to finish initial setup on factory (first-boot) devices:', 'BR');
    if (country === null) return;
    if (!(await ipc.confirm(`Change login on ${selected.size} device(s) to "${username}"? Factory devices will also have their initial setup completed. The app re-links them to the new credential automatically.`))) return;
    await ipc.batchChangeCredentials(Array.from(selected), username, password, country || 'BR');
    toast('Credential change started — see Tasks page for results', 'info');
    setSelected(new Set());
  };

  const handleBatchAudit = async () => {
    await ipc.securityAudit(Array.from(selected));
    toast('Factory-credential audit started — flagged devices show as FAILED on the Tasks page.', 'info');
    setSelected(new Set());
    setTimeout(load, 2000);
  };

  const handleBatchReboot = async () => {
    if (!(await ipc.confirm(`Reboot ${selected.size} device(s)?`))) return;
    await ipc.batchReboot(Array.from(selected));
    setSelected(new Set());
  };

  const handleBatchRepairFirmware = async () => {
    if (!(await ipc.confirm(`Update the firmware on ${selected.size} device(s) via recovery mode? Each device downloads the firmware from Control iD (they need INTERNET access). Devices are processed ONE AT A TIME and each stays offline for several minutes. Settings and users are kept.`))) return;
    await ipc.firmwareRepair(Array.from(selected));
    toast('Firmware update job started — see Tasks page for progress.', 'info');
    setSelected(new Set());
  };

  const applyNtp = async () => {
    try {
      await ipc.batchSetNtp(Array.from(selected), ntpForm.enabled, ntpForm.timezone);
      toast('NTP configuration job started — see Tasks page.', 'info');
      setNtpModal(false);
      setSelected(new Set());
    } catch (e: any) { toast(`NTP job failed to start: ${e.message || e}`, 'error'); }
  };

  const applyHarden = async () => {
    if (hardenForm.https === 'keep' && hardenForm.ssh === 'keep') { toast('Nothing selected to change.', 'warning'); return; }
    const parts: string[] = [];
    if (hardenForm.https !== 'keep') parts.push(`HTTPS: ${hardenForm.https}`);
    if (hardenForm.ssh !== 'keep') parts.push(`SSH: ${hardenForm.ssh}`);
    if (!(await ipc.confirm(`Apply to ${selected.size} device(s)? ${parts.join(', ')}. Enabling HTTPS moves devices to port 443 and briefly drops their connection.`))) return;
    try {
      await ipc.batchHarden(Array.from(selected), hardenForm.https, hardenForm.ssh);
      toast('Hardening job started — see Tasks page.', 'info');
      setHardenModal(false);
      setSelected(new Set());
    } catch (e: any) { toast(`Hardening failed to start: ${e.message || e}`, 'error'); }
  };

  const handleRefresh = async () => {
    const allIds = devices.filter(d => d.credential_id).map((d: any) => d.id);
    if (allIds.length === 0) { toast('No devices with credentials to refresh.', 'warning'); return; }
    await ipc.batchTestConnection(allIds);
    toast(`Refreshing ${allIds.length} devices...`, 'info');
    setTimeout(load, 3000);
  };

  const handleAdd = async () => {
    if (!addForm.ip_address) { toast('IP address is required.', 'warning'); return; }
    await ipc.createDevice({ ...addForm, name: addForm.name || addForm.ip_address });
    setAddModal(false);
    setAddForm({ name: '', ip_address: '', port: 80, manufacturer: 'controlid', model: '' });
    load();
  };

  // ─── Group pills ──────────────────────────────────────────────────

  const pills: { key: string | null; label: string; count: number; group?: any }[] = [
    { key: null, label: 'All devices', count: devices.length },
    { key: '__none__', label: 'Ungrouped', count: devices.filter(d => !d.group_id).length },
    ...groups.map(g => ({ key: g.id, label: g.name, count: devices.filter(d => d.group_id === g.id).length, group: g })),
  ];

  return (
    <div style={{ padding: '18px 28px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Filters row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {pills.map(p => {
          const active = filterGroup === p.key;
          return (
            <button key={p.key ?? '__all__'} onClick={() => setFilterGroup(p.key)}
              onContextMenu={async e => {
                // Right-click a group pill to delete the group (management affordance).
                if (!p.group) return;
                e.preventDefault();
                if (await ipc.confirm(`Delete group "${p.label}"? Devices keep their registration and become ungrouped.`)) {
                  await ipc.deleteGroup(p.group.id);
                  if (filterGroup === p.group.id) setFilterGroup(null);
                  load();
                }
              }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px',
                borderRadius: 999, fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                cursor: 'pointer', whiteSpace: 'nowrap',
                border: `1px solid ${active ? 'var(--sr-blue)' : 'var(--border-strong)'}`,
                background: active ? 'var(--sr-blue)' : 'var(--surface-card)',
                color: active ? '#fff' : 'var(--text-muted)',
                transition: 'background .12s ease, color .12s ease',
              }}>
              {p.label}
              <span style={{ opacity: .65, fontVariantNumeric: 'tabular-nums' }}>{p.count}</span>
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <TextInput placeholder="Search name, IP, MAC…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 230 }} />
        <Button variant="ghost" size="sm" onClick={handleRefresh}>↻ Refresh</Button>
        <Button variant="ghost" size="sm" onClick={() => ipc.exportDevicesCsv()}>Export (CSV)</Button>
        <Button variant="primary" size="sm" onClick={() => setAddModal(true)}>+ Add device</Button>
      </div>

      {/* Batch actions bar */}
      {selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          background: 'var(--sr-info-bg)', border: '1px solid var(--border)', borderRadius: 11, padding: '8px 14px',
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sr-info-fg)' }}>{selected.size} selected</span>
          <div style={{ width: 1, height: 18, background: 'var(--border-strong)' }} />
          <Button variant="ghost" size="sm" onClick={handleBatchTest}>Test connection</Button>
          <Button variant="ghost" size="sm" onClick={() => { ipc.batchBackup(Array.from(selected)); toast('Backup job started — see Tasks page.', 'info'); setSelected(new Set()); }}>Backup</Button>
          <Button variant="ghost" size="sm" onClick={handleBatchCredentials}>Set credentials</Button>
          <Button variant="ghost" size="sm" onClick={() => setNtpModal(true)}>Set NTP</Button>
          <Button variant="ghost" size="sm" onClick={() => setHardenModal(true)}>Harden</Button>
          <Button variant="ghost" size="sm" onClick={handleBatchAudit}>Audit</Button>
          <Button variant="warn-outline" size="sm" onClick={handleBatchReboot}>Reboot</Button>
          <Button variant="danger" size="sm" onClick={handleBatchRepairFirmware}>Update firmware</Button>
        </div>
      )}

      {/* Devices table */}
      <Card style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 1380 }}>
            <div style={{
              display: 'grid', gridTemplateColumns: GRID_COLUMNS, alignItems: 'center',
              background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ padding: '10px 0 10px 16px' }}>
                <input type="checkbox" checked={selected.size > 0 && selected.size === filtered.length} onChange={selectAll} style={{ accentColor: 'var(--sr-blue)' }} />
              </div>
              <div className="sr-th" style={{ cursor: 'pointer' }} onClick={() => toggleSort('status')}>Status{sortIcon('status')}</div>
              <div className="sr-th" style={{ cursor: 'pointer' }} onClick={() => toggleSort('name')}>Name{sortIcon('name')}</div>
              <div className="sr-th" style={{ cursor: 'pointer' }} onClick={() => toggleSort('ip_address')}>IP address{sortIcon('ip_address')}</div>
              <div className="sr-th" style={{ cursor: 'pointer' }} onClick={() => toggleSort('model')}>Model{sortIcon('model')}</div>
              <div className="sr-th" style={{ cursor: 'pointer' }} onClick={() => toggleSort('serial_number')}>Serial{sortIcon('serial_number')}</div>
              <div className="sr-th" style={{ cursor: 'pointer' }} onClick={() => toggleSort('firmware_version')}>Firmware{sortIcon('firmware_version')}</div>
              <div className="sr-th" style={{ cursor: 'pointer' }} onClick={() => toggleSort('mac_address')}>MAC address{sortIcon('mac_address')}</div>
              <div className="sr-th" style={{ cursor: 'pointer' }} onClick={() => toggleSort('dhcp_enabled')}>DHCP{sortIcon('dhcp_enabled')}</div>
              <div className="sr-th">Uptime 7d</div>
              <div className="sr-th" style={{ cursor: 'pointer' }} onClick={() => toggleSort('last_heartbeat')}>Last heartbeat{sortIcon('last_heartbeat')}</div>
              <div />
            </div>

            {filtered.map(d => {
              const h = health[d.id];
              const st = statusInfo(d);
              return (
                <div key={d.id} className="sr-row" onClick={() => onOpenDevice(d.id)}
                  style={{ display: 'grid', gridTemplateColumns: GRID_COLUMNS, alignItems: 'center' }}>
                  <div style={{ padding: '10px 0 10px 16px' }} onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelect(d.id)} style={{ accentColor: 'var(--sr-blue)' }} />
                  </div>
                  <div style={{ padding: '10px 12px' }}><Badge tone={st.tone} dot>{st.label}</Badge></div>
                  <div style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-.1px' }}>{d.name || d.ip_address}</div>
                  <div style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                    <a href="#" onClick={e => { e.preventDefault(); e.stopPropagation(); window.api.invoke('shell:open-url', `http${d.https_enabled ? 's' : ''}://${d.ip_address}:${d.port}`); }}>
                      {d.ip_address}:{d.port}
                    </a>
                  </div>
                  <div style={{ padding: '10px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12.5 }}>{d.model || '—'}</div>
                  <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: 12, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{d.serial_number || '—'}</div>
                  <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>{d.firmware_version || '—'}</div>
                  <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: 12, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{d.mac_address || '—'}</div>
                  <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: 12.5 }}>{d.dhcp_enabled ? 'Yes' : 'No'}</div>
                  <div style={{ padding: '10px 12px' }}>
                    {h ? <UptimeBar value={h.availability_7d} /> : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                  </div>
                  <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: 12.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {d.last_heartbeat ? fmtDate(d.last_heartbeat) : 'Never'}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 15 }}>›</div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <StateBlock variant="empty" compact title="No devices match"
                message="Adjust the search or group filter, or scan the network on the Discovery page." />
            )}
          </div>
        </div>
      </Card>

      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
        {filtered.length} device(s) in "{groupLabel}" · heartbeat every 2 min · click a row to open the device
      </div>

      {/* Add device modal */}
      {addModal && (
        <Modal onClose={() => setAddModal(false)}>
          <ModalTitle>Add device</ModalTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {([
              ['Name', 'name', 'Entrance reader'],
              ['IP address', 'ip_address', '192.168.0.129'],
              ['Port', 'port', '80'],
              ['Model', 'model', 'iDFace Max'],
            ] as const).map(([label, key, ph]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-muted)', width: 90, flex: 'none' }}>{label}</span>
                <TextInput placeholder={ph} value={String((addForm as any)[key])}
                  type={key === 'port' ? 'number' : 'text'}
                  onChange={e => setAddForm({ ...addForm, [key]: key === 'port' ? Number(e.target.value) : e.target.value })}
                  style={{ flex: 1 }} />
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button variant="ghost" size="sm" onClick={() => setAddModal(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleAdd}>Add device</Button>
          </div>
        </Modal>
      )}

      {/* Batch NTP modal */}
      {ntpModal && (
        <Modal onClose={() => setNtpModal(false)}>
          <ModalTitle sub={`${selected.size} device(s) selected`}>NTP time sync</ModalTitle>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <Button variant={ntpForm.enabled ? 'primary' : 'ghost'} size="sm" style={{ flex: 1 }} onClick={() => setNtpForm({ ...ntpForm, enabled: true })}>Enable NTP</Button>
            <Button variant={!ntpForm.enabled ? 'primary' : 'ghost'} size="sm" style={{ flex: 1 }} onClick={() => setNtpForm({ ...ntpForm, enabled: false })}>Disable NTP</Button>
          </div>
          {ntpForm.enabled ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)', width: 90, flex: 'none' }}>Timezone</span>
              <Select value={ntpForm.timezone} onChange={e => setNtpForm({ ...ntpForm, timezone: e.target.value })} style={{ flex: 1 }}>
                {Array.from({ length: 25 }, (_, i) => {
                  const off = i - 12;
                  const v = `UTC${off >= 0 ? '+' : ''}${off}`;
                  return <option key={v} value={v}>{v}{v === 'UTC-3' ? ' (Brasília)' : ''}</option>;
                })}
              </Select>
            </label>
          ) : (
            <p style={{ fontSize: 12.5, color: 'var(--sr-warn-fg)', margin: '0 0 14px' }}>
              Devices will stop syncing time automatically — use "Sync date/time" manually when needed.
            </p>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => setNtpModal(false)}>Cancel</Button>
            <Button variant="green" size="sm" onClick={applyNtp}>Apply to {selected.size}</Button>
          </div>
        </Modal>
      )}

      {/* Batch hardening modal */}
      {hardenModal && (
        <Modal onClose={() => setHardenModal(false)}>
          <ModalTitle sub={`${selected.size} device(s) selected`}>Security hardening</ModalTitle>
          {([
            ['https', 'HTTPS (self-signed)', 'Encrypts the web/API traffic. Enabling moves the device to port 443.'],
            ['ssh', 'SSH access', 'Shell access to the device. Disable unless you need it.'],
          ] as const).map(([key, label, hint]) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{label}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 6px' }}>{hint}</p>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['enable', 'disable', 'keep'] as const).map(opt => (
                  <Button key={opt} size="sm" style={{ flex: 1, textTransform: 'capitalize' }}
                    variant={(hardenForm as any)[key] === opt ? 'primary' : 'ghost'}
                    onClick={() => setHardenForm({ ...hardenForm, [key]: opt })}>
                    {opt === 'keep' ? 'Leave as-is' : opt}
                  </Button>
                ))}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <Button variant="ghost" size="sm" onClick={() => setHardenModal(false)}>Cancel</Button>
            <Button variant="green" size="sm" onClick={applyHarden}>Apply to {selected.size}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
