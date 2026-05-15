import { useContext, useMemo } from "react";
import { ToastContext } from "../components/ui/ToastProvider";

export default function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }

  const { pushToast } = context;

  return useMemo(() => {
    const baseToast = (message, options = {}) =>
      pushToast({
        message,
        type: "neutral",
        ...options,
      });

    baseToast.success = (message, options = {}) =>
      pushToast({
        message,
        type: "success",
        ...options,
      });

    baseToast.error = (message, options = {}) =>
      pushToast({
        message,
        type: "error",
        ...options,
      });

    baseToast.info = (message, options = {}) =>
      pushToast({
        message,
        type: "info",
        ...options,
      });

    baseToast.neutral = (message, options = {}) =>
      pushToast({
        message,
        type: "neutral",
        ...options,
      });

    const toastWithAction = (message, actionLabel, onAction, options = {}) =>
      pushToast({
        message,
        type: "neutral",
        actionLabel,
        onAction,
        ...options,
      });

    return {
      toast: baseToast,
      toastWithAction,
    };
  }, [pushToast]);
}
