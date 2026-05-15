import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../styles/toast.css";

const MAX_VISIBLE_TOASTS = 3;
const DEFAULT_DURATION = 3000;
const EXIT_ANIMATION_MS = 220;

export const ToastContext = createContext(null);

function createToastId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function ToastItem({ toast, onDismiss, onAction }) {
  const canAct = typeof toast.onAction === "function" && toast.actionLabel;

  return (
    <div className={`ab-toast ab-toast--${toast.type || "neutral"} ${toast.exiting ? "is-exiting" : "is-entering"}`}>
      <div className="ab-toast__content">{toast.message}</div>
      <div className="ab-toast__controls">
        {canAct && (
          <button
            type="button"
            className="ab-toast__action"
            onClick={() => onAction(toast.id)}
          >
            {toast.actionLabel}
          </button>
        )}
        <button
          type="button"
          className="ab-toast__close"
          aria-label="Dismiss notification"
          onClick={() => onDismiss(toast.id)}
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [portalRoot, setPortalRoot] = useState(null);
  const timersRef = useRef(new Map());

  useEffect(() => {
    let root = document.getElementById("alphabot-toast-root");

    if (!root) {
      root = document.createElement("div");
      root.id = "alphabot-toast-root";
      document.body.appendChild(root);
    }

    setPortalRoot(root);

    return () => {
      timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      timersRef.current.clear();
    };
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.map((toast) => (toast.id === id ? { ...toast, exiting: true } : toast)));

    const activeTimer = timersRef.current.get(id);
    if (activeTimer) {
      window.clearTimeout(activeTimer);
      timersRef.current.delete(id);
    }

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, EXIT_ANIMATION_MS);
  }, []);

  const pushToast = useCallback((input) => {
    const payload = typeof input === "string" ? { message: input } : (input || {});
    if (!payload.message) {
      return "";
    }

    const id = payload.id || createToastId();

    setToasts((prev) => {
      const next = [{
        id,
        message: String(payload.message),
        type: payload.type || "neutral",
        actionLabel: payload.actionLabel || null,
        onAction: payload.onAction || null,
        duration: Number.isFinite(Number(payload.duration)) ? Math.max(500, Number(payload.duration)) : DEFAULT_DURATION,
        exiting: false,
      }, ...prev];

      return next.slice(0, 30);
    });

    return id;
  }, []);

  useEffect(() => {
    const visibleIds = new Set(toasts.slice(0, MAX_VISIBLE_TOASTS).map((toast) => toast.id));

    toasts.forEach((toast) => {
      if (toast.exiting || !visibleIds.has(toast.id)) {
        return;
      }

      if (timersRef.current.has(toast.id)) {
        return;
      }

      const timerId = window.setTimeout(() => {
        dismissToast(toast.id);
      }, toast.duration || DEFAULT_DURATION);

      timersRef.current.set(toast.id, timerId);
    });

    timersRef.current.forEach((timerId, id) => {
      if (!visibleIds.has(id)) {
        window.clearTimeout(timerId);
        timersRef.current.delete(id);
      }
    });
  }, [toasts, dismissToast]);

  const handleAction = useCallback((id) => {
    const toast = toasts.find((entry) => entry.id === id);
    if (toast && typeof toast.onAction === "function") {
      toast.onAction();
    }

    dismissToast(id);
  }, [toasts, dismissToast]);

  const contextValue = useMemo(() => ({
    pushToast,
    dismissToast,
  }), [pushToast, dismissToast]);

  const visibleToasts = toasts.slice(0, MAX_VISIBLE_TOASTS);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {portalRoot && createPortal(
        <div className="ab-toast-stack" role="status" aria-live="polite" aria-atomic="false">
          {visibleToasts.map((toast) => (
            <ToastItem
              key={toast.id}
              toast={toast}
              onDismiss={dismissToast}
              onAction={handleAction}
            />
          ))}
        </div>,
        portalRoot
      )}
    </ToastContext.Provider>
  );
}

export default ToastProvider;
