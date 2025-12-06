import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

// We don't pull the generated Database types here to keep the engine decoupled
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
