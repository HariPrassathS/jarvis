// Verify records in Supabase
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL environment variable not set');
  process.exit(1);
}

async function checkDb() {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    console.log('\n--- Profiles Table ---');
    const profiles = await client.query('SELECT * FROM profiles');
    console.table(profiles.rows);

    console.log('\n--- Conversations Table ---');
    const convs = await client.query('SELECT * FROM conversations');
    console.table(convs.rows);

    console.log('\n--- Messages Table ---');
    const msgs = await client.query('SELECT role, content, provider_used, created_at FROM messages ORDER BY created_at ASC');
    console.table(msgs.rows);

    console.log('\n--- Memory Table ---');
    const memories = await client.query('SELECT * FROM memory');
    console.table(memories.rows);

    await client.end();
  } catch (err) {
    console.error('Query error:', err.message);
  }
}

checkDb();
