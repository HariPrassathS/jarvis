// ──────────────────────────────────────────────
// Migration: Create provider_usage table for daily budget tracking
// ──────────────────────────────────────────────

import pg from 'pg';

const connectionString = 'postgres://postgres.owzqnpuyasdpotzaxdfs:Prassath%402007@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres';

async function migrate() {
  console.log('🔄 Connecting to Supabase IPv4 Pooler for migration...');
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to Supabase DB.');

    console.log('Creating table provider_usage if not exists...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS provider_usage (
        provider TEXT NOT NULL,
        date_utc DATE NOT NULL DEFAULT CURRENT_DATE,
        request_count INT NOT NULL DEFAULT 0,
        token_count INT NOT NULL DEFAULT 0,
        last_used_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (provider, date_utc)
      );

      CREATE INDEX IF NOT EXISTS idx_provider_usage_date ON provider_usage(date_utc);
    `);
    console.log('✅ provider_usage table created / verified successfully!');

    // Check columns on provider_usage table
    const res = await client.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'provider_usage';
    `);
    console.log('provider_usage table columns:');
    res.rows.forEach(r => console.log(` - ${r.column_name} (${r.data_type}, default: ${r.column_default})`));

    await client.end();
    console.log('\n🎉 Provider usage migration complete!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrate();
