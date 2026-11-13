import { Outlet } from 'react-router';

import { ServerStatus } from './health/ServerStatus';
import { MenuBar } from './MenuBar';

// The frame around every page: the menu bar, the page itself, and a footer
// that says whether the API answers.
export function Layout() {
  return (
    <>
      <MenuBar />
      <main className="page">
        <Outlet />
      </main>
      <footer className="footer">
        <ServerStatus />
      </footer>
    </>
  );
}
