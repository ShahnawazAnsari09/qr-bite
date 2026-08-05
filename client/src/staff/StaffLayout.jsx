import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useAuth } from './auth.jsx';
import { LiveBoardProvider, useLiveBoard } from './LiveBoardContext.jsx';

const NAV = [
  { to: '/staff', label: 'Live orders', end: true, badge: 'active' },
  { to: '/staff/orders', label: 'Order history' },
  { to: '/staff/menu', label: 'Menu' },
  { to: '/staff/tables', label: 'Tables & QR' },
  { to: '/staff/customers', label: 'Customers' },
  { to: '/staff/reports', label: 'Reports' },
];

/** Badge counts come from the shared live board, so they update over the socket. */
function Nav() {
  const { counts } = useLiveBoard();

  const badgeFor = (key) => {
    if (key === 'active') return counts.total + counts.requests || null;
    return null;
  };

  return (
    <>
      {NAV.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
          <span>{item.label}</span>
          {badgeFor(item.badge) && <span className="nav-count">{badgeFor(item.badge)}</span>}
        </NavLink>
      ))}
    </>
  );
}

export default function StaffLayout() {
  const { user, restaurant, signOut } = useAuth();
  const navigate = useNavigate();

  const logout = () => {
    signOut();
    navigate('/staff/login', { replace: true });
  };

  return (
    <LiveBoardProvider>
      <div className="staff-shell">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <strong>QR-Bite</strong>
            <span>{restaurant?.name || 'Dashboard'}</span>
          </div>

          <Nav />

          <div className="sidebar-foot">
            <div>
              <div className="who">{user?.name}</div>
              <div className="role">{user?.role}</div>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={logout}>
              Sign out
            </button>
          </div>
        </aside>

        <main className="staff-main">
          <Outlet />
        </main>
      </div>
    </LiveBoardProvider>
  );
}
