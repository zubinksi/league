import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/', label: 'LEAGUE', end: true },
  { to: '/matchup', label: 'MATCHUP', end: false },
  { to: '/team', label: 'TEAM', end: false },
  { to: '/players', label: 'PLAYERS', end: false },
  { to: '/arcade', label: 'ARCADE', end: false },
];

export function TabBar() {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
