// ──────────────────────────────────────────────
// Automated Verification Script for Persistent Memory & Continuity
// ──────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env.local manually
try {
  const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      process.env[key] = val;
    }
  }
} catch (e) {
  console.warn('Could not read .env.local:', e);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

async function runTests() {
  console.log('🚀 Starting Persistent Memory & Session Continuity Verification...\n');

  // Test Profile
  const testFirebaseUid = 'test-operator-nova-' + Date.now();
  const testEmail = 'operator.nova@stark.ai';
  const testName = 'Agent Nova';

  console.log('Step 1: Creating/Resolving test profile in Supabase...');
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .insert({
      firebase_uid: testFirebaseUid,
      email: testEmail,
      display_name: testName,
    })
    .select('id, firebase_uid, email, display_name')
    .single();

  if (pErr || !profile) {
    console.error('❌ Profile creation failed:', pErr);
    process.exit(1);
  }
  console.log(`✅ Profile created: ID=${profile.id}, Email=${profile.email}`);

  // Test 1: Background Memory Extraction on Casual Conversation
  console.log('\nStep 2: Testing automatic background memory extraction...');
  const userExchange = "I'm working on an autonomous robotics project called Nova.";
  const assistantExchange = "Understood, sir. I have synchronized telemetry for Project Nova. How can I assist with the robotic kinematics?";

  const extractionPrompt = `You are a memory extraction engine for J.A.R.V.I.S.
Your ONLY job is to extract durable, persistent facts about the user (the operator) from this single conversational exchange that are worth remembering long-term.

Durable facts include:
- Ongoing projects, apps, ventures, or robotics (e.g. project name, tech stack, goals)
- Personal details, profession, job role, skills, interests
- Explicit or implicit preferences (e.g. coding conventions, language choices, workflows)
- Names of collaborators, colleagues, pets, or significant entities mentioned
- Hardware, servers, or environment details

DO NOT extract:
- Casual chit-chat, greetings, or pleasantries ("hello", "how are you", "good morning")
- Ephemeral queries or one-off questions ("what is the weather", "calculate 42*5")
- J.A.R.V.I.S's own capabilities, status, or system remarks
- Transient states ("I'm tired", "I will be back in 5 minutes")

Return STRICTLY a JSON array of objects with "key" and "value" string properties.
- "key": short, descriptive snake_case identifier (e.g. "robotics_project_nova", "preferred_language", "pet_dog")
- "value": clear, concise fact summary (e.g. "Nova (robotics project)", "Works primarily in Rust", "Has a dog named Max")

If NO durable facts are found, return STRICTLY: []

Exchange to analyze:
Operator: "${userExchange}"
J.A.R.V.I.S: "${assistantExchange}"`;

  let rawExtracted = '';
  if (process.env.GROQ_API_KEY) {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const res = await groq.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: extractionPrompt }],
      temperature: 0.1,
      max_tokens: 256,
    });
    rawExtracted = res.choices[0]?.message?.content || '';
  } else if (process.env.GEMINI_API_KEY) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const res = await model.generateContent(extractionPrompt);
    rawExtracted = res.response.text();
  }

  const cleanedJson = rawExtracted.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  console.log('Raw Extracted Output:', cleanedJson);
  const facts = JSON.parse(cleanedJson);

  if (!Array.isArray(facts) || facts.length === 0) {
    console.error('❌ Failed: No facts extracted from casual message.');
    process.exit(1);
  }

  console.log('✅ Extracted facts:', facts);
  for (const fact of facts) {
    await supabase.from('memory').insert({
      profile_id: profile.id,
      key: fact.key,
      value: fact.value,
    });
  }

  // Test 2: Unconditional Memory Query Verification
  console.log('\nStep 3: Verifying unconditional memory recall from Supabase...');
  const { data: storedMemories, error: mErr } = await supabase
    .from('memory')
    .select('*')
    .eq('profile_id', profile.id);

  if (mErr || !storedMemories || storedMemories.length === 0) {
    console.error('❌ Memory retrieval failed:', mErr);
    process.exit(1);
  }
  console.log(`✅ Recalled ${storedMemories.length} facts:`, storedMemories.map(m => `[${m.key}]: ${m.value}`));
  const hasNova = storedMemories.some(m => m.key.toLowerCase().includes('nova') || m.value.toLowerCase().includes('nova'));
  if (!hasNova) {
    console.error('❌ Expected "Nova" in recalled memories.');
    process.exit(1);
  }
  console.log('✅ Confirmed Project Nova exists in operator persistent memory!');

  // Test 3: Conversation History Rehydration
  console.log('\nStep 4: Testing conversation history persistence and rehydration...');
  const convId = '550e8400-e29b-41d4-a716-' + Math.floor(100000000000 + Math.random() * 900000000000);
  await supabase.from('conversations').insert({
    id: convId,
    profile_id: profile.id,
    title: 'Robotics Project Discussion',
  });

  await supabase.from('messages').insert([
    {
      conversation_id: convId,
      role: 'user',
      content: "I'm working on a robotics project called Nova.",
    },
    {
      conversation_id: convId,
      role: 'assistant',
      content: 'Understood, sir. Telemetry for Project Nova is active.',
      provider_used: 'groq',
    },
    {
      conversation_id: convId,
      role: 'user',
      content: 'Can you simulate motor torques for Nova?',
    },
    {
      conversation_id: convId,
      role: 'assistant',
      content: 'Simulating 42.5 Nm torque across all four quad-rotors.',
      provider_used: 'groq',
    }
  ]);

  const { data: fetchedConv } = await supabase
    .from('conversations')
    .select('id, title')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const { data: fetchedMsgs } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', fetchedConv.id)
    .order('created_at', { ascending: true });

  console.log(`✅ Rehydrated Conversation: ${fetchedConv.title} (ID: ${fetchedConv.id})`);
  console.log(`✅ Loaded ${fetchedMsgs.length} messages in chronological sequence:`);
  fetchedMsgs.forEach((m, idx) => {
    console.log(`   ${idx + 1}. [${m.role.toUpperCase()}]: ${m.content}`);
  });

  if (fetchedMsgs.length !== 4) {
    console.error('❌ Rehydration count mismatch');
    process.exit(1);
  }

  // Clean up test data
  console.log('\nStep 5: Cleaning up test artifacts from Supabase...');
  await supabase.from('messages').delete().eq('conversation_id', convId);
  await supabase.from('conversations').delete().eq('id', convId);
  await supabase.from('memory').delete().eq('profile_id', profile.id);
  await supabase.from('profiles').delete().eq('id', profile.id);
  console.log('✅ Clean up complete.');

  console.log('\n🎉 ALL PERSISTENT MEMORY & CONTINUITY CHECKS PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
