"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  X,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";

export type AlertType = "success" | "error" | "warning" | "info";

export interface AlertModalOptions {
  type?: AlertType;
  title: string;
  description: string;
  details?: Array<{ label: string; value: string; copyable?: boolean; isMonospace?: boolean }>;
  primaryAction?: {
    label: string;
    onClick?: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick?: () => void;
  };
  rawCopyPayload?: string;
  copyPayloadLabel?: string;
}

interface AlertContextValue {
  showAlert: (options: AlertModalOptions) => void;
  showSuccess: (title: string, description: string, details?: AlertModalOptions["details"], copyPayload?: string) => void;
  showError: (title: string, description: string, details?: AlertModalOptions["details"]) => void;
  showWarning: (title: string, description: string) => void;
  showInfo: (title: string, description: string) => void;
  hideAlert: () => void;
}

const AlertContext = createContext<AlertContextValue | null>(null);

const fallbackAlert: AlertContextValue = {
  showAlert: (opts) => {
    if (typeof window !== "undefined") {
      window.alert(`${opts.title}\n\n${opts.description || ""}`);
    }
  },
  showSuccess: (title, description) => {
    if (typeof window !== "undefined") {
      window.alert(`${title}\n\n${description || ""}`);
    }
  },
  showError: (title, description) => {
    if (typeof window !== "undefined") {
      window.alert(`Error: ${title}\n\n${description || ""}`);
    }
  },
  showWarning: (title, description) => {
    if (typeof window !== "undefined") {
      window.alert(`Warning: ${title}\n\n${description || ""}`);
    }
  },
  showInfo: (title, description) => {
    if (typeof window !== "undefined") {
      window.alert(`${title}\n\n${description || ""}`);
    }
  },
  hideAlert: () => {},
};

export function useAlert() {
  const context = useContext(AlertContext);
  return context || fallbackAlert;
}

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [modalOptions, setModalOptions] = useState<AlertModalOptions | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const hideAlert = useCallback(() => {
    setModalOptions(null);
    setCopiedKey(null);
  }, []);

  const showAlert = useCallback((options: AlertModalOptions) => {
    setModalOptions(options);
  }, []);

  const showSuccess = useCallback((title: string, description: string, details?: AlertModalOptions["details"], copyPayload?: string) => {
    showAlert({
      type: "success",
      title,
      description,
      details,
      rawCopyPayload: copyPayload,
      copyPayloadLabel: "Copy All Details",
      primaryAction: { label: "Done", onClick: () => setModalOptions(null) },
    });
  }, [showAlert]);

  const showError = useCallback((title: string, description: string, details?: AlertModalOptions["details"]) => {
    showAlert({
      type: "error",
      title,
      description,
      details,
      primaryAction: { label: "Acknowledge", onClick: () => setModalOptions(null) },
    });
  }, [showAlert]);

  const showWarning = useCallback((title: string, description: string) => {
    showAlert({
      type: "warning",
      title,
      description,
      primaryAction: { label: "Understood", onClick: () => setModalOptions(null) },
    });
  }, [showAlert]);

  const showInfo = useCallback((title: string, description: string) => {
    showAlert({
      type: "info",
      title,
      description,
      primaryAction: { label: "OK", onClick: () => setModalOptions(null) },
    });
  }, [showAlert]);

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    } catch (err) {
      console.error("Clipboard copy failed:", err);
    }
  };

  const alertType = modalOptions?.type || "info";

  return (
    <AlertContext.Provider value={{ showAlert, showSuccess, showError, showWarning, showInfo, hideAlert }}>
      {children}

      {/* Global Alert Modal */}
      {modalOptions && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] bg-black/65 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-150"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-lg w-full overflow-hidden transform animate-in zoom-in-95 duration-200">
            {/* Top Accent Strip */}
            <div
              className={`h-2 w-full ${
                alertType === "success"
                  ? "bg-emerald-500"
                  : alertType === "error"
                  ? "bg-red-500"
                  : alertType === "warning"
                  ? "bg-amber-500"
                  : "bg-indigo-500"
              }`}
            />

            <div className="p-6 space-y-4">
              {/* Header Icon + Title */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                      alertType === "success"
                        ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/80 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                        : alertType === "error"
                        ? "bg-red-100 text-red-600 dark:bg-red-950/80 dark:text-red-400 border border-red-200 dark:border-red-800"
                        : alertType === "warning"
                        ? "bg-amber-100 text-amber-600 dark:bg-amber-950/80 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                        : "bg-indigo-100 text-indigo-600 dark:bg-indigo-950/80 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800"
                    }`}
                  >
                    {alertType === "success" && <CheckCircle2 className="w-6 h-6" />}
                    {alertType === "error" && <AlertCircle className="w-6 h-6" />}
                    {alertType === "warning" && <AlertTriangle className="w-6 h-6" />}
                    {alertType === "info" && <Info className="w-6 h-6" />}
                  </div>

                  <div>
                    <h3 className="font-bold text-lg text-zinc-900 dark:text-white leading-tight">
                      {modalOptions.title}
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                      {modalOptions.description}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={hideAlert}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Key/Value Details Card */}
              {modalOptions.details && modalOptions.details.length > 0 && (
                <div className="bg-zinc-50 dark:bg-zinc-800/60 rounded-xl p-3.5 border border-zinc-200 dark:border-zinc-700/60 space-y-2.5 text-xs">
                  {modalOptions.details.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-3 py-1 border-b last:border-b-0 border-zinc-200/60 dark:border-zinc-700/40"
                    >
                      <span className="text-zinc-500 dark:text-zinc-400 font-medium shrink-0">
                        {item.label}:
                      </span>
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span
                          className={`truncate text-zinc-900 dark:text-zinc-100 font-semibold ${
                            item.isMonospace ? "font-mono bg-zinc-200/80 dark:bg-zinc-700/80 px-2 py-0.5 rounded text-[11px]" : ""
                          }`}
                        >
                          {item.value}
                        </span>
                        {item.copyable && (
                          <button
                            type="button"
                            onClick={() => handleCopy(item.value, `item-${idx}`)}
                            className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition shrink-0"
                            title={`Copy ${item.label}`}
                          >
                            {copiedKey === `item-${idx}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Raw Copy Payload Banner */}
              {modalOptions.rawCopyPayload && (
                <button
                  type="button"
                  onClick={() => handleCopy(modalOptions.rawCopyPayload!, "raw-payload")}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 transition cursor-pointer"
                >
                  {copiedKey === "raw-payload" ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400">Copied to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>{modalOptions.copyPayloadLabel || "Copy All Details"}</span>
                    </>
                  )}
                </button>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                {modalOptions.secondaryAction && (
                  <button
                    type="button"
                    onClick={() => {
                      modalOptions.secondaryAction?.onClick?.();
                      hideAlert();
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                  >
                    {modalOptions.secondaryAction.label}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    modalOptions.primaryAction?.onClick?.();
                    hideAlert();
                  }}
                  className={`px-5 py-2.5 rounded-xl text-xs font-semibold text-white shadow-sm transition cursor-pointer ${
                    alertType === "success"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : alertType === "error"
                      ? "bg-red-600 hover:bg-red-700"
                      : alertType === "warning"
                      ? "bg-amber-600 hover:bg-amber-700"
                      : "bg-indigo-600 hover:bg-indigo-700"
                  }`}
                >
                  {modalOptions.primaryAction?.label || "Done"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AlertContext.Provider>
  );
}
