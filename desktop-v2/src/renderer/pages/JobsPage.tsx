import { useState, useEffect } from 'react';
import { ipc } from '../hooks/useIpc';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-slate-500', running: 'bg-blue-500', completed: 'bg-emerald-500',
  failed: 'bg-red-500', cancelled: 'bg-amber-500',
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
    <div className="flex h-full">
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          <h1 className="text-xl font-bold text-white mb-6">Tasks</h1>
          <div className="space-y-3">
            {jobs.map(job => (
              <div key={job.id} onClick={() => viewDetail(job.id)}
                className="bg-slate-800 rounded-xl border border-slate-700 p-4 cursor-pointer hover:border-slate-600 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[job.status]}`} />
                    <span className="text-sm font-medium text-white">{job.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 capitalize">{job.status}</span>
                    {job.status === 'running' && (
                      <button onClick={e => { e.stopPropagation(); ipc.cancelJob(job.id); }}
                        className="px-2 py-0.5 bg-red-700 text-white text-xs rounded hover:bg-red-600">Cancel</button>
                    )}
                  </div>
                </div>
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${job.status === 'failed' ? 'bg-red-500' : 'bg-brand-500'}`}
                    style={{ width: `${job.progress}%` }} />
                </div>
                <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
                  <span>{job.type} &middot; {job.completed_items}/{job.total_items} completed, {job.failed_items} failed</span>
                  <span>{new Date(job.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
            {jobs.length === 0 && <p className="text-slate-600 text-center py-12">No tasks yet</p>}
          </div>
        </div>
      </div>

      {detail && (
        <div className="w-80 border-l border-slate-800 bg-slate-900/80 overflow-auto">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Task Details</h2>
            <button onClick={() => setDetail(null)} className="text-slate-500 hover:text-white">&times;</button>
          </div>
          <div className="p-4">
            <p className="text-sm text-white mb-4">{detail.job.title}</p>
            <div className="space-y-2">
              {detail.items.map((item: any) => (
                <div key={item.id} className="flex items-center gap-2 text-xs">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    item.status === 'success' ? 'bg-emerald-500' : item.status === 'failed' ? 'bg-red-500' :
                    item.status === 'running' ? 'bg-blue-500' : 'bg-slate-500'
                  }`} />
                  <span className="text-slate-400 flex-1 truncate">{item.device_id}</span>
                  <span className="text-slate-600">{item.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
