import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { staffApi } from '../lib/api.js';
import { EVENTS, joinRoom, onEvent } from '../lib/socket.js';
import { useAuth } from './auth.jsx';

/**
 * RQ5 / UC4 — the live kitchen board, shared by the whole dashboard.
 *
 * It loads once over REST and is kept current by Socket.io from then on, so
 * the sidebar badges and the orders screen agree without either of them
 * polling. Grouping and counts are derived here rather than taken from the
 * initial response, because socket updates change the list afterwards.
 */

const ACTIVE = new Set(['RECEIVED', 'PREPARING']);

const LiveBoardContext = createContext(null);

export function LiveBoardProvider({ children }) {
  const { token } = useAuth();

  const [orders, setOrders] = useState([]);
  const [serviceRequests, setServiceRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);

  const refresh = useCallback(
    async (signal) => {
      if (!token) return;
      try {
        const data = await staffApi.liveOrders(token, signal);
        setOrders(data.orders);
        setServiceRequests(data.serviceRequests);
        setError(null);
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!token) return undefined;

    const leave = joinRoom('staff:join', token, (ack) => {
      setConnected(Boolean(ack?.ok));
      // A reconnect can miss events sent while offline; resync on rejoin.
      if (ack?.ok) refresh();
    });

    const offs = [
      onEvent(EVENTS.ORDER_NEW, (order) =>
        setOrders((current) =>
          current.some((o) => o.id === order.id) ? current : [...current, order]
        )
      ),
      onEvent(EVENTS.ORDER_UPDATED, (order) =>
        setOrders((current) => {
          const without = current.filter((o) => o.id !== order.id);
          // Served and cancelled tickets leave the board entirely.
          return ACTIVE.has(order.status) ? [...without, order] : without;
        })
      ),
      onEvent(EVENTS.SERVICE_REQUEST, (request) =>
        setServiceRequests((current) =>
          current.some((r) => String(r.id) === String(request.id)) ? current : [...current, request]
        )
      ),
      onEvent(EVENTS.SERVICE_RESOLVED, ({ id }) =>
        setServiceRequests((current) => current.filter((r) => String(r.id) !== String(id)))
      ),
    ];

    return () => {
      leave();
      offs.forEach((off) => off());
    };
  }, [token, refresh]);

  const value = useMemo(() => {
    const sorted = [...orders].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    const byTable = new Map();
    sorted.forEach((order) => {
      if (!byTable.has(order.tableNumber)) byTable.set(order.tableNumber, []);
      byTable.get(order.tableNumber).push(order);
    });

    const tables = [...byTable.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([tableNumber, tableOrders]) => ({
        tableNumber,
        orders: tableOrders,
        openTotal:
          Math.round(tableOrders.reduce((sum, o) => sum + o.totalAmount, 0) * 100) / 100,
      }));

    return {
      orders: sorted,
      tables,
      serviceRequests,
      counts: {
        received: sorted.filter((o) => o.status === 'RECEIVED').length,
        preparing: sorted.filter((o) => o.status === 'PREPARING').length,
        total: sorted.length,
        requests: serviceRequests.length,
      },
      loading,
      error,
      connected,
      refresh,
      /** Applies a status change returned by the API without waiting for the echo. */
      applyOrder: (order) =>
        setOrders((current) => {
          const without = current.filter((o) => o.id !== order.id);
          return ACTIVE.has(order.status) ? [...without, order] : without;
        }),
      dismissRequest: (id) =>
        setServiceRequests((current) => current.filter((r) => String(r.id) !== String(id))),
    };
  }, [orders, serviceRequests, loading, error, connected, refresh]);

  return <LiveBoardContext.Provider value={value}>{children}</LiveBoardContext.Provider>;
}

export function useLiveBoard() {
  const ctx = useContext(LiveBoardContext);
  if (!ctx) throw new Error('useLiveBoard must be used inside a LiveBoardProvider');
  return ctx;
}
