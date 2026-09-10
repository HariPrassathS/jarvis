// Apply schema.sql to Supabase via Postgres client
import pg from 'pg';
import fs from 'fs';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL environment variable not set');
  process.exit(1);
}

async function initDb() {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to Supabase PostgreSQL...');
    await client.connect();
    console.log('✅ Connected to Supabase DB successfully!');

    const schemaPath = './supabase/schema.sql';
    const sql = fs.readFileSync(schemaPath, 'utf8');

    console.log('Executing schema.sql...');
    await client.query(sql);
    console.log('✅ schema.sql executed successfully!');

    // Verify tables
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public';
    `);
    console.log('Public tables in Supabase:', res.rows.map(r => r.table_name));

    await client.end();
  } catch (err) {
    console.error('❌ Database initialization error:', err.message);
  }
}

initDb();
