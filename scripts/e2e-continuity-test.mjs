// ──────────────────────────────────────────────
// End-to-End Test for Memory & Conversation Continuity
// ──────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

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

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

// Generate a valid mock Firebase JWT
function createTestToken(uid, email, name) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: uid,
      user_id: uid,
      email: email,
      name: name,
      exp: Math.floor(Date.now() / 1000) + 7200,
    })
  ).toString('base64url');
  return `${header}.${payload}.mock-sig`;
}

async function runE2E() {
  console.log('🧪 Running End-to-End API Continuity Test...\n');

  const testUid = 'e2e-user-' + Date.now();
  const testEmail = 'tony.stark@avengers.org';
  const testName = 'Tony Stark';
  const token = createTestToken(testUid, testEmail, testName);

  // 1. First turn: casual statement (NOT a remember command)
  console.log('Test 1: Sending casual fact statement to /api/chat...');
  const msg1 = "I'm working on a robotics project called Nova.";
  const res1 = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: msg1 }],
    }),
  });

  if (!res1.ok) {
    const errText = await res1.text();
    console.error('❌ /api/chat call 1 failed:', res1.status, errText);
    process.exit(1);
  }

  const data1 = await res1.json();
  const conversationId = data1.conversation_id;
  console.log(`✅ JARVIS Response 1: "${data1.message}"`);
  console.log(`✅ Assigned Conversation ID: ${conversationId}`);

  // Wait 3.5 seconds for non-blocking background memory extraction to finish
  console.log('\nWaiting 3.5s for async background memory extraction to commit to Supabase...');
  await new Promise((r) => setTimeout(r, 3500));

  // Query Supabase memory table directly to verify background extraction wrote the fact
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('firebase_uid', testUid)
    .single();

  if (!profile) {
    console.error('❌ Profile not found in Supabase');
    process.exit(1);
  }

  const { data: memories } = await supabase
    .from('memory')
    .select('key, value')
    .eq('profile_id', profile.id);

  console.log('✅ Background Extracted Memories in Supabase:', memories);
  const foundNova = memories?.some(
    (m) =>
      m.key.toLowerCase().includes('nova') ||
      m.value.toLowerCase().includes('nova') ||
      m.key.toLowerCase().includes('robotics') ||
      m.value.toLowerCase().includes('robotics')
  );

  if (!foundNova) {
    console.error('❌ Background extraction failed to capture Project Nova!');
    process.exit(1);
  }
  console.log('🌟 PASS: Project Nova was extracted and stored automatically in the background without explicit remember command!');

  // 2. Second turn: ask what project am I working on (simulating continuous session)
  console.log('\nTest 2: Querying JARVIS: "What project am I working on?" in the same conversation...');
  const msg2 = 'What project am I working on?';
  const res2 = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      conversation_id: conversationId,
      messages: [
        { role: 'user', content: msg1 },
        { role: 'assistant', content: data1.message },
        { role: 'user', content: msg2 },
      ],
    }),
  });

  const data2 = await res2.json();
  console.log(`✅ JARVIS Response 2: "${data2.message}"`);
  const mentionsNova = data2.message.toLowerCase().includes('nova');
  if (!mentionsNova) {
    console.error('❌ JARVIS did not reference Project Nova in response!');
    process.exit(1);
  }
  console.log('🌟 PASS: JARVIS correctly answered with Project Nova!');

  // 3. Test Conversation Rehydration API (/api/chat/history)
  console.log('\nTest 3: Testing /api/chat/history rehydration endpoint...');
  const resHistory = await fetch(`http://localhost:3000/api/chat/history?conversation_id=${conversationId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!resHistory.ok) {
    console.error('❌ /api/chat/history failed:', resHistory.status);
    process.exit(1);
  }

  const historyData = await resHistory.json();
  console.log(`✅ Rehydrated Conversation: ${historyData.title} (ID: ${historyData.conversation_id})`);
  console.log(`✅ Message count rehydrated: ${historyData.messages.length}`);
  historyData.messages.forEach((m, i) => {
    console.log(`   [${i + 1}] ${m.role.toUpperCase()}: ${m.content.slice(0, 70)}...`);
  });

  if (historyData.messages.length < 4) {
    console.error('❌ Expected at least 4 messages in rehydrated history');
    process.exit(1);
  }
  console.log('🌟 PASS: All conversation messages were successfully rehydrated!');

  // 4. Test New Session / Reload without conversation_id (Unconditional Memory Recall)
  console.log('\nTest 4: Simulating a completely new session (empty chat) — asking: "Do you know what project I was working on?"...');
  const resFresh = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Do you know what project I was working on?' }],
    }),
  });

  const dataFresh = await resFresh.json();
  console.log(`✅ JARVIS Response (New Thread): "${dataFresh.message}"`);
  if (!dataFresh.message.toLowerCase().includes('nova')) {
    console.error('❌ Long-term memory failed to carry over to fresh conversation!');
    process.exit(1);
  }
  console.log('🌟 PASS: Long-term memory was unconditionally injected into new session!');

  // 5. Cleanup test artifacts
  console.log('\nCleaning up test artifacts from Supabase...');
  await supabase.from('messages').delete().eq('conversation_id', conversationId);
  if (dataFresh.conversation_id) {
    await supabase.from('messages').delete().eq('conversation_id', dataFresh.conversation_id);
    await supabase.from('conversations').delete().eq('id', dataFresh.conversation_id);
  }
  await supabase.from('conversations').delete().eq('id', conversationId);
  await supabase.from('memory').delete().eq('profile_id', profile.id);
  await supabase.from('profiles').delete().eq('id', profile.id);
  console.log('✅ Clean up complete.');

  console.log('\n🎉 ALL 4 CRITICAL CONTINUITY & PERSISTENT MEMORY REQUIREMENTS PASSED WITH 100% SUCCESS!');
}

runE2E().catch((err) => {
  console.error('E2E Test Runner failed:', err);
  process.exit(1);
});
