"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type ToastLevel = "info" | "success" | "warning" | "danger";

interface ToastItem {
  id: string;
  message: string;
  level: ToastLevel;
}

interface ToastContextValue {
  toast: (message: string, level?: ToastLevel) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const LEVEL_CLASSES: Record<ToastLevel, string> = {
  info:    "border-brand/20 bg-brand-soft text-brand",
  success: "border-success/20 bg-success-soft text-success",
  warning: "border-warning/20 bg-warning-soft text-warning",
  danger:  "border-danger/20 bg-danger-soft text-danger",
};

const AUTO_DISMISS: Record<ToastLevel, number | null> = {
  info:    4000,
  success: 4000,
  warning: 6000,
  danger:  null, // manual dismiss only
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, level: ToastLevel = "info") => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, level }]);
      const delay = AUTO_DISMISS[level];
      if (delay) setTimeout(() => dismiss(id), delay);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast stack — bottom-right */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 end-6 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-3rem)]">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="alert"
              className={[
                "glass flex items-start gap-3 rounded-xl border px-4 py-3",
                "shadow-lg animate-scale-in",
                LEVEL_CLASSES[t.level],
              ].join(" ")}
            >
              <p className="flex-1 text-[13px] font-medium leading-snug">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="mt-0.5 shrink-0 text-current opacity-60 hover:opacity-100 transition-opacity"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
