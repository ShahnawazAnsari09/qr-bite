import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="landing">
      <div className="landing-inner">
        <h1>Page not found</h1>
        <p style={{ color: 'var(--ink-2)' }}>
          That link does not lead anywhere. If you scanned a table QR code and reached this page,
          please ask a staff member — the code may need reprinting.
        </p>
        <Link className="btn btn-secondary" to="/">
          Back to the start
        </Link>
      </div>
    </div>
  );
}
