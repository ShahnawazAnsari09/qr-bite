import { useCallback, useEffect, useState } from 'react';

import { Empty, ErrorState, Loading, Stars } from '../components/ui.jsx';
import { staffApi } from '../lib/api.js';
import { money, STATUS_LABEL } from '../lib/format.js';
import { useApiCall, useAuth } from './auth.jsx';

/**
 * RQ11 / UC13 / TC14 — the owner's reporting screen.
 *
 * Every number here comes pre-aggregated from /reports/summary, so this file
 * only lays it out. Cancelled orders are already excluded from the revenue
 * figures by the server; the status panel is the one place they still show.
 *
 * The trend is a plain CSS column chart rather than a charting library — it is
 * one series of daily totals, and the dependency would outweigh the drawing.
 */

const RANGES = [
  { days: 7, label: 'Last 7 days' },
  { days: 14, label: 'Last 14 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
];

/** "12 Aug" — short enough to sit under a narrow column. */
function dayLabel(iso) {
  const [, month, day] = iso.split('-');
  const name = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    Number(month) - 1
  ];
  return `${Number(day)} ${name}`;
}

/**
 * Daily revenue as columns. Over a long range the labels would overlap, so only
 * every nth one is drawn — the rest stay reachable through the column tooltip.
 */
function TrendChart({ trend, currency }) {
  const peak = Math.max(...trend.map((point) => point.revenue), 0);
  const every = Math.ceil(trend.length / 10);

  if (!peak) return <Empty>No revenue in this period yet.</Empty>;

  return (
    <div className="trend">
      {trend.map((point, index) => (
        <div
          key={point.date}
          className="trend-col"
          title={`${dayLabel(point.date)} · ${money(point.revenue, currency)} from ${point.orders} order(s)`}
        >
          <div className="trend-bar" style={{ height: `${(point.revenue / peak) * 100}%` }} />
          <span className="day">
            {index % every === 0 || index === trend.length - 1 ? dayLabel(point.date) : ' '}
          </span>
        </div>
      ))}
    </div>
  );
}

/** A labelled row with a proportional bar underneath it. */
function BarRow({ label, value, share }) {
  return (
    <div className="bar-row">
      <span>{label}</span>
      <span className="hint">{value}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${Math.max(share * 100, 2)}%` }} />
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { currency, restaurant } = useAuth();
  const call = useApiCall();

  const [days, setDays] = useState(7);
  const [state, setState] = useState({ loading: true, report: null, error: null });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    try {
      const report = await call((token) => staffApi.reportSummary(token, days));
      setState({ loading: false, report, error: null });
    } catch (err) {
      setState({ loading: false, report: null, error: err.message });
    }
  }, [call, days]);

  useEffect(() => {
    load();
  }, [load]);

  const { loading, report, error } = state;

  if (loading && !report) return <Loading label="Crunching the numbers…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!report) return null;

  const topQuantity = Math.max(...report.topSelling.map((item) => item.quantity), 1);
  const whatsappTotal = Object.values(report.whatsapp).reduce((sum, n) => sum + n, 0);
  const range = RANGES.find((r) => r.days === report.days);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <div className="sub">
            {restaurant?.name || 'Your restaurant'} · {(range?.label || `Last ${report.days} days`).toLowerCase()}.
            Cancelled orders are left out of every revenue figure.
          </div>
        </div>

        <div className="toolbar">
          <select
            className="select"
            style={{ width: 'auto' }}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Reporting period"
          >
            {RANGES.map((option) => (
              <option key={option.days} value={option.days}>
                {option.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="label">Today</div>
          <div className="value">{money(report.today.revenue, currency)}</div>
          <div className="foot">{report.today.orders} order(s) so far</div>
        </div>
        <div className="stat">
          <div className="label">Period revenue</div>
          <div className="value">{money(report.period.revenue, currency)}</div>
          <div className="foot">{report.period.orders} order(s) in {report.days} days</div>
        </div>
        <div className="stat">
          <div className="label">Average order</div>
          <div className="value">{money(report.period.averageOrderValue, currency)}</div>
          <div className="foot">Across the whole period</div>
        </div>
        <div className="stat">
          <div className="label">Feedback</div>
          <div className="value">
            {report.feedback.count ? report.feedback.averageStars.toFixed(1) : '—'}
          </div>
          <div className="foot">{report.feedback.count} rating(s) left</div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 18 }}>
        <h3>Revenue per day</h3>
        <TrendChart trend={report.trend} currency={currency} />
      </div>

      <div className="split" style={{ marginBottom: 18 }}>
        <div className="panel">
          <h3>Best sellers</h3>
          {report.topSelling.map((item) => (
            <BarRow
              key={item.menuItemId}
              label={item.name}
              value={`${item.quantity} sold · ${money(item.revenue, currency)}`}
              share={item.quantity / topQuantity}
            />
          ))}
          {!report.topSelling.length && <Empty>No dishes have sold in this period.</Empty>}
        </div>

        <div className="panel">
          <h3>Best rated</h3>
          {report.topRated.map((item) => (
            <div key={item._id} className="bar-row">
              <span>{item.name}</span>
              <Stars value={item.avgRating} count={item.ratingCount} />
            </div>
          ))}
          {!report.topRated.length && (
            <Empty>Ratings appear here once diners rate a served order.</Empty>
          )}
        </div>
      </div>

      <div className="split">
        <div className="panel">
          <h3>Orders by status</h3>
          {Object.entries(report.statusCounts).map(([status, count]) => (
            <div key={status} className="bar-row">
              <span className={`badge badge-${status}`}>{STATUS_LABEL[status] || status}</span>
              <span>{count}</span>
            </div>
          ))}
          <div className="hint" style={{ marginTop: 10 }}>
            {report.snapshot.activeOrders} order(s) open right now across{' '}
            {report.snapshot.tableCount} table(s), from a menu of {report.snapshot.menuCount} live
            dish(es).
          </div>
        </div>

        <div className="panel">
          <h3>Customers &amp; WhatsApp</h3>
          <div className="bar-row">
            <span>Total customers</span>
            <span>{report.customers.total}</span>
          </div>
          <div className="bar-row">
            <span>New in this period</span>
            <span>{report.customers.new}</span>
          </div>
          {Object.entries(report.whatsapp).map(([status, count]) => (
            <div key={status} className="bar-row">
              <span className="hint">Messages {status.toLowerCase()}</span>
              <span>{count}</span>
            </div>
          ))}
          {!whatsappTotal && (
            <div className="hint" style={{ marginTop: 8 }}>
              No WhatsApp messages have gone out in this period.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
