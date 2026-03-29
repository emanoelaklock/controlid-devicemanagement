import { useState, useEffect } from 'react';
import { ipc } from '../hooks/useIpc';
import { fmtDate } from '../utils/date';

const SEVERITY_COLORS: Record<string, string> = {
  info: 'bg-blue-500', warning: 'bg-amber-500', error: 'bg-red-500', critical: 'bg-red-600',
};

export default function AuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [category, setCategory] = useState('');

  useEffect(() => {
    ipc.listAuditLogs({ limit: 200, category: category || undefined }).then(setLogs);
  }, [category]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">Audit Log</h1>
        <div className="flex items-center gap-3">
        <button onClick={() => ipc.exportAuditCsv()} className="px-3 py-1.5 bg-slate-700 text-white text-xs rounded-lg hover:bg-slate-600">
          Export CSV
        </button>
        <select value={category} onChange={e => setCategory(e.target.value)}
          className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white">
          <option value="">All Categories</option>
          <option value="device">Device</option>
          <option value="config">Configuration</option>
          <option value="credential">Credentials</option>
          <option value="system">System</option>
        </select>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/80">
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-3 w-8">Sev</th>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Device</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {logs.map(log => (
              <tr key={log.id} className="hover:bg-slate-800/50">
                <td className="px-4 py-2.5"><span className={`inline-block w-2.5 h-2.5 rounded-full ${SEVERITY_COLORS[log.severity] || 'bg-slate-500'}`} /></td>
                <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{fmtDate(log.created_at)}</td>
                <td className="px-4 py-2.5 text-white">{log.action}</td>
                <td className="px-4 py-2.5 text-slate-400 capitalize">{log.category}</td>
                <td className="px-4 py-2.5 text-slate-400">{log.device_name || '-'}</td>
                <td className="px-4 py-2.5 text-slate-500 text-xs truncate max-w-xs">{log.details || '-'}</td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-600">No audit logs</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
