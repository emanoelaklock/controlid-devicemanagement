import { CSSProperties, ReactNode, useState } from 'react';

/* ============================================================================
   Service Report UI kit — ported 1:1 from the design-system bundle
   (_ds/…/_ds_bundle.js) used by the redesign prototype. Values are kept
   pixel-identical; literal whites were swapped for surface tokens so the
   dark theme flips them too.
   ========================================================================== */

// ─── Badge ──────────────────────────────────────────────────────────

export type BadgeTone = 'exec' | 'info' | 'warn' | 'pend' | 'move' | 'jrny' | 'aguard' | 'teal';

const BADGE_TONES: Record<BadgeTone, { bg: string; fg: string; m: string }> = {
  exec: { bg: 'var(--sr-exec-bg)', fg: 'var(--sr-exec-fg)', m: 'var(--sr-exec-m)' },
  info: { bg: 'var(--sr-info-bg)', fg: 'var(--sr-info-fg)', m: 'var(--sr-info-m)' },
  warn: { bg: 'var(--sr-warn-bg)', fg: 'var(--sr-warn-fg)', m: 'var(--sr-warn-m)' },
  pend: { bg: 'var(--sr-pend-bg)', fg: 'var(--sr-pend-fg)', m: 'var(--sr-pend-m)' },
  move: { bg: 'var(--sr-move-bg)', fg: 'var(--sr-move-fg)', m: 'var(--sr-move-m)' },
  jrny: { bg: 'var(--sr-jrny-bg)', fg: 'var(--sr-jrny-fg)', m: 'var(--sr-jrny-m)' },
  aguard: { bg: 'var(--sr-aguard-bg)', fg: 'var(--sr-aguard-fg)', m: 'var(--sr-aguard-m)' },
  teal: { bg: 'var(--sr-teal-bg)', fg: 'var(--sr-teal-fg)', m: 'var(--sr-teal-m)' },
};

export function Badge({ tone = 'info', dot = false, children, style }: {
  tone?: BadgeTone; dot?: boolean; children: ReactNode; style?: CSSProperties;
}) {
  const t = BADGE_TONES[tone] || BADGE_TONES.info;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--sr-font)',
      fontSize: 11, fontWeight: 700, lineHeight: 1.2, padding: '4px 11px',
      borderRadius: 999, whiteSpace: 'nowrap', background: t.bg, color: t.fg, ...style,
    }}>
      {dot && <i style={{ width: 6, height: 6, borderRadius: '50%', background: t.m, display: 'inline-block' }} />}
      {children}
    </span>
  );
}

// ─── Button ─────────────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'green' | 'ghost' | 'danger' | 'ok-outline' | 'warn-outline';

const BUTTON_PALETTE: Record<ButtonVariant, CSSProperties> = {
  primary: { background: 'var(--sr-blue)', color: '#fff', border: '1px solid var(--sr-blue)', boxShadow: 'var(--sr-shadow-primary)' },
  green: { background: 'var(--sr-green)', color: '#fff', border: '1px solid var(--sr-green)', boxShadow: 'var(--sr-shadow-kpi-green)' },
  ghost: { background: 'var(--surface-card)', color: 'var(--text)', border: '1px solid var(--border-strong)' },
  danger: { background: 'var(--sr-pend-m)', color: '#fff', border: '1px solid var(--sr-pend-m)' },
  'ok-outline': { background: 'var(--surface-card)', color: 'var(--sr-exec-fg)', border: '1.5px solid #9AD3B0' },
  'warn-outline': { background: 'var(--surface-card)', color: 'var(--sr-warn-fg)', border: '1.5px solid #EBC777' },
};

