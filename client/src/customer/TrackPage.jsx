import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { ErrorState, Loading, Stars, useToast } from '../components/ui.jsx';
import { ApiError, publicApi } from '../lib/api.js';
import { KEYS, dateTime, money, store, time } from '../lib/format.js';
import { EVENTS, joinRoom, onEvent } from '../lib/socket.js';

const STEPS = [
  { status: 'RECEIVED', label: 'Received', blurb: 'The kitchen has your order.' },
  { status: 'PREPARING', label: 'Preparing', blurb: 'Your food is being cooked.' },
  { status: 'SERVED', label: 'Served', blurb: 'Enjoy your meal!' },
];

/** UC6 / TC11 — one row per dish, filled in only for the dishes a diner rates. */
function RateDishes({ order, onDone }) {
  const toast = useToast();
  const [scores, setScores] = useState({});
  const [comments, setComments] = useState({});
  const [saving, setSaving] = useState(false);

  // The same dish ordered on two lines should only be rated once.
  const dishes = useMemo(() => {
    const seen = new Map();
    order.items.forEach((item) => {
      if (!seen.has(item.menuItemId)) seen.set(item.menuItemId, item);
    });
    return [...seen.values()];
  }, [order.items]);

  const chosen = Object.entries(scores).filter(([, stars]) => stars > 0);

  const submit = async (event) => {
    event.preventDefault();
    if (!chosen.length) return;

    setSaving(true);
    try {
      const session = store.get(KEYS.order);
      await publicApi.submitRatings(
        session.token,
        chosen.map(([menuItemId, stars]) => ({
          menuItemId,
          stars,
          comment: (comments[menuItemId] || '').trim(),
        }))
      );
      toast.success('Thanks for your feedback!');
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card" style={{ padding: 18, marginTop: 16 }} onSubmit={submit}>
      <h3 style={{ fontSize: 16 }}>How was it?</h3>
      <p className="hint" style={{ marginTop: 4, marginBottom: 8 }}>
        Rate the dishes you tried. Your rating shows on the menu for other diners.
      </p>

      {dishes.map((item) => (
        <div key={item.menuItemId}>
          <div className="rate-row">
            <strong style={{ fontSize: 14 }}>{item.name}</strong>
            <div className="star-picker">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className={star <= (scores[item.menuItemId] || 0) ? 'on' : ''}
                  onClick={() =>
                    setScores((current) => ({
                      ...current,
                      // Tapping the same star again clears the rating.
                      [item.menuItemId]: current[item.menuItemId] === star ? 0 : star,
                    }))
                  }
                  aria-label={`${star} star${star > 1 ? 's' : ''} for ${item.name}`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          {scores[item.menuItemId] > 0 && (
            <input
              className="input"
              style={{ marginBottom: 12, fontSize: 14 }}
              placeholder="Add a comment (optional)"
              maxLength={500}
              value={comments[item.menuItemId] || ''}
              onChange={(e) =>
                setComments((current) => ({ ...current, [item.menuItemId]: e.target.value }))
              }
            />
          )}
        </div>
      ))}

      <button type="submit" className="btn btn-block" style={{ marginTop: 14 }} disabled={!chosen.length || saving}>
        {saving ? 'Sending…' : `Submit ${chosen.length || ''} rating${chosen.length === 1 ? '' : 's'}`}
      </button>
    </form>
  );
}

/**
 * UC5 — live order status. The page loads once over REST, then the server
 * pushes every status change into this order's private socket room, so the
 * diner sees "Preparing" the moment the kitchen taps it.
 */
export default function TrackPage() {
  const toast = useToast();
  const session = store.get(KEYS.order);

  const [state, setState] = useState({ loading: true, order: null, restaurant: null, error: null });
  const [live, setLive] = useState(false);

  const load = useCallback(async () => {
    if (!session?.token) return;
    try {
      const data = await publicApi.getMyOrder(session.token);
      setState({ loading: false, order: data.order, restaurant: data.restaurant, error: null });
    } catch (err) {
      // An expired or rejected token is dead weight — clear it so the diner is
      // not stuck on a page that can never load.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        store.remove(KEYS.order);
        setState({ loading: false, order: null, restaurant: null, error: err.message });
        return;
      }
      setState((current) => ({ ...current, loading: false, error: err.message }));
    }
  }, [session?.token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!session?.token) return undefined;

    const leave = joinRoom('order:join', session.token, (ack) => setLive(Boolean(ack?.ok)));
    const off = onEvent(EVENTS.ORDER_UPDATED, (order) => {
      setState((current) => ({ ...current, order }));
      if (order.status === 'SERVED') toast.success('Your order has been served. Enjoy!');
      if (order.status === 'CANCELLED') toast.error('This order was cancelled. Please ask a staff member.');
    });

    return () => {
      leave();
      off();
    };
  }, [session?.token, toast]);

  if (!session?.token) {
    return (
      <div className="track">
        <div className="center-state">
          <h2 style={{ fontSize: 19, color: 'var(--ink)' }}>No order to track</h2>
          <p>Scan the QR code on your table to start an order.</p>
          <Link className="btn btn-secondary" to="/">
            Back to the start
          </Link>
        </div>
      </div>
    );
  }

  if (state.loading) return <Loading label="Fetching your order…" />;
  if (!state.order) return <ErrorState message={state.error} onRetry={load} />;

  const order = state.order;
  const currency = state.restaurant?.currencySymbol || '₹';
  const cancelled = order.status === 'CANCELLED';
  const currentStep = STEPS.findIndex((step) => step.status === order.status);

  return (
    <div className="track">
      <div className="track-hero">
        <div className="order-no">
          {order.orderNumber} · Table {order.tableNumber}
        </div>
        <h2>{cancelled ? 'Order cancelled' : STEPS[Math.max(0, currentStep)].label}</h2>
        <p className="hint">
          {cancelled
            ? 'Please speak to a staff member if this was unexpected.'
            : STEPS[Math.max(0, currentStep)].blurb}
        </p>

        {!cancelled && (
          <div className="progress-steps">
            {STEPS.map((step, index) => (
              <div
                key={step.status}
                className={`progress-step ${index < currentStep ? 'done' : ''} ${
                  index === currentStep ? 'current' : ''
                }`}
              >
                <div className="dot">{index < currentStep ? '✓' : index + 1}</div>
                {step.label}
              </div>
            ))}
          </div>
        )}

        <p className="hint" style={{ marginTop: 14 }}>
          {live ? 'Updating live' : 'Reconnecting…'} · Placed {time(order.createdAt)}
          {order.servedAt ? ` · Served ${time(order.servedAt)}` : ''}
        </p>
      </div>

      <div className="card" style={{ padding: 18, marginTop: 16 }}>
        <h3 style={{ fontSize: 16, marginBottom: 10 }}>Your items</h3>

        {order.items.map((item) => (
          <div className="cart-line" key={item.id}>
            <div>
              <strong style={{ fontSize: 14 }}>
                {item.quantity} × {item.name}
              </strong>
              {item.note && <div className="hint">“{item.note}”</div>}
            </div>
            <span style={{ fontWeight: 600 }}>{money(item.lineTotal, currency)}</span>
          </div>
        ))}

        {order.note && (
          <p className="hint" style={{ marginTop: 10 }}>
            Note to kitchen: “{order.note}”
          </p>
        )}

        <div className="totals">
          <div className="totals-row">
            <span>Subtotal</span>
            <span>{money(order.subtotal, currency)}</span>
          </div>
          <div className="totals-row">
            <span>Tax ({order.taxPercent}%)</span>
            <span>{money(order.taxAmount, currency)}</span>
          </div>
          <div className="totals-row grand">
            <span>Total</span>
            <span>{money(order.totalAmount, currency)}</span>
          </div>
        </div>
      </div>

      {order.status === 'SERVED' && !order.isRated && (
        <RateDishes order={order} onDone={() => setState((c) => ({ ...c, order: { ...c.order, isRated: true } }))} />
      )}

      {order.isRated && (
        <div className="alert alert-ok" style={{ marginTop: 16 }}>
          <Stars value={5} /> Thanks — your feedback is on the menu now.
        </div>
      )}

      <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
        {session.tableCode && (
          <Link className="btn btn-secondary btn-block" to={`/t/${session.tableCode}`}>
            Order something else
          </Link>
        )}
        <p className="hint" style={{ textAlign: 'center' }}>
          Placed {dateTime(order.createdAt)}
        </p>
      </div>
    </div>
  );
}
