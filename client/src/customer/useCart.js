import { useCallback, useEffect, useMemo, useState } from 'react';

import { KEYS, store } from '../lib/format.js';

/**
 * The cart, kept per table code and mirrored into localStorage.
 *
 * Persisting matters more than it looks: a diner switching to WhatsApp and back,
 * or a phone that reloads the tab to save memory, must not lose a half-built
 * order. Prices here are only for display — the server re-prices every line from
 * the database when the order is placed.
 */
export function useCart(tableCode) {
  const key = KEYS.cart(tableCode);
  const [lines, setLines] = useState(() => (tableCode ? store.get(key, []) : []));

  // Switching tables (rescanning a different QR) starts a fresh cart.
  useEffect(() => {
    if (tableCode) setLines(store.get(KEYS.cart(tableCode), []));
  }, [tableCode]);

  useEffect(() => {
    if (!tableCode) return;
    if (lines.length) store.set(key, lines);
    else store.remove(key);
  }, [key, lines, tableCode]);

  const add = useCallback((item) => {
    setLines((current) => {
      const existing = current.find((line) => line.menuItemId === item._id);
      if (existing) {
        return current.map((line) =>
          line.menuItemId === item._id ? { ...line, quantity: Math.min(50, line.quantity + 1) } : line
        );
      }
      return [
        ...current,
        { menuItemId: item._id, name: item.name, price: item.price, quantity: 1, note: '' },
      ];
    });
  }, []);

  const setQuantity = useCallback((menuItemId, quantity) => {
    setLines((current) =>
      quantity <= 0
        ? current.filter((line) => line.menuItemId !== menuItemId)
        : current.map((line) =>
            line.menuItemId === menuItemId ? { ...line, quantity: Math.min(50, quantity) } : line
          )
    );
  }, []);

  const setNote = useCallback((menuItemId, note) => {
    setLines((current) =>
      current.map((line) => (line.menuItemId === menuItemId ? { ...line, note } : line))
    );
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const quantityOf = useCallback(
    (menuItemId) => lines.find((line) => line.menuItemId === menuItemId)?.quantity || 0,
    [lines]
  );

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
    const count = lines.reduce((sum, line) => sum + line.quantity, 0);
    return { subtotal: Math.round(subtotal * 100) / 100, count };
  }, [lines]);

  /**
   * Drops anything no longer on the menu — a dish can be marked unavailable
   * while the cart sits open, and the order endpoint would reject the whole
   * order for it (409). Better to tell the diner before checkout.
   */
  const reconcile = useCallback(
    (availableIds) => {
      const removed = lines.filter((line) => !availableIds.has(line.menuItemId));
      if (removed.length) {
        setLines((current) => current.filter((line) => availableIds.has(line.menuItemId)));
      }
      return removed;
    },
    [lines]
  );

  return { lines, add, setQuantity, setNote, clear, quantityOf, totals, reconcile };
}