export function Button({ variant = 'primary', size = 'md', fullWidth = false, icon = null, disabled = false, autoFocus = false, title, onClick, children, style }: {
  variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg'; fullWidth?: boolean; icon?: ReactNode;
  disabled?: boolean; autoFocus?: boolean; title?: string; onClick?: (e: React.MouseEvent) => void; children?: ReactNode; style?: CSSProperties;
}) {
  const [hover, setHover] = useState(false);
  const pal = BUTTON_PALETTE[variant] || BUTTON_PALETTE.primary;
  const pad = size === 'sm' ? '9px 14px' : size === 'lg' ? '14px 18px' : '11px 16px';
  const fontSize = size === 'sm' ? 13 : size === 'lg' ? 15 : 14;
  const hoverStyle: CSSProperties = hover && !disabled
    ? (variant === 'ghost' || variant === 'ok-outline' || variant === 'warn-outline'
      ? { background: 'var(--surface-sunken)' }
      : { filter: 'brightness(.94)' })
    : {};
  return (
    <button
      disabled={disabled} autoFocus={autoFocus} title={title} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        width: fullWidth ? '100%' : 'auto', fontFamily: 'var(--sr-font)', fontSize,
        fontWeight: 700, letterSpacing: '-.2px', padding: pad, borderRadius: 15,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        transition: 'filter .12s ease, background .12s ease, transform .12s ease',
        whiteSpace: 'nowrap', ...pal, ...hoverStyle, ...style,
      }}>
      {icon && <span style={{ display: 'inline-flex', width: 16, height: 16 }}>{icon}</span>}
      {children}
    </button>
  );
}

// ─── KPI card ───────────────────────────────────────────────────────

const KPI_TONE = {
  blue: { bg: 'rgba(27,127,196,.13)', ic: 'var(--sr-blue)', sh: 'var(--sr-shadow-kpi-blue)' },
  green: { bg: 'rgba(23,154,71,.13)', ic: 'var(--sr-green)', sh: 'var(--sr-shadow-kpi-green)' },
  amber: { bg: 'rgba(247,184,30,.20)', ic: '#C2810A', sh: 'var(--sr-shadow-kpi-amber)' },
  purple: { bg: 'rgba(142,69,181,.13)', ic: 'var(--sr-purple)', sh: 'var(--sr-shadow-kpi-purple)' },
} as const;

export function KPI({ tone = 'blue', icon = null, label, value, sub }: {
  tone?: keyof typeof KPI_TONE; icon?: ReactNode; label: string; value: ReactNode; sub?: string;
}) {
  const t = KPI_TONE[tone] || KPI_TONE.blue;
  return (
    <div style={{
      borderRadius: 16, padding: 20, background: t.bg, boxShadow: t.sh,
      border: '1px solid rgba(0,0,0,.05)', color: 'var(--sr-ink)',
    }}>
      {icon && (
        <div style={{
          width: 42, height: 42, borderRadius: 12, background: 'rgba(255,255,255,.65)',
          display: 'grid', placeItems: 'center', marginBottom: 14, color: t.ic,
        }}>{icon}</div>
      )}
      <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.75 }}>{label}</div>
      <div style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.05, marginTop: 8, fontVariantNumeric: 'tabular-nums', letterSpacing: '-1px' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 500, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── Tabs ───────────────────────────────────────────────────────────

