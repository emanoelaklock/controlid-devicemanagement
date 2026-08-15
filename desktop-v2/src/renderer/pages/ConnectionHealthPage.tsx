import { useState, useEffect, useCallback } from 'react';
import { ipc } from '../hooks/useIpc';
import { fmtDate } from '../utils/date';
import { Badge, Card, KPI, StateBlock, Tabs, UptimeBar } from '../components/ui';
import { IconMonitor, IconWifi, IconWifiOff, IconActivity } from '../components/ui/icons';
import { statusInfo, DeviceHealth } from './DevicesPage';

const GRID_COLUMNS = '126px minmax(220px,1.3fr) 150px 96px 96px 200px minmax(170px,1fr) 30px';

function dropColor(n: number): string {
  return n >= 3 ? 'var(--sr-pend-fg)' : n > 0 ? 'var(--sr-warn-fg)' : 'var(--text-muted)';
}

export default function ConnectionHealthPage({ onOpenDevice }: { onOpenDevice: (id: string) => void }) {
  const [devices, setDevices] = useState<any[]>([]);
  const [health, setHealth] = useState<Record<string, DeviceHealth>>({});
  const [tab, setTab] = useState(0);

  const load = useCallback(() => {
    ipc.listDevices().then(setDevices).catch(() => {});
    ipc.devicesHealth().then(setHealth).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    const unsub = ipc.on('heartbeat:update', load);
    return () => { clearInterval(interval); unsub?.(); };
  }, [load]);

  const h = (d: any): DeviceHealth => health[d.id] ?? { drops_24h: 0, drops_7d: 0, availability_7d: 0, unstable: false };
  const severity = (d: any) => (d.status !== 'online' ? 0 : h(d).unstable ? 1 : 2);

  const online = devices.filter(d => d.status === 'online');
  const offline = devices.filter(d => d.status !== 'online');
  const unstable = devices.filter(d => h(d).unstable);
  const problems = devices.filter(d => d.status !== 'online' || h(d).drops_7d >= 3);

  const sorted = devices.slice().sort((a, b) =>
    severity(a) - severity(b) || h(b).drops_7d - h(a).drops_7d || String(a.name || '').localeCompare(String(b.name || '')));
  const rows = tab === 0 ? sorted.filter(d => problems.includes(d)) : sorted;

  return (
    <div style={{ padding: '18px 28px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPI tone="blue" label="Devices" value={devices.length} sub="registered in all groups" icon={<IconMonitor size={22} />} />
        <KPI tone="green" label="Online now" value={online.length} sub="heartbeat under 2 min" icon={<IconWifi size={22} />} />
        <KPI tone="amber" label="Offline now" value={offline.length} sub="no heartbeat response" icon={<IconWifiOff size={22} />} />
        <KPI tone="purple" label="Unstable · 24h" value={unstable.length} sub="3+ drops in 24 hours" icon={<IconActivity size={22} />} />
      </div>

      <Tabs active={tab} onChange={setTab}
        tabs={[{ label: 'Problems', count: problems.length, countRed: true }, { label: 'All devices' }]} />

      {/* Health table */}
      <Card style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 1090 }}>
            <div style={{
              display: 'grid', gridTemplateColumns: GRID_COLUMNS, alignItems: 'center',
              background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border)',
            }}>
              <div className="sr-th" style={{ paddingLeft: 16 }}>Status</div>
              <div className="sr-th">Device</div>
              <div className="sr-th">Group</div>
              <div className="sr-th">Drops 24h</div>
              <div className="sr-th">Drops 7d</div>
              <div className="sr-th">Availability 7d</div>
              <div className="sr-th">Last seen</div>
              <div />
            </div>

            {rows.map(d => {
              const dh = h(d);
              const st = statusInfo(d, dh);
              return (
                <div key={d.id} className="sr-row" onClick={() => onOpenDevice(d.id)}
                  style={{ display: 'grid', gridTemplateColumns: GRID_COLUMNS, alignItems: 'center' }}>
                  <div style={{ padding: '10px 16px' }}><Badge tone={st.tone} dot>{st.label}</Badge></div>
                  <div style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-.1px' }}>{d.name || d.ip_address}</div>
                  <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: 12.5, whiteSpace: 'nowrap' }}>{d.group_name || 'Ungrouped'}</div>
                  <div style={{ padding: '10px 12px', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: dropColor(dh.drops_24h) }}>{dh.drops_24h}</div>
                  <div style={{ padding: '10px 12px', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: dropColor(dh.drops_7d) }}>{dh.drops_7d}</div>
                  <div style={{ padding: '10px 12px' }}>
                    <UptimeBar value={dh.availability_7d} width={96} height={7} fontSize={12.5} weight={800} />
                  </div>
                  <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: 12.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {d.last_heartbeat ? fmtDate(d.last_heartbeat) : 'Never'}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 15 }}>›</div>
                </div>
              );
            })}

            {rows.length === 0 && (
              <StateBlock variant="success" compact title="All devices stable"
                message="No device lost connection in the selected window." />
            )}
          </div>
        </div>
      </Card>

      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
        Sorted by severity — offline first, then most drops · availability computed from the 90-day heartbeat history
      </div>
    </div>
  );
}
