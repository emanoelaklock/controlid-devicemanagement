import { useState, useEffect, useCallback, ReactNode } from 'react';
import { ipc } from '../hooks/useIpc';
import { fmtDate } from '../utils/date';
import { toast } from '../components/Toast';
import ConfigEditor, { ConfigValues, diffValues, stripEmpty } from '../components/ConfigEditor';
import { Badge, Button, Card, Eyebrow, InfoRow, Modal, ModalTitle, Select, TextInput, UptimeBar } from '../components/ui';
import { statusInfo, DeviceHealth } from './DevicesPage';

const STATUS_MARK: Record<string, string> = {
  exec: 'var(--sr-exec-m)', warn: 'var(--sr-warn-m)', pend: 'var(--sr-pend-m)',
};
const STATUS_TEXT: Record<string, string> = {
  exec: 'var(--sr-exec-fg)', warn: 'var(--sr-warn-fg)', pend: 'var(--sr-pend-fg)',
};

function ActionRow({ label, danger = false, last = false, children }: {
  label: string; danger?: boolean; last?: boolean; children: ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      padding: last ? '12px 0 2px' : '12px 0', borderBottom: last ? 'none' : '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: danger ? 'var(--sr-pend-fg)' : 'var(--text-muted)', width: 110, flex: 'none' }}>{label}</span>
      {children}
    </div>
  );
}

