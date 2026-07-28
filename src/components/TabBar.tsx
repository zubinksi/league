import { NavLink } from 'react-router-dom';

// League, Matchup and Team are hidden for now — their routes still resolve, so
// a saved link keeps working, they just have no tab.
const TABS = [
  { to: '/roster', label: 'ROSTER', end: false },
  { to: '/arcade', label: 'ARCADE', end: false },
  { to: '/players', label: 'PLAYERS', end: false },
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
