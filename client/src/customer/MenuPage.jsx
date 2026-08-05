import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ErrorState, Loading, useToast } from '../components/ui.jsx';
import { ApiError, publicApi } from '../lib/api.js';
import { KEYS, money, store } from '../lib/format.js';
import CheckoutSheet from './CheckoutSheet.jsx';
import DishCard from './DishCard.jsx';
import { useCart } from './useCart.js';

const SERVICE_BUTTONS = [
  { type: 'CALL_WAITER', label: 'Call waiter' },
  { type: 'WATER', label: 'Water' },
  { type: 'BILL', label: 'Ask for bill' },
];

/**
 * UC1-UC3 — the page a table's QR code opens: the live menu, a cart, and
 * checkout. The table code in the URL is the only credential a diner needs.
 */
export default function MenuPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [activeCategory, setActiveCategory] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [calling, setCalling] = useState(null);

  const sectionRefs = useRef({});
  const cart = useCart(code);

  const load = useCallback(
    (signal) =>
      publicApi
        .getTableMenu(code, signal)
        .then((data) => {
          setState({ loading: false, data, error: null });
          setActiveCategory((current) => current ?? data.categories[0]?.name ?? null);
          return data;
        })
        .catch((err) => {
          if (err.name === 'AbortError') return null;
          setState({ loading: false, data: null, error: err.message });
          return null;
        }),
    [code]
  );

  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, data: null, error: null });
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  /**
   * Staff can change the menu while a diner is reading it. Refetching whenever
   * the tab comes back into view is enough to keep an unavailable dish from
   * being added, without polling the server from every phone in the room.
   */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const data = state.data;
  const currency = data?.restaurant?.currencySymbol || '₹';

  const availableIds = useMemo(() => {
    if (!data) return null;
    return new Set(data.categories.flatMap((category) => category.items.map((item) => item._id)));
  }, [data]);

  // Drop cart lines for dishes that went off the menu since they were added.
  const { reconcile } = cart;
  useEffect(() => {
    if (!availableIds) return;
    const removed = reconcile(availableIds);
    if (removed.length) {
      toast.error(
        `${removed.map((line) => line.name).join(', ')} ${
          removed.length > 1 ? 'are' : 'is'
        } no longer available and left your cart.`
      );
    }
  }, [availableIds, reconcile, toast]);

  const scrollToCategory = (name) => {
    setActiveCategory(name);
    sectionRefs.current[name]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const callService = async (type, label) => {
    setCalling(type);
    try {
      await publicApi.callService(code, type);
      toast.success(`${label} — a staff member has been notified.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCalling(null);
    }
  };

  const placeOrder = async ({ customer, note }) => {
    setSubmitting(true);
    setServerErrors({});
    try {
      const result = await publicApi.placeOrder({
        tableCode: code,
        customer,
        note,
        items: cart.lines.map((line) => ({
          menuItemId: line.menuItemId,
          quantity: line.quantity,
          note: line.note,
        })),
      });

      // The scoped token is the diner's only proof of ownership for this order.
      store.set(KEYS.order, {
        token: result.orderToken,
        orderId: result.order.id,
        orderNumber: result.order.orderNumber,
        tableCode: code,
      });

      cart.clear();
      setCheckoutOpen(false);
      navigate('/order', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setServerErrors(err.fieldErrors);
        toast.error('Please check the highlighted fields.');
      } else {
        toast.error(err.message);
        // A 409 means a dish sold out between adding and checkout — refresh so
        // the menu the diner sees matches what the kitchen will accept.
        if (err instanceof ApiError && err.status === 409) load();
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (state.loading) return <Loading label="Loading the menu…" />;
  if (state.error) {
    return (
      <div className="diner">
        <ErrorState message={state.error} onRetry={() => load()} />
      </div>
    );
  }

  const openOrder = store.get(KEYS.order);

  return (
    <div className="diner">
      <header className="diner-header">
        <h1>{data.restaurant.name}</h1>
        <div className="table-line">
          {data.table.displayName || `Table ${data.table.tableNumber}`}
          {data.restaurant.address ? ` · ${data.restaurant.address}` : ''}
        </div>

        <div className="diner-actions">
          {SERVICE_BUTTONS.map((button) => (
            <button
              key={button.type}
              type="button"
              className="chip"
              disabled={calling === button.type}
              onClick={() => callService(button.type, button.label)}
            >
              {calling === button.type ? 'Sending…' : button.label}
            </button>
          ))}

          {openOrder?.token && (
            <button type="button" className="chip" onClick={() => navigate('/order')}>
              Track {openOrder.orderNumber || 'my order'}
            </button>
          )}
        </div>
      </header>

      {data.categories.length > 1 && (
        <nav className="category-rail" aria-label="Menu categories">
          {data.categories.map((category) => (
            <button
              key={category.name}
              type="button"
              className={category.name === activeCategory ? 'is-active' : ''}
              onClick={() => scrollToCategory(category.name)}
            >
              {category.name}
            </button>
          ))}
        </nav>
      )}

      {data.categories.length === 0 && (
        <div className="center-state">
          <p>The menu is being updated. Please ask a staff member.</p>
        </div>
      )}

      {data.categories.map((category) => (
        <section
          className="menu-section"
          key={category.name}
          ref={(node) => {
            sectionRefs.current[category.name] = node;
          }}
        >
          <h2>{category.name}</h2>
          {category.items.map((item) => (
            <DishCard
              key={item._id}
              item={item}
              currency={currency}
              quantity={cart.quantityOf(item._id)}
              onAdd={cart.add}
              onQuantity={(quantity) => cart.setQuantity(item._id, quantity)}
            />
          ))}
        </section>
      ))}

      {cart.totals.count > 0 && (
        <div className="cart-bar">
          <button type="button" className="btn btn-block" onClick={() => setCheckoutOpen(true)}>
            <span>
              {cart.totals.count} item{cart.totals.count > 1 ? 's' : ''} ·{' '}
              {money(cart.totals.subtotal, currency)}
            </span>
            <span>Review order →</span>
          </button>
        </div>
      )}

      {checkoutOpen && (
        <CheckoutSheet
          lines={cart.lines}
          restaurant={data.restaurant}
          onQuantity={cart.setQuantity}
          onNote={cart.setNote}
          onClose={() => setCheckoutOpen(false)}
          onPlace={placeOrder}
          submitting={submitting}
          serverErrors={serverErrors}
        />
      )}
    </div>
  );
}
