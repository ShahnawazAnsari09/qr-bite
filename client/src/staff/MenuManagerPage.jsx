import { useCallback, useEffect, useMemo, useState } from 'react';

import { Empty, ErrorState, Loading, Modal, Stars, useToast } from '../components/ui.jsx';
import { ApiError, staffApi } from '../lib/api.js';
import { dateTime, money } from '../lib/format.js';
import { useApiCall, useAuth } from './auth.jsx';

const BLANK = {
  name: '',
  description: '',
  price: '',
  category: '',
  imageUrl: '',
  isVegetarian: true,
  spiceLevel: 'none',
  preparationMinutes: 15,
  sortOrder: 0,
};

/** UC8 / TC10 — add or edit a dish. */
function ItemForm({ item, categories, onClose, onSave }) {
  const toast = useToast();
  const [form, setForm] = useState(() => (item ? { ...BLANK, ...item } : BLANK));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await onSave({
        name: form.name.trim(),
        description: form.description.trim(),
        price: Number(form.price),
        category: form.category.trim(),
        imageUrl: form.imageUrl.trim(),
        isVegetarian: Boolean(form.isVegetarian),
        spiceLevel: form.spiceLevel,
        preparationMinutes: Number(form.preparationMinutes) || 0,
        sortOrder: Number(form.sortOrder) || 0,
      });
      // The parent closes the sheet on success, so no state update here.
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) setErrors(err.fieldErrors);
      else toast.error(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal title={item ? `Edit ${item.name}` : 'Add a dish'} onClose={onClose}>
      <form onSubmit={submit}>
        <label className="field">
          <span>Name</span>
          <input
            className={`input ${errors.name ? 'has-error' : ''}`}
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            required
            autoFocus
          />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </label>

        <label className="field">
          <span>Description</span>
          <textarea
            className="textarea"
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            maxLength={500}
          />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label className="field">
            <span>Price</span>
            <input
              className={`input ${errors.price ? 'has-error' : ''}`}
              type="number"
              min="0"
              step="1"
              value={form.price}
              onChange={(e) => set({ price: e.target.value })}
              required
            />
            {errors.price && <span className="field-error">{errors.price}</span>}
          </label>

          <label className="field">
            <span>Category</span>
            <input
              className={`input ${errors.category ? 'has-error' : ''}`}
              value={form.category}
              onChange={(e) => set({ category: e.target.value })}
              list="menu-categories"
              required
            />
            <datalist id="menu-categories">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
            {errors.category && <span className="field-error">{errors.category}</span>}
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label className="field">
            <span>Spice level</span>
            <select
              className="select"
              value={form.spiceLevel}
              onChange={(e) => set({ spiceLevel: e.target.value })}
            >
              {['none', 'mild', 'medium', 'hot'].map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Prep time (minutes)</span>
            <input
              className="input"
              type="number"
              min="0"
              max="240"
              value={form.preparationMinutes}
              onChange={(e) => set({ preparationMinutes: e.target.value })}
            />
          </label>
        </div>

        <label className="field">
          <span>Image URL (optional)</span>
          <input
            className="input"
            value={form.imageUrl}
            onChange={(e) => set({ imageUrl: e.target.value })}
            placeholder="https://…"
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 18 }}>
          <input
            type="checkbox"
            checked={Boolean(form.isVegetarian)}
            onChange={(e) => set({ isVegetarian: e.target.checked })}
          />
          <span>Vegetarian</span>
        </label>

        <button type="submit" className="btn btn-block" disabled={saving}>
          {saving ? 'Saving…' : item ? 'Save changes' : 'Add to menu'}
        </button>
      </form>
    </Modal>
  );
}