export function Tabs({ tabs, active, onChange }: {
  tabs: { label: string; count?: number; countRed?: boolean }[];
  active: number; onChange: (i: number) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
      {tabs.map((t, i) => {
        const on = i === active;
        return (
          <span key={i} onClick={() => onChange(i)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 14px',
            fontFamily: 'var(--sr-font)', fontSize: 13.5, fontWeight: 600,
            color: on ? 'var(--sr-info-fg)' : 'var(--text-muted)', cursor: 'pointer',
            borderBottom: `2.5px solid ${on ? 'var(--sr-blue)' : 'transparent'}`, marginBottom: -1,
          }}>
            {t.label}
            {t.count != null && (
              <span style={{
                minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
                background: t.countRed ? 'var(--sr-pend-m)' : 'var(--sr-warn-m)',
                color: t.countRed ? '#fff' : '#3a2c00', fontSize: 11, fontWeight: 800,
                display: 'grid', placeItems: 'center',
              }}>{t.count}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

// ─── StateBlock (empty / success states) ────────────────────────────

const STATE_ICONS = {
  empty: <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h18M3 12h18M3 17h10" /></svg>,
  success: <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={9} /><path d="M8.5 12.5 11 15l4.5-5" /></svg>,
};

export function StateBlock({ variant = 'empty', title, message, actionLabel, onAction, compact = false }: {
  variant?: 'empty' | 'success'; title: string; message?: string;
  actionLabel?: string; onAction?: () => void; compact?: boolean;
}) {
  const tone = variant === 'success' ? BADGE_TONES.exec : BADGE_TONES.aguard;
  return (
    <div role="status" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      fontFamily: 'var(--sr-font)', padding: compact ? '22px 18px' : '34px 22px',
      background: 'var(--surface-card)', color: 'var(--text)',
    }}>
      <span style={{
        width: compact ? 48 : 62, height: compact ? 48 : 62, borderRadius: '50%',
        background: tone.bg, color: tone.m, display: 'grid', placeItems: 'center', marginBottom: 14,
      }}>{STATE_ICONS[variant]}</span>
      <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.3px' }}>{title}</div>
      {message && <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginTop: 5, maxWidth: 280, lineHeight: 1.5 }}>{message}</div>}
      {actionLabel && <div style={{ marginTop: 16 }}><Button variant="ghost" onClick={onAction}>{actionLabel}</Button></div>}
    </div>
  );
}

// ─── Uptime / availability mini-bar ─────────────────────────────────

export function uptimeColors(u: number) {
  return {
    bar: u >= 99.5 ? 'var(--sr-exec-m)' : u >= 95 ? 'var(--sr-warn-m)' : 'var(--sr-pend-m)',
    text: u >= 99.5 ? 'var(--sr-exec-fg)' : u >= 95 ? 'var(--sr-warn-fg)' : 'var(--sr-pend-fg)',
  };
}

export function fmtUptime(u: number): string {
  return (u % 1 === 0 ? u : u.toFixed(1)) + '%';
}

export function UptimeBar({ value, width = 42, height = 6, fontSize = 12, weight = 700 }: {
  value: number; width?: number; height?: number; fontSize?: number; weight?: number;
}) {
  const c = uptimeColors(value);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <span style={{
        width, height, borderRadius: 999, background: 'var(--surface-sunken)',
        border: '1px solid var(--border)', overflow: 'hidden', flex: 'none', display: 'inline-block',
      }}>
        <span style={{ display: 'block', height: '100%', borderRadius: 999, width: `${Math.max(4, Math.round(value))}%`, background: c.bar }} />
      </span>
      <span style={{ fontSize, fontWeight: weight, fontVariantNumeric: 'tabular-nums', color: c.text }}>{fmtUptime(value)}</span>
    </span>
  );
}

// ─── Card + eyebrow + label/value row (detail page primitives) ──────

export function Card({ children, style, edge }: { children: ReactNode; style?: CSSProperties; edge?: string }) {
  return (
    <div style={{
      background: 'var(--surface-card)', border: '1px solid var(--border)',
      ...(edge ? { borderLeft: `4px solid ${edge}` } : {}),
      borderRadius: 16, boxShadow: 'var(--sr-shadow-card)', ...style,
    }}>{children}</div>
  );
}

export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, letterSpacing: '1.3px', textTransform: 'uppercase',
      color: 'var(--text-muted)', ...style,
    }}>{children}</div>
  );
}

export function InfoRow({ label, children, last = false }: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', borderBottom: last ? 'none' : '1px solid var(--border)', gap: 10,
    }}>
      <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', minWidth: 0, textAlign: 'right' }}>{children}</span>
    </div>
  );
}

// ─── Modal (light-theme, token-based) ───────────────────────────────

export function Modal({ onClose, width = 416, children }: { onClose: () => void; width?: number; children: ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,27,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
      onClick={onClose}>
      <div style={{
        background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 16,
        boxShadow: 'var(--sr-shadow-pop)', padding: 22, width, maxWidth: '92vw', maxHeight: '88vh',
        overflow: 'auto', color: 'var(--text)',
      }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function ModalTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, letterSpacing: '-.3px', color: 'var(--text-strong)' }}>{children}</h3>
      {sub && <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  );
}

// ─── Text input (11px radius control) ───────────────────────────────

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { style, ...rest } = props;
  return (
    <input {...rest} style={{
      padding: '8px 13px', borderRadius: 11, border: '1px solid var(--border-strong)',
      background: 'var(--surface-card)', color: 'var(--text)', fontFamily: 'inherit',
      fontSize: 12.5, outline: 'none', ...style,
    }} />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { style, children, ...rest } = props;
  return (
    <select {...rest} style={{
      padding: '7px 10px', borderRadius: 11, border: '1px solid var(--border-strong)',
      background: 'var(--surface-card)', color: 'var(--text)', fontFamily: 'inherit',
      fontSize: 12.5, fontWeight: 600, outline: 'none', cursor: 'pointer', ...style,
    }}>{children}</select>
  );
}
