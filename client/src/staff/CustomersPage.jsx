import { useCallback, useEffect, useState } from 'react';

import { Empty, ErrorState, Loading, Modal, useToast } from '../components/ui.jsx';
import { staffApi } from '../lib/api.js';
import { dateTime, money } from '../lib/format.js';
import { useApiCall, useAuth } from './auth.jsx';

/**
 * RQ9 / UC12 / TC13 — the customer database built up from orders, and the
 * WhatsApp outreach on top of it.
 *
 * Broadcasting is admin-only on the server; the UI hides it for floor staff
 * rather than letting them hit a 403. Opted-out customers are skipped by the
 * API even when "everyone" is selected.
 */
export default function CustomersPage() {
  const { isAdmin, currency } = useAuth();
  const call = useApiCall();
  const toast = useToast();

  const [tab, setTab] = useState('customers');
  const [query, setQuery] = useState({ search: '', sort: 'recent', page: 1 });
  const [state, setState] = useState({ loading: true, customers: [], meta: null, error: null });
  const [messages, setMessages] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState({ body: '', type: 'PROMOTION' });
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    try {
      const payload = await call((token) =>
        staffApi.listCustomers(token, {
          search: query.search || undefined,
          sort: query.sort,
          page: query.page,
          limit: 20,
        })
      );
      setState({ loading: false, customers: payload.data, meta: payload.meta, error: null });
    } catch (err) {
      setState({ loading: false, customers: [], meta: null, error: err.message });
    }
  }, [call, query]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMessages = useCallback(async () => {
    try {
      const payload = await call((token) => staffApi.messageLog(token, { limit: 50 }));
      setMessages(payload.data);
    } catch (err) {
      toast.error(err.message);
    }
  }, [call, toast]);

  useEffect(() => {
    if (tab === 'messages' && !messages) loadMessages();
  }, [tab, messages, loadMessages]);

  const toggleOptIn = async (customer) => {
    try {
      const updated = await call((token) => staffApi.toggleOptIn(token, customer.id));
      setState((current) => ({
        ...current,
        customers: current.customers.map((row) => (row.id === updated.id ? updated : row)),
      }));
      toast.success(
        `${updated.name} ${updated.marketingOptIn ? 'will receive' : 'will no longer receive'} offers`
      );
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggleSelected = (id) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = async (event) => {
    event.preventDefault();
    setSending(true);
    try {
      const result = await call((token) =>
        staffApi.broadcast(token, {
          body: draft.body.trim(),
          type: draft.type,
          ...(selected.size ? { customerIds: [...selected] } : { allCustomers: true }),
        })
      );
      toast.success(
        `Sent to ${result.sent} of ${result.total} customer(s)` +
          (result.failed ? ` · ${result.failed} failed` : '')
      );
      setComposing(false);
      setDraft({ body: '', type: 'PROMOTION' });
      setSelected(new Set());
      setMessages(null); // force the log to refetch next time it is opened
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Customers</h1>
          <div className="sub">
            Built automatically from orders — every diner who checks out is saved once, by phone
            number.
          </div>
        </div>

        <div className="toolbar">
          <button
            type="button"
            className={`btn btn-sm ${tab === 'customers' ? '' : 'btn-secondary'}`}
            onClick={() => setTab('customers')}
          >
            Customers
          </button>
          <button
            type="button"
            className={`btn btn-sm ${tab === 'messages' ? '' : 'btn-secondary'}`}
            onClick={() => setTab('messages')}
          >
            WhatsApp log
          </button>
          {isAdmin && (
            <button type="button" className="btn btn-sm" onClick={() => setComposing(true)}>
              Send offer
            </button>
          )}
        </div>
      </div>

      {tab === 'customers' && (
        <>
          <div className="toolbar" style={{ marginBottom: 14 }}>
            <input
              className="input"
              style={{ maxWidth: 280 }}
              placeholder="Search by name or phone number"
              value={query.search}
              onChange={(e) => setQuery({ ...query, search: e.target.value, page: 1 })}
            />
            <select
              className="select"
              style={{ width: 'auto' }}
              value={query.sort}
              onChange={(e) => setQuery({ ...query, sort: e.target.value, page: 1 })}
            >
              <option value="recent">Most recent visit</option>
              <option value="spend">Highest spend</option>
              <option value="orders">Most orders</option>
            </select>
            {selected.size > 0 && (
              <span className="hint">
                {selected.size} selected —{' '}
                <button type="button" className="link-btn" onClick={() => setSelected(new Set())}>
                  clear
                </button>
              </span>
            )}
          </div>

          {state.loading && !state.customers.length ? (
            <Loading />
          ) : state.error ? (
            <ErrorState message={state.error} onRetry={load} />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    {isAdmin && <th style={{ width: 36 }} />}
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Orders</th>
                    <th>Total spend</th>
                    <th>Last visit</th>
                    <th>Offers</th>
                  </tr>
                </thead>
                <tbody>
                  {state.customers.map((customer) => (
                    <tr key={customer.id}>
                      {isAdmin && (
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.has(customer.id)}
                            onChange={() => toggleSelected(customer.id)}
                            aria-label={`Select ${customer.name}`}
                          />
                        </td>
                      )}
                      <td>
                        <strong>{customer.name}</strong>
                        <div className="hint">{customer.visitCount} visit(s)</div>
                      </td>
                      <td>{customer.phone}</td>
                      <td>{customer.orderCount}</td>
                      <td>{money(customer.totalSpend, currency)}</td>
                      <td className="hint">{dateTime(customer.lastOrderAt) || '—'}</td>
                      <td>
                        <button
                          type="button"
                          className={`badge badge-${customer.marketingOptIn ? 'SERVED' : 'CANCELLED'}`}
                          style={{ border: 'none', cursor: 'pointer' }}
                          onClick={() => toggleOptIn(customer)}
                          title="Toggle marketing consent"
                        >
                          {customer.marketingOptIn ? 'Opted in' : 'Opted out'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!state.customers.length && <Empty>No customers match that search.</Empty>}
            </div>
          )}

          {state.meta && state.meta.pages > 1 && (
            <div className="toolbar" style={{ marginTop: 14, justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={query.page <= 1}
                onClick={() => setQuery((c) => ({ ...c, page: c.page - 1 }))}
              >
                Previous
              </button>
              <span className="hint">
                Page {state.meta.page} of {state.meta.pages} · {state.meta.total} customers
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={query.page >= state.meta.pages}
                onClick={() => setQuery((c) => ({ ...c, page: c.page + 1 }))}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {tab === 'messages' &&
        (!messages ? (
          <Loading label="Loading the message log…" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Message</th>
                  <th>Status</th>
                  <th>Sent</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((message) => (
                  <tr key={message.id}>
                    <td>
                      <strong>{message.customerName}</strong>
                      <div className="hint">{message.maskedPhone}</div>
                    </td>
                    <td>
                      <span className="badge">{message.type.replace(/_/g, ' ').toLowerCase()}</span>
                    </td>
                    <td style={{ maxWidth: 380 }}>
                      <div className="hint">{message.content}</div>
                    </td>
                    <td>
                      <span
                        className={`badge badge-${
                          message.deliveryStatus === 'SENT' ? 'SERVED' : 'CANCELLED'
                        }`}
                      >
                        {message.deliveryStatus.toLowerCase()}
                      </span>
                      {message.error && <div className="hint">{message.error}</div>}
                    </td>
                    <td className="hint">{dateTime(message.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!messages.length && <Empty>No WhatsApp messages have been sent yet.</Empty>}
          </div>
        ))}

      {composing && (
        <Modal title="Send a WhatsApp offer" onClose={() => setComposing(false)}>
          <form onSubmit={send}>
            <div className="alert alert-info" style={{ marginBottom: 16 }}>
              {selected.size
                ? `Sending to the ${selected.size} selected customer(s).`
                : 'Sending to every opted-in customer.'}{' '}
              Anyone who has opted out is skipped automatically.
            </div>

            <label className="field">
              <span>Type</span>
              <select
                className="select"
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value })}
              >
                <option value="PROMOTION">Promotion</option>
                <option value="GREETING">Greeting</option>
              </select>
            </label>

            <label className="field">
              <span>Message</span>
              <textarea
                className="textarea"
                style={{ minHeight: 120 }}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                placeholder="e.g. Flat 20% off this weekend on all biryanis!"
                maxLength={1000}
                required
              />
              <span className="hint">{draft.body.trim().length}/1000 · at least 5 characters</span>
            </label>

            <button
              type="submit"
              className="btn btn-block"
              disabled={sending || draft.body.trim().length < 5}
            >
              {sending ? 'Sending…' : 'Send campaign'}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
