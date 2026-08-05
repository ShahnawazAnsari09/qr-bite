import { useEffect, useState } from 'react';

import { Empty, ErrorState, Loading, useToast } from '../components/ui.jsx';
import { staffApi } from '../lib/api.js';
import { SERVICE_LABEL, STATUS_LABEL, ago, minutesSince, money, time } from '../lib/format.js';
import { EVENTS, onEvent } from '../lib/socket.js';
import { useApiCall, useAuth } from './auth.jsx';
import { useLiveBoard } from './LiveBoardContext.jsx';

/** A ticket open longer than this is highlighted for the floor manager. */
const LATE_MINUTES = 20;

const NEXT_ACTION = {
  RECEIVED: { status: 'PREPARING', label: 'Start preparing' },
  PREPARING: { status: 'SERVED', label: 'Mark served' },
};

function Ticket({ order, currency, isAdmin, onStatus, busy }) {
  const next = NEXT_ACTION[order.status];
  const late = minutesSince(order.createdAt) >= LATE_MINUTES;

  return (
    <article className={`ticket ${late ? 'is-late' : ''}`}>
      <div className="ticket-head">
        <div>
          <div className="ticket-table">Table {order.tableNumber}</div>
          <div className="ticket-sub">
            {order.orderNumber} · {time(order.createdAt)} · {ago(order.createdAt)}
          </div>
        </div>
        <span className={`badge badge-${order.status}`}>{STATUS_LABEL[order.status]}</span>
      </div>

      <div className="ticket-items">
        {order.items.map((item) => (
          <div className="ticket-item" key={item.id}>
            <span className="ticket-qty">{item.quantity}×</span>
            <div style={{ minWidth: 0 }}>
              <div>{item.name}</div>
              {item.note && <div className="ticket-note">“{item.note}”</div>}
            </div>
          </div>
        ))}

        {order.note && <div className="ticket-note">Order note: “{order.note}”</div>}

        {order.customer && (
          <div className="ticket-sub">
            {order.customer.name} · {order.customer.phone}
          </div>
        )}
      </div>

      <div className="ticket-foot">
        <strong>{money(order.totalAmount, currency)}</strong>
        <div className="row-actions">
          {isAdmin && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => onStatus(order, 'CANCELLED')}
            >
              Cancel
            </button>
          )}
          {next && (
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={() => onStatus(order, next.status)}
            >
              {next.label}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function LiveOrdersPage() {
  const { isAdmin, currency } = useAuth();
  const call = useApiCall();
  const toast = useToast();
  const board = useLiveBoard();

  const [busyId, setBusyId] = useState(null);
  const [, forceTick] = useState(0);

  // "12m ago" has to keep counting up while the monitor sits untouched.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // The board itself handles the data; this is just the human-facing alert.
  useEffect(() => {
    const off = onEvent(EVENTS.ORDER_NEW, (order) =>
      toast.info(`New order on table ${order.tableNumber} — ${order.orderNumber}`)
    );
    const offRequest = onEvent(EVENTS.SERVICE_REQUEST, (request) =>
      toast.info(`Table ${request.tableNumber} needs: ${SERVICE_LABEL[request.type] || request.type}`)
    );
    return () => {
      off();
      offRequest();
    };
  }, [toast]);

  const changeStatus = async (order, status) => {
    if (status === 'CANCELLED' && !window.confirm(`Cancel ${order.orderNumber}? This cannot be undone.`)) {
      return;
    }

    setBusyId(order.id);
    try {
      const updated = await call((token) => staffApi.updateOrderStatus(token, order.id, status));
      board.applyOrder(updated);
      toast.success(`${order.orderNumber} marked ${STATUS_LABEL[status].toLowerCase()}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const resolveRequest = async (request) => {
    try {
      await call((token) => staffApi.resolveServiceRequest(token, request.id));
      board.dismissRequest(request.id);
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (board.loading) return <Loading label="Loading the kitchen board…" />;
  if (board.error && !board.orders.length) {
    return <ErrorState message={board.error} onRetry={() => board.refresh()} />;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Live orders</h1>
          <div className="sub">Tickets stay here until they are served or cancelled.</div>
        </div>
        <div className="toolbar">
          <span className={`live-dot ${board.connected ? '' : 'off'}`}>
            {board.connected ? 'Live' : 'Offline — reconnecting'}
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => board.refresh()}>
            Refresh
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="label">New</div>
          <div className="value">{board.counts.received}</div>
          <div className="foot">Waiting to be started</div>
        </div>
        <div className="stat">
          <div className="label">Preparing</div>
          <div className="value">{board.counts.preparing}</div>
          <div className="foot">In the kitchen now</div>
        </div>
        <div className="stat">
          <div className="label">Open tables</div>
          <div className="value">{board.tables.length}</div>
          <div className="foot">With an unserved order</div>
        </div>
        <div className="stat">
          <div className="label">Service calls</div>
          <div className="value">{board.counts.requests}</div>
          <div className="foot">Waiting for a waiter</div>
        </div>
      </div>

      {board.serviceRequests.length > 0 && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <h3>Service requests</h3>
          <div className="row-actions" style={{ gap: 10 }}>
            {board.serviceRequests.map((request) => (
              <div
                key={request.id}
                className="badge"
                style={{ padding: '8px 12px', gap: 10, fontSize: 13 }}
              >
                <strong>Table {request.tableNumber}</strong>
                <span>{SERVICE_LABEL[request.type] || request.type}</span>
                <span style={{ opacity: 0.7 }}>{ago(request.createdAt)}</span>
                <button type="button" className="btn btn-sm" onClick={() => resolveRequest(request)}>
                  Done
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {board.orders.length === 0 ? (
        <div className="panel">
          <Empty>No open orders. New ones appear here the moment a diner checks out.</Empty>
        </div>
      ) : (
        board.tables.map((table) => (
          <section key={table.tableNumber} style={{ marginBottom: 22 }}>
            <div className="page-head" style={{ marginBottom: 10 }}>
              <h2 style={{ fontSize: 16 }}>
                Table {table.tableNumber}
                <span className="hint" style={{ marginLeft: 10, fontWeight: 400 }}>
                  {table.orders.length} order{table.orders.length > 1 ? 's' : ''} ·{' '}
                  {money(table.openTotal, currency)} open
                </span>
              </h2>
            </div>

            <div className="board">
              {table.orders.map((order) => (
                <Ticket
                  key={order.id}
                  order={order}
                  currency={currency}
                  isAdmin={isAdmin}
                  busy={busyId === order.id}
                  onStatus={changeStatus}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
