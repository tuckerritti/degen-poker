"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";

/**
 * Hook to ensure an authenticated (anonymous) Supabase session exists
 * Returns the auth user id for scoping queries and UI
 */
export function useSession() {
  const [sessionId, setSessionId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchSession = async () => {
      try {
        const supabase = getBrowserClient();
        const { data } = await supabase.auth.getSession();

        if (!data.session) {
          // Create an anonymous session
          const { data: anonData, error } =
            await supabase.auth.signInAnonymously();

          if (error) throw error;
          if (!cancelled && anonData.session?.user?.id) {
            setSessionId(anonData.session.user.id);
          }
        } else if (!cancelled && data.session.user?.id) {
          setSessionId(data.session.user.id);
        }
      } catch (error) {
        console.error("Failed to fetch session", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const clearSession = () => {
    // Trigger regeneration on next render
    setSessionId("");
    setIsLoading(true);
  };

  return { sessionId, isLoading, clearSession };
}
