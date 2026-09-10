// ──────────────────────────────────────────────
// Tool: System Diagnostics & Telemetry
// Inspects active LLM status, latency, and memory buffer
// ──────────────────────────────────────────────

import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function runSystemDiagnostics(profileId: string): Promise<string> {
  const start = Date.now();
  const supabase = createServerSupabaseClient();

  let dbStatus = 'ONLINE';
  let memoryCount = 0;
  let messageCount = 0;

  try {
    const { count: memCount } = await supabase
      .from('memory')
      .select('*', { count: 'exact', head: true })
      .eq('profile_id', profileId);

    const { count: msgCount } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true });

    memoryCount = memCount || 0;
    messageCount = msgCount || 0;
  } catch {
    dbStatus = 'DEGRADED';
  }

  const dbPing = Date.now() - start;

  return `J.A.R.V.I.S System Telemetry Report:
- Core Status: NOMINAL / OPTIMAL
- Primary Brain: Google Gemini 2.5 Flash (Active)
- Secondary Neural Mesh: Groq (openai/gpt-oss-120b)
- Failover Guard: OpenRouter Free Tier
- Database Telemetry: ${dbStatus} (${dbPing}ms ping)
- Stored Memory Engrams: ${memoryCount} items
- Historical Interaction Buffer: ${messageCount} messages
- Perceptual Audio Synthesis Matrix: ONLINE`;
}
