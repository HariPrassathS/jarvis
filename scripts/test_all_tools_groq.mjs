import { toolDefinitions } from '../src/lib/tools/definitions.ts';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) {
  console.error('Missing GROQ_API_KEY environment variable');
  process.exit(1);
}

async function testAllTools() {
  console.log('Testing toolDefinitions with Groq openai/gpt-oss-120b:');
  console.log('Tools:', JSON.stringify(toolDefinitions, null, 2));

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: 'You are JARVIS.' },
          { role: 'user', content: 'What is the flight weather in Malibu right now?' }
        ],
        tools: toolDefinitions,
        tool_choice: 'auto'
      })
    });
    const data = await res.json();
    console.log('Response status:', res.status);
    console.log('Response body:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error:', e);
  }
}

testAllTools();
