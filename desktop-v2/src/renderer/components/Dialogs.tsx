import { useEffect, useState } from 'react';
import { Button, TextInput } from './ui';

/**
 * In-app prompt/confirm dialogs, themed with the design tokens. They replace
 * the native Electron message boxes (dialog:prompt / dialog:confirm), which
 * ignored the app's size and colors. ipc.prompt / ipc.confirm route here.
 */

type PromptReq = { kind: 'prompt'; title: string; message: string; defaultValue: string; resolve: (v: string | null) => void };
type ConfirmReq = { kind: 'confirm'; title: string; message: string; resolve: (v: boolean) => void };
type Req = PromptReq | ConfirmReq;

let pushReq: ((r: Req) => void) | null = null;

export function appPrompt(title: string, message: string, defaultValue = ''): Promise<string | null> {
  return new Promise(resolve => {
    if (!pushReq) { resolve(null); return; }
    pushReq({ kind: 'prompt', title, message, defaultValue, resolve });
  });
}

export function appConfirm(message: string, title = 'Confirm'): Promise<boolean> {
  return new Promise(resolve => {
    if (!pushReq) { resolve(false); return; }
    pushReq({ kind: 'confirm', title, message, resolve });
  });
}

export function DialogHost() {
  const [queue, setQueue] = useState<Req[]>([]);
  const [value, setValue] = useState('');
  const current = queue[0];

  useEffect(() => {
    pushReq = (r) => setQueue(q => [...q, r]);
    return () => { pushReq = null; };
  }, []);

  useEffect(() => {
    setValue(current?.kind === 'prompt' ? current.defaultValue : '');
  }, [current]);

  if (!current) return null;

  const finish = (result: string | null | boolean) => {
    (current.resolve as (v: any) => void)(result);
    setQueue(q => q.slice(1));
  };
  const cancel = () => finish(current.kind === 'prompt' ? null : false);
  const ok = () => finish(current.kind === 'prompt' ? value : true);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,27,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70 }}
      onClick={cancel}
      onKeyDown={e => { if (e.key === 'Escape') cancel(); if (e.key === 'Enter' && current.kind === 'confirm') ok(); }}
    >
      <div
        style={{
          background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 16,
          boxShadow: 'var(--sr-shadow-pop)', padding: 22, width: 420, maxWidth: '92vw', color: 'var(--text)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: 15.5, fontWeight: 700, letterSpacing: '-.3px', color: 'var(--text-strong)' }}>{current.title}</h3>
        <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.55, color: 'var(--text-muted)', overflowWrap: 'break-word' }}>{current.message}</p>
        {current.kind === 'prompt' && (
          <TextInput
            value={value} autoFocus
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') cancel(); }}
            style={{ width: '100%', boxSizing: 'border-box', marginBottom: 16 }}
          />
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="ghost" size="sm" onClick={cancel}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={ok} style={current.kind === 'confirm' ? undefined : undefined}>
            {current.kind === 'confirm' ? 'Confirm' : 'OK'}
          </Button>
        </div>
      </div>
    </div>
  );
}
