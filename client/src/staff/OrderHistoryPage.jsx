import { Fragment, useCallback, useEffect, useState } from 'react';

import { Empty, ErrorState, Loading } from '../components/ui.jsx';
import { staffApi } from '../lib/api.js';
import { STATUS_LABEL, dateTime, money } from '../lib/format.js';
import { useApiCall, useAuth } from './auth.jsx';

const STATUSES = ['ALL', 'ACTIVE', 'RECEIVED', 'PREPARING', 'SERVED', 'CANCELLED'];

/** Order history with the filters the reports screen refers back to. */
export default function OrderHistoryPage() {
  const { currency } = useAuth();
  const call = useApiCall();

  const [filters, setFilters] = useState({ status: 'ALL', tableNumber: '', page: 1 });
  const [state, setState] = useState({ loading: true, orders: [], meta: null, error: null });
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    try {
      const payload = await call((token) =>
        staffApi.listOrders(token, {
          status: filters.status,
          tableNumber: filters.tableNumber || undefined,
          page: filters.page,
          limit: 20,
        })
      );
      setState({ loading: false, orders: payload.data, meta: payload.meta, error: null });
    } catch (err) {
      setState({ loading: false, orders: [], meta: null, error: err.message });
    }
  }, [call, filters]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (patch) => setFilters((current) => ({ ...current, page: 1, ...patch }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Order history</h1>
          <div className="sub">Every ticket, including served and cancelled ones.</div>
        </div>

        <div className="toolbar">
          <select
            className="select"
            style={{ width: 'auto' }}
            value={filters.status}
            onChange={(e) => setFilter({ status: e.target.value })}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status === 'ALL' ? 'All statuses' : status === 'ACTIVE' ? 'Still open' : STATUS_LABEL[status]}
              </option>
            ))}
          </select>

          <input
            className="input"
            style={{ width: 130 }}
            type="number"
            min="1"
            placeholder="Table no."
            value={filters.tableNumber}
            onChange={(e) => setFilter({ tableNumber: e.target.value })}
          />
        </div>
      </div>

      {state.loading && !state.orders.length ? (
        <Loading />
      ) : state.error ? (
        <ErrorState message={state.error} onRetry={load} />
      ) : (
        <>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Table</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Placed</th>
                </tr>
              </thead>
              <tbody>
                {state.orders.map((order) => (
                  <Fragment key={order.id}>
                    <tr
                      className={order.status === 'CANCELLED' ? 'muted-row' : ''}
                      onClick={() => setExpanded(expanded === order.id ? null : order.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <strong>{order.orderNumber}</strong>
                      </td>
                      <td>{order.tableNumber}</td>
                      <td>
                        {order.customer ? (
                          <>
                            <div>{order.customer.name}</div>
                            <div className="hint">{order.customer.phone}</div>
                          </>
                        ) : (
                          <span className="hint">—</span>
                        )}
                      </td>
                      <td>{order.items.reduce((sum, item) => sum + item.quantity, 0)}</td>
                      <td>{money(order.totalAmount, currency)}</td>
                      <td>
                        <span className={`badge badge-${order.status}`}>{STATUS_LABEL[order.status]}</span>
                      </td>
                      <td className="hint">{dateTime(order.createdAt)}</td>
                    </tr>

                    {expanded === order.id && (
                      <tr>
                        <td colSpan={7} style={{ background: 'rgba(255,255,255,0.02)' }}>
                          <div style={{ display: 'grid', gap: 6 }}>
                            {order.items.map((item) => (
                              <div key={item.id} style={{ fontSize: 13 }}>
                                {item.quantity} × {item.name} — {money(item.lineTotal, currency)}
                                {item.note && <span className="hint"> · “{item.note}”</span>}
                              </div>
                            ))}
                            <div className="hint">
                              Subtotal {money(order.subtotal, currency)} · Tax {money(order.taxAmount, currency)}
                              {order.note ? ` · Note: “${order.note}”` : ''}
                              {order.isRated ? ' · Rated by the diner' : ''}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>

            {!state.orders.length && <Empty>No orders match these filters.</Empty>}
          </div>

          {state.meta && state.meta.pages > 1 && (
            <div className="toolbar" style={{ marginTop: 14, justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={filters.page <= 1}
                onClick={() => setFilters((c) => ({ ...c, page: c.page - 1 }))}
              >
                Previous
              </button>
              <span className="hint">
                Page {state.meta.page} of {state.meta.pages} · {state.meta.total} orders
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={filters.page >= state.meta.pages}
                onClick={() => setFilters((c) => ({ ...c, page: c.page + 1 }))}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
