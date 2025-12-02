import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { Database } from "@/types/database.types";

// Service-role client for privileged operations (dealing, settlements)
export async function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service credentials are missing from env");
  }
  // Use plain createClient so role is always service_role and not influenced by cookies
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Auth-aware client using the anon key so RLS sees auth.uid() from cookies
export async function getAuthClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            /* noop for server components */
          }
        },
      },
    },
  );
}

export async function getAuthUser() {
  const client = await getAuthClient();
  const { data } = await client.auth.getUser();
  return { user: data.user, client };
}
