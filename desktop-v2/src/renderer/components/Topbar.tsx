import { useEffect, useState } from 'react';
import { ipc } from '../hooks/useIpc';
import { Badge, Button } from './ui';
import { IconSun, IconMoon } from './ui/icons';

export default function Topbar({ title, theme, onToggleTheme }: {
  title: string; theme: 'light' | 'dark'; onToggleTheme: () => void;
}) {
  const [counts, setCounts] = useState({ online: 0, offline: 0 });

  useEffect(() => {
    const load = () =>
      ipc.getStats().then((s: any) => {
        const total = s?.devices?.total ?? 0;
        const online = s?.devices?.online ?? 0;
        setCounts({ online, offline: total - online });
      }).catch(() => {});
    load();
    const interval = setInterval(load, 5000);
    const unsub = ipc.on('heartbeat:update', load);
    return () => { clearInterval(interval); unsub?.(); };
  }, []);

  return (
    <div style={{
      background: 'var(--surface-card)', borderBottom: '1px solid var(--border)',
      padding: '15px 28px', display: 'flex', alignItems: 'center', gap: 10,
      position: 'sticky', top: 0, zIndex: 20, flex: 'none',
    }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.4px', color: 'var(--text-strong)', margin: 0 }}>{title}</h1>
      <div style={{ flex: 1 }} />
      <Badge tone="exec" dot>{counts.online} online</Badge>
      <Badge tone="pend" dot>{counts.offline} offline</Badge>
      <div style={{ width: 1, height: 22, background: 'var(--border-strong)', margin: '0 6px' }} />
      <Button variant="ghost" size="sm" icon={theme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />} onClick={onToggleTheme}>
        {theme === 'dark' ? 'Light' : 'Dark'}
      </Button>
    </div>
  );
}
