import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';

interface Device {
  id: string;
  name: string;
  model: string;
  serialNumber: string;
  ipAddress: string;
  port: number;
  login: string;
  status: string;
  firmwareVersion: string | null;
  lastSyncAt: string | null;
  lastHeartbeat: string | null;
  location: { name: string } | null;
}

export default function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [device, setDevice] = useState<Device | null>(null);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    api.get(`/devices/${id}`).then((res) => setDevice(res.data));
  }, [id]);

  const testConnection = async () => {
    setTesting(true);
    try {
      const res = await api.post(`/devices/${id}/test-connection`);
      if (res.data.connected) {
        toast.success('Connection successful!');
      } else {
        toast.error('Could not connect to device');
      }
    } catch {
      toast.error('Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const syncPeople = async () => {
    setSyncing(true);
    try {
      const res = await api.post(`/devices/${id}/sync-people`);
      toast.success(`Synced ${res.data.synced}/${res.data.total} people`);
    } catch {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const openDoor = async () => {
    try {
      await api.post(`/devices/${id}/open-door`);
      toast.success('Door opened remotely');
    } catch {
      toast.error('Failed to open door');
    }
  };

  const deleteDevice = async () => {
    if (!confirm('Are you sure you want to delete this device?')) return;
    try {
      await api.delete(`/devices/${id}`);
      toast.success('Device deleted');
      navigate('/devices');
    } catch {
      toast.error('Failed to delete device');
    }
  };

  if (!device) return <div className="text-center py-10">Loading...</div>;

  return (
    <div>
      <button onClick={() => navigate('/devices')} className="text-primary-600 hover:underline mb-4 inline-block">
        &larr; Back to Devices
      </button>

      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{device.name}</h1>
            <p className="text-gray-500">{device.model} - {device.serialNumber}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            device.status === 'ONLINE' ? 'bg-green-100 text-green-800' :
            device.status === 'OFFLINE' ? 'bg-red-100 text-red-800' :
            'bg-yellow-100 text-yellow-800'
          }`}>
            {device.status}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-500">IP Address:</span> <span className="font-medium">{device.ipAddress}:{device.port}</span></div>
          <div><span className="text-gray-500">Login:</span> <span className="font-medium">{device.login}</span></div>
          <div><span className="text-gray-500">Firmware:</span> <span className="font-medium">{device.firmwareVersion || 'Unknown'}</span></div>
          <div><span className="text-gray-500">Location:</span> <span className="font-medium">{device.location?.name || 'Not assigned'}</span></div>
          <div><span className="text-gray-500">Last Sync:</span> <span className="font-medium">{device.lastSyncAt ? new Date(device.lastSyncAt).toLocaleString() : 'Never'}</span></div>
          <div><span className="text-gray-500">Last Heartbeat:</span> <span className="font-medium">{device.lastHeartbeat ? new Date(device.lastHeartbeat).toLocaleString() : 'Never'}</span></div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button onClick={testConnection} disabled={testing} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {testing ? 'Testing...' : 'Test Connection'}
        </button>
        <button onClick={syncPeople} disabled={syncing} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {syncing ? 'Syncing...' : 'Sync People'}
        </button>
        <button onClick={openDoor} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
          Open Door
        </button>
        <button onClick={deleteDevice} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors">
          Delete Device
        </button>
      </div>
    </div>
  );
}
