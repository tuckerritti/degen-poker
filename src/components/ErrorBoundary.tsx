"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { clientLogger } from "@/lib/client-logger";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component to catch and log React errors
 * Logs errors to the client logger and displays a fallback UI
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    clientLogger.error("ErrorBoundary: React error caught", {
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack,
      },
      componentStack: errorInfo.componentStack,
    });

    // In production, you might want to send this to an error tracking service
    // like Sentry, LogRocket, etc.
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <h1 className="mb-4 text-2xl font-bold text-red-600">
              Something went wrong
            </h1>
            <p className="mb-4 text-gray-700">
              An error occurred in the application. Please refresh the page to
              try again.
            </p>
            {this.state.error && (
              <details className="mb-4">
                <summary className="cursor-pointer text-sm text-gray-600">
                  Error details
                </summary>
                <pre className="mt-2 overflow-auto rounded bg-gray-100 p-2 text-xs">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
