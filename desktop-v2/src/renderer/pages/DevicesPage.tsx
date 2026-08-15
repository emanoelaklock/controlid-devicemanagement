import { useState, useEffect, useCallback, useRef, ReactNode, CSSProperties } from 'react';
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

type CellCtx = { h?: DeviceHealth; net?: any };

type ColumnDef = {
  key: string;
  label: string;
  width: string;
  minPx: number;
  locked?: boolean; // cannot be hidden (Name is the row's identity/link)
  // Every column is sortable. Columns whose data doesn't live on the device
  // row (health, live network) provide sortValue; the rest sort by d[key].
  sortValue?: (d: any, ctx: CellCtx) => string | number;
  render: (d: any, ctx: CellCtx) => ReactNode;
};

// Standard muted text cell; empty values render as an em dash.
const txt = (v: ReactNode, style?: CSSProperties) => (
  <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...style }}>{v || '—'}</div>
);

// Netmask/gateway/DNS live only on the device (system_information.fcgi), not
// in the DB: undefined = not fetched yet ('…' while eligible), null = fetch
// failed, object = live network block.
function liveNetCell(d: any, net: any, pick: (n: any) => string) {
  if (net === undefined) return txt(d.status === 'online' && d.credential_id ? '…' : '—');
  if (net === null) return txt('—');
  return txt(pick(net), { fontVariantNumeric: 'tabular-nums' });
}

