import { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

interface Person {
  id: string;
  name: string;
  registration: string;
  cardNumber: string | null;
  active: boolean;
  group: { name: string } | null;
  devices: { device: { id: string; name: string } }[];
}

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', registration: '', cardNumber: '', pinCode: '' });

  useEffect(() => {
    loadPeople();
  }, []);

  const loadPeople = (q = '') => {
    const params = q ? { search: q } : {};
    api.get('/people', { params }).then((res) => setPeople(res.data));
  };

  const handleSearch = () => loadPeople(search);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = { ...form, cardNumber: form.cardNumber || undefined, pinCode: form.pinCode || undefined };
      await api.post('/people', data);
      toast.success('Person created');
      setShowForm(false);
      setForm({ name: '', registration: '', cardNumber: '', pinCode: '' });
      loadPeople();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || 'Error creating person');
    }
  };

  const deletePerson = async (id: string) => {
    if (!confirm('Delete this person?')) return;
    try {
      await api.delete(`/people/${id}`);
      toast.success('Person deleted');
      loadPeople();
    } catch {
      toast.error('Failed to delete');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">People</h1>
        <button onClick={() => setShowForm(!showForm)} className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors">
          {showForm ? 'Cancel' : 'Add Person'}
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <input
          placeholder="Search by name or registration..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="flex-1 px-3 py-2 border rounded-lg"
        />
        <button onClick={handleSearch} className="bg-gray-200 px-4 py-2 rounded-lg hover:bg-gray-300">Search</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border p-6 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <input placeholder="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="px-3 py-2 border rounded-lg" />
          <input placeholder="Registration" required value={form.registration} onChange={(e) => setForm({ ...form, registration: e.target.value })} className="px-3 py-2 border rounded-lg" />
          <input placeholder="Card Number (optional)" value={form.cardNumber} onChange={(e) => setForm({ ...form, cardNumber: e.target.value })} className="px-3 py-2 border rounded-lg" />
          <input placeholder="PIN Code (optional)" value={form.pinCode} onChange={(e) => setForm({ ...form, pinCode: e.target.value })} className="px-3 py-2 border rounded-lg" />
          <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 md:col-span-2">Save Person</button>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Registration</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Card</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Group</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Devices</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {people.map((person) => (
              <tr key={person.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{person.name}</td>
                <td className="px-4 py-3 text-gray-600">{person.registration}</td>
                <td className="px-4 py-3 text-gray-600">{person.cardNumber || '-'}</td>
                <td className="px-4 py-3 text-gray-600">{person.group?.name || '-'}</td>
                <td className="px-4 py-3 text-gray-600">{person.devices.length}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${person.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {person.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => deletePerson(person.id)} className="text-red-600 hover:underline text-sm">Delete</button>
                </td>
              </tr>
            ))}
            {people.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No people registered</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
