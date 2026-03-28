import { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

interface Location {
  id: string;
  name: string;
  address: string | null;
  devices: { id: string; name: string; status: string }[];
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', address: '' });

  useEffect(() => {
    loadLocations();
  }, []);

  const loadLocations = () => {
    api.get('/locations').then((res) => setLocations(res.data));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/locations', { ...form, address: form.address || undefined });
      toast.success('Location created');
      setShowForm(false);
      setForm({ name: '', address: '' });
      loadLocations();
    } catch {
      toast.error('Error creating location');
    }
  };

  const deleteLocation = async (id: string) => {
    if (!confirm('Delete this location?')) return;
    try {
      await api.delete(`/locations/${id}`);
      toast.success('Location deleted');
      loadLocations();
    } catch {
      toast.error('Failed to delete (may have associated devices)');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Locations</h1>
        <button onClick={() => setShowForm(!showForm)} className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors">
          {showForm ? 'Cancel' : 'Add Location'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border p-6 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <input placeholder="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="px-3 py-2 border rounded-lg" />
          <input placeholder="Address (optional)" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="px-3 py-2 border rounded-lg" />
          <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 md:col-span-2">Save Location</button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {locations.map((loc) => (
          <div key={loc.id} className="bg-white rounded-xl shadow-sm border p-5">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-semibold text-lg">{loc.name}</h3>
              <button onClick={() => deleteLocation(loc.id)} className="text-red-500 text-sm hover:underline">Delete</button>
            </div>
            {loc.address && <p className="text-gray-500 text-sm mb-3">{loc.address}</p>}
            <p className="text-sm text-gray-600">{loc.devices.length} device(s)</p>
            {loc.devices.length > 0 && (
              <div className="mt-2 space-y-1">
                {loc.devices.map((d) => (
                  <div key={d.id} className="text-xs flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${d.status === 'ONLINE' ? 'bg-green-500' : 'bg-red-500'}`} />
                    {d.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {locations.length === 0 && (
          <p className="text-gray-500 col-span-full text-center py-8">No locations registered</p>
        )}
      </div>
    </div>
  );
}
