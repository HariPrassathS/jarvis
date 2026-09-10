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
  voice_persona text default 'jarvis'
);

-- ── Indexes ────────────────────────────────────

create index if not exists idx_profiles_firebase_uid on profiles(firebase_uid);
create index if not exists idx_conversations_profile_id on conversations(profile_id);
create index if not exists idx_messages_conversation_id on messages(conversation_id);
create index if not exists idx_messages_created_at on messages(created_at);
create index if not exists idx_memory_profile_id on memory(profile_id);
create index if not exists idx_memory_key on memory(profile_id, key);

-- ── Row Level Security ─────────────────────────

alter table profiles enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table memory enable row level security;
alter table settings enable row level security;

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
