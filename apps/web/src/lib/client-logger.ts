const isDevelopment =
  typeof window !== "undefined" && process.env.NODE_ENV === "development";

/**
 * Client-side logger for browser environments
 * Uses console API with formatted output
 */
export const clientLogger = {
  debug: (message: string, data?: Record<string, unknown>) => {
    if (isDevelopment) {
      console.debug(`[DEBUG] ${message}`, data || "");
    }
  },
  info: (message: string, data?: Record<string, unknown>) => {
    console.info(`[INFO] ${message}`, data || "");
  },
  warn: (message: string, data?: Record<string, unknown>) => {
    console.warn(`[WARN] ${message}`, data || "");
  },
  error: (message: string, error?: Error | Record<string, unknown>) => {
    console.error(`[ERROR] ${message}`, error || "");
  },
};
