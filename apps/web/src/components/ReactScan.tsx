"use client";

import { useEffect } from "react";

export function ReactScan({ enabled = false }: { enabled?: boolean }) {
  useEffect(() => {
    if (!enabled || process.env.NODE_ENV === "production") return;
    let isMounted = true;
    void (async () => {
      const { scan } = await import("react-scan");
      if (isMounted) {
        scan({ enabled: true });
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [enabled]);

  return null;
}
