-- ──────────────────────────────────────────────
-- JARVIS — Supabase Database Schema
-- Run this in your Supabase SQL Editor
-- ──────────────────────────────────────────────

-- profiles: mirrors Firebase identity + app-specific fields
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text unique not null,
  email text not null,
  display_name text,
  photo_url text,
  created_at timestamptz default now(),
  last_login_at timestamptz default now()
);

-- conversations: one row per chat session
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  title text,
  created_at timestamptz default now()
);

-- messages: chat history
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text check (role in ('user','assistant','system','tool')),
  content text,
  provider_used text,
  created_at timestamptz default now()
);

-- memory: long-term facts JARVIS remembers about the user
create table if not exists memory (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  key text not null,
  value text not null,
  updated_at timestamptz default now()
);

-- settings: per-user preferences
create table if not exists settings (
  profile_id uuid primary key references profiles(id) on delete cascade,
  voice_enabled boolean default true,
  preferred_provider text default 'groq',
  theme text default 'dark-hud',
  voice_persona text default 'jarvis',
  clearance_level integer default 9
);

-- uploaded_files: permanent metadata tracking for operator images & documents
create table if not exists uploaded_files (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  storage_path text not null,           -- path within the user-files bucket (e.g. {firebase_uid}/{file_id}-{filename})
  file_type text not null,              -- 'image' | 'document'
  original_filename text,
  mime_type text,
  file_size_bytes integer,
  ai_description text,                  -- the LLM's analysis/summary cached for long-term recall
  uploaded_at timestamptz default now()
);

-- provider_usage: global daily request & token budget tracking per LLM provider
create table if not exists provider_usage (
  provider text not null,
  date_utc date not null default current_date,
  request_count int not null default 0,
  token_count int not null default 0,
  last_used_at timestamptz default now(),
  primary key (provider, date_utc)
);

-- ── Indexes ────────────────────────────────────

create index if not exists idx_provider_usage_date on provider_usage(date_utc);

create index if not exists idx_profiles_firebase_uid on profiles(firebase_uid);
create index if not exists idx_conversations_profile_id on conversations(profile_id);
create index if not exists idx_messages_conversation_id on messages(conversation_id);
create index if not exists idx_messages_created_at on messages(created_at);
create index if not exists idx_memory_profile_id on memory(profile_id);
create index if not exists idx_memory_key on memory(profile_id, key);
create index if not exists idx_uploaded_files_profile_id on uploaded_files(profile_id);
create index if not exists idx_uploaded_files_conversation_id on uploaded_files(conversation_id);
create index if not exists idx_uploaded_files_uploaded_at on uploaded_files(uploaded_at);

-- ── Row Level Security ─────────────────────────

alter table profiles enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table memory enable row level security;
alter table settings enable row level security;
alter table uploaded_files enable row level security;

-- Profiles: users can only read their own profile
create policy "Users can view own profile"
  on profiles for select
  using (firebase_uid = current_setting('app.firebase_uid', true));

create policy "Service role can manage profiles"
  on profiles for all
  using (true)
  with check (true);

-- Conversations: users can only access their own conversations
create policy "Users can view own conversations"
  on conversations for select
  using (profile_id in (
    select id from profiles where firebase_uid = current_setting('app.firebase_uid', true)
  ));

create policy "Users can create own conversations"
  on conversations for insert
  with check (profile_id in (
    select id from profiles where firebase_uid = current_setting('app.firebase_uid', true)
  ));

-- Messages: users can access messages in their conversations
create policy "Users can view own messages"
  on messages for select
  using (conversation_id in (
    select c.id from conversations c
    join profiles p on c.profile_id = p.id
    where p.firebase_uid = current_setting('app.firebase_uid', true)
  ));

create policy "Users can create messages in own conversations"
  on messages for insert
  with check (conversation_id in (
    select c.id from conversations c
    join profiles p on c.profile_id = p.id
    where p.firebase_uid = current_setting('app.firebase_uid', true)
  ));

-- Memory: users can manage their own memory entries
create policy "Users can manage own memory"
  on memory for all
  using (profile_id in (
    select id from profiles where firebase_uid = current_setting('app.firebase_uid', true)
  ))
  with check (profile_id in (
    select id from profiles where firebase_uid = current_setting('app.firebase_uid', true)
  ));

-- Settings: users can manage their own settings
create policy "Users can manage own settings"
  on settings for all
  using (profile_id in (
    select id from profiles where firebase_uid = current_setting('app.firebase_uid', true)
  ))
  with check (profile_id in (
    select id from profiles where firebase_uid = current_setting('app.firebase_uid', true)
  ));

-- Uploaded Files: users can only access their own uploaded file metadata
create policy "Users can view own uploaded files"
  on uploaded_files for select
  using (profile_id in (
    select id from profiles where firebase_uid = current_setting('app.firebase_uid', true)
  ));

create policy "Users can insert own uploaded files"
  on uploaded_files for insert
  with check (profile_id in (
    select id from profiles where firebase_uid = current_setting('app.firebase_uid', true)
  ));

create policy "Users can delete own uploaded files"
  on uploaded_files for delete
  using (profile_id in (
    select id from profiles where firebase_uid = current_setting('app.firebase_uid', true)
  ));

-- ── Supabase Storage Policies (Bucket: 'user-files') ──
-- Scoped to folder prefix matching operator's firebase_uid: {firebase_uid}/{file_id}
create policy "Users can upload their own files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'user-files' and
    (storage.foldername(name))[1] = current_setting('app.firebase_uid', true)
  );

create policy "Users can view their own files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'user-files' and
    (storage.foldername(name))[1] = current_setting('app.firebase_uid', true)
  );

create policy "Users can delete their own files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'user-files' and
    (storage.foldername(name))[1] = current_setting('app.firebase_uid', true)
  );
