import { useMemo, useState } from 'react';

import { Modal } from '../components/ui.jsx';
import { KEYS, money, store } from '../lib/format.js';

/**
 * Cart review and checkout (UC3). Name and phone are required because the
 * restaurant's WhatsApp confirmations and later offers are built on them —
 * the same reason the field labels say what the number is used for.
 */
export default function CheckoutSheet({
  lines,
  restaurant,
  onQuantity,
  onNote,
  onClose,
  onPlace,
  submitting,
  serverErrors,
}) {
  const remembered = store.get(KEYS.diner, { name: '', phone: '' });
  const [name, setName] = useState(remembered.name || '');
  const [phone, setPhone] = useState(remembered.phone || '');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);

  const currency = restaurant.currencySymbol || '₹';

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
    const taxAmount = (subtotal * (restaurant.taxPercent || 0)) / 100;
    const round2 = (n) => Math.round(n * 100) / 100;
    return { subtotal: round2(subtotal), taxAmount: round2(taxAmount), total: round2(subtotal + taxAmount) };
  }, [lines, restaurant.taxPercent]);

  // Mirrors the server's rules so the diner is corrected before a round trip.
  const localErrors = {
    name: name.trim().length < 2 ? 'Please enter your name' : null,
    phone: phone.replace(/\D/g, '').length < 8 ? 'Enter a valid phone number' : null,
  };
  const errors = { ...localErrors, ...serverErrors };
  const invalid = Boolean(localErrors.name || localErrors.phone);

  const submit = (event) => {
    event.preventDefault();
    setTouched(true);
    if (invalid || submitting) return;

    store.set(KEYS.diner, { name: name.trim(), phone: phone.trim() });
    onPlace({ customer: { name: name.trim(), phone: phone.trim() }, note: note.trim() });
  };

  return (
    <Modal title="Your order" onClose={onClose}>
      <div>
        {lines.map((line) => (
          <div className="cart-line" key={line.menuItemId}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: 14 }}>{line.name}</strong>
              <div className="hint">
                {money(line.price, currency)} each · {money(line.price * line.quantity, currency)}
              </div>
              <input
                className="input"
                style={{ marginTop: 7, fontSize: 14, padding: '8px 10px' }}
                placeholder="Any request for this dish? (optional)"
                maxLength={200}
                value={line.note}
                onChange={(e) => onNote(line.menuItemId, e.target.value)}
              />
            </div>

            <div className="stepper" style={{ flex: 'none' }}>
              <button type="button" onClick={() => onQuantity(line.menuItemId, line.quantity - 1)} aria-label="One less">
                −
              </button>
              <span>{line.quantity}</span>
              <button type="button" onClick={() => onQuantity(line.menuItemId, line.quantity + 1)} aria-label="One more">
                +
              </button>
            </div>
          </div>
        ))}

        <div className="totals">
          <div className="totals-row">
            <span>Subtotal</span>
            <span>{money(totals.subtotal, currency)}</span>
          </div>
          <div className="totals-row">
            <span>Tax ({restaurant.taxPercent || 0}%)</span>
            <span>{money(totals.taxAmount, currency)}</span>
          </div>
          <div className="totals-row grand">
            <span>Total</span>
            <span>{money(totals.total, currency)}</span>
          </div>
          <p className="hint">The kitchen confirms the final amount on your bill.</p>
        </div>
      </div>

      <form onSubmit={submit} style={{ marginTop: 20 }} noValidate>
        <label className="field">
          <span>Your name</span>
          <input
            className={`input ${touched && errors.name ? 'has-error' : ''}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Aarav Sharma"
            autoComplete="name"
            maxLength={60}
            required
          />
          {touched && errors.name && <span className="field-error">{errors.name}</span>}
        </label>

        <label className="field">
          <span>WhatsApp number</span>
          <input
            className={`input ${touched && errors.phone ? 'has-error' : ''}`}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit mobile number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={20}
            required
          />
          {touched && errors.phone ? (
            <span className="field-error">{errors.phone}</span>
          ) : (
            <span className="hint">We send your order confirmation here.</span>
          )}
        </label>

        <label className="field">
          <span>Note for the kitchen (optional)</span>
          <textarea
            className="textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Allergies, how spicy, anything else"
            maxLength={300}
          />
        </label>

        <button type="submit" className="btn btn-block" disabled={submitting || (touched && invalid)}>
          {submitting ? 'Sending to the kitchen…' : `Place order · ${money(totals.total, currency)}`}
        </button>
      </form>
    </Modal>
  );
}
