// ──────────────────────────────────────────────
// Supabase Browser Client
// Used in client components for real-time queries
// ──────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

let client: ReturnType<typeof createClient> | null = null;

export function createBrowserSupabaseClient() {
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  client = createClient(supabaseUrl, supabaseAnonKey);
  return client;
}
