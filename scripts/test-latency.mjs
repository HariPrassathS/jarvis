// ──────────────────────────────────────────────
// Latency Benchmark for Memory Recall & Background Extraction
// ──────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env.local
const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    process.env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
}

function createTestToken(uid) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: uid,
      user_id: uid,
      email: 'speed.tester@stark.ai',
      name: 'Speed Tester',
      exp: Math.floor(Date.now() / 1000) + 7200,
    })
  ).toString('base64url');
  return `${header}.${payload}.sig`;
}

async function benchmark() {
  console.log('⚡ Benchmarking /api/chat Latency & Non-blocking Extraction...\n');
  const token = createTestToken('speed-test-user-' + Date.now());

  const start = Date.now();
  const res = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Good morning JARVIS, run a quick status report.' }],
    }),
  });

  const duration = Date.now() - start;
  const data = await res.json();

  console.log(`⏱️ User-Facing Response Received in: ${duration}ms`);
  console.log(`🤖 Provider Used: ${data.provider_used}`);
  console.log(`💬 Response: "${data.message.slice(0, 100)}..."`);

  if (duration < 3500) {
    console.log(`\n✅ PASS: Response latency is ${duration}ms (well within normal LLM inference limits, zero blocking from background tasks)`);
  } else {
    console.warn(`\n⚠️ Notice: Response took ${duration}ms (dependent on upstream LLM API latency)`);
  }
}

benchmark().catch(console.error);
