import { useState, useEffect } from 'react';
import api from '../services/api';

interface AccessLog {
  id: string;
  event: string;
  method: string | null;
  accessedAt: string;
  details: string | null;
  device: { name: string };
  person: { name: string; registration: string } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export default function AccessLogsPage() {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 0 });
  const [eventFilter, setEventFilter] = useState('');

  useEffect(() => {
    loadLogs();
  }, [pagination.page, eventFilter]);

  const loadLogs = () => {
    const params: Record<string, string | number> = { page: pagination.page, limit: 50 };
    if (eventFilter) params.event = eventFilter;
    api.get('/access-logs', { params }).then((res) => {
      setLogs(res.data.data);
      setPagination(res.data.pagination);
    });
  };

  const eventColor: Record<string, string> = {
    GRANTED: 'bg-green-100 text-green-800',
    DENIED: 'bg-red-100 text-red-800',
    DOOR_OPENED: 'bg-blue-100 text-blue-800',
    DOOR_CLOSED: 'bg-gray-100 text-gray-800',
    ALARM: 'bg-yellow-100 text-yellow-800',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Access Logs</h1>
        <select
          value={eventFilter}
          onChange={(e) => { setEventFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
          className="px-3 py-2 border rounded-lg"
        >
          <option value="">All Events</option>
          <option value="GRANTED">Granted</option>
          <option value="DENIED">Denied</option>
          <option value="DOOR_OPENED">Door Opened</option>
          <option value="ALARM">Alarm</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date/Time</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Device</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Person</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Event</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Method</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-600">{new Date(log.accessedAt).toLocaleString()}</td>
                <td className="px-4 py-3 font-medium">{log.device.name}</td>
                <td className="px-4 py-3 text-gray-600">{log.person?.name || 'Unknown'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${eventColor[log.event] || 'bg-gray-100'}`}>
                    {log.event}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{log.method || '-'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{log.details || '-'}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No access logs found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination.pages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            disabled={pagination.page <= 1}
            onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
            className="px-3 py-1 border rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-3 py-1 text-sm text-gray-600">
            Page {pagination.page} of {pagination.pages}
          </span>
          <button
            disabled={pagination.page >= pagination.pages}
            onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
            className="px-3 py-1 border rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
