import { useState, useEffect } from 'react';
import { ipc } from '../hooks/useIpc';
import { fmtDate } from '../utils/date';
import { Badge, BadgeTone, Button, Card, Eyebrow, StateBlock } from '../components/ui';

const STATUS_TONE: Record<string, BadgeTone> = {
  pending: 'aguard', running: 'info', completed: 'exec', failed: 'pend', cancelled: 'warn',
};
const ITEM_MARK: Record<string, string> = {
  success: 'var(--sr-exec-m)', failed: 'var(--sr-pend-m)', running: 'var(--sr-info-m)',
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);

  useEffect(() => {
    ipc.listJobs().then(setJobs);
    const unsub = ipc.on('job:complete', () => ipc.listJobs().then(setJobs));
    const interval = setInterval(() => ipc.listJobs().then(setJobs), 5000);
    return () => { unsub?.(); clearInterval(interval); };
  }, []);

  const viewDetail = async (jobId: string) => {
    const data = await ipc.getJob(jobId);
    setDetail(data);
  };

  return (
    <div style={{ padding: '18px 28px 28px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: detail ? 'minmax(0,1fr) 340px' : 'minmax(0,1fr)', gap: 14, alignItems: 'start' }}>
        {/* Job list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {jobs.map(job => (
            <Card key={job.id} style={{ padding: '14px 18px', cursor: 'pointer' }} edge={detail?.job?.id === job.id ? 'var(--sr-blue)' : undefined}>
              <div onClick={() => viewDetail(job.id)}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', letterSpacing: '-.1px' }}>{job.title}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Badge tone={STATUS_TONE[job.status] || 'aguard'} dot style={{ textTransform: 'capitalize' }}>{job.status}</Badge>
                    {job.status === 'running' && (
                      <Button variant="warn-outline" size="sm" onClick={e => { e.stopPropagation(); ipc.cancelJob(job.id); }}>Cancel</Button>
                    )}
                  </div>
                </div>
                <div style={{ height: 6, background: 'var(--surface-sunken)', border: '1px solid var(--border)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 999, transition: 'width .2s ease', width: `${job.progress}%`,
                    background: job.status === 'failed' ? 'var(--sr-pend-m)' : job.status === 'completed' ? 'var(--sr-exec-m)' : 'var(--sr-blue)',
                  }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, fontSize: 11.5, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  <span>{job.type} · {job.completed_items}/{job.total_items} completed, {job.failed_items} failed</span>
                  <span>{fmtDate(job.created_at)}</span>
                </div>
              </div>
            </Card>
          ))}
          {jobs.length === 0 && (
            <Card style={{ overflow: 'hidden' }}>
              <StateBlock variant="empty" title="No tasks yet"
                message="Batch actions started on the Devices page show up here with per-device results." />
            </Card>
          )}
        </div>

        {/* Detail column */}
        {detail && (
          <Card style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Eyebrow>Task details</Eyebrow>
              <button onClick={() => setDetail(null)} style={{
                background: 'none', border: 'none', cursor: 'pointer', fontSize: 16,
                color: 'var(--text-muted)', padding: 0, lineHeight: 1,
              }}>×</button>
            </div>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>{detail.job.title}</p>
            <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 480, overflowY: 'auto' }}>
              {detail.items.map((item: any, i: number) => (
                <div key={item.id} style={{ padding: '6px 0', borderBottom: i === detail.items.length - 1 ? 'none' : '1px solid var(--border)', fontSize: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: ITEM_MARK[item.status] || 'var(--sr-aguard-m)' }} />
                    <span style={{ color: 'var(--text)', fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.device_name || item.device_id}</span>
                    {item.ip_address && <span style={{ color: 'var(--text-muted)', fontSize: 11.5, fontVariantNumeric: 'tabular-nums' }}>{item.ip_address}</span>}
                    <span style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>{item.status}</span>
                  </div>
                  {item.message && (
                    <p style={{
                      margin: '3px 0 0 16px', overflowWrap: 'break-word', fontSize: 11.5,
                      color: item.status === 'failed' ? 'var(--sr-pend-fg)' : 'var(--text-muted)',
                    }}>
                      {item.message}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