export default function DeviceDetailPage({ deviceId, onBack }: { deviceId: string; onBack: () => void }) {
  const [device, setDevice] = useState<any>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [credentials, setCredentials] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [backups, setBackups] = useState<any[]>([]);
  const [health, setHealth] = useState<DeviceHealth | null>(null);
  const [liveNet, setLiveNet] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [netModal, setNetModal] = useState(false);
  const [netSaving, setNetSaving] = useState(false);
  const [netForm, setNetForm] = useState({ dhcp: false, ip: '', netmask: '255.255.255.0', gateway: '', primary_dns: '', secondary_dns: '' });
  const [cfgModal, setCfgModal] = useState(false);
  const [cfgLoading, setCfgLoading] = useState(false);
  const [cfgSaving, setCfgSaving] = useState(false);
  const [cfgValues, setCfgValues] = useState<ConfigValues>({});
  const [cfgOriginal, setCfgOriginal] = useState<ConfigValues>({});

  const load = useCallback(() => {
    ipc.getDevice(deviceId).then(setDevice).catch(() => {});
    ipc.listGroups().then(setGroups).catch(() => {});
    ipc.listCredentials().then(setCredentials).catch(() => {});
    ipc.deviceHistory(deviceId, 90).then(setHistory).catch(() => setHistory([]));
    ipc.listBackups(deviceId).then(setBackups).catch(() => setBackups([]));
    ipc.devicesHealth().then(h => setHealth(h[deviceId] ?? null)).catch(() => {});
  }, [deviceId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    const unsub = ipc.on('heartbeat:update', load);
    return () => { clearInterval(interval); unsub?.(); };
  }, [load]);

  // Netmask/gateway live only on the device — fetched best-effort when reachable.
  useEffect(() => {
    setLiveNet(null);
    ipc.getNetwork(deviceId).then(setLiveNet).catch(() => {});
  }, [deviceId]);

  if (!device) {
    return (
      <div style={{ padding: '18px 28px' }}>
        <Button variant="ghost" size="sm" onClick={onBack}>‹ All devices</Button>
      </div>
    );
  }

  const st = statusInfo(device, health ?? undefined);
  const groupName = device.group_name || 'Ungrouped';
  const noCred = !device.credential_id;
  const openUrl = () => window.api.invoke('shell:open-url', `http${device.https_enabled ? 's' : ''}://${device.ip_address}:${device.port}`);
  const dropCount = history.filter((h: any) => h.event === 'offline').length;
  const dropTone = dropCount >= 10 ? 'pend' : dropCount >= 3 ? 'warn' : 'aguard';

  // ─── Actions ──────────────────────────────────────────────────────

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await ipc.testConnection(deviceId);
      load();
      if (!result.connected) toast('Could not connect. Check credentials and port.', 'error');
    } catch (e: any) { toast(`Connection failed: ${e.message || e}`, 'error'); }
    finally { setTesting(false); }
  };

  const handleLocatePhysical = async () => {
    try {
      toast('Beeping and showing a message on the device...', 'info');
      await ipc.locatePhysical(deviceId, { buzz: true, message: 'Localizando este equipamento' });
      toast('Device signalled (buzzer + screen).', 'success');
    } catch (e: any) { toast(`Locate failed: ${e.message || e}`, 'error'); }
  };

  const handleLocateByMac = async () => {
    setTesting(true);
    try {
      const result = await ipc.locateDevice(deviceId);
      if (result.found) toast(`Device found at new IP: ${result.newIp} (was ${result.oldIp})`, 'success');
      else toast('Device not found on the subnet.', 'warning');
      load();
    } catch (e: any) { toast(`Error: ${e.message}`, 'error'); }
    finally { setTesting(false); }
  };

  const handleSyncTime = async () => {
    try { await ipc.setTime(deviceId); toast('Device time synchronized.', 'success'); }
    catch (e: any) { toast(`Error: ${e.message}`, 'error'); }
  };

  const handleRename = async () => {
    const name = await ipc.prompt('Rename device', 'New device name:', device.name || device.ip_address);
    if (name === null || !name.trim()) return;
    await ipc.updateDevice(deviceId, { name: name.trim() });
    load();
  };

  const handleEditNotes = async () => {
    const notes = await ipc.prompt('Edit notes', 'Notes for this device:', device.notes || '');
    if (notes === null) return;
    await ipc.updateDevice(deviceId, { notes });
    load();
  };

  const openNetworkModal = async () => {
    const gwGuess = (device.ip_address || '').split('.').slice(0, 3).join('.') + '.1';
    setNetForm({ dhcp: !!device.dhcp_enabled, ip: device.ip_address || '', netmask: '255.255.255.0', gateway: gwGuess, primary_dns: '', secondary_dns: '' });
    setNetModal(true);
    // Prefill with the device's live config (netmask/gateway/DNS aren't in the DB).
    try {
      const net: any = await ipc.getNetwork(deviceId);
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
      await ipc.setNetwork(deviceId, f.dhcp
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
    setCfgModal(true); setCfgLoading(true); setCfgValues({}); setCfgOriginal({});
    try {
      const cfg = await ipc.getLiveConfig(deviceId);
      setCfgValues(cfg);
      setCfgOriginal(JSON.parse(JSON.stringify(cfg)));
    } catch (e: any) {
      toast(`Could not read configuration: ${e.message || e}`, 'error');
      setCfgModal(false);
    } finally { setCfgLoading(false); }
  };

  const applyConfigChanges = async () => {
    const diff = stripEmpty(diffValues(cfgOriginal, cfgValues));
    const n = Object.values(diff).reduce((a, m) => a + Object.keys(m).length, 0);
    if (n === 0) { toast('No changes to apply.', 'info'); return; }
    if (!(await ipc.confirm(`Apply ${n} changed setting(s) to this device?`))) return;
    setCfgSaving(true);
    try {
      await ipc.applyConfig(deviceId, diff);
      toast(`${n} setting(s) applied.`, 'success');
      setCfgOriginal(JSON.parse(JSON.stringify(cfgValues)));
    } catch (e: any) { toast(`Apply failed: ${e.message || e}`, 'error'); }
    finally { setCfgSaving(false); }
  };

  const saveConfigAsTemplate = async () => {
    const n = await ipc.prompt('Save as Template', 'Template name:', `${device.name || device.ip_address} config`);
    if (!n) return;
    try {
      await ipc.createTemplate({
        name: n,
        description: `Captured from ${device.name || device.ip_address} (${device.ip_address})`,
        config: stripEmpty(cfgValues),
      });
      toast('Template saved — manage it on the Configuration page.', 'success');
    } catch (e: any) { toast(`Could not save template: ${e.message || e}`, 'error'); }
  };

  const handleFinishSetup = async () => {
    const country = await ipc.prompt('Finish initial setup', 'Country code (the on-screen language is derived from it):', 'BR');
    if (country === null) return;
    if (!(await ipc.confirm('Complete the initial setup wizard (language + legal terms) on this device remotely? Use this if the reader is stuck on the on-screen setup wizard (language/country/terms).'))) return;
    try {
      await ipc.finishSetup(deviceId, country || 'BR');
      toast('Setup completed. If the screen still shows the wizard, reboot the device to apply.', 'success');
    } catch (e: any) { toast(`Finish setup failed: ${e.message || e}`, 'error'); }
  };

  const handleLogs = async (label: string, kind: 'diagnostic' | 'audit') => {
    try {
      toast(`Generating ${label.toLowerCase()}...`, 'info');
      const r = await ipc.downloadLogs(deviceId, kind);
      if (r?.saved) toast(`${label} saved.`, 'success');
    } catch (e: any) { toast(`Log download failed: ${e.message || e}`, 'error'); }
  };

  const handleReboot = async () => {
    if (await ipc.confirm('Reboot this device?')) ipc.rebootDevice(deviceId);
  };

  const handleRepairFirmware = async () => {
    if (!(await ipc.confirm('Reinstall the current firmware via recovery mode? Settings and users are KEPT. The device stays offline for several minutes while it reboots into recovery, reapplies its firmware image and boots back. Use this for corrupted firmware or boot loops.'))) return;
    try {
      await ipc.firmwareRepair([deviceId]);
      toast('Firmware repair started — follow progress on the Tasks page.', 'info');
    } catch (e: any) { toast(`Could not start repair: ${e.message || e}`, 'error'); }
  };

  const handleEnterRecovery = async () => {
    if (!(await ipc.confirm('Reboot this device into recovery mode? It goes offline and shows only the recovery screen until it is told to reboot normally (use "Exit recovery").'))) return;
    try {
      await ipc.deviceRecovery(deviceId, 'enter');
      toast('Recovery mode requested. The device is rebooting...', 'warning');
    } catch (e: any) { toast(`Enter recovery failed: ${e.message || e}`, 'error'); }
  };

  const handleExitRecovery = async () => {
    try {
      await ipc.deviceRecovery(deviceId, 'exit');
      toast('Normal reboot sent. The device is leaving recovery mode...', 'success');
    } catch (e: any) { toast(`${e.message || e}`, 'error'); }
  };

  const handleFactoryReinstall = async () => {
    if (!(await ipc.confirm('FACTORY REINSTALL: reinstalls the firmware AND ERASES all configuration and users (like a factory reset). The device comes back with factory defaults (admin/admin, possibly IP 192.168.0.129). Continue?'))) return;
    const word = await ipc.prompt('Factory Reinstall', 'Type ERASE to confirm:');
    if (word !== 'ERASE') { if (word !== null) toast('Confirmation text did not match — cancelled.', 'info'); return; }
    try {
      await ipc.firmwareRepair([deviceId], true);
      toast('Factory reinstall started — see Tasks. Afterwards, re-add the device via Discovery if it changes IP.', 'warning');
    } catch (e: any) { toast(`Could not start factory reinstall: ${e.message || e}`, 'error'); }
  };

  const handleFactoryReset = async () => {
    if (!(await ipc.confirm('FACTORY RESET: This will erase all data on the device. Keep network settings?'))) return;
    const keepNet = await ipc.confirm('Preserve network configuration (IP, DHCP)?');
    try { await ipc.factoryReset(deviceId, keepNet); toast('Factory reset sent. Device is restarting...', 'warning'); load(); }
    catch (e: any) { toast(`Error: ${e.message}`, 'error'); }
  };

  const handleDelete = async () => {
    if (!(await ipc.confirm('Delete this device?'))) return;
    await ipc.deleteDevice(deviceId);
    onBack();
  };

  const handleBackupNow = async () => {
    try {
      toast('Reading configuration for backup...', 'info');
      const b = await ipc.backupConfig(deviceId);
      toast(`Backup v${b.version} saved.`, 'success');
      ipc.listBackups(deviceId).then(setBackups).catch(() => {});
    } catch (e: any) { toast(`Backup failed: ${e.message || e}`, 'error'); }
  };

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div style={{ padding: '18px 28px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Button variant="ghost" size="sm" onClick={onBack}>‹ All devices</Button>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Devices / {groupName} / <b style={{ color: 'var(--text)' }}>{device.name || device.ip_address}</b>
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 14, alignItems: 'start' }}>
        {/* Main column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {/* Header card */}
          <Card edge={STATUS_MARK[st.tone]} style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: '-.3px', color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {device.name || device.ip_address}
                </h2>
                <Badge tone={st.tone} dot>{st.label}</Badge>
                {device.factory_credentials === 1 && <Badge tone="pend">Factory credentials</Badge>}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                {device.model || 'Unknown model'} · <a href="#" onClick={e => { e.preventDefault(); openUrl(); }}>{device.ip_address}:{device.port}</a> · {groupName} · last heartbeat {device.last_heartbeat ? fmtDate(device.last_heartbeat) : 'never'}
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button variant="primary" size="sm" disabled={testing || noCred} onClick={handleTest}>{testing ? 'Testing…' : 'Test connection'}</Button>
              <Button variant="green" size="sm" disabled={noCred} onClick={() => ipc.openDoor(deviceId)}>Open door</Button>
            </div>
          </Card>

          {/* 3 info cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 14 }}>
            <Card style={{ padding: '16px 18px' }}>
              <Eyebrow style={{ marginBottom: 6 }}>Status &amp; heartbeat</Eyebrow>
              <InfoRow label="Status"><span style={{ color: STATUS_TEXT[st.tone] }}>{st.label}</span></InfoRow>
              <InfoRow label="Last heartbeat">{device.last_heartbeat ? fmtDate(device.last_heartbeat) : 'Never'}</InfoRow>
              <InfoRow label="Uptime 7d">{health ? <UptimeBar value={health.availability_7d} width={52} fontSize={12.5} /> : '—'}</InfoRow>
              <InfoRow label="Drops 24h / 7d">{health ? `${health.drops_24h} / ${health.drops_7d}` : '—'}</InfoRow>
              <InfoRow label="Monitoring" last>every 2 min</InfoRow>
            </Card>

            <Card style={{ padding: '16px 18px' }}>
              <Eyebrow style={{ marginBottom: 6 }}>Network</Eyebrow>
              <InfoRow label="IP address">
                <a href="#" onClick={e => { e.preventDefault(); openUrl(); }} style={{ fontWeight: 700 }}>{device.ip_address}:{device.port}</a>
              </InfoRow>
              <InfoRow label="MAC">{device.mac_address || '—'}</InfoRow>
              <InfoRow label="DHCP">{device.dhcp_enabled ? 'Yes · automatic' : 'No · static'}</InfoRow>
              <InfoRow label="Gateway">{liveNet?.gateway || '—'}</InfoRow>
              <InfoRow label="Netmask">{liveNet?.netmask || '—'}</InfoRow>
              <InfoRow label="HTTPS" last>{device.https_enabled ? `On · port ${device.port}` : `Off · port ${device.port}`}</InfoRow>
            </Card>

            <Card style={{ padding: '16px 18px' }}>
              <Eyebrow style={{ marginBottom: 6 }}>Equipment</Eyebrow>
              <InfoRow label="Model">{device.model || '—'}</InfoRow>
              <InfoRow label="Serial">{device.serial_number || '—'}</InfoRow>
              <InfoRow label="Firmware">{device.firmware_version || '—'}</InfoRow>
              <InfoRow label="Manufacturer">{device.manufacturer === 'controlid' ? 'Control iD' : (device.manufacturer || '—')}</InfoRow>
              <InfoRow label="Group">
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <Select value={device.group_id || ''} style={{ fontSize: 12, padding: '4px 8px' }}
                    onChange={async e => { await ipc.updateDevice(deviceId, { group_id: e.target.value || null }); load(); }}>
                    <option value="">Ungrouped</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </Select>
                  <Button variant="ghost" size="sm" style={{ padding: '4px 9px' }} title="New group" onClick={async () => {
                    const name = await ipc.prompt('New Group', 'Enter group name:');
                    if (name) { const g = await ipc.createGroup({ name }); await ipc.updateDevice(deviceId, { group_id: g.id }); load(); }
                  }}>+</Button>
                </span>
              </InfoRow>
              <InfoRow label="Credential" last>
                <Select value={device.credential_id || ''} style={{ fontSize: 12, padding: '4px 8px', maxWidth: 150 }}
                  onChange={async e => { await ipc.updateDevice(deviceId, { credential_id: e.target.value || null }); load(); }}>
                  <option value="">None</option>
                  {credentials.map(c => <option key={c.id} value={c.id}>{c.name} ({c.username})</option>)}
                </Select>
              </InfoRow>
              {noCred && <p style={{ fontSize: 11, color: 'var(--sr-warn-fg)', margin: '6px 0 0' }}>Assign a credential to enable actions.</p>}
            </Card>
          </div>

          {/* Actions card */}
          <Card style={{ padding: '16px 18px' }}>
            <Eyebrow>Actions</Eyebrow>
            <ActionRow label="Connectivity">
              <Button variant="ghost" size="sm" disabled={noCred} onClick={handleLocatePhysical}>Locate (beep + screen)</Button>
              <Button variant="ghost" size="sm" disabled={noCred} onClick={handleSyncTime}>Sync date/time</Button>
              <Button variant="ghost" size="sm" disabled={noCred} onClick={openNetworkModal}>Network (DHCP / static IP)</Button>
              {device.status !== 'online' && device.mac_address && (
                <Button variant="ghost" size="sm" disabled={testing} onClick={handleLocateByMac}>{testing ? 'Scanning…' : 'Locate by MAC (scan)'}</Button>
              )}
            </ActionRow>
            <ActionRow label="Configuration">
              <Button variant="ghost" size="sm" disabled={noCred} onClick={openConfigModal}>Edit configuration</Button>
              <Button variant="ghost" size="sm" disabled={noCred} onClick={handleFinishSetup}>Finish setup (wizard)</Button>
              <Button variant="ghost" size="sm" disabled={noCred} onClick={() => handleLogs('Diagnostic logs', 'diagnostic')}>Diagnostic logs</Button>
              <Button variant="ghost" size="sm" disabled={noCred} onClick={() => handleLogs('Audit logs', 'audit')}>Audit logs</Button>
              <Button variant="ghost" size="sm" onClick={handleRename}>Rename</Button>
              <Button variant="ghost" size="sm" onClick={handleEditNotes}>Edit notes</Button>
            </ActionRow>
            <ActionRow label="Recovery">
              <Button variant="warn-outline" size="sm" disabled={noCred} onClick={handleReboot}>Reboot</Button>
              <Button variant="warn-outline" size="sm" disabled={noCred} onClick={handleRepairFirmware}>Repair firmware (recovery)</Button>
              <Button variant="ghost" size="sm" disabled={noCred} onClick={handleEnterRecovery}>Enter recovery</Button>
              <Button variant="ghost" size="sm" onClick={handleExitRecovery}>Exit recovery</Button>
            </ActionRow>
            <ActionRow label="Danger zone" danger last>
              <Button variant="danger" size="sm" disabled={noCred} onClick={handleFactoryReinstall}>Factory reinstall (wipes config)</Button>
              <Button variant="danger" size="sm" disabled={noCred} onClick={handleFactoryReset}>Factory reset</Button>
              <Button variant="danger" size="sm" onClick={handleDelete}>Delete device</Button>
            </ActionRow>
          </Card>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Eyebrow>Connection history · 90d</Eyebrow>
              <Badge tone={dropTone as any}>{dropCount} drops</Badge>
            </div>
            {history.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                No connection events recorded yet.
              </p>
            )}
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              {history.slice(0, 60).map((h: any, i: number) => (
                <div key={h.id} style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '5.5px 0',
                  borderBottom: i === Math.min(history.length, 60) - 1 ? 'none' : '1px solid var(--border)', fontSize: 12,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: h.event === 'online' ? 'var(--sr-exec-m)' : 'var(--sr-pend-m)' }} />
                  <span style={{ color: 'var(--text)', fontWeight: 600, flex: 1 }}>{h.event === 'online' ? 'Connected' : 'Disconnected'}</span>
                  <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', fontSize: 11.5 }}>{fmtDate(h.timestamp)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Eyebrow>Config backups ({backups.length})</Eyebrow>
              <Button variant="ok-outline" size="sm" disabled={noCred} onClick={handleBackupNow}>Backup now</Button>
            </div>
            {backups.length > 0 ? (
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {backups.map((b: any, i: number) => (
                  <div key={b.id} style={{
                    display: 'flex', alignItems: 'center', gap: 9, padding: '5.5px 0',
                    borderBottom: i === backups.length - 1 ? 'none' : '1px solid var(--border)', fontSize: 12,
                  }}>
                    <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>v{b.version}</span>
                    <span style={{ color: 'var(--text-muted)', flex: 1, fontSize: 11.5, fontVariantNumeric: 'tabular-nums' }}>{fmtDate(b.created_at)}</span>
                    <a href="#" style={{ fontSize: 11.5, fontWeight: 700 }} onClick={async e => {
                      e.preventDefault();
                      if (!(await ipc.confirm(`Restore configuration backup v${b.version} (${fmtDate(b.created_at)}) to this device? Current settings will be overwritten.`))) return;
                      try {
                        const ok = await ipc.restoreConfig(deviceId, b.id);
                        toast(ok ? `Backup v${b.version} restored.` : 'Device rejected the restore.', ok ? 'success' : 'error');
                      } catch (err: any) { toast(`Restore failed: ${err.message || err}`, 'error'); }
                    }}>Restore</a>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                No backups yet. Run "Backup now" or enable the scheduled backup on the Configuration page.
              </p>
            )}
          </Card>
        </div>
      </div>

      {/* Network configuration modal */}
      {netModal && (
        <Modal onClose={() => { if (!netSaving) setNetModal(false); }}>
          <ModalTitle sub={`${device.name || device.ip_address} · ${device.ip_address}:${device.port}`}>Network configuration</ModalTitle>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <Button variant={netForm.dhcp ? 'primary' : 'ghost'} size="sm" style={{ flex: 1 }} onClick={() => setNetForm({ ...netForm, dhcp: true })}>DHCP (automatic)</Button>
            <Button variant={!netForm.dhcp ? 'primary' : 'ghost'} size="sm" style={{ flex: 1 }} onClick={() => setNetForm({ ...netForm, dhcp: false })}>Static IP</Button>
          </div>
          {netForm.dhcp ? (
            <p style={{ fontSize: 12.5, color: 'var(--sr-warn-fg)', margin: '0 0 14px' }}>
              The device will get its IP from the DHCP server. If the IP changes, the app relocates the device automatically by MAC address.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {([
                ['IP address', 'ip'], ['Netmask', 'netmask'], ['Gateway', 'gateway'],
                ['DNS primary (optional)', 'primary_dns'], ['DNS secondary (optional)', 'secondary_dns'],
              ] as const).map(([label, key]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-muted)', width: 145, flex: 'none' }}>{label}</span>
                  <TextInput value={(netForm as any)[key]} onChange={e => setNetForm({ ...netForm, [key]: e.target.value })}
                    style={{ flex: 1, fontVariantNumeric: 'tabular-nums' }} />
                </label>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="ghost" size="sm" disabled={netSaving} onClick={() => setNetModal(false)}>Cancel</Button>
            <Button variant="green" size="sm" disabled={netSaving} onClick={applyNetwork}>{netSaving ? 'Applying…' : 'Apply'}</Button>
          </div>
        </Modal>
      )}

      {/* Live configuration editor modal — keeps the legacy dark styling of
          ConfigEditor (shared with the Configuration page) until it migrates. */}
      {cfgModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => { if (!cfgSaving && !cfgLoading) setCfgModal(false); }}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-[46rem] max-h-[85vh] flex flex-col shadow-2xl text-slate-200"
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Device Configuration</h3>
                <p className="text-xs text-slate-500">{device.name || device.ip_address} · {device.ip_address}:{device.port}</p>
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
    </div>
  );
}
