// Tony Stark JARVIS Test Battery Script
const BASE_URL = 'http://localhost:3000';

async function sendQuery(prompt, conversationId = null) {
  const start = Date.now();
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer demo-token',
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      conversation_id: conversationId,
    }),
  });

  const data = await res.json();
  const latency = Date.now() - start;
  return { ok: res.ok, status: res.status, data, latency };
}

async function runStarkTestBattery() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('⚡ STARK INDUSTRIES — J.A.R.V.I.S OPERATIONAL VERIFICATION BATTERY ⚡');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  // Test 1: Memory Recall
  console.log('🧪 TEST 1: Memory Engram Recall (Project Code MARK-85)');
  console.log('Prompt: "JARVIS, do you recall my secret project code from earlier?"');
  const t1 = await sendQuery('JARVIS, do you recall my secret project code from earlier?');
  if (t1.ok) {
    console.log(`✅ Passed (${t1.latency}ms, Provider: ${t1.data.provider_used})`);
    console.log(`JARVIS: "${t1.data.message}"\n`);
  } else {
    console.error(`❌ Failed:`, t1.data);
  }

  // Test 2: Math / Physics Computation Engine
  console.log('🧪 TEST 2: Physics Calculation Engine (Kinetic Energy at Mach 3)');
  console.log('Prompt: "Calculate the kinetic energy in joules for 180kg armor traveling at 1029 m/s (0.5 * 180 * (1029^2))."');
  const t2 = await sendQuery('Calculate the kinetic energy in joules for 180kg armor traveling at 1029 m/s (0.5 * 180 * (1029^2)).');
  if (t2.ok) {
    console.log(`✅ Passed (${t2.latency}ms, Provider: ${t2.data.provider_used})`);
    console.log(`JARVIS: "${t2.data.message}"\n`);
  } else {
    console.error(`❌ Failed:`, t2.data);
  }

  // Test 3: System Diagnostics Telemetry
  console.log('🧪 TEST 3: System Diagnostics & Core Telemetry');
  console.log('Prompt: "Run a full system diagnostic on core neural matrix and report telemetry."');
  const t3 = await sendQuery('Run a full system diagnostic on core neural matrix and report telemetry.');
  if (t3.ok) {
    console.log(`✅ Passed (${t3.latency}ms, Provider: ${t3.data.provider_used})`);
    console.log(`JARVIS: "${t3.data.message}"\n`);
  } else {
    console.error(`❌ Failed:`, t3.data);
  }

  // Test 4: Live Flight Weather Telemetry (Malibu)
  console.log('🧪 TEST 4: Live Flight Weather Telemetry (Malibu, CA)');
  console.log('Prompt: "JARVIS, what are the flight conditions and weather in Malibu right now?"');
  const t4 = await sendQuery('JARVIS, what are the flight conditions and weather in Malibu right now?');
  if (t4.ok) {
    console.log(`✅ Passed (${t4.latency}ms, Provider: ${t4.data.provider_used})`);
    console.log(`JARVIS: "${t4.data.message}"\n`);
  } else {
    console.error(`❌ Failed:`, t4.data);
  }

  // Test 5: New Long-term Memory Storage
  console.log('🧪 TEST 5: Committing New Engram to Supabase Memory');
  console.log('Prompt: "Commit to memory: Arc reactor core output is calibrated to 8.4 Gigajoules per second."');
  const t5 = await sendQuery('Commit to memory: Arc reactor core output is calibrated to 8.4 Gigajoules per second.');
  if (t5.ok) {
    console.log(`✅ Passed (${t5.latency}ms, Provider: ${t5.data.provider_used})`);
    console.log(`JARVIS: "${t5.data.message}"\n`);
  } else {
    console.error(`❌ Failed:`, t5.data);
  }

  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('⚡ ALL VERIFICATION TESTS COMPLETED ⚡');
  console.log('═══════════════════════════════════════════════════════════════════════');
}

runStarkTestBattery();
