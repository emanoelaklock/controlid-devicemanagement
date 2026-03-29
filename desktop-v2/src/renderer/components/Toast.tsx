import { useState, useEffect, useCallback } from 'react';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

let addToastFn: ((message: string, type?: Toast['type']) => void) | null = null;

export function toast(message: string, type: Toast['type'] = 'info') {
  addToastFn?.(message, type);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  useEffect(() => { addToastFn = addToast; return () => { addToastFn = null; }; }, [addToast]);

  const colors: Record<string, string> = {
    success: 'bg-emerald-600 border-emerald-500',
    error: 'bg-red-600 border-red-500',
    info: 'bg-brand-600 border-brand-500',
    warning: 'bg-amber-600 border-amber-500',
  };

  const icons: Record<string, string> = {
    success: '✓', error: '✕', info: 'ℹ', warning: '⚠',
  };

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {toasts.map(t => (
        <div key={t.id}
          className={`${colors[t.type]} border-l-4 rounded-lg px-4 py-3 shadow-xl flex items-start gap-3 animate-fadeIn`}
          onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
        >
          <span className="text-white text-sm mt-0.5">{icons[t.type]}</span>
          <p className="text-white text-sm flex-1">{t.message}</p>
          <button className="text-white/60 hover:text-white text-xs">✕</button>
        </div>
      ))}
    </div>
  );
}
