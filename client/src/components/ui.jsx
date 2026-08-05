import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Small shared UI kit: toasts, a bottom-sheet modal, star display, and the
 * loading/empty states used by both the diner site and the dashboard.
 */

// --- Toasts ----------------------------------------------------------------

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message, tone = 'info') => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), tone === 'error' ? 6000 : 3500)
      );
      return id;
    },
    [dismiss]
  );

  // Clear pending timers if the provider unmounts mid-toast.
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  const value = useMemo(
    () => ({
      info: (m) => push(m, 'info'),
      success: (m) => push(m, 'success'),
      error: (m) => push(typeof m === 'string' ? m : m?.message || 'Something went wrong', 'error'),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`} onClick={() => dismiss(toast.id)}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside a ToastProvider');
  return ctx;
}

// --- Modal -----------------------------------------------------------------

export function Modal({ title, onClose, children, footer }) {
  // Escape closes; the body scroll lock stops the page sliding under the sheet.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2 style={{ fontSize: 18 }}>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
        {footer}
      </div>
    </div>
  );
}

// --- Display helpers -------------------------------------------------------

export function Stars({ value = 0, count }) {
  const rounded = Math.round(Number(value) || 0);
  return (
    <span className="stars" title={`${Number(value || 0).toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rounded ? '' : 'stars-muted'}>
          ★
        </span>
      ))}
      {count !== undefined && (
        <span style={{ color: 'inherit', opacity: 0.75, marginLeft: 4, letterSpacing: 0 }}>
          {count > 0 ? `${Number(value).toFixed(1)} (${count})` : 'No ratings yet'}
        </span>
      )}
    </span>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="center-state">
      <div className="spinner" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="center-state">
      <p style={{ color: 'var(--danger)', fontWeight: 600 }}>{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}
