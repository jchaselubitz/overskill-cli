import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function createSupabaseClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw new Error("Missing Authorization header");
  }

  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: { Authorization: authHeader },
      },
    }
  );
}

export function createAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

export function getSupabaseUrl(): string {
  return Deno.env.get("SUPABASE_URL")!;
}

export function getAnonKey(): string {
  return Deno.env.get("SUPABASE_ANON_KEY")!;
}
