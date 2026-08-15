import { useState, useEffect } from 'react';
import { ipc } from '../hooks/useIpc';
import { toast } from '../components/Toast';
import { Badge, Button, Card, Eyebrow, StateBlock } from '../components/ui';

export default function FirmwarePage() {
  const [summary, setSummary] = useState<any>(null);
  const [checking, setChecking] = useState(false);

  const load = () => ipc.firmwareSummary().then(setSummary);
  useEffect(() => { load(); }, []);

  const handleCheckAll = async () => {
    if (!summary) return;
    setChecking(true);
    const allIds = summary.versions.flatMap((v: any) => v.devices.map((d: any) => d.id));
    try {
      await ipc.firmwareCheckAll(allIds);
      setTimeout(() => { load(); setChecking(false); }, 3000);
    } catch { setChecking(false); }
  };

  const handleRepair = async (d: any) => {
    if (!(await ipc.confirm(`Reinstall the firmware on "${d.name}" via recovery mode? The device downloads the firmware from Control iD (it needs INTERNET access), reflashes itself and reboots — offline for several minutes. Settings and users are KEPT.`))) return;
    try {
      await ipc.firmwareRepair([d.id]);
      toast('Firmware repair started — follow progress on the Tasks page.', 'info');
    } catch (e: any) { toast(`Could not start repair: ${e.message || e}`, 'error'); }
  };

  if (!summary) return <div style={{ padding: '18px 28px', color: 'var(--text-muted)' }}>Loading…</div>;

  const outdatedCount = summary.outdated.length;

  return (
    <div style={{ padding: '18px 28px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }} />
        <Button variant="primary" size="sm" disabled={checking} onClick={handleCheckAll}>
          {checking ? 'Checking…' : 'Check all devices'}
        </Button>
      </div>

      {/* How firmware installs work on Control iD devices */}
      <div style={{
        background: 'var(--sr-info-bg)', border: '1px solid var(--border)', borderRadius: 11,
        padding: '10px 14px', fontSize: 12, color: 'var(--sr-info-fg)', lineHeight: 1.55,
      }}>
        <b>Repair</b> reinstalls the firmware through the device's recovery mode: the device
        <b>downloads the firmware from Control iD's servers</b>, verifies its signature and reflashes
        itself (settings and users are kept) — use it for corrupted installs or boot loops.
        <b>The device needs internet access</b> for this. The API does not accept firmware uploads;
        version upgrades can also be run from the update option on the device's About screen.
      </div>

      {/* Summary tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <div style={{ borderRadius: 16, padding: '14px 16px', background: 'var(--sr-info-bg)', border: '1px solid rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.1px', textTransform: 'uppercase', color: 'var(--sr-info-fg)', opacity: .8 }}>Total devices</div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.6px', color: 'var(--sr-info-fg)' }}>{summary.total}</div>
        </div>
        <div style={{ borderRadius: 16, padding: '14px 16px', background: 'var(--sr-exec-bg)', border: '1px solid rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.1px', textTransform: 'uppercase', color: 'var(--sr-exec-fg)', opacity: .8 }}>Latest version</div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.6px', color: 'var(--sr-exec-fg)' }}>{summary.latest || 'N/A'}</div>
        </div>
        <div style={{ borderRadius: 16, padding: '14px 16px', background: outdatedCount > 0 ? 'var(--sr-warn-bg)' : 'var(--sr-aguard-bg)', border: '1px solid rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.1px', textTransform: 'uppercase', color: outdatedCount > 0 ? 'var(--sr-warn-fg)' : 'var(--sr-aguard-fg)', opacity: .8 }}>Outdated</div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.6px', color: outdatedCount > 0 ? 'var(--sr-warn-fg)' : 'var(--sr-aguard-fg)' }}>{outdatedCount}</div>
        </div>
      </div>

      {/* Version breakdown */}
      {summary.versions.map((v: any) => (
        <Card key={v.version} style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 10, height: 10, borderRadius: '50%',
                background: v.isLatest ? 'var(--sr-exec-m)' : v.version === 'Unknown' ? 'var(--sr-aguard-m)' : 'var(--sr-warn-m)',
              }} />
              <span style={{ fontSize: 13.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-strong)' }}>{v.version}</span>
              {v.isLatest && <Badge tone="exec">Latest</Badge>}
              {!v.isLatest && v.version !== 'Unknown' && <Badge tone="warn">Outdated</Badge>}
            </div>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{v.count} device(s)</span>
          </div>
          {v.devices.map((d: any, i: number) => (
            <div key={d.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
              borderTop: i === 0 ? 'none' : '1px solid var(--border)',
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: d.status === 'online' ? 'var(--sr-exec-m)' : 'var(--sr-pend-m)' }} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{d.ip_address}</span>
              <Button variant="warn-outline" size="sm" onClick={() => handleRepair(d)}>Repair</Button>
            </div>
          ))}
        </Card>
      ))}

      {summary.versions.length === 0 && (
        <Card style={{ overflow: 'hidden' }}>
          <StateBlock variant="empty" title="No firmware data"
            message='Click "Check all devices" to query firmware versions from all managed devices.' />
        </Card>
      )}
    </div>
  );
}
