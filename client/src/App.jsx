import { Navigate, Route, Routes } from 'react-router-dom';

import MenuPage from './customer/MenuPage.jsx';
import TrackPage from './customer/TrackPage.jsx';
import Landing from './pages/Landing.jsx';
import NotFound from './pages/NotFound.jsx';
import { AuthProvider, RequireStaff } from './staff/auth.jsx';
import CustomersPage from './staff/CustomersPage.jsx';
import LiveOrdersPage from './staff/LiveOrdersPage.jsx';
import LoginPage from './staff/LoginPage.jsx';
import MenuManagerPage from './staff/MenuManagerPage.jsx';
import OrderHistoryPage from './staff/OrderHistoryPage.jsx';
import ReportsPage from './staff/ReportsPage.jsx';
import StaffLayout from './staff/StaffLayout.jsx';
import TablesPage from './staff/TablesPage.jsx';

/**
 * Two apps behind one bundle.
 *
 *   /t/:code   what a table's QR code opens — the diner's menu
 *   /order     the diner tracking and rating the order they just placed
 *   /staff/*   the dashboard, behind a login
 */
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />

        <Route path="/t/:code" element={<MenuPage />} />
        <Route path="/order" element={<TrackPage />} />

        <Route path="/staff/login" element={<LoginPage />} />
        <Route
          path="/staff"
          element={
            <RequireStaff>
              <StaffLayout />
            </RequireStaff>
          }
        >
          <Route index element={<LiveOrdersPage />} />
          <Route path="orders" element={<OrderHistoryPage />} />
          <Route path="menu" element={<MenuManagerPage />} />
          <Route path="tables" element={<TablesPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="reports" element={<ReportsPage />} />
        </Route>

        {/* Old bookmark shape, kept working. */}
        <Route path="/dashboard/*" element={<Navigate to="/staff" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
