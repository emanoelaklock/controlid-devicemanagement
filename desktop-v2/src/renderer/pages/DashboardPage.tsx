import { useState, useEffect } from 'react';
import { ipc } from '../hooks/useIpc';
import { fmtDate } from '../utils/date';
import { Badge, Card, Eyebrow } from '../components/ui';

function StatTile({ tone, label, value }: { tone: string; label: string; value: number }) {
  const tones: Record<string, { bg: string; fg: string }> = {
    info: { bg: 'var(--sr-info-bg)', fg: 'var(--sr-info-fg)' },
    exec: { bg: 'var(--sr-exec-bg)', fg: 'var(--sr-exec-fg)' },
    pend: { bg: 'var(--sr-pend-bg)', fg: 'var(--sr-pend-fg)' },
    warn: { bg: 'var(--sr-warn-bg)', fg: 'var(--sr-warn-fg)' },
    aguard: { bg: 'var(--sr-aguard-bg)', fg: 'var(--sr-aguard-fg)' },
    jrny: { bg: 'var(--sr-jrny-bg)', fg: 'var(--sr-jrny-fg)' },
  };
  const t = tones[tone] || tones.info;
  return (
    <div style={{ borderRadius: 16, padding: '14px 16px', background: t.bg, border: '1px solid rgba(0,0,0,.05)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.1px', textTransform: 'uppercase', color: t.fg, opacity: .8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1, marginTop: 6, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.6px', color: t.fg }}>{value}</div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [devices, setDevices] = useState<any[]>([]);

  useEffect(() => {
    const load = () => {
      ipc.getStats().then(setStats);
      ipc.listDevices().then(setDevices);
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!stats) return <div style={{ padding: '18px 28px', color: 'var(--text-muted)' }}>Loading…</div>;

  // Security analysis
  const noCredential = devices.filter(d => !d.credential_id);
  const factoryCreds = devices.filter(d => d.factory_credentials === 1);
  const noHttps = devices.filter(d => !d.https_enabled && d.status === 'online');
  const firmwareVersions = new Map<string, any[]>();
  devices.forEach(d => {
    if (d.firmware_version) {
      const list = firmwareVersions.get(d.firmware_version) || [];
      list.push(d);
      firmwareVersions.set(d.firmware_version, list);
    }
  });
  const uniqueFirmwares = Array.from(firmwareVersions.entries()).sort((a, b) => b[0].localeCompare(a[0], undefined, { numeric: true }));
  const latestFirmware = uniqueFirmwares[0]?.[0];
  const outdatedFirmware = devices.filter(d => d.firmware_version && d.firmware_version !== latestFirmware);

  const securityIssues = [
    ...factoryCreds.length > 0 ? [{ severity: 'critical' as const, text: `${factoryCreds.length} device(s) still using factory credentials (admin/admin)`, detail: factoryCreds.map(d => d.name).join(', ') }] : [],
    ...noCredential.length > 0 ? [{ severity: 'warning' as const, text: `${noCredential.length} device(s) without credentials`, detail: noCredential.map(d => d.name).join(', ') }] : [],
    ...noHttps.length > 0 ? [{ severity: 'info' as const, text: `${noHttps.length} device(s) without HTTPS`, detail: noHttps.map(d => d.name).join(', ') }] : [],
    ...outdatedFirmware.length > 0 ? [{ severity: 'warning' as const, text: `${outdatedFirmware.length} device(s) with outdated firmware (latest: ${latestFirmware})`, detail: outdatedFirmware.map(d => `${d.name}: ${d.firmware_version}`).join(', ') }] : [],
  ];
  const SEVERITY_MARK: Record<string, string> = {
    critical: 'var(--sr-pend-m)', error: 'var(--sr-pend-m)', warning: 'var(--sr-warn-m)', info: 'var(--sr-info-m)',
  };

  const onlinePercent = stats.devices.total > 0 ? Math.round((stats.devices.online / stats.devices.total) * 100) : 0;

  return (
    <div style={{ padding: '18px 28px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Status tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14 }}>
        <StatTile tone="info" label="Total devices" value={stats.devices.total} />
        <StatTile tone="exec" label="Online" value={stats.devices.online} />
        <StatTile tone="pend" label="Offline" value={stats.devices.offline} />
        <StatTile tone="warn" label="Error" value={stats.devices.error} />
        <StatTile tone="aguard" label="Unknown" value={stats.devices.unknown} />
        <StatTile tone="jrny" label="Jobs running" value={stats.jobsRunning} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 14 }}>
        {/* Fleet health */}
        <Card style={{ padding: '16px 18px' }}>
          <Eyebrow style={{ marginBottom: 12 }}>Fleet health</Eyebrow>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ position: 'relative', width: 96, height: 96 }}>
              <svg viewBox="0 0 36 36" width={96} height={96} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={18} cy={18} r={15.9} fill="none" stroke="var(--surface-sunken)" strokeWidth={3} />
                <circle cx={18} cy={18} r={15.9} fill="none" stroke="var(--sr-exec-m)" strokeWidth={3}
                  strokeDasharray={`${onlinePercent} ${100 - onlinePercent}`} strokeLinecap="round" />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                <span style={{ fontSize: 19, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--text-strong)' }}>{onlinePercent}%</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
              {([['var(--sr-exec-m)', `Online: ${stats.devices.online}`],
                 ['var(--sr-pend-m)', `Offline: ${stats.devices.offline}`],
                 ['var(--sr-warn-m)', `Error: ${stats.devices.error}`]] as const).map(([c, label]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
          {stats.lastScanAt && (
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '14px 0 0' }}>Last network scan: {fmtDate(stats.lastScanAt)}</p>
          )}
        </Card>

        {/* Security posture */}
        <Card style={{ padding: '16px 18px' }}>
          <Eyebrow style={{ marginBottom: 12 }}>Security posture</Eyebrow>
          {securityIssues.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--sr-exec-fg)' }}>
              <span style={{ fontSize: 20 }}>✓</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>All devices are properly configured</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {securityIssues.map((issue, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, flex: 'none', background: SEVERITY_MARK[issue.severity] }} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{issue.text}</p>
                    <p title={issue.detail} style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 420 }}>{issue.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Firmware versions */}
        <Card style={{ padding: '16px 18px' }}>
          <Eyebrow style={{ marginBottom: 12 }}>Firmware versions</Eyebrow>
          {uniqueFirmwares.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>No firmware data. Run Test connection on devices.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {uniqueFirmwares.map(([version, devs]) => (
                <div key={version} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: version === latestFirmware ? 'var(--sr-exec-m)' : 'var(--sr-warn-m)' }} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{version}</span>
                    {version === latestFirmware && <Badge tone="exec">Latest</Badge>}
                  </div>
                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{devs.length} device(s)</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent activity */}
        <Card style={{ padding: '16px 18px' }}>
          <Eyebrow style={{ marginBottom: 12 }}>Recent activity</Eyebrow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 192, overflowY: 'auto' }}>
            {stats.recentAlerts.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>No recent activity</p>}
            {stats.recentAlerts.map((a: any) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', flex: 'none', background: SEVERITY_MARK[a.severity] || 'var(--sr-info-m)' }} />
                <span style={{ color: 'var(--text)', fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.action}{a.device_name ? `: ${a.device_name}` : ''}
                </span>
                <span style={{ color: 'var(--text-muted)', flex: 'none', fontSize: 11.5, fontVariantNumeric: 'tabular-nums' }}>{fmtDate(a.created_at)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
