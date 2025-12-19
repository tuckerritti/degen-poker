"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";

/**
 * Hook to ensure an authenticated (anonymous) Supabase session exists
 * Returns the auth user id for scoping queries and UI
 */
export function useSession() {
  const [sessionId, setSessionId] = useState<string>("");
  const [accessToken, setAccessToken] = useState<string>("");
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
          if (
            !cancelled &&
            anonData.session?.user?.id &&
            anonData.session?.access_token
          ) {
            setSessionId(anonData.session.user.id);
            setAccessToken(anonData.session.access_token);
          }
        } else if (
          !cancelled &&
          data.session.user?.id &&
          data.session.access_token
        ) {
          setSessionId(data.session.user.id);
          setAccessToken(data.session.access_token);
        }
      } catch (error) {
        console.error("Failed to fetch session", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchSession();

    const supabase = getBrowserClient();
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (cancelled) return;
        if (session?.user?.id && session.access_token) {
          setSessionId(session.user.id);
          setAccessToken(session.access_token);
        }
      },
    );

    return () => {
      cancelled = true;
      listener?.subscription.unsubscribe();
    };
  }, []);

  const clearSession = () => {
    // Trigger regeneration on next render
    setSessionId("");
    setAccessToken("");
    setIsLoading(true);
  };

  return { sessionId, accessToken, isLoading, clearSession };
}
