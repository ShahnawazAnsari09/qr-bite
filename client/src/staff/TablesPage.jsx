import { useCallback, useEffect, useState } from 'react';

import { Empty, ErrorState, Loading, Modal, useToast } from '../components/ui.jsx';
import { downloadTableQr, staffApi } from '../lib/api.js';
import { useApiCall, useAuth } from './auth.jsx';

/** RQ2 — tables and the QR codes printed for them. */
export default function TablesPage() {
  const { isAdmin, token } = useAuth();
  const call = useApiCall();
  const toast = useToast();

  const [state, setState] = useState({ loading: true, tables: [], error: null });
  const [dialog, setDialog] = useState(null); // 'single' | 'bulk'
  const [busy, setBusy] = useState(false);
  const [single, setSingle] = useState({ tableNumber: '', label: '', seats: 4 });
  const [bulk, setBulk] = useState({ from: '', to: '', seats: 4 });

  const load = useCallback(async () => {
    try {
      const tables = await call((t) => staffApi.listTables(t));
      setState({ loading: false, tables, error: null });
    } catch (err) {
      setState({ loading: false, tables: [], error: err.message });
    }
  }, [call]);

  useEffect(() => {
    load();
  }, [load]);

  const createSingle = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const table = await call((t) =>
        staffApi.createTable(t, {
          tableNumber: Number(single.tableNumber),
          label: single.label.trim(),
          seats: Number(single.seats),
        })
      );
      setState((current) => ({
        ...current,
        tables: [...current.tables, table].sort((a, b) => a.tableNumber - b.tableNumber),
      }));
      setDialog(null);
      setSingle({ tableNumber: '', label: '', seats: 4 });
      toast.success(`Table ${table.tableNumber} created with a fresh QR code`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const createBulk = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const created = await call((t) =>
        staffApi.createTablesBulk(t, {
          from: Number(bulk.from),
          to: Number(bulk.to),
          seats: Number(bulk.seats),
        })
      );
      setDialog(null);
      toast.success(`${created.length} table(s) created`);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async (table) => {
    if (
      !window.confirm(
        `Issue a new QR code for table ${table.tableNumber}? The printed card must be replaced — the old one will stop working.`
      )
    ) {
      return;
    }

    try {
      const updated = await call((t) => staffApi.regenerateQr(t, table._id));
      setState((current) => ({
        ...current,
        tables: current.tables.map((row) => (row._id === updated._id ? updated : row)),
      }));
      toast.success('New QR code issued. Reprint and replace the table card.');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (table) => {
    if (!window.confirm(`Delete table ${table.tableNumber}?`)) return;
    try {
      await call((t) => staffApi.deleteTable(t, table._id));
      setState((current) => ({
        ...current,
        tables: current.tables.filter((row) => row._id !== table._id),
      }));
      toast.success('Table deleted');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const download = async (table) => {
    try {
      await downloadTableQr(token, { id: table._id, tableNumber: table.tableNumber });
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (state.loading) return <Loading />;
  if (state.error) return <ErrorState message={state.error} onRetry={load} />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tables & QR codes</h1>
          <div className="sub">
            Print a card per table. Scanning it opens that table's menu — no app, no login.
          </div>
        </div>

        <div className="toolbar">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
            Print all
          </button>
          {isAdmin && (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog('bulk')}>
                Add a range
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setDialog('single')}>
                + Add table
              </button>
            </>
          )}
        </div>
      </div>

      {!state.tables.length ? (
        <div className="panel">
          <Empty>
            No tables yet.{' '}
            {isAdmin ? 'Add one to generate its QR code.' : 'Ask an admin to add them.'}
          </Empty>
        </div>
      ) : (
        <div className="qr-grid">
          {state.tables.map((table) => (
            <div className="qr-card" key={table._id}>
              {table.qrCodeUrl ? (
                <img src={table.qrCodeUrl} alt={`QR code for table ${table.tableNumber}`} />
              ) : (
                <div className="empty">No QR yet</div>
              )}

              <h3 style={{ marginTop: 10, fontSize: 16 }}>
                {table.label || `Table ${table.tableNumber}`}
              </h3>
              <div className="hint">{table.seats} seats</div>
              <div className="code">{table.url}</div>

              <div className="row-actions" style={{ justifyContent: 'center', marginTop: 10 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => download(table)}>
                  Download PNG
                </button>
                {isAdmin && (
                  <>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => regenerate(table)}
                    >
                      New code
                    </button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(table)}>
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {dialog === 'single' && (
        <Modal title="Add a table" onClose={() => setDialog(null)}>
          <form onSubmit={createSingle}>
            <label className="field">
              <span>Table number</span>
              <input
                className="input"
                type="number"
                min="1"
                max="999"
                value={single.tableNumber}
                onChange={(e) => setSingle({ ...single, tableNumber: e.target.value })}
                required
                autoFocus
              />
            </label>
            <label className="field">
              <span>Label (optional)</span>
              <input
                className="input"
                value={single.label}
                onChange={(e) => setSingle({ ...single, label: e.target.value })}
                placeholder="e.g. Terrace 2"
              />
            </label>
            <label className="field">
              <span>Seats</span>
              <input
                className="input"
                type="number"
                min="1"
                max="40"
                value={single.seats}
                onChange={(e) => setSingle({ ...single, seats: e.target.value })}
              />
            </label>
            <button type="submit" className="btn btn-block" disabled={busy}>
              {busy ? 'Creating…' : 'Create table'}
            </button>
          </form>
        </Modal>
      )}

      {dialog === 'bulk' && (
        <Modal title="Add a range of tables" onClose={() => setDialog(null)}>
          <form onSubmit={createBulk}>
            <p className="hint" style={{ marginBottom: 14 }}>
              Numbers that already exist are skipped, so this is safe to re-run.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label className="field">
                <span>From</span>
                <input
                  className="input"
                  type="number"
                  min="1"
                  value={bulk.from}
                  onChange={(e) => setBulk({ ...bulk, from: e.target.value })}
                  required
                  autoFocus
                />
              </label>
              <label className="field">
                <span>To</span>
                <input
                  className="input"
                  type="number"
                  min="1"
                  value={bulk.to}
                  onChange={(e) => setBulk({ ...bulk, to: e.target.value })}
                  required
                />
              </label>
            </div>
            <label className="field">
              <span>Seats per table</span>
              <input
                className="input"
                type="number"
                min="1"
                max="40"
                value={bulk.seats}
                onChange={(e) => setBulk({ ...bulk, seats: e.target.value })}
              />
            </label>
            <button type="submit" className="btn btn-block" disabled={busy}>
              {busy ? 'Creating…' : 'Create tables'}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
