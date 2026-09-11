import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import pg from 'pg';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL environment variable not set');
  process.exit(1);
}

async function migrate() {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('✅ Connected to Supabase PostgreSQL');

    const ddl = `
      create table if not exists public.uploaded_files (
        id uuid primary key default gen_random_uuid(),
        profile_id uuid references public.profiles(id) on delete cascade,
        conversation_id uuid references public.conversations(id) on delete set null,
        storage_path text not null,
        file_type text not null,
        original_filename text,
        mime_type text,
        file_size_bytes integer,
        ai_description text,
        uploaded_at timestamptz default now()
      );

      create index if not exists idx_uploaded_files_profile_id on public.uploaded_files(profile_id);
      create index if not exists idx_uploaded_files_conversation_id on public.uploaded_files(conversation_id);
      create index if not exists idx_uploaded_files_uploaded_at on public.uploaded_files(uploaded_at);

      alter table public.uploaded_files enable row level security;

      do $$ begin
        if not exists (select 1 from pg_policies where tablename = 'uploaded_files' and policyname = 'Users can view own uploaded files') then
          create policy "Users can view own uploaded files"
            on public.uploaded_files for select
            using (profile_id in (
              select id from public.profiles where firebase_uid = current_setting('app.firebase_uid', true)
            ));
        end if;
        if not exists (select 1 from pg_policies where tablename = 'uploaded_files' and policyname = 'Users can insert own uploaded files') then
          create policy "Users can insert own uploaded files"
            on public.uploaded_files for insert
            with check (profile_id in (
              select id from public.profiles where firebase_uid = current_setting('app.firebase_uid', true)
            ));
        end if;
        if not exists (select 1 from pg_policies where tablename = 'uploaded_files' and policyname = 'Users can delete own uploaded files') then
          create policy "Users can delete own uploaded files"
            on public.uploaded_files for delete
            using (profile_id in (
              select id from public.profiles where firebase_uid = current_setting('app.firebase_uid', true)
            ));
        end if;
      end $$;
    `;

    console.log('Applying uploaded_files table DDL...');
    await client.query(ddl);
    console.log('✅ uploaded_files table and RLS policies applied successfully!');

    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'uploaded_files';
    `);
    console.log('Columns in uploaded_files:');
    console.table(res.rows);

    await client.end();
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  }
}

migrate();
