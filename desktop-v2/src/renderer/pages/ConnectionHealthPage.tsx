import { useState, useEffect, useCallback } from 'react';
import { ipc } from '../hooks/useIpc';
import { fmtDate } from '../utils/date';
import { Badge, BadgeTone, Card, KPI, StateBlock, Tabs, UptimeBar } from '../components/ui';
import { IconMonitor, IconWifi, IconWifiOff, IconActivity } from '../components/ui/icons';
import { DeviceHealth } from './DevicesPage';

const GRID_COLUMNS = '126px minmax(220px,1.3fr) 150px 96px 96px 200px minmax(170px,1fr) 30px';
const LOG_COLUMNS = 'minmax(240px,1.4fr) 170px 150px minmax(180px,1fr) 30px';

function dropColor(n: number): string {
  return n >= 3 ? 'var(--sr-pend-fg)' : n > 0 ? 'var(--sr-warn-fg)' : 'var(--text-muted)';
}

/** Unlike the Devices page, health rows do surface instability (3+ drops/24h). */
function healthStatusInfo(d: any, h: DeviceHealth): { label: string; tone: BadgeTone } {
  if (d.status === 'online') {
    return h.unstable ? { label: 'Unstable', tone: 'warn' } : { label: 'Online', tone: 'exec' };
  }
  return { label: 'Offline', tone: 'pend' };
}

export default function ConnectionHealthPage({ onOpenDevice }: { onOpenDevice: (id: string) => void }) {
  const [devices, setDevices] = useState<any[]>([]);
  const [health, setHealth] = useState<Record<string, DeviceHealth>>({});
  const [disconnects, setDisconnects] = useState<any[]>([]);
  const [tab, setTab] = useState(0);

  const load = useCallback(() => {
    ipc.listDevices().then(setDevices).catch(() => {});
    ipc.devicesHealth().then(setHealth).catch(() => {});
    ipc.recentHistory(500, 'offline').then(setDisconnects).catch(() => {});
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

  const problemRows = devices.filter(d => problems.includes(d)).sort((a, b) =>
    severity(a) - severity(b) || h(b).drops_7d - h(a).drops_7d || String(a.name || '').localeCompare(String(b.name || '')));

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

      {tab === 0 ? (
        /* ─── Problems: per-device health table ─────────────────────── */
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

              {problemRows.map(d => {
                const dh = h(d);
                const st = healthStatusInfo(d, dh);
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

              {problemRows.length === 0 && (
                <StateBlock variant="success" compact title="All devices stable"
                  message="No device lost connection in the selected window." />
              )}
            </div>
          </div>
        </Card>
      ) : (
        /* ─── All devices: disconnection log (one row per drop) ─────── */
        <Card style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 820 }}>
              <div style={{
                display: 'grid', gridTemplateColumns: LOG_COLUMNS, alignItems: 'center',
                background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border)',
              }}>
                <div className="sr-th" style={{ paddingLeft: 16 }}>Device</div>
                <div className="sr-th">Group</div>
                <div className="sr-th">IP address</div>
                <div className="sr-th">Disconnected at</div>
                <div />
              </div>

              {disconnects.map((e: any) => (
                <div key={e.id} className="sr-row" onClick={() => onOpenDevice(e.device_id)}
                  style={{ display: 'grid', gridTemplateColumns: LOG_COLUMNS, alignItems: 'center' }}>
                  <div style={{ padding: '9px 12px 9px 16px', display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: 'var(--sr-pend-m)' }} />
                    <span style={{ fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-.1px' }}>{e.device_name || e.ip_address}</span>
                  </div>
                  <div style={{ padding: '9px 12px', color: 'var(--text-muted)', fontSize: 12.5, whiteSpace: 'nowrap' }}>{e.group_name || 'Ungrouped'}</div>
                  <div style={{ padding: '9px 12px', color: 'var(--text-muted)', fontSize: 12.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{e.ip_address}</div>
                  <div style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--text)', fontSize: 12.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtDate(e.timestamp)}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 15 }}>›</div>
                </div>
              ))}

              {disconnects.length === 0 && (
                <StateBlock variant="success" compact title="No disconnections recorded"
                  message="No device lost connection in the last 90 days." />
              )}
            </div>
          </div>
        </Card>
      )}

      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
        {tab === 0
          ? 'Sorted by severity — offline first, then most drops · availability computed from the 90-day heartbeat history'
          : `${disconnects.length} disconnection(s) · one row per drop, newest first · up to 500 records from the 90-day history · click a row to open the device`}
      </div>
    </div>
  );
}
