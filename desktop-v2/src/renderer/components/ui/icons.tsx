import { ReactNode } from 'react';

/**
 * Line-SVG icon set (Lucide-style, stroke 1.9) — paths copied from the
 * redesign prototype. Icons inherit color from context via currentColor.
 */
function I({ children, size = 17 }: { children: ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export const IconHome = ({ size }: { size?: number }) => (
  <I size={size}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></I>
);

export const IconMonitor = ({ size }: { size?: number }) => (
  <I size={size}><rect x={2} y={3} width={20} height={14} rx={2} /><path d="M8 21h8M12 17v4" /></I>
);

export const IconActivity = ({ size }: { size?: number }) => (
  <I size={size}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></I>
);

export const IconSearch = ({ size }: { size?: number }) => (
  <I size={size}><circle cx={11} cy={11} r={7} /><path d="m21 21-4.3-4.3" /></I>
);

export const IconUpload = ({ size }: { size?: number }) => (
  <I size={size}><path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path d="M5 21h14" /></I>
);

export const IconGear = ({ size }: { size?: number }) => (
  <I size={size}>
    <circle cx={12} cy={12} r={3} />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 14H3.5a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 5 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.6V3.5a2 2 0 1 1 4 0v.1A1.6 1.6 0 0 0 17 5a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 20.4 10h.1a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  </I>
);

export const IconList = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M10 6h11M10 12h11M10 18h11" />
    <path d="m3 6 1.5 1.5L7 5" /><path d="m3 12 1.5 1.5L7 11" /><path d="m3 18 1.5 1.5L7 17" />
  </I>
);

export const IconKey = ({ size }: { size?: number }) => (
  <I size={size}><circle cx={7.5} cy={15.5} r={4.5} /><path d="m21 2-9.6 9.6" /><path d="m15.5 7.5 3 3L22 7l-3-3" /></I>
);

export const IconScroll = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M19 17V5a2 2 0 0 0-2-2H4" />
    <path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3" />
  </I>
);

export const IconSun = ({ size }: { size?: number }) => (
  <I size={size}>
    <circle cx={12} cy={12} r={4} />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </I>
);

export const IconMoon = ({ size }: { size?: number }) => (
  <I size={size}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></I>
);

export const IconWifi = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="M2 9.5a15 15 0 0 1 20 0" /><path d="M5 13a10 10 0 0 1 14 0" />
    <path d="M8.5 16.5a5 5 0 0 1 7 0" /><path d="M12 20h.01" />
  </I>
);

export const IconWifiOff = ({ size }: { size?: number }) => (
  <I size={size}>
    <path d="m2 2 20 20" /><path d="M8.5 16.5a5 5 0 0 1 7 0" />
    <path d="M2 8.8a15 15 0 0 1 5.9-2.8" /><path d="M10.7 5.1a15 15 0 0 1 11.3 4.4" />
    <path d="M16.8 11.7a10 10 0 0 1 2.2 1.3" /><path d="M5 13a10 10 0 0 1 5.2-2.7" />
    <path d="M12 20h.01" />
  </I>
);
