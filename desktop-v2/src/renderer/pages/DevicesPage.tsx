import { useState, useEffect, useCallback, useRef } from 'react';
import { ipc } from '../hooks/useIpc';
import { fmtDate } from '../utils/date';
import { toast } from '../components/Toast';
import ConfigEditor, { ConfigValues, diffValues, stripEmpty } from '../components/ConfigEditor';

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
  const [filterGroup, setFilterGroup] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [netModal, setNetModal] = useState(false);
  const [netSaving, setNetSaving] = useState(false);
  const [netForm, setNetForm] = useState({ dhcp: false, ip: '', netmask: '255.255.255.0', gateway: '', primary_dns: '', secondary_dns: '' });
  const [ntpModal, setNtpModal] = useState(false);
  const [ntpForm, setNtpForm] = useState({ enabled: true, timezone: 'UTC-3' });
  const [hardenModal, setHardenModal] = useState(false);
  const [hardenForm, setHardenForm] = useState<{ https: 'enable' | 'disable' | 'keep'; ssh: 'enable' | 'disable' | 'keep' }>({ https: 'keep', ssh: 'disable' });
  const [backups, setBackups] = useState<any[]>([]);
  const [cfgModal, setCfgModal] = useState(false);
  const [cfgLoading, setCfgLoading] = useState(false);
  const [cfgSaving, setCfgSaving] = useState(false);
  const [cfgValues, setCfgValues] = useState<ConfigValues>({});
  const [cfgOriginal, setCfgOriginal] = useState<ConfigValues>({});
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

  const refreshAll = useCallback(() => {
    ipc.listDevices().then(devs => {
      setDevices(devs);
      if (detailRef.current) {
        const updated = devs.find((d: any) => d.id === detailRef.current.id);
        if (updated) {
          // Force new object reference so React re-renders
          const fresh = { ...updated };
          setDetail(fresh);
          detailRef.current = fresh;
        }
        ipc.deviceHistory(detailRef.current.id, 90).then(setHistory).catch(() => {});
      }
    });
    ipc.listCredentials().then(setCredentials);
    ipc.listGroups().then(setGroups);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(refreshAll, 3000);
    const unsub = ipc.on('heartbeat:update', refreshAll);
    return () => { clearInterval(interval); unsub?.(); };
  }, []);

  const [sortCol, setSortCol] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const sortIcon = (col: string) => sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  const filtered = devices
    .filter(d => {
      if (filterGroup === '__none__') return !d.group_id;
      if (filterGroup) return d.group_id === filterGroup;
      return true;
    })
    .filter(d =>
      !search || d.name?.toLowerCase().includes(search.toLowerCase()) ||
      d.ip_address?.includes(search) || d.model?.toLowerCase().includes(search.toLowerCase()) ||
      d.firmware_version?.includes(search) || d.mac_address?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const va = (a[sortCol] ?? '') as string;
      const vb = (b[sortCol] ?? '') as string;
      const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const setDetailAndRef = (d: any) => {
    setDetail(d);
    detailRef.current = d;
    if (d?.id) {
      ipc.deviceHistory(d.id, 90).then(setHistory).catch(() => setHistory([]));
      ipc.listBackups(d.id).then(setBackups).catch(() => setBackups([]));
    } else { setHistory([]); setBackups([]); }
  };

  const refreshBackups = () => {
    if (detailRef.current?.id) ipc.listBackups(detailRef.current.id).then(setBackups).catch(() => {});
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

  const openNetworkModal = async () => {
    const d = detail;
    if (!d) return;
    const gwGuess = (d.ip_address || '').split('.').slice(0, 3).join('.') + '.1';
    setNetForm({ dhcp: !!d.dhcp_enabled, ip: d.ip_address || '', netmask: '255.255.255.0', gateway: gwGuess, primary_dns: '', secondary_dns: '' });
    setNetModal(true);
    // Prefill with the device's live config (netmask/gateway/DNS aren't in the DB).
    // Deliberately doesn't touch f.dhcp: the DB value used above is kept fresh by
    // the heartbeat, and overriding here would clobber a click made while loading.
    try {
      const net: any = await ipc.getNetwork(d.id);
      if (net) setNetForm(f => ({
        ...f,
        ip: net.ip || f.ip,
        netmask: net.netmask || f.netmask,
        gateway: net.gateway || f.gateway,
        primary_dns: net.primary_dns || net.dns_primary || '',
        secondary_dns: net.secondary_dns || net.dns_secondary || '',
      }));
    } catch { /* device unreachable — keep defaults */ }
  };

  const applyNetwork = async () => {
    const f = netForm;
    if (f.dhcp) {
      if (!(await ipc.confirm('Enable DHCP? The device may come back on a different IP — the app will relocate it by MAC automatically.'))) return;
    } else {
      if (!f.ip || !f.netmask || !f.gateway) { toast('IP, netmask and gateway are required for static IP.', 'warning'); return; }
      if (!(await ipc.confirm(`Apply static IP ${f.ip} / ${f.netmask} (gw ${f.gateway})?`))) return;
    }
    setNetSaving(true);
    try {
      await ipc.setNetwork(detail.id, f.dhcp
        ? { dhcp: true }
        : { dhcp: false, ip: f.ip, netmask: f.netmask, gateway: f.gateway,
            primary_dns: f.primary_dns || undefined, secondary_dns: f.secondary_dns || undefined });
      toast(f.dhcp ? 'DHCP enabled. Waiting for the device to reconnect...' : `Static IP ${f.ip} applied. Reconnecting...`, 'success');
      setNetModal(false);
      setTimeout(load, 4000);
    } catch (e: any) { toast(`Network change failed: ${e.message || e}`, 'error'); }
    finally { setNetSaving(false); }
  };

  const openConfigModal = async () => {
    if (!detail) return;
    setCfgModal(true); setCfgLoading(true); setCfgValues({}); setCfgOriginal({});
    try {
      const cfg = await ipc.getLiveConfig(detail.id);
      setCfgValues(cfg);
      setCfgOriginal(JSON.parse(JSON.stringify(cfg)));
    } catch (e: any) {
      toast(`Could not read configuration: ${e.message || e}`, 'error');
      setCfgModal(false);
    } finally { setCfgLoading(false); }
  };

  const applyConfigChanges = async () => {
    if (!detail) return;
    // stripEmpty: a field cleared to '' can't be applied (the API has no
    // "unset" — the adapter skips empty values), so don't count or send it.
    const diff = stripEmpty(diffValues(cfgOriginal, cfgValues));
    const n = Object.values(diff).reduce((a, m) => a + Object.keys(m).length, 0);
    if (n === 0) { toast('No changes to apply.', 'info'); return; }
    if (!(await ipc.confirm(`Apply ${n} changed setting(s) to this device?`))) return;
    setCfgSaving(true);
    try {
      await ipc.applyConfig(detail.id, diff);
      toast(`${n} setting(s) applied.`, 'success');
      setCfgOriginal(JSON.parse(JSON.stringify(cfgValues)));
    } catch (e: any) { toast(`Apply failed: ${e.message || e}`, 'error'); }
    finally { setCfgSaving(false); }
  };

  const saveConfigAsTemplate = async () => {
    if (!detail) return;
    const n = await ipc.prompt('Save as Template', 'Template name:', `${detail.name || detail.ip_address} config`);
    if (!n) return;
    try {
      await ipc.createTemplate({
        name: n,
        description: `Captured from ${detail.name || detail.ip_address} (${detail.ip_address})`,
        config: stripEmpty(cfgValues),
      });
      toast('Template saved — manage it on the Configuration page.', 'success');
    } catch (e: any) { toast(`Could not save template: ${e.message || e}`, 'error'); }
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

  const handleBatchCredentials = async () => {
    const username = await ipc.prompt('Set Credentials', `New login for ${selected.size} device(s) (web + API):`, 'admin');
    if (!username) return;
    const password = await ipc.prompt('Set Credentials', `New password for user "${username}":`);
    if (!password) return;
    // Country only matters for factory devices still in first-boot: setting the
    // login also completes the on-screen wizard (language + legal terms).
    const country = await ipc.prompt('Set Credentials',
      'Country code — only used to finish initial setup on factory (first-boot) devices:', 'BR');
    if (country === null) return;
    if (!(await ipc.confirm(`Change login on ${selected.size} device(s) to "${username}"? Factory devices will also have their initial setup completed. The app re-links them to the new credential automatically.`))) return;
    await ipc.batchChangeCredentials(Array.from(selected), username, password, country || 'BR');
    toast('Credential change started — see Tasks page for results', 'info');
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

  const handleBatchAudit = async () => {
    await ipc.securityAudit(Array.from(selected));
    toast('Factory-credential audit started — flagged devices show as FAILED on the Tasks page.', 'info');
    setSelected(new Set());
    setTimeout(load, 2000);
  };

  const handleBatchRepairFirmware = async () => {
    if (!(await ipc.confirm(`Reinstall firmware on ${selected.size} device(s) via recovery mode? Devices are processed ONE AT A TIME and each stays offline for several minutes. Settings and users are kept.`))) return;
    await ipc.firmwareRepair(Array.from(selected));
    toast('Firmware repair job started — see Tasks page for progress.', 'info');
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
      if (!result.connected) toast('Could not connect. Check credentials and port.', 'error');
    } catch (err: any) {
      toast(`Connection failed: ${err.message || err}`, 'error');
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
      {/* Groups sidebar */}
      <div className="w-48 border-r border-slate-800 bg-slate-900/50 flex flex-col flex-shrink-0">
        <div className="px-3 py-3 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Groups</span>
          <button onClick={async () => {
            const name = await ipc.prompt('New Group', 'Enter group name:');
            if (name) { await ipc.createGroup({ name }); load(); }
          }} className="text-xs text-brand-400 hover:text-brand-300">+ New</button>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-0.5">
          <button onClick={() => setFilterGroup(null)}
            className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors ${!filterGroup ? 'bg-brand-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
            All Devices <span className="text-slate-500">({devices.length})</span>
          </button>
          <button onClick={() => setFilterGroup('__none__')}
            className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors ${filterGroup === '__none__' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
            Ungrouped <span className="text-slate-500">({devices.filter(d => !d.group_id).length})</span>
          </button>
          {groups.map(g => (
            <div key={g.id} className="flex items-center group">
              <button onClick={() => setFilterGroup(g.id)}
                className={`flex-1 text-left px-3 py-1.5 rounded text-xs transition-colors truncate ${filterGroup === g.id ? 'bg-brand-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                {g.name} <span className="text-slate-500">({devices.filter(d => d.group_id === g.id).length})</span>
              </button>
              <button onClick={async () => {
                if (await ipc.confirm(`Delete group "${g.name}"?`)) { await ipc.deleteGroup(g.id); load(); if (filterGroup === g.id) setFilterGroup(null); }
              }} className="text-slate-700 hover:text-red-400 text-xs px-1 opacity-0 group-hover:opacity-100">×</button>
            </div>
          ))}
        </div>
      </div>

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
              <button onClick={handleBatchCredentials} className="px-3 py-1.5 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700">Set Credentials</button>
              <button onClick={handleBatchReboot} className="px-3 py-1.5 bg-amber-600 text-white text-xs rounded-lg hover:bg-amber-700">Reboot</button>
              <button onClick={handleBatchRepairFirmware} className="px-3 py-1.5 bg-rose-700 text-white text-xs rounded-lg hover:bg-rose-600">Repair FW</button>
              <button onClick={() => setNtpModal(true)} className="px-3 py-1.5 bg-sky-700 text-white text-xs rounded-lg hover:bg-sky-600">Set NTP</button>
              <button onClick={() => setHardenModal(true)} className="px-3 py-1.5 bg-indigo-700 text-white text-xs rounded-lg hover:bg-indigo-600">Harden</button>
              <button onClick={handleBatchAudit} className="px-3 py-1.5 bg-slate-600 text-white text-xs rounded-lg hover:bg-slate-500">Audit</button>
            </div>
          )}
          <button onClick={() => ipc.exportDevicesCsv()} className="px-3 py-1.5 bg-slate-700 text-white text-xs rounded-lg hover:bg-slate-600">
            Export CSV
          </button>
          <button onClick={async () => {
            const allIds = devices.filter(d => d.credential_id).map((d: any) => d.id);
            if (allIds.length === 0) { toast('No devices with credentials to refresh.', 'warning'); return; }
            await ipc.batchTestConnection(allIds);
            toast(`Refreshing ${allIds.length} devices...`, 'info');
            setTimeout(refreshAll, 3000);
          }} className="px-3 py-1.5 bg-teal-600 text-white text-xs rounded-lg hover:bg-teal-700">
            Refresh Devices
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
                <th className="px-3 py-2.5 w-8 cursor-pointer hover:text-white" onClick={() => toggleSort('status')}>Status{sortIcon('status')}</th>
                <th className="px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => toggleSort('name')}>Name{sortIcon('name')}</th>
                <th className="px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => toggleSort('ip_address')}>IP Address{sortIcon('ip_address')}</th>
                <th className="px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => toggleSort('model')}>Model{sortIcon('model')}</th>
                <th className="px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => toggleSort('serial_number')}>Serial{sortIcon('serial_number')}</th>
                <th className="px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => toggleSort('firmware_version')}>Firmware{sortIcon('firmware_version')}</th>
                <th className="px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => toggleSort('mac_address')}>MAC Address{sortIcon('mac_address')}</th>
                <th className="px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => toggleSort('dhcp_enabled')}>DHCP{sortIcon('dhcp_enabled')}</th>
                <th className="px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => toggleSort('last_heartbeat')}>Last Heartbeat{sortIcon('last_heartbeat')}</th>
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
                  <td className="px-3 py-2 text-slate-500 text-xs">{d.last_heartbeat ? fmtDate(d.last_heartbeat) : 'Never'}</td>
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

            {/* Factory-credential warning (set by the security audit) */}
            {detail.factory_credentials === 1 && (
              <div className="flex items-start gap-2 px-2.5 py-2 bg-red-900/30 border border-red-800/60 rounded-lg">
                <span className="text-red-400">⚠</span>
                <p className="text-xs text-red-300">Accepts factory credentials (admin/admin). Use "Set Credentials" to change them.</p>
              </div>
            )}

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
              ['Last Heartbeat', detail.last_heartbeat ? fmtDate(detail.last_heartbeat) : 'Never'],
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
                    <span className="text-slate-600 text-[10px]">{fmtDate(h.timestamp)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Config backups */}
          {detail.credential_id && (
            <div className="px-4 py-3 border-t border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs text-slate-600 uppercase tracking-wide">Config Backups ({backups.length})</h3>
                <button onClick={async () => {
                  try {
                    toast('Reading configuration for backup...', 'info');
                    const b = await ipc.backupConfig(detail.id);
                    toast(`Backup v${b.version} saved.`, 'success');
                    refreshBackups();
                  } catch (e: any) { toast(`Backup failed: ${e.message || e}`, 'error'); }
                }} className="text-xs text-brand-400 hover:text-brand-300">Backup now</button>
              </div>
              {backups.length > 0 ? (
                <div className="space-y-1 max-h-36 overflow-auto">
                  {backups.map((b: any) => (
                    <div key={b.id} className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400 font-mono">v{b.version}</span>
                      <span className="text-slate-600 flex-1 text-[10px]">{fmtDate(b.created_at)}</span>
                      <button onClick={async () => {
                        if (!(await ipc.confirm(`Restore configuration backup v${b.version} (${fmtDate(b.created_at)}) to this device? Current settings will be overwritten.`))) return;
                        try {
                          const ok = await ipc.restoreConfig(detail.id, b.id);
                          toast(ok ? `Backup v${b.version} restored.` : 'Device rejected the restore.', ok ? 'success' : 'error');
                        } catch (e: any) { toast(`Restore failed: ${e.message || e}`, 'error'); }
                      }} className="text-slate-500 hover:text-emerald-400">Restore</button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-slate-600">No backups yet. Use "Backup now" or enable the scheduled backup on the Configuration page.</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="p-4 border-t border-slate-800 space-y-2 flex-shrink-0">
            <button onClick={() => handleTestConnection(detail.id)} disabled={testing || !detail.credential_id}
              className="w-full px-3 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
              {testing ? 'Testing...' : 'Test Connection'}</button>
            {(detail.status === 'offline' || detail.status === 'unreachable') && detail.mac_address && (
              <button onClick={async () => {
                setTesting(true);
                try {
                  const result = await ipc.locateDevice(detail.id);
                  if (result.found) {
                    toast(`Device found at new IP: ${result.newIp} (was ${result.oldIp})`, 'success');
                    const devs = await ipc.listDevices();
                    setDevices(devs);
                    const updated = devs.find((d: any) => d.id === detail.id);
                    if (updated) { setDetail(updated); detailRef.current = updated; }
                    ipc.deviceHistory(detail.id, 90).then(setHistory).catch(() => {});
                    ipc.listCredentials().then(setCredentials);
                    ipc.listGroups().then(setGroups);
                  } else {
                    toast('Device not found on the subnet.', 'warning');
                  }
                } catch (e: any) { toast(`Error: ${e.message}`, 'error'); }
                finally { setTesting(false); }
              }} disabled={testing}
                className="w-full px-3 py-2 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 disabled:opacity-40">
                {testing ? 'Scanning...' : 'Locate Device (scan by MAC)'}
              </button>
            )}
            <button onClick={() => ipc.openDoor(detail.id)} disabled={!detail.credential_id}
              className="w-full px-3 py-2 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">Open Door</button>
            <button onClick={async () => {
              try {
                toast('Beeping and showing a message on the device...', 'info');
                await ipc.locatePhysical(detail.id, { buzz: true, message: 'Localizando este equipamento' });
                toast('Device signalled (buzzer + screen).', 'success');
              } catch (e: any) { toast(`Locate failed: ${e.message || e}`, 'error'); }
            }} disabled={!detail.credential_id}
              className="w-full px-3 py-2 bg-fuchsia-700 text-white text-xs rounded-lg hover:bg-fuchsia-600 disabled:opacity-40 disabled:cursor-not-allowed">
              Locate (beep + screen)</button>
            <button onClick={async () => { if (await ipc.confirm('Reboot this device?')) ipc.rebootDevice(detail.id); }} disabled={!detail.credential_id}
              className="w-full px-3 py-2 bg-amber-600 text-white text-xs rounded-lg hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed">Reboot</button>
            <button onClick={async () => {
              try { await ipc.setTime(detail.id); toast('Device time synchronized.', 'success'); } catch (e: any) { toast(`Error: ${e.message}`, 'error'); }
            }} disabled={!detail.credential_id}
              className="w-full px-3 py-2 bg-slate-700 text-white text-xs rounded-lg hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed">Sync Date/Time</button>
            <button onClick={openNetworkModal} disabled={!detail.credential_id}
              className="w-full px-3 py-2 bg-cyan-700 text-white text-xs rounded-lg hover:bg-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed">
              Network (DHCP / Static IP)</button>
            <button onClick={openConfigModal} disabled={!detail.credential_id}
              className="w-full px-3 py-2 bg-teal-700 text-white text-xs rounded-lg hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed">
              Edit Configuration</button>
            <button onClick={async () => {
              const country = await ipc.prompt('Finish initial setup',
                'Country code (the on-screen language is derived from it):', 'BR');
              if (country === null) return;
              if (!(await ipc.confirm('Complete the initial setup wizard (language + legal terms) on this device remotely? Use this if the reader is stuck on the on-screen setup wizard (language/country/terms).'))) return;
              try {
                await ipc.finishSetup(detail.id, country || 'BR');
                toast('Setup completed. If the screen still shows the wizard, reboot the device to apply.', 'success');
              } catch (e: any) { toast(`Finish setup failed: ${e.message || e}`, 'error'); }
            }} disabled={!detail.credential_id}
              className="w-full px-3 py-2 bg-indigo-700 text-white text-xs rounded-lg hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed">
              Finish Setup (stuck on wizard)</button>
            <div className="flex gap-2">
              {([['Diagnostic Logs', 'diagnostic'], ['Audit Logs', 'audit']] as const).map(([label, kind]) => (
                <button key={kind} onClick={async () => {
                  try {
                    toast(`Generating ${label.toLowerCase()}...`, 'info');
                    const r = await ipc.downloadLogs(detail.id, kind);
                    if (r?.saved) toast(`${label} saved.`, 'success');
                  } catch (e: any) { toast(`Log download failed: ${e.message || e}`, 'error'); }
                }} disabled={!detail.credential_id}
                  className="flex-1 px-3 py-2 bg-slate-700 text-white text-xs rounded-lg hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed">
                  {label}</button>
              ))}
            </div>
            <button onClick={async () => {
              if (!(await ipc.confirm('Reinstall the current firmware via recovery mode? Settings and users are KEPT. The device stays offline for several minutes while it reboots into recovery, reapplies its firmware image and boots back. Use this for corrupted firmware or boot loops.'))) return;
              try {
                await ipc.firmwareRepair([detail.id]);
                toast('Firmware repair started — follow progress on the Tasks page.', 'info');
              } catch (e: any) { toast(`Could not start repair: ${e.message || e}`, 'error'); }
            }} disabled={!detail.credential_id}
              className="w-full px-3 py-2 bg-rose-700 text-white text-xs rounded-lg hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed">
              Repair Firmware (recovery)</button>
            <div className="flex gap-2">
              <button onClick={async () => {
                if (!(await ipc.confirm('Reboot this device into recovery mode? It goes offline and shows only the recovery screen until it is told to reboot normally (use "Exit Recovery").'))) return;
                try {
                  await ipc.deviceRecovery(detail.id, 'enter');
                  toast('Recovery mode requested. The device is rebooting...', 'warning');
                } catch (e: any) { toast(`Enter recovery failed: ${e.message || e}`, 'error'); }
              }} disabled={!detail.credential_id}
                className="flex-1 px-3 py-2 bg-slate-700 text-white text-xs rounded-lg hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed">
                Enter Recovery</button>
              <button onClick={async () => {
                try {
                  await ipc.deviceRecovery(detail.id, 'exit');
                  toast('Normal reboot sent. The device is leaving recovery mode...', 'success');
                } catch (e: any) { toast(`${e.message || e}`, 'error'); }
              }}
                className="flex-1 px-3 py-2 bg-slate-700 text-white text-xs rounded-lg hover:bg-slate-600">
                Exit Recovery</button>
            </div>
            <button onClick={async () => {
              if (!(await ipc.confirm('FACTORY REINSTALL: reinstalls the firmware AND ERASES all configuration and users (like a factory reset). The device comes back with factory defaults (admin/admin, possibly IP 192.168.0.129). Continue?'))) return;
              const word = await ipc.prompt('Factory Reinstall', 'Type ERASE to confirm:');
              if (word !== 'ERASE') { if (word !== null) toast('Confirmation text did not match — cancelled.', 'info'); return; }
              try {
                await ipc.firmwareRepair([detail.id], true);
                toast('Factory reinstall started — see Tasks. Afterwards, re-add the device via Discovery if it changes IP.', 'warning');
              } catch (e: any) { toast(`Could not start factory reinstall: ${e.message || e}`, 'error'); }
            }} disabled={!detail.credential_id}
              className="w-full px-3 py-2 bg-red-900/60 text-red-300 text-xs rounded-lg hover:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed">
              Factory Reinstall (wipes config)</button>
            <button onClick={async () => {
              if (!(await ipc.confirm('FACTORY RESET: This will erase all data on the device. Keep network settings?'))) return;
              const keepNet = await ipc.confirm('Preserve network configuration (IP, DHCP)?');
              try { await ipc.factoryReset(detail.id, keepNet); toast('Factory reset sent. Device is restarting...', 'warning'); await load(); } catch (e: any) { toast(`Error: ${e.message}`, 'error'); }
            }} disabled={!detail.credential_id}
              className="w-full px-3 py-2 bg-red-900/60 text-red-300 text-xs rounded-lg hover:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed">Factory Reset</button>
            <button onClick={() => handleDelete(detail.id)}
              className="w-full px-3 py-2 bg-red-700/60 text-red-200 text-xs rounded-lg hover:bg-red-700">Delete Device</button>
          </div>
        </div>
      )}

      {/* Batch hardening modal */}
      {hardenModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setHardenModal(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-[26rem] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-1">Security Hardening</h3>
            <p className="text-xs text-slate-500 mb-4">{selected.size} device(s) selected</p>
            {([
              ['https', 'HTTPS (self-signed)', 'Encrypts the web/API traffic. Enabling moves the device to port 443.'],
              ['ssh', 'SSH access', 'Shell access to the device. Disable unless you need it.'],
            ] as const).map(([key, label, hint]) => (
              <div key={key} className="mb-4">
                <p className="text-xs text-slate-300 font-medium">{label}</p>
                <p className="text-[10px] text-slate-600 mb-1.5">{hint}</p>
                <div className="flex gap-1.5">
                  {(['enable', 'disable', 'keep'] as const).map(opt => (
                    <button key={opt} onClick={() => setHardenForm({ ...hardenForm, [key]: opt })}
                      className={`flex-1 px-2 py-1.5 text-xs rounded-lg border capitalize ${
                        (hardenForm as any)[key] === opt
                          ? 'bg-indigo-700 border-indigo-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}>
                      {opt === 'keep' ? 'Leave as-is' : opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex justify-end gap-2 mt-2">
              <button onClick={() => setHardenModal(false)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg hover:bg-slate-700">Cancel</button>
              <button onClick={applyHarden}
                className="px-4 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700">Apply to {selected.size}</button>
            </div>
          </div>
        </div>
      )}

      {/* Batch NTP modal */}
      {ntpModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setNtpModal(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-[24rem] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-1">NTP Time Sync</h3>
            <p className="text-xs text-slate-500 mb-4">{selected.size} device(s) selected</p>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setNtpForm({ ...ntpForm, enabled: true })}
                className={`flex-1 px-3 py-2 text-xs rounded-lg border ${ntpForm.enabled
                  ? 'bg-sky-700 border-sky-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}>
                Enable NTP
              </button>
              <button onClick={() => setNtpForm({ ...ntpForm, enabled: false })}
                className={`flex-1 px-3 py-2 text-xs rounded-lg border ${!ntpForm.enabled
                  ? 'bg-sky-700 border-sky-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}>
                Disable NTP
              </button>
            </div>
            {ntpForm.enabled ? (
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs text-slate-500 w-24 flex-shrink-0">Timezone</span>
                <select value={ntpForm.timezone} onChange={e => setNtpForm({ ...ntpForm, timezone: e.target.value })}
                  className="flex-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white">
                  {Array.from({ length: 25 }, (_, i) => {
                    const off = i - 12;
                    const v = `UTC${off >= 0 ? '+' : ''}${off}`;
                    return <option key={v} value={v}>{v}{v === 'UTC-3' ? ' (Brasília)' : ''}</option>;
                  })}
                </select>
              </div>
            ) : (
              <p className="text-xs text-amber-400/90 mb-4">
                Devices will stop syncing time automatically — use "Sync Date/Time" manually when needed.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setNtpModal(false)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg hover:bg-slate-700">Cancel</button>
              <button onClick={applyNtp}
                className="px-4 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700">
                Apply to {selected.size}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live configuration editor modal */}
      {cfgModal && detail && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => { if (!cfgSaving && !cfgLoading) setCfgModal(false); }}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-[46rem] max-h-[85vh] flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Device Configuration</h3>
                <p className="text-xs text-slate-500">{detail.name || detail.ip_address} · {detail.ip_address}:{detail.port}</p>
              </div>
              <button onClick={() => { if (!cfgSaving) setCfgModal(false); }}
                className="text-slate-500 hover:text-white text-lg">&times;</button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {cfgLoading ? (
                <p className="text-center text-slate-500 text-sm py-12">
                  Reading configuration from the device (module by module)...
                </p>
              ) : (
                <>
                  <p className="text-xs text-slate-600 mb-3">
                    Values read live from the device; modules the firmware doesn't support are hidden.
                    Changed fields are marked in amber and only they are sent on Apply.
                  </p>
                  <ConfigEditor values={cfgValues} original={cfgOriginal} emptyHint="—" onlyReported
                    onChange={(mod, key, value) =>
                      setCfgValues(c => ({ ...c, [mod]: { ...(c[mod] || {}), [key]: value } }))} />
                </>
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-800 flex items-center gap-2">
              <button onClick={saveConfigAsTemplate} disabled={cfgLoading}
                className="px-3 py-1.5 bg-slate-700 text-white text-xs rounded-lg hover:bg-slate-600 disabled:opacity-40">
                Save as Template</button>
              <div className="flex-1" />
              <button onClick={() => setCfgModal(false)} disabled={cfgSaving}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg hover:bg-slate-700 disabled:opacity-40">Close</button>
              <button onClick={applyConfigChanges} disabled={cfgLoading || cfgSaving}
                className="px-4 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 disabled:opacity-40">
                {cfgSaving ? 'Applying...' : 'Apply changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Network configuration modal */}
      {netModal && detail && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => { if (!netSaving) setNetModal(false); }}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-[26rem] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-1">Network Configuration</h3>
            <p className="text-xs text-slate-500 mb-4 truncate">{detail.name || detail.ip_address} · {detail.ip_address}:{detail.port}</p>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setNetForm({ ...netForm, dhcp: true })}
                className={`flex-1 px-3 py-2 text-xs rounded-lg border ${netForm.dhcp
                  ? 'bg-cyan-700 border-cyan-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}>
                DHCP (automatic)
              </button>
              <button onClick={() => setNetForm({ ...netForm, dhcp: false })}
                className={`flex-1 px-3 py-2 text-xs rounded-lg border ${!netForm.dhcp
                  ? 'bg-cyan-700 border-cyan-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}>
                Static IP
              </button>
            </div>
            {netForm.dhcp ? (
              <p className="text-xs text-amber-400/90 mb-4">
                The device will get its IP from the DHCP server. If the IP changes,
                the app relocates the device automatically by MAC address.
              </p>
            ) : (
              <div className="space-y-2 mb-4">
                {([
                  ['IP address', 'ip'], ['Netmask', 'netmask'], ['Gateway', 'gateway'],
                  ['DNS primary (optional)', 'primary_dns'], ['DNS secondary (optional)', 'secondary_dns'],
                ] as const).map(([label, key]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-36 flex-shrink-0">{label}</span>
                    <input value={(netForm as any)[key]} onChange={e => setNetForm({ ...netForm, [key]: e.target.value })}
                      className="flex-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono" />
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setNetModal(false)} disabled={netSaving}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg hover:bg-slate-700 disabled:opacity-40">Cancel</button>
              <button onClick={applyNetwork} disabled={netSaving}
                className="px-4 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 disabled:opacity-40">
                {netSaving ? 'Applying...' : 'Apply'}
              </button>
            </div>
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
