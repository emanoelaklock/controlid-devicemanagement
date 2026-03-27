import { useState, useEffect } from 'react';
import api from '../services/api';

interface Stats {
  devices: { total: number; online: number; offline: number; error: number };
  people: { total: number; active: number };
  locations: number;
  accessLogsLast24h: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api.get('/dashboard/stats').then((res) => setStats(res.data));
  }, []);

  if (!stats) return <div className="text-center py-10">Loading...</div>;

  const cards = [
    { label: 'Total Devices', value: stats.devices.total, color: 'bg-blue-500' },
    { label: 'Online', value: stats.devices.online, color: 'bg-green-500' },
    { label: 'Offline', value: stats.devices.offline, color: 'bg-red-500' },
    { label: 'Errors', value: stats.devices.error, color: 'bg-yellow-500' },
    { label: 'Total People', value: stats.people.total, color: 'bg-indigo-500' },
    { label: 'Active People', value: stats.people.active, color: 'bg-teal-500' },
    { label: 'Locations', value: stats.locations, color: 'bg-purple-500' },
    { label: 'Access (24h)', value: stats.accessLogsLast24h, color: 'bg-orange-500' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl shadow-sm p-6 border">
            <div className={`w-3 h-3 rounded-full ${card.color} mb-3`} />
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="text-3xl font-bold mt-1">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