const COLUMN_GROUPS: { label: string; columns: ColumnDef[] }[] = [
  {
    label: 'Device',
    columns: [
      {
        key: 'name', label: 'Name', width: 'minmax(210px,1.4fr)', minPx: 210, locked: true,
        render: d => <div style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-.1px' }}>{d.name || d.ip_address}</div>,
      },
      { key: 'group_name', label: 'Group', width: '112px', minPx: 112, render: d => txt(d.group_name) },
      { key: 'tags', label: 'Tags', width: '112px', minPx: 112, render: d => txt(d.tags) },
      { key: 'notes', label: 'Notes', width: '150px', minPx: 150, render: d => txt(d.notes) },
      { key: 'created_at', label: 'Added', width: '148px', minPx: 148, render: d => txt(d.created_at ? fmtDate(d.created_at) : '', { fontVariantNumeric: 'tabular-nums' }) },
      { key: 'updated_at', label: 'Updated', width: '148px', minPx: 148, render: d => txt(d.updated_at ? fmtDate(d.updated_at) : '', { fontVariantNumeric: 'tabular-nums' }) },
    ],
  },
  {
    label: 'Connection',
    columns: [
      {
        key: 'status', label: 'Status', width: '122px', minPx: 122,
        render: d => { const st = statusInfo(d); return <div style={{ padding: '10px 12px' }}><Badge tone={st.tone} dot>{st.label}</Badge></div>; },
      },
      {
        key: 'uptime', label: 'Uptime 7d', width: '118px', minPx: 118,
        sortValue: (_d, { h }) => (h ? h.availability_7d : -1),
        render: (_d, { h }) => (
          <div style={{ padding: '10px 12px' }}>
            {h ? <UptimeBar value={h.availability_7d} /> : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
          </div>
        ),
      },
      { key: 'drops_24h', label: 'Drops 24h', width: '84px', minPx: 84, sortValue: (_d, { h }) => (h ? h.drops_24h : -1), render: (_d, { h }) => txt(h ? String(h.drops_24h) : '', { fontVariantNumeric: 'tabular-nums' }) },
      { key: 'drops_7d', label: 'Drops 7d', width: '78px', minPx: 78, sortValue: (_d, { h }) => (h ? h.drops_7d : -1), render: (_d, { h }) => txt(h ? String(h.drops_7d) : '', { fontVariantNumeric: 'tabular-nums' }) },
      {
        key: 'last_heartbeat', label: 'Last heartbeat', width: 'minmax(160px,1fr)', minPx: 160,
        render: d => txt(d.last_heartbeat ? fmtDate(d.last_heartbeat) : 'Never', { fontVariantNumeric: 'tabular-nums' }),
      },
      { key: 'last_seen', label: 'Last seen', width: '148px', minPx: 148, render: d => txt(d.last_seen ? fmtDate(d.last_seen) : 'Never', { fontVariantNumeric: 'tabular-nums' }) },
    ],
  },
  {
    label: 'Network',
    columns: [
      {
        key: 'ip_address', label: 'IP address', width: '148px', minPx: 148,
        render: d => (
          <div style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums', fontSize: 12.5, whiteSpace: 'nowrap' }}>
            <a href="#" onClick={e => { e.preventDefault(); e.stopPropagation(); window.api.invoke('shell:open-url', `http${d.https_enabled ? 's' : ''}://${d.ip_address}:${d.port}`); }}>
              {d.ip_address}:{d.port}
            </a>
          </div>
        ),
      },
      { key: 'mac_address', label: 'MAC address', width: '172px', minPx: 172, render: d => txt(d.mac_address, { fontSize: 12, fontVariantNumeric: 'tabular-nums' }) },
      { key: 'dhcp_enabled', label: 'DHCP', width: '60px', minPx: 60, render: d => txt(d.dhcp_enabled ? 'Yes' : 'No') },
      { key: 'hostname', label: 'Hostname', width: '130px', minPx: 130, render: d => txt(d.hostname) },
      { key: 'https_enabled', label: 'HTTPS', width: '64px', minPx: 64, render: d => txt(d.https_enabled ? 'On' : 'Off') },
      { key: 'netmask', label: 'Netmask', width: '118px', minPx: 118, sortValue: (_d, { net }) => net?.netmask || '', render: (d, { net }) => liveNetCell(d, net, n => n.netmask) },
      { key: 'gateway', label: 'Gateway', width: '118px', minPx: 118, sortValue: (_d, { net }) => net?.gateway || '', render: (d, { net }) => liveNetCell(d, net, n => n.gateway) },
      {
        key: 'dns', label: 'DNS', width: '190px', minPx: 190,
        sortValue: (_d, { net }) => net?.primary_dns || net?.dns_primary || '',
        render: (d, { net }) => liveNetCell(d, net, n => {
          const dns1 = n.primary_dns || n.dns_primary || '';
          const dns2 = n.secondary_dns || n.dns_secondary || '';
          return dns1 + (dns2 ? ` · ${dns2}` : '');
        }),
      },
    ],
  },
  {
    label: 'Equipment',
    columns: [
      { key: 'model', label: 'Model', width: '105px', minPx: 105, render: d => txt(d.model) },
      { key: 'serial_number', label: 'Serial', width: '138px', minPx: 138, render: d => txt(d.serial_number, { fontSize: 12, fontVariantNumeric: 'tabular-nums' }) },
      { key: 'firmware_version', label: 'Firmware', width: '96px', minPx: 96, render: d => txt(d.firmware_version, { fontVariantNumeric: 'tabular-nums' }) },
      { key: 'manufacturer', label: 'Manufacturer', width: '104px', minPx: 104, render: d => txt(d.manufacturer === 'controlid' ? 'Control iD' : d.manufacturer) },
      { key: 'credential_name', label: 'Credential', width: '120px', minPx: 120, render: d => txt(d.credential_name) },
    ],
  },
];

const COLUMNS: ColumnDef[] = COLUMN_GROUPS.flatMap(g => g.columns);

// Same set the list showed before the picker existed — new columns are opt-in.
const DEFAULT_VISIBLE = [
  'name', 'status', 'uptime', 'last_heartbeat', 'ip_address', 'mac_address',
  'dhcp_enabled', 'model', 'serial_number', 'firmware_version',
];

// Columns whose data must be fetched live from each device.
const LIVE_NET_KEYS = ['netmask', 'gateway', 'dns'];

const COLS_STORAGE_KEY = 'devices.visibleColumns';

function loadVisibleColumns(): Set<string> {
  try {
    const saved = JSON.parse(localStorage.getItem(COLS_STORAGE_KEY) || '');
    if (Array.isArray(saved)) {
      const valid = saved.filter(k => COLUMNS.some(c => c.key === k));
      COLUMNS.filter(c => c.locked).forEach(c => { if (!valid.includes(c.key)) valid.push(c.key); });
      return new Set(valid);
    }
  } catch { /* first run or corrupted value — fall through to default */ }
  return new Set(DEFAULT_VISIBLE);
}

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
  const [visibleCols, setVisibleCols] = useState<Set<string>>(loadVisibleColumns);
  const [colsMenu, setColsMenu] = useState(false);
  const colsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!colsMenu) return;
    const onDown = (e: MouseEvent) => {
      if (colsMenuRef.current && !colsMenuRef.current.contains(e.target as Node)) setColsMenu(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [colsMenu]);

  const persistCols = (next: Set<string>) => {
    localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(Array.from(next)));
    return next;
  };

  const toggleColumn = (key: string) => {
    setVisibleCols(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return persistCols(next);
    });
  };

  const toggleGroup = (g: { columns: ColumnDef[] }) => {
    setVisibleCols(prev => {
      const next = new Set(prev);
      const toggleable = g.columns.filter(c => !c.locked);
      const allOn = toggleable.every(c => next.has(c.key));
      toggleable.forEach(c => { allOn ? next.delete(c.key) : next.add(c.key); });
      return persistCols(next);
    });
  };

  const shownColumns = COLUMNS.filter(c => visibleCols.has(c.key));
  const gridColumns = `44px ${shownColumns.map(c => c.width).join(' ')} 30px`;
  const tableMinWidth = 44 + shownColumns.reduce((s, c) => s + c.minPx, 0) + 30;

  // ─── Live network info (netmask/gateway/DNS) ──────────────────────
  // Only fetched while one of those columns is visible; each device is
  // queried once (login + system_information + logout is a full HTTP round
  // trip), at most 5 new devices per poll tick so the LAN isn't hammered.
  const [liveNet, setLiveNet] = useState<Record<string, any>>({});
  const liveNetRequested = useRef<Set<string>>(new Set());
  const needLiveNet = LIVE_NET_KEYS.some(k => visibleCols.has(k));

  useEffect(() => {
    if (!needLiveNet) return;
    devices
      .filter(d => d.status === 'online' && d.credential_id && !liveNetRequested.current.has(d.id))
      .slice(0, 5)
      .forEach(d => {
        liveNetRequested.current.add(d.id);
        ipc.getNetwork(d.id)
          .then((net: any) => setLiveNet(prev => ({ ...prev, [d.id]: net || {} })))
          .catch(() => setLiveNet(prev => ({ ...prev, [d.id]: null })));
      });
  }, [needLiveNet, devices]);

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

  // Batch actions must never target rows the operator can't see: switching
  // the group filter or the search clears the selection.
  useEffect(() => { setSelected(new Set()); }, [filterGroup, search]);

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
      const col = COLUMNS.find(c => c.key === sortCol);
      const val = (d: any) => (col?.sortValue ? col.sortValue(d, { h: health[d.id], net: liveNet[d.id] }) : d[sortCol]);
      const va = val(a);
      const vb = val(b);
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va ?? '').localeCompare(String(vb ?? ''), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    if (filtered.length > 0 && filtered.every(d => selected.has(d.id))) setSelected(new Set());
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

  const handleBatchUploadLogo = async () => {
    try {
      const r = await ipc.batchUploadLogo(Array.from(selected));
      if (r?.cancelled) return;
      toast('Logo upload job started — see Tasks page for results.', 'info');
      setSelected(new Set());
    } catch (e: any) { toast(`Logo upload failed to start: ${e.message || e}`, 'error'); }
  };

  const handleBatchDelete = async () => {
    const n = selected.size;
    if (!(await ipc.confirm(`Delete ${n} device(s)? Their connection history and config backups are removed too. They can be re-added later via Discovery.`))) return;
    try {
      const r = await ipc.batchDeleteDevices(Array.from(selected));
      if (r.failed > 0) toast(`${r.deleted} deleted, ${r.failed} failed.`, 'warning');
      else toast(`${r.deleted} device(s) deleted.`, 'success');
    } catch (e: any) { toast(`Delete failed: ${e.message || e}`, 'error'); }
    setSelected(new Set());
    load();
  };

  const handleRefresh = async () => {
    liveNetRequested.current.clear();
    setLiveNet({});
    const allIds = devices.filter(d => d.credential_id).map((d: any) => d.id);
    if (allIds.length === 0) { toast('No devices with credentials to refresh.', 'warning'); return; }
    await ipc.batchTestConnection(allIds);
    toast(`Refreshing ${allIds.length} devices...`, 'info');
    setTimeout(load, 3000);
  };

  const handleAdd = async () => {
    if (!addForm.ip_address) { toast('IP address is required.', 'warning'); return; }
    const port = Number(addForm.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      toast('Port must be between 1 and 65535 (default 80).', 'warning');
      return;
    }
    await ipc.createDevice({ ...addForm, port, name: addForm.name || addForm.ip_address });
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
        <div ref={colsMenuRef} style={{ position: 'relative' }}>
          <Button variant="ghost" size="sm" onClick={() => setColsMenu(v => !v)}>Columns ▾</Button>
          {colsMenu && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 40,
              background: 'var(--surface-card)', border: '1px solid var(--border-strong)', borderRadius: 11,
              boxShadow: '0 8px 24px rgba(0,0,0,.14)', padding: '10px 14px 12px',
              display: 'flex', gap: 20, maxHeight: '70vh', overflow: 'auto',
            }}>
              {COLUMN_GROUPS.map(g => {
                const toggleable = g.columns.filter(c => !c.locked);
                const allOn = toggleable.every(c => visibleCols.has(c.key));
                const someOn = toggleable.some(c => visibleCols.has(c.key));
                return (
                  <div key={g.label} style={{ minWidth: 124 }}>
                    <label style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 6px',
                      fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase',
                      color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none',
                      borderBottom: '1px solid var(--border)', marginBottom: 4,
                    }}>
                      <input type="checkbox" checked={allOn}
                        ref={el => { if (el) el.indeterminate = !allOn && someOn; }}
                        onChange={() => toggleGroup(g)} style={{ accentColor: 'var(--sr-blue)' }} />
                      {g.label}
                    </label>
                    {g.columns.map(c => (
                      <label key={c.key} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 12.5,
                        color: c.locked ? 'var(--text-muted)' : 'var(--text)',
                        cursor: c.locked ? 'default' : 'pointer', whiteSpace: 'nowrap', userSelect: 'none',
                      }}>
                        <input type="checkbox" checked={visibleCols.has(c.key)} disabled={c.locked}
                          onChange={() => toggleColumn(c.key)} style={{ accentColor: 'var(--sr-blue)' }} />
                        {c.label}
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => ipc.exportDevicesCsv(liveNet)}>Export (CSV)</Button>
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
          <Button variant="ghost" size="sm" onClick={handleBatchUploadLogo}>Upload logo</Button>
          <Button variant="ghost" size="sm" onClick={handleBatchAudit}>Audit</Button>
          <Button variant="warn-outline" size="sm" onClick={handleBatchReboot}>Reboot</Button>
          <Button variant="danger" size="sm" onClick={handleBatchRepairFirmware}>Update firmware</Button>
          <div style={{ flex: 1 }} />
          <Button variant="danger" size="sm" onClick={handleBatchDelete}>Delete</Button>
        </div>
      )}

      {/* Devices table */}
      <Card style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: tableMinWidth }}>
            <div style={{
              display: 'grid', gridTemplateColumns: gridColumns, alignItems: 'center',
              background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ padding: '10px 0 10px 16px' }}>
                <input type="checkbox" checked={filtered.length > 0 && filtered.every(d => selected.has(d.id))} onChange={selectAll} style={{ accentColor: 'var(--sr-blue)' }} />
              </div>
              {shownColumns.map(c => (
                <div key={c.key} className="sr-th" style={{ cursor: 'pointer' }} onClick={() => toggleSort(c.key)}>{c.label}{sortIcon(c.key)}</div>
              ))}
              <div />
            </div>

            {filtered.map(d => {
              const ctx: CellCtx = { h: health[d.id], net: liveNet[d.id] };
              return (
                <div key={d.id} className="sr-row" onClick={() => onOpenDevice(d.id)}
                  style={{ display: 'grid', gridTemplateColumns: gridColumns, alignItems: 'center' }}>
                  <div style={{ padding: '10px 0 10px 16px' }} onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelect(d.id)} style={{ accentColor: 'var(--sr-blue)' }} />
                  </div>
                  {shownColumns.map(c => <div key={c.key} style={{ minWidth: 0 }}>{c.render(d, ctx)}</div>)}
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
