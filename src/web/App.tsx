import { Route, Routes } from 'react-router';

import { CatalogPage } from './catalog/CatalogPage';
import { Layout } from './Layout';
import { NotFoundPage } from './NotFoundPage';
import { OrdersPage } from './orders/OrdersPage';
import { PatientsPage } from './patients/PatientsPage';
import { StylesPage } from './styles/StylesPage';

// The routes. Every page sits inside Layout, so the menu bar is always there.
// The router itself is set up in main.tsx (tests use a MemoryRouter instead).
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<OrdersPage />} />
        <Route path="patients" element={<PatientsPage />} />
        <Route path="catalog" element={<CatalogPage />} />
        {/* The style sample page: linked from nowhere, see AGENTS.md. */}
        <Route path="styles" element={<StylesPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
