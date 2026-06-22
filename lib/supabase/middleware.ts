import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Refreshes the Supabase auth session for an incoming request and forwards the
 * updated cookies on the response. Built per request, bound to the
 * request/response cookie stores. Calling `getUser()` triggers the token
 * refresh when needed. This establishes the per-request client rule that later
 * auth features inherit; no authorization decisions are made here yet.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Without Supabase env configured there is no session to refresh. Pass the
  // request through untouched rather than throwing, so the app still serves
  // (e.g. the placeholder route in a fresh checkout without `.env.local`).
  if (!supabaseUrl || !supabaseKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: triggers the session refresh. Do not run logic between client
  // creation and this call.
  await supabase.auth.getUser();

  return supabaseResponse;
}
