import { Page } from '../App';

const nav: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'devices', label: 'Devices', icon: '🖥️' },
  { id: 'discovery', label: 'Discovery', icon: '🔍' },
  { id: 'firmware', label: 'Firmware', icon: '⬆️' },
  { id: 'jobs', label: 'Tasks', icon: '📋' },
  { id: 'credentials', label: 'Credentials', icon: '🔑' },
  { id: 'audit', label: 'Audit Log', icon: '📜' },
];

interface Props {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

export default function Sidebar({ currentPage, onNavigate }: Props) {
  return (
    <aside className="w-56 bg-slate-950 border-r border-slate-800 flex flex-col">
      <div className="p-5 border-b border-slate-800">
        <h1 className="text-lg font-bold text-white">Control iD</h1>
        <p className="text-xs text-slate-500">Device Manager v2</p>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {nav.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              currentPage === item.id
                ? 'bg-brand-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="p-4 border-t border-slate-800 text-xs text-slate-600">
        Desktop Edition
      </div>
    </aside>
  );
}
