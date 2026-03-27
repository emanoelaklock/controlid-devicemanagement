import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';

interface Device {
  id: string;
  name: string;
  model: string;
  serialNumber: string;
  ipAddress: string;
  port: number;
  status: string;
  firmwareVersion: string | null;
  lastHeartbeat: string | null;
  location: { name: string } | null;
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', model: '', serialNumber: '', ipAddress: '', port: 443, login: 'admin', password: '', locationId: '',
  });

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = () => {
    api.get('/devices').then((res) => setDevices(res.data));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = { ...form, port: Number(form.port), locationId: form.locationId || undefined };
      await api.post('/devices', data);
      toast.success('Device created');
      setShowForm(false);
      setForm({ name: '', model: '', serialNumber: '', ipAddress: '', port: 443, login: 'admin', password: '', locationId: '' });
      loadDevices();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || 'Error creating device');
    }
  };

  const statusColor: Record<string, string> = {
    ONLINE: 'bg-green-100 text-green-800',
    OFFLINE: 'bg-red-100 text-red-800',
    ERROR: 'bg-yellow-100 text-yellow-800',
    SYNCING: 'bg-blue-100 text-blue-800',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Devices</h1>
        <button onClick={() => setShowForm(!showForm)} className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors">
          {showForm ? 'Cancel' : 'Add Device'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border p-6 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <input placeholder="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="px-3 py-2 border rounded-lg" />
          <input placeholder="Model (e.g., iDFace)" required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="px-3 py-2 border rounded-lg" />
          <input placeholder="Serial Number" required value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} className="px-3 py-2 border rounded-lg" />
          <input placeholder="IP Address" required value={form.ipAddress} onChange={(e) => setForm({ ...form, ipAddress: e.target.value })} className="px-3 py-2 border rounded-lg" />
          <input placeholder="Port" type="number" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} className="px-3 py-2 border rounded-lg" />
          <input placeholder="Login" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} className="px-3 py-2 border rounded-lg" />
          <input placeholder="Password" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="px-3 py-2 border rounded-lg" />
          <div />
          <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 md:col-span-2">Save Device</button>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Model</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">IP Address</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Location</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {devices.map((device) => (
              <tr key={device.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{device.name}</td>
                <td className="px-4 py-3 text-gray-600">{device.model}</td>
                <td className="px-4 py-3 text-gray-600">{device.ipAddress}:{device.port}</td>
                <td className="px-4 py-3 text-gray-600">{device.location?.name || '-'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor[device.status] || 'bg-gray-100'}`}>
                    {device.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link to={`/devices/${device.id}`} className="text-primary-600 hover:underline">Details</Link>
                </td>
              </tr>
            ))}
            {devices.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No devices registered</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
