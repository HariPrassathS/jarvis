# Project JARVIS — Product Plan

A personal AI assistant, inspired by Tony Stark's JARVIS. Web-based, voice-enabled,
animated UI, powered by multiple free LLM APIs, with Google login (Firebase Auth)
and data storage on Supabase. Deployed on Vercel.

---

## 1. Product Vision

A single web app that:
- Logs you in with **Google (via Firebase Auth)** — auth only, nothing else in Firebase.
- Stores **everything else** (chat history, user profile, memory, settings, tasks) in **Supabase (Postgres)**.
- Talks to you via voice (mic in, speech out) and text.
- Answers using a **router across multiple free LLM APIs** (Groq, Gemini, OpenRouter free tier) with automatic fallback.
- Has a JARVIS-like animated UI (reactive orb / waveform, dark HUD theme).
- Can be extended later to control apps/files on your own machine via a local companion agent.

**Non-goals (for v1):** true OS-level device control from the browser, always-on background listening outside the browser tab, mobile native app.

---

## 2. High-Level Architecture

```
┌───────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                     │
│  - Deployed on Vercel                                      │
│  - Firebase Google Sign-In (auth only)                     │
│  - Animated HUD UI (Framer Motion / Three.js orb)          │
│  - Mic input (Web Speech API) + TTS output                 │
└───────────────────┬─────────────────────────────────────────┘
                    │ (Firebase ID token sent with requests)
┌───────────────────▼─────────────────────────────────────────┐
│              Vercel Serverless API Routes                  │
│  /api/auth/session   -> verify Firebase token, upsert user │
│                          into Supabase                     │
│  /api/chat           -> LLM router (Groq -> Gemini ->      │
│                          OpenRouter fallback chain)         │
│  /api/memory         -> read/write user memory in Supabase │
│  /api/tools/*        -> tool-calling endpoints (weather,   │
│                          web search, reminders, etc.)      │
└───────────────────┬─────────────────────────────────────────┘
                    │
     ┌──────────────┼──────────────────┬─────────────────┐
     ▼               ▼                 ▼                 ▼
  Firebase Auth   Supabase (DB)     Groq / Gemini /   Free tool APIs
  (Google login    (profiles,       OpenRouter        (weather, search)
   only)            chats, memory)   (LLM brains)
```

**Key rule:** Firebase is used ONLY for authentication (Google sign-in, issuing an
ID token). No app data lives in Firestore. All persistent data — user profile
mirror, chat history, memory, settings — lives in Supabase (Postgres).

---

## 3. Auth Flow (Firebase → Supabase)

1. User clicks "Sign in with Google" → Firebase Auth popup/redirect.
2. Firebase returns an **ID token** + basic profile (name, email, photoURL, uid).
3. Frontend sends that ID token to `POST /api/auth/session`.
4. Backend verifies the token using **Firebase Admin SDK**.
5. Backend **upserts** a row into Supabase `profiles` table, keyed by `firebase_uid`,
   using the name/email/photo pulled from the verified token.
6. Backend issues its own **Supabase-compatible session** (either a signed cookie
   or a Supabase custom JWT) so subsequent requests can use Supabase Row Level
   Security (RLS) tied to `firebase_uid`.
7. Frontend stores session, fetches profile from Supabase (not Firebase) from
   then on.

This way: **Firebase = "who are you"**, **Supabase = "everything about you and
your data."**

---

## 4. Database Schema (Supabase / Postgres)

```sql
-- profiles: mirrors Firebase identity + app-specific fields
create table profiles (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text unique not null,
  email text not null,
  display_name text,
  photo_url text,
  created_at timestamptz default now(),
  last_login_at timestamptz default now()
);

-- conversations: one row per chat session
create table conversations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  title text,
  created_at timestamptz default now()
);

-- messages: chat history
create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text check (role in ('user','assistant','system','tool')),
  content text,
  provider_used text,        -- e.g. 'groq', 'gemini', 'openrouter'
  created_at timestamptz default now()
);

-- memory: long-term facts JARVIS remembers about the user
create table memory (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  key text,
  value text,
  updated_at timestamptz default now()
);

-- settings: per-user preferences (voice on/off, wake word, theme)
create table settings (
  profile_id uuid primary key references profiles(id) on delete cascade,
  voice_enabled boolean default true,
  preferred_provider text default 'groq',
  theme text default 'dark-hud'
);
```

Row Level Security: every table filtered by `profile_id` matching the
authenticated user's Supabase JWT claim (`firebase_uid`).

---

## 5. LLM Router (Multi-API, Free Tier, With Fallback)

**Goal:** never pay, never fully break — if one provider is rate-limited, fall
through to the next.

Priority order (adjustable in `settings`):

