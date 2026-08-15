import { useState, useEffect } from 'react';
import { ipc } from '../hooks/useIpc';
import { toast } from '../components/Toast';
import { Badge, BadgeTone, Button, Card, Eyebrow, StateBlock, TextInput } from '../components/ui';

const AUTH_BADGE: Record<string, { text: string; tone: BadgeTone }> = {
  authenticated: { text: 'Connected', tone: 'exec' },
  auth_failed: { text: 'Auth failed', tone: 'warn' },
  already_managed: { text: 'Already added', tone: 'aguard' },
};

const thStyle: React.CSSProperties = {
  padding: '10px 12px', fontSize: 11, fontWeight: 600, letterSpacing: '1.1px',
  textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'left', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 12.5, borderTop: '1px solid var(--border)' };

export default function DiscoveryPage() {
  const [ipRange, setIpRange] = useState('192.168.1.*');
  const [ports, setPorts] = useState('80, 443');
  const [timeout, setTimeout_] = useState(3000);
  const [concurrency, setConcurrency] = useState(20);
  const [scanning, setScanning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0, progress: 0, found: 0 });
  const [results, setResults] = useState<any[]>([]);
  const [retryDevice, setRetryDevice] = useState<any>(null);
  const [retryForm, setRetryForm] = useState({ username: 'admin', password: '' });

  useEffect(() => {
    const unsub1 = ipc.on('discovery:progress', (data: any) => setProgress(data));
    const unsub2 = ipc.on('discovery:device-found', (device: any) => {
      setResults(prev => {
        if (prev.some(d => d.ipAddress === device.ipAddress && d.port === device.port)) return prev;
        return [...prev, device];
      });
    });
    const unsub3 = ipc.on('discovery:complete', () => setScanning(false));
    return () => { unsub1?.(); unsub2?.(); unsub3?.(); };
  }, []);

  const startScan = async () => {
    setScanning(true);
    setResults([]);
    setProgress({ completed: 0, total: 0, progress: 0, found: 0 });
    const ranges = ipRange.split(',').map(r => r.trim()).filter(Boolean);
    const portList = ports.split(',').map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p));
    try {
      const id = await ipc.startScan({ ranges, ports: portList, timeout, concurrency });
      setJobId(id);
    } catch (err: any) {
      // e.g. an invalid IP range rejected by parseRange
      toast(`Could not start scan: ${err.message || err}`);
      setScanning(false);
    }
  };

  const cancelScan = () => {
    if (jobId) { ipc.cancelScan(jobId); setScanning(false); }
  };

  const handleRetryAuth = async () => {
    if (!retryDevice?.deviceId || !retryForm.password) return;
    try {
      // Create credential and assign to device
      const cred = await ipc.createCredential({
        name: `${retryDevice.ipAddress} credentials`,
        username: retryForm.username,
        password: retryForm.password,
      });
      await ipc.updateDevice(retryDevice.deviceId, { credential_id: cred.id });

      // Test connection
      const result = await ipc.testConnection(retryDevice.deviceId);
      if (result.connected) {
        setResults(prev => prev.map(r =>
          r.ipAddress === retryDevice.ipAddress ? { ...r, authStatus: 'authenticated', credentialName: cred.name } : r
        ));
      } else {
        toast('Authentication failed with these credentials.');
      }
    } catch (err: any) {
      toast(`Error: ${err.message || err}`);
    }
    setRetryDevice(null);
    setRetryForm({ username: 'admin', password: '' });
  };

  const authFailedCount = results.filter(r => r.authStatus === 'auth_failed').length;
  const connectedCount = results.filter(r => r.authStatus === 'authenticated').length;

  return (
    <div style={{ padding: '18px 28px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Scan form */}
      <Card style={{ padding: '16px 18px' }}>
        <Eyebrow style={{ marginBottom: 10 }}>Network scan</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 14, marginBottom: 14 }}>
          {([
            ['IP range', ipRange, (v: string) => setIpRange(v), '192.168.1.*', 'text'],
            ['Ports', ports, (v: string) => setPorts(v), '80, 443', 'text'],
            ['Timeout (ms)', String(timeout), (v: string) => setTimeout_(Number(v)), '', 'number'],
            ['Concurrency', String(concurrency), (v: string) => setConcurrency(Number(v)), '', 'number'],
          ] as const).map(([label, value, set, ph, type]) => (
            <label key={label}>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '1.1px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 5 }}>{label}</span>
              <TextInput value={value} placeholder={ph} type={type} onChange={e => set(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {!scanning ? (
            <Button variant="primary" size="sm" onClick={startScan}>Start scan</Button>
          ) : (
            <Button variant="danger" size="sm" onClick={cancelScan}>Cancel</Button>
          )}
          {(scanning || results.length > 0) && (
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 5, fontVariantNumeric: 'tabular-nums' }}>
                <span>{progress.completed}/{progress.total} scanned</span>
                <div style={{ display: 'flex', gap: 12 }}>
                  {connectedCount > 0 && <span style={{ color: 'var(--sr-exec-fg)', fontWeight: 700 }}>{connectedCount} connected</span>}
                  {authFailedCount > 0 && <span style={{ color: 'var(--sr-warn-fg)', fontWeight: 700 }}>{authFailedCount} need credentials</span>}
                  <span style={{ color: 'var(--sr-info-fg)', fontWeight: 700 }}>{results.length} found</span>
                </div>
              </div>
              <div style={{ height: 8, background: 'var(--surface-sunken)', border: '1px solid var(--border)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'var(--sr-blue)', borderRadius: 999, transition: 'width .2s ease', width: `${progress.progress}%` }} />
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Retry auth inline card */}
      {retryDevice && (
        <Card style={{ padding: '16px 18px', borderLeft: '4px solid var(--sr-warn-m)' }}>
          <Eyebrow style={{ marginBottom: 10 }}>Enter credentials for {retryDevice.ipAddress}</Eyebrow>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
            <label style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 4 }}>Username</span>
              <TextInput value={retryForm.username} onChange={e => setRetryForm({ ...retryForm, username: e.target.value })} style={{ width: '100%', boxSizing: 'border-box' }} />
            </label>
            <label style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 4 }}>Password</span>
              <TextInput type="password" value={retryForm.password} autoFocus
                onChange={e => setRetryForm({ ...retryForm, password: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && handleRetryAuth()} style={{ width: '100%', boxSizing: 'border-box' }} />
            </label>
            <Button variant="green" size="sm" onClick={handleRetryAuth}>Connect</Button>
            <Button variant="ghost" size="sm" onClick={() => setRetryDevice(null)}>Cancel</Button>
          </div>
        </Card>
      )}

      {/* Results */}
      <Card style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Eyebrow>{scanning ? `Scanning… ${results.length} device(s) found` : `${results.length} device(s) found`}</Eyebrow>
          {scanning && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--sr-blue)', animation: 'srPulse 1s ease infinite' }} />}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--surface-sunken)' }}>
              <tr>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>IP address</th>
                <th style={thStyle}>Model</th>
                <th style={thStyle}>Serial</th>
                <th style={thStyle}>Firmware</th>
                <th style={thStyle}>MAC</th>
                <th style={thStyle}>Response</th>
                <th style={thStyle}>Credential</th>
                <th style={{ ...thStyle, width: 120 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {results.map((d, i) => {
                const badge = AUTH_BADGE[d.authStatus] || AUTH_BADGE.auth_failed;
                return (
                  <tr key={i} className="animate-fadeIn">
                    <td style={tdStyle}><Badge tone={badge.tone} dot>{badge.text}</Badge></td>
                    <td style={{ ...tdStyle, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text)', whiteSpace: 'nowrap' }}>{d.ipAddress}:{d.port}</td>
                    <td style={{ ...tdStyle, color: 'var(--text)' }}>{d.model || 'Control iD Device'}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{d.serialNumber || '—'}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{d.firmwareVersion || '—'}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 12, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{d.macAddress || '—'}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{d.responseTimeMs}ms</td>
                    <td style={tdStyle}>
                      {d.credentialName
                        ? <span style={{ color: 'var(--sr-exec-fg)', fontWeight: 700, fontSize: 12 }}>{d.credentialName}</span>
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={tdStyle}>
                      {d.authStatus === 'auth_failed' && (
                        <Button variant="warn-outline" size="sm" onClick={() => setRetryDevice(d)}>Set password</Button>
                      )}
                      {d.authStatus === 'authenticated' && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sr-exec-fg)' }}>Auto-added</span>
                      )}
                      {d.authStatus === 'already_managed' && (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Managed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {results.length === 0 && (
            <StateBlock variant="empty" compact
              title={scanning ? 'Scanning network…' : 'No devices found yet'}
              message={scanning
                ? 'Devices will appear here as they are found.'
                : 'Click "Start scan" to discover devices on your network.'} />
          )}
        </div>
      </Card>
    </div>
  );
}
