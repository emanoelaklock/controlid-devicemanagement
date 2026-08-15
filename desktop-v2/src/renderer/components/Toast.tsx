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

  // Service Report status families: soft tinted card + readable fg + mark edge.
  const colors: Record<string, { bg: string; fg: string; m: string }> = {
    success: { bg: 'var(--sr-exec-bg)', fg: 'var(--sr-exec-fg)', m: 'var(--sr-exec-m)' },
    error: { bg: 'var(--sr-pend-bg)', fg: 'var(--sr-pend-fg)', m: 'var(--sr-pend-m)' },
    info: { bg: 'var(--sr-info-bg)', fg: 'var(--sr-info-fg)', m: 'var(--sr-info-m)' },
    warning: { bg: 'var(--sr-warn-bg)', fg: 'var(--sr-warn-fg)', m: 'var(--sr-warn-m)' },
  };

  const icons: Record<string, string> = {
    success: '✓', error: '✕', info: 'ℹ', warning: '⚠',
  };

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {toasts.map(t => {
        const c = colors[t.type];
        return (
          <div key={t.id}
            className="rounded-lg px-4 py-3 flex items-start gap-3 animate-fadeIn cursor-pointer"
            style={{
              background: c.bg, color: c.fg, borderLeft: `4px solid ${c.m}`,
              border: '1px solid var(--border)', borderLeftWidth: 4, borderLeftColor: c.m,
              boxShadow: 'var(--sr-shadow-pop)',
            }}
            onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
          >
            <span className="text-sm mt-0.5">{icons[t.type]}</span>
            <p className="text-sm flex-1 font-semibold">{t.message}</p>
            <button className="text-xs opacity-60 hover:opacity-100">✕</button>
          </div>
        );
      })}
    </div>
  );
}