export default function MenuManagerPage() {
  const { isAdmin, currency } = useAuth();
  const call = useApiCall();
  const toast = useToast();

  const [state, setState] = useState({ loading: true, items: [], error: null });
  const [feedback, setFeedback] = useState(null);
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new
  const [tab, setTab] = useState('menu');

  const load = useCallback(async () => {
    try {
      const items = await call((token) => staffApi.listMenu(token));
      setState({ loading: false, items, error: null });
    } catch (err) {
      setState({ loading: false, items: [], error: err.message });
    }
  }, [call]);

  useEffect(() => {
    load();
  }, [load]);

  // Ratings are a second, heavier query — only fetched when that tab is opened.
  useEffect(() => {
    if (tab !== 'feedback' || feedback) return;
    call((token) => staffApi.ratingsOverview(token))
      .then(setFeedback)
      .catch((err) => toast.error(err.message));
  }, [tab, feedback, call, toast]);

  const categories = useMemo(
    () => [...new Set(state.items.map((item) => item.category))].sort(),
    [state.items]
  );

  const grouped = useMemo(() => {
    const map = new Map();
    state.items.forEach((item) => {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category).push(item);
    });
    return [...map.entries()];
  }, [state.items]);

  const save = async (payload) => {
    const isEdit = Boolean(editing?._id);
    const saved = await call((token) =>
      isEdit
        ? staffApi.updateMenuItem(token, editing._id, payload)
        : staffApi.createMenuItem(token, payload)
    );

    setState((current) => ({
      ...current,
      items: isEdit
        ? current.items.map((item) => (item._id === saved._id ? saved : item))
        : [...current.items, saved],
    }));
    setEditing(undefined);
    toast.success(isEdit ? `${saved.name} updated` : `${saved.name} added to the menu`);
  };

  const toggle = async (item) => {
    try {
      const updated = await call((token) => staffApi.toggleMenuItem(token, item._id));
      setState((current) => ({
        ...current,
        items: current.items.map((row) => (row._id === updated._id ? updated : row)),
      }));
      toast.success(`${updated.name} is now ${updated.isActive ? 'available' : 'hidden from diners'}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete ${item.name} permanently?`)) return;
    try {
      await call((token) => staffApi.deleteMenuItem(token, item._id));
      setState((current) => ({ ...current, items: current.items.filter((row) => row._id !== item._id) }));
      toast.success(`${item.name} deleted`);
    } catch (err) {
      // The API refuses to delete a dish with history and says to deactivate it.
      toast.error(err.message);
    }
  };

  if (state.loading) return <Loading />;
  if (state.error) return <ErrorState message={state.error} onRetry={load} />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Menu</h1>
          <div className="sub">
            {state.items.filter((i) => i.isActive).length} of {state.items.length} dishes visible to
            diners. Changes show on the customer menu straight away.
          </div>
        </div>

        <div className="toolbar">
          <button
            type="button"
            className={`btn btn-sm ${tab === 'menu' ? '' : 'btn-secondary'}`}
            onClick={() => setTab('menu')}
          >
            Dishes
          </button>
          <button
            type="button"
            className={`btn btn-sm ${tab === 'feedback' ? '' : 'btn-secondary'}`}
            onClick={() => setTab('feedback')}
          >
            Ratings
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setEditing(null)}>
            + Add dish
          </button>
        </div>
      </div>

      {tab === 'menu' &&
        grouped.map(([category, items]) => (
          <section key={category} style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: 15, marginBottom: 10 }}>{category}</h2>

            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Dish</th>
                    <th>Price</th>
                    <th>Rating</th>
                    <th>Ordered</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item._id} className={item.isActive ? '' : 'muted-row'}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className={item.isVegetarian ? 'veg-mark' : 'nonveg-mark'} />
                          <div>
                            <strong>{item.name}</strong>
                            {item.description && (
                              <div className="hint" style={{ maxWidth: 380 }}>
                                {item.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>{money(item.price, currency)}</td>
                      <td>
                        {item.ratingCount > 0 ? (
                          <Stars value={item.avgRating} count={item.ratingCount} />
                        ) : (
                          <span className="hint">—</span>
                        )}
                      </td>
                      <td>{item.orderCount}</td>
                      <td>
                        <span className={`badge badge-${item.isActive ? 'SERVED' : 'CANCELLED'}`}>
                          {item.isActive ? 'Available' : 'Hidden'}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => toggle(item)}
                          >
                            {item.isActive ? 'Mark unavailable' : 'Make available'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setEditing(item)}
                          >
                            Edit
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => remove(item)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

      {tab === 'menu' && !state.items.length && (
        <div className="panel">
          <Empty>No dishes yet. Add the first one to open the menu.</Empty>
        </div>
      )}

      {tab === 'feedback' &&
        (!feedback ? (
          <Loading label="Loading feedback…" />
        ) : (
          <div className="split">
            <div className="panel">
              <h3>Recent reviews</h3>
              {feedback.recentReviews.length === 0 && <Empty>No reviews yet.</Empty>}
              {feedback.recentReviews.map((review) => (
                <div key={review.id} className="rate-row">
                  <div>
                    <strong style={{ fontSize: 14 }}>{review.dish}</strong>
                    {review.comment && (
                      <p className="hint" style={{ marginTop: 2 }}>
                        “{review.comment}” — {review.by}
                      </p>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Stars value={review.stars} />
                    <div className="hint">{dateTime(review.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="panel">
              <h3>Best rated dishes</h3>
              {feedback.items
                .filter((item) => item.ratingCount > 0)
                .map((item) => (
                  <div key={item._id} className="bar-row">
                    <span>{item.name}</span>
                    <Stars value={item.avgRating} count={item.ratingCount} />
                  </div>
                ))}
              {!feedback.items.some((item) => item.ratingCount > 0) && (
                <Empty>Ratings appear here once diners rate a served order.</Empty>
              )}
            </div>
          </div>
        ))}

      {editing !== undefined && (
        <ItemForm
          item={editing}
          categories={categories}
          onClose={() => setEditing(undefined)}
          onSave={save}
        />
      )}
    </>
  );
}
