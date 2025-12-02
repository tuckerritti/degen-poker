"use client";

import { useEffect } from "react";
import { clientLogger } from "@/lib/client-logger";

/**
 * Global error handler component
 * Catches unhandled errors and promise rejections at the window level
 */
export function GlobalErrorHandler() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      clientLogger.error("GlobalErrorHandler: Unhandled error", {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error
          ? {
              message: event.error.message,
              stack: event.error.stack,
            }
          : undefined,
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      clientLogger.error("GlobalErrorHandler: Unhandled promise rejection", {
        reason:
          event.reason instanceof Error
            ? {
                message: event.reason.message,
                stack: event.reason.stack,
              }
            : String(event.reason),
      });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    clientLogger.debug("GlobalErrorHandler: Initialized");

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
      clientLogger.debug("GlobalErrorHandler: Cleanup");
    };
  }, []);

  return null;
}
