// Server-side logger (Node.js only - uses Pino)
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
let logger: any;
let createLogger: any;

// Only import Pino on the server-side
if (typeof window === "undefined") {
  // Dynamic import to avoid bundling pino for client
  const pino = require("pino");
  const isDevelopment = process.env.NODE_ENV === "development";

  logger = pino({
    level: process.env.LOG_LEVEL || (isDevelopment ? "debug" : "info"),
    transport: isDevelopment
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname",
            singleLine: false,
          },
        }
      : undefined,
    formatters: {
      level: (label: string) => {
        return { level: label.toUpperCase() };
      },
    },
    base: {
      env: process.env.NODE_ENV,
    },
  });

  createLogger = (module: string) => {
    return logger.child({ module });
  };
} else {
  // Client-side fallback (browser) - use console
  logger = {
    info: console.info,
    debug: console.debug,
    warn: console.warn,
    error: console.error,
  };

  createLogger = (module: string) => {
    return {
      info: (data: any, message: string) =>
        console.info(`[${module}] ${message}`, data),
      debug: (data: any, message: string) =>
        console.debug(`[${module}] ${message}`, data),
      warn: (data: any, message: string) =>
        console.warn(`[${module}] ${message}`, data),
      error: (data: any, message: string) =>
        console.error(`[${module}] ${message}`, data),
    };
  };
}

export { logger, createLogger };

// Helper to sanitize sensitive data before logging
export const sanitizePlayerData = (data: Record<string, unknown>) => {
  const sanitized = { ...data };

  // Remove hole cards from logs to prevent security issues
  if ("cards" in sanitized) {
    sanitized.cards = "[REDACTED]";
  }

  return sanitized;
};

// Helper to log API route entry/exit
export const logApiRoute = (method: string, path: string) => {
  const routeLogger = createLogger("api");
  return {
    start: (data?: Record<string, unknown>) => {
      routeLogger.info(
        { method, path, ...data },
        `${method} ${path} - Request started`,
      );
    },
    info: (message: string, data?: Record<string, unknown>) => {
      routeLogger.info(
        { method, path, ...data },
        `${method} ${path} - ${message}`,
      );
    },
    debug: (message: string, data?: Record<string, unknown>) => {
      routeLogger.debug(
        { method, path, ...data },
        `${method} ${path} - ${message}`,
      );
    },
    warn: (message: string, data?: Record<string, unknown>) => {
      routeLogger.warn(
        { method, path, ...data },
        `${method} ${path} - ${message}`,
      );
    },
    success: (data?: Record<string, unknown>) => {
      routeLogger.info(
        { method, path, ...data },
        `${method} ${path} - Request successful`,
      );
    },
    error: (error: Error | unknown, data?: Record<string, unknown>) => {
      const errorData =
        error instanceof Error
          ? {
              errorMessage: error.message,
              errorStack: error.stack,
              errorName: error.name,
            }
          : { errorString: String(error) };

      routeLogger.error(
        { method, path, ...errorData, ...data },
        `${method} ${path} - Request failed`,
      );
    },
  };
};
