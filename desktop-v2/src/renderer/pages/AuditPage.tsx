import { useState, useEffect } from 'react';
import { ipc } from '../hooks/useIpc';
import { fmtDate } from '../utils/date';
import { Button, Card, Select, StateBlock } from '../components/ui';

const SEVERITY_MARK: Record<string, string> = {
  info: 'var(--sr-info-m)', warning: 'var(--sr-warn-m)',
  error: 'var(--sr-pend-m)', critical: 'var(--sr-pend-m)',
};

const thStyle: React.CSSProperties = {
  padding: '10px 12px', fontSize: 11, fontWeight: 600, letterSpacing: '1.1px',
  textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'left', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 12.5, borderTop: '1px solid var(--border)' };

export default function AuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [category, setCategory] = useState('');

  useEffect(() => {
    ipc.listAuditLogs({ limit: 200, category: category || undefined }).then(setLogs);
  }, [category]);

  return (
    <div style={{ padding: '18px 28px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" onClick={() => ipc.exportAuditCsv()}>Export (CSV)</Button>
        <Select value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">All categories</option>
          <option value="device">Device</option>
          <option value="config">Configuration</option>
          <option value="credential">Credentials</option>
          <option value="system">System</option>
        </Select>
      </div>

      <Card style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--surface-sunken)' }}>
              <tr>
                <th style={{ ...thStyle, width: 48 }}>Sev</th>
                <th style={thStyle}>Timestamp</th>
                <th style={thStyle}>Action</th>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>Device</th>
                <th style={thStyle}>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td style={tdStyle}>
                    <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: SEVERITY_MARK[log.severity] || 'var(--sr-aguard-m)' }} />
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 12, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtDate(log.created_at)}</td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--text)' }}>{log.action}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{log.category}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{log.device_name || '—'}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 12, maxWidth: 340, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={log.details || undefined}>{log.details || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 && (
            <StateBlock variant="empty" compact title="No audit logs"
              message="Actions performed by the app are recorded here." />
          )}
        </div>
      </Card>
    </div>
  );
}
