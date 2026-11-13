import { NavLink } from 'react-router';

const SECTIONS = [
  { to: '/', label: 'Orders' },
  { to: '/patients', label: 'Patients' },
  { to: '/catalog', label: 'Catalog' },
];

// The menu bar on every page. NavLink adds aria-current="page" to the link of
// the current section (base.css styles it). Only Orders needs `end`: '/'
// would otherwise count as current on every page, while /patients stays
// current on a page under it such as /patients/<id>.
export function MenuBar() {
  return (
    <header className="menu-bar">
      <span className="brand">Lab Orders Lite</span>
      <nav aria-label="Main">
        <ul>
          {SECTIONS.map(({ to, label }) => (
            <li key={to}>
              <NavLink to={to} end={to === '/'}>
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      {/* LAB-20 puts the "New order" button here, at the end of the bar. */}
    </header>
  );
}
