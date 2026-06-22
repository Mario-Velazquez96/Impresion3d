import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Created fresh per call (never at module scope) so it
 * always binds to the current document cookies. Uses only browser-safe
 * (`NEXT_PUBLIC_*`) values — the publishable key, never the secret key.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
