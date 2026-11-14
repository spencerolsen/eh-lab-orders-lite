import { NavLink } from 'react-router';

const SECTIONS = [
  { to: '/', label: 'Orders' },
  { to: '/patients', label: 'Patients' },
  { to: '/catalog', label: 'Catalog' },
];

// The menu bar on every page. NavLink adds aria-current="page" to the link of
// the current section (base.css styles it). A section stays current on a page
// under it (/patients/<id> marks Patients), and '/' only on the home page.
export function MenuBar() {
  return (
    <header className="menu-bar">
      <span className="brand">Lab Orders Lite</span>
      <nav aria-label="Main">
        <ul>
          {SECTIONS.map(({ to, label }) => (
            <li key={to}>
              <NavLink to={to}>{label}</NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