| Priority | Provider | Model | Notes |
|---|---|---|---|
| 1 | Groq | Llama 3.3 70B / 8B | Fastest responses, generous free tier |
| 2 | Google Gemini | Gemini 2.0 Flash | Free tier, multimodal (can see images) |
| 3 | OpenRouter | Free-tagged models pool | Backup when both above fail |

`lib/router.ts` logic:
1. Try provider 1 with a short timeout.
2. On error / 429 rate limit → try provider 2.
3. On error → try provider 3.
4. Log which provider actually answered (`provider_used`) into `messages` table
   for transparency/debugging.
5. All API keys stored as **Vercel environment variables** (`GROQ_API_KEY`,
   `GEMINI_API_KEY`, `OPENROUTER_API_KEY`) — never exposed to the client.

---

## 6. Voice (100% Free, Browser-Native)

- **Speech-to-text:** Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`)
  — built into Chrome, zero cost, zero server round-trip for transcription.
- **Text-to-speech:** Web Speech Synthesis API (`speechSynthesis`) — built into
  the browser, pick a natural-sounding voice from the available system voices.
- Fallback note: Web Speech API browser support varies — Chrome/Edge best,
  Safari partial, Firefox limited. Document this as a known limitation in v1.

---

## 7. UI / UX Plan

- **Framework:** Next.js (App Router) + Tailwind CSS + Framer Motion.
- **Visual identity:** dark HUD theme — deep navy/black background, cyan/blue
  glow accents (JARVIS arc-reactor palette).
- **Core visual element:** a central animated orb/ring that:
  - Pulses gently when idle.
  - Ripples/waveforms while listening.
  - Rotates or brightens while "thinking" (LLM call in flight).
  - Syncs subtle animation to speech while talking (TTS output).
- **Optional stretch:** Three.js for a 3D rotating HUD ring instead of flat SVG.
- **Chat log:** minimal, transcript-style, collapsible — voice-first, not
  text-first.
- **Auth UI:** single "Sign in with Google" button, Firebase-hosted popup.

---

## 8. Tools / Capabilities (v1, all free)

| Tool | Source | Notes |
|---|---|---|
| Web search | DuckDuckGo free API / SerpAPI free tier | For up-to-date answers |
| Weather | Open-Meteo (free, no key needed) | Location-based |
| Reminders/notes | Supabase `memory` table | Stored per user |
| Calendar (stretch) | Google Calendar API via OAuth | Reuses Google login scopes |

Tool-calling is implemented via each provider's function-calling support
(Groq/Gemini both support OpenAI-style tool schemas).

---

## 9. Roadmap / Phases

**Phase 1 — Foundation**
- Next.js project scaffold, deployed to Vercel.
- Firebase Google Auth wired up (auth only).
- Supabase project + schema above, profile upsert on login.

**Phase 2 — Brain**
- `/api/chat` route with multi-provider router + fallback.
- Store messages in Supabase, tied to `conversation_id`.
- Basic text chat UI working end-to-end.

**Phase 3 — Voice**
- Web Speech API mic input.
- Web Speech Synthesis output.
- Push-to-talk button, then optional wake-word later.

**Phase 4 — Animated HUD UI**
- Orb/ring component with Framer Motion states (idle/listening/thinking/speaking).
- Full JARVIS visual theme.

**Phase 5 — Tools & Memory**
- Web search, weather, reminders wired in as callable tools.
- Long-term memory read/write (`memory` table) so JARVIS "remembers" facts
  about you across sessions.

**Phase 6 (optional, later) — Local Device Agent**
- A small local Node.js companion app on your own machine.
- Vercel-hosted UI sends commands over a WebSocket to this local agent.
- Explicit, user-approved allow-list of actions (open specific apps, run
  specific scripts) — deliberately scoped for safety, since this is the one
  part of the system with real security risk if built carelessly.

---

## 10. Environment Variables (Vercel)

```
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

GROQ_API_KEY=
GEMINI_API_KEY=
OPENROUTER_API_KEY=
```

---

## 11. Tech Stack Summary

| Layer | Choice |
|---|---|
| Frontend framework | Next.js (App Router, TypeScript) |
| Styling / animation | Tailwind CSS + Framer Motion (+ optional Three.js) |
| Auth | Firebase Authentication (Google provider only) |
| Database | Supabase (Postgres + RLS) |
| LLM brains | Groq, Gemini, OpenRouter (free tiers, router w/ fallback) |
| Voice | Web Speech API (STT) + Web Speech Synthesis (TTS) — free, browser-native |
| Hosting | Vercel |
| Cost | $0 — all free tiers |

---

## 12. Known Limitations (Be Honest About These)

- Browser sandboxing means no real filesystem/app control without the optional
  Phase 6 local agent.
- Free LLM tiers have daily/rate limits — the fallback chain mitigates this
  but doesn't eliminate it.
- Web Speech API quality/support varies by browser.
- Local-agent device control (Phase 6) is the highest-risk part of the system
  from a security standpoint and should only be built with a tightly scoped
  allow-list.
