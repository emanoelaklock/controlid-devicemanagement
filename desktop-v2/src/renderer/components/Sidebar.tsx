import { CSSProperties, ReactNode } from 'react';
import { Page } from '../App';
import {
  IconHome, IconMonitor, IconActivity, IconSearch, IconUpload,
  IconGear, IconList, IconKey, IconScroll,
} from './ui/icons';

/* NavItem — ported from the design-system bundle (components/navigation/NavItem.jsx). */

type NavColor = 'blue' | 'purple' | 'green' | 'amber' | 'orange' | 'pink' | 'gray';

const NAV_COLORS: Record<NavColor, { fg: string; tileBg: string; tileFg: string; on: string }> = {
  blue: { fg: '#1976D2', tileBg: 'rgba(27,127,196,.12)', tileFg: 'var(--sr-blue)', on: 'var(--sr-blue)' },
  purple: { fg: '#7E37A6', tileBg: 'rgba(115,50,142,.12)', tileFg: 'var(--sr-purple)', on: 'var(--sr-purple)' },
  green: { fg: '#1F8F3F', tileBg: 'rgba(23,154,71,.12)', tileFg: 'var(--sr-green)', on: 'var(--sr-green)' },
  amber: { fg: '#B07D08', tileBg: 'rgba(247,184,30,.18)', tileFg: '#C2900B', on: '#E5890B' },
  orange: { fg: '#C96A12', tileBg: 'rgba(244,134,31,.14)', tileFg: 'var(--sr-orange)', on: 'var(--sr-orange)' },
  pink: { fg: '#C03A78', tileBg: 'rgba(214,51,132,.12)', tileFg: 'var(--sr-pink)', on: 'var(--sr-pink)' },
  gray: { fg: '#5B6270', tileBg: '#EEF0F4', tileFg: '#8A909C', on: '#3a4150' },
};

function NavItem({ color = 'blue', icon, active = false, onClick, children }: {
  color?: NavColor; icon: ReactNode; active?: boolean; onClick: () => void; children: ReactNode;
}) {
  const c = NAV_COLORS[color] || NAV_COLORS.blue;
  return (
    <a onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 10,
      fontFamily: 'var(--sr-font)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
      textDecoration: 'none', marginBottom: 2,
      color: active ? '#fff' : c.fg,
      background: active ? c.on : 'transparent',
      boxShadow: active ? 'var(--sr-shadow-pop)' : 'none',
      transition: 'background .12s ease',
    }}>
      <span style={{
        width: 29, height: 29, borderRadius: 8, display: 'grid', placeItems: 'center', flex: 'none',
        background: active ? 'rgba(255,255,255,.25)' : c.tileBg,
        color: active ? '#fff' : c.tileFg,
      }}>{icon}</span>
      {children}
    </a>
  );
}

const eyebrowStyle: CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#94A0C0', margin: '14px 10px 6px', letterSpacing: '.4px',
};

interface Props {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

export default function Sidebar({ currentPage, onNavigate }: Props) {
  return (
    <aside style={{
      width: 240, flex: 'none', background: 'var(--surface-card)',
      borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
      padding: '18px 14px', boxSizing: 'border-box', overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '6px 8px 14px' }}>
        <div style={{ width: 37, height: 37, borderRadius: 10, background: 'var(--sr-blue)', color: '#fff', display: 'grid', placeItems: 'center' }}>
          <IconMonitor size={19} />
        </div>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-.2px', color: 'var(--text)' }}>Control iD</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, marginTop: 1 }}>Device Manager</div>
        </div>
      </div>

      <div style={{ ...eyebrowStyle, margin: '12px 10px 6px' }}>MONITOR</div>
      <NavItem color="blue" icon={<IconHome />} active={currentPage === 'dashboard'} onClick={() => onNavigate('dashboard')}>Dashboard</NavItem>
      <NavItem color="blue" icon={<IconMonitor />} active={currentPage === 'devices' || currentPage === 'device-detail'} onClick={() => onNavigate('devices')}>Devices</NavItem>
      <NavItem color="orange" icon={<IconActivity />} active={currentPage === 'connection-health'} onClick={() => onNavigate('connection-health')}>Connection health</NavItem>

      <div style={eyebrowStyle}>OPERATE</div>
      <NavItem color="green" icon={<IconSearch />} active={currentPage === 'discovery'} onClick={() => onNavigate('discovery')}>Discovery</NavItem>
      <NavItem color="purple" icon={<IconUpload />} active={currentPage === 'firmware'} onClick={() => onNavigate('firmware')}>Firmware</NavItem>
      <NavItem color="gray" icon={<IconGear />} active={currentPage === 'config'} onClick={() => onNavigate('config')}>Configuration</NavItem>
      <NavItem color="amber" icon={<IconList />} active={currentPage === 'jobs'} onClick={() => onNavigate('jobs')}>Tasks</NavItem>

      <div style={eyebrowStyle}>SECURITY</div>
      <NavItem color="pink" icon={<IconKey />} active={currentPage === 'credentials'} onClick={() => onNavigate('credentials')}>Credentials</NavItem>
      <NavItem color="gray" icon={<IconScroll />} active={currentPage === 'audit'} onClick={() => onNavigate('audit')}>Audit log</NavItem>

      <div style={{ marginTop: 'auto', padding: '11px 8px 4px', borderTop: '1px solid var(--border)', fontSize: 10.5, color: 'var(--text-muted)' }}>
        Desktop Edition · v3
      </div>
    </aside>
  );
}
