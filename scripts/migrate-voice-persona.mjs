// ──────────────────────────────────────────────
// Migration: Add voice_persona column to settings table
// ──────────────────────────────────────────────

import pg from 'pg';

const connectionString = 'postgresql://postgres:Prassath@2007@db.owzqnpuyasdpotzaxdfs.supabase.co:5432/postgres';

async function migrate() {
  console.log('🔄 Connecting to Supabase PostgreSQL for migration...');
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to Supabase DB.');

    console.log('Running ALTER TABLE settings ADD COLUMN IF NOT EXISTS voice_persona TEXT DEFAULT \'jarvis\';');
    await client.query(`
      ALTER TABLE settings 
      ADD COLUMN IF NOT EXISTS voice_persona TEXT DEFAULT 'jarvis';
    `);
    console.log('✅ voice_persona column added / verified successfully!');

    // Check columns on settings table
    const res = await client.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'settings';
    `);
    console.log('Settings table columns:');
    res.rows.forEach(r => console.log(` - ${r.column_name} (${r.data_type}, default: ${r.column_default})`));

    await client.end();
    console.log('\n🎉 Migration complete!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrate();
