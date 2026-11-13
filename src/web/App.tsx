import { Route, Routes } from 'react-router';

import { CatalogPage } from './catalog/CatalogPage';
import { Layout } from './Layout';
import { NotFoundPage } from './NotFoundPage';
import { OrdersPage } from './orders/OrdersPage';
import { PatientsPage } from './patients/PatientsPage';

// The routes. Every page sits inside Layout, so the menu bar is always there.
// The router itself is set up in main.tsx (tests use a MemoryRouter instead).
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<OrdersPage />} />
        <Route path="patients" element={<PatientsPage />} />
        <Route path="catalog" element={<CatalogPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
