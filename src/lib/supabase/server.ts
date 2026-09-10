// ──────────────────────────────────────────────
// Supabase Server Client
// Used in API routes and server components
// ──────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client with the service role key.
 * This bypasses RLS — use only in server-side code where
 * we've already verified the user's Firebase token.
 */
export function createServerSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Creates a Supabase client scoped to a specific user's firebase_uid.
 * Sets the RLS context so policies filter by this user.
 */
export async function createUserScopedClient(firebaseUid: string) {
  const client = createServerSupabaseClient();

  // Set the RLS context for this request
  await client.rpc('set_config', {
    setting_name: 'app.firebase_uid',
    setting_value: firebaseUid,
  }).throwOnError();

  return client;
}
