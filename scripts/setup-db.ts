import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(url, key);

async function main() {
  const sql = `
    create table if not exists uploaded_files (
      id uuid primary key default gen_random_uuid(),
      profile_id uuid references profiles(id) on delete cascade,
      conversation_id uuid references conversations(id) on delete set null,
      storage_path text not null,
      file_type text not null,
      original_filename text,
      mime_type text,
      file_size_bytes integer,
      ai_description text,
      uploaded_at timestamptz default now()
    );

    create index if not exists idx_uploaded_files_profile_id on uploaded_files(profile_id);
    create index if not exists idx_uploaded_files_conversation_id on uploaded_files(conversation_id);
    create index if not exists idx_uploaded_files_uploaded_at on uploaded_files(uploaded_at);

    alter table uploaded_files enable row level security;

    do $$ begin
      if not exists (select 1 from pg_policies where tablename = 'uploaded_files' and policyname = 'Users can view own uploaded files') then
        create policy "Users can view own uploaded files"
          on uploaded_files for select
          using (profile_id in (
            select id from profiles where firebase_uid = current_setting('app.firebase_uid', true)
          ));
      end if;
      if not exists (select 1 from pg_policies where tablename = 'uploaded_files' and policyname = 'Users can insert own uploaded files') then
        create policy "Users can insert own uploaded files"
          on uploaded_files for insert
          with check (profile_id in (
            select id from profiles where firebase_uid = current_setting('app.firebase_uid', true)
          ));
      end if;
      if not exists (select 1 from pg_policies where tablename = 'uploaded_files' and policyname = 'Users can delete own uploaded files') then
        create policy "Users can delete own uploaded files"
          on uploaded_files for delete
          using (profile_id in (
            select id from profiles where firebase_uid = current_setting('app.firebase_uid', true)
          ));
      end if;
    end $$;
  `;

  console.log('Attempting RPC exec_sql...');
  const res1 = await supabase.rpc('exec_sql', { query: sql });
  console.log('res1:', res1);

  const res2 = await supabase.rpc('execute_sql', { query: sql });
  console.log('res2:', res2);

  const testTable = await supabase.from('uploaded_files').select('*').limit(1);
  console.log('uploaded_files query test:', testTable);
}

main().catch(console.error);
