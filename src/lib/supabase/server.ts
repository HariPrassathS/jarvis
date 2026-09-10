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
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'https://owzqnpuyasdpotzaxdfs.supabase.co';

  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93enFucHV5YXNkcG90emF4ZGZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NTM1NzIsImV4cCI6MjEwNDUyOTU3Mn0.DvOG53_q30jJ7AxV-bFfmHSscGc_HMzsxm410LD2Xzg';

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
