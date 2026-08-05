import { Link } from 'react-router-dom';

import { KEYS, store } from '../lib/format.js';

/**
 * Nobody should normally land here — diners arrive at /t/:code from a QR code
 * and staff bookmark /staff. It exists so the root URL explains itself during
 * the demo, and offers a way back to an order still in progress.
 */
export default function Landing() {
  const openOrder = store.get(KEYS.order);

  return (
    <div className="landing">
      <div className="landing-inner">
        <h1>QR-Bite</h1>
        <p style={{ color: 'var(--ink-2)' }}>
          Scan the QR code on your table to browse the menu, order, and rate your meal — no app to
          install.
        </p>

        {openOrder?.token && (
          <Link className="btn" to="/order">
            Track my order
          </Link>
        )}

        <Link className="btn btn-secondary" to="/staff">
          Staff dashboard
        </Link>

        <p className="hint">
          Restaurant staff can print table QR codes from the dashboard under <strong>Tables</strong>.
        </p>
      </div>
    </div>
  );
}
