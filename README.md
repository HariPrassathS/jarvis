# 🤖 J.A.R.V.I.S — Personal AI Assistant

A JARVIS-inspired personal AI assistant web app with voice interaction, animated HUD UI, and multi-LLM routing.

## ✨ Features

- **Google Sign-In** via Firebase Auth (real OAuth, zero demo bypass)
- **Multi-LLM Router** — Groq → Gemini → OpenRouter fallback chain with circuit breakers & timeout protection
- **Voice Interaction & Sentry** — Continuous Always-On VAD listening with automatic Tap-to-Talk fallback on iOS/Safari
- **Holographic HUD UI** — 3D volumetric glass orb, 40° radar sweep, orbiting satellite dots, arc audio visualizer, scan lines, and Stark telemetry
- **Cinematic Boot Sequence** — 5-phase timed boot-up animation from dark viewport to active HUD
- **Fully Responsive Architecture** — Zero-overflow layouts adapted across mobile (320px+), tablet, and desktop viewports
- **Tool Calling** — Weather (Open-Meteo), web search (DuckDuckGo), memory storage
- **Long-Term Memory** — JARVIS remembers facts and personal preferences across sessions
- **Data Storage** — All conversations and memories persisted in Supabase (Postgres + RLS)
- **$0 Cost** — Everything runs on free tiers
- **Product Architecture & Specs** — Detailed in [`docs/JARVIS-Product-Plan.md`](docs/JARVIS-Product-Plan.md)

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Firebase project with Google Auth enabled
- Supabase project
- API keys: Groq, Gemini, OpenRouter

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.local.example .env.local
# Fill in your API keys and credentials

# 3. Set up database
# Run supabase/schema.sql in your Supabase SQL Editor

# 4. Start development server
npm run dev
```

### Environment Variables

See [`.env.local.example`](.env.local.example) for all required variables.

## 🏗️ Architecture

```
Firebase Auth (Google sign-in) → Vercel API Routes → Supabase (Postgres)
                                       ↓
                              LLM Router (Groq → Gemini → OpenRouter)
                                       ↓
                              Tool Executor (Weather, Search, Memory)
```

## 📁 Project Structure

```
src/
├── app/              # Next.js App Router pages + API routes
├── components/       # UI components (auth, chat, hud, voice)
├── contexts/         # React contexts (auth)
├── hooks/            # Custom hooks (chat, speech)
├── lib/              # Core logic (firebase, supabase, llm, tools)
└── types/            # TypeScript type definitions
```

## 🎨 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router, TypeScript) |
| Styling | Tailwind CSS + Framer Motion |
| Auth | Firebase Authentication (Google) |
| Database | Supabase (Postgres + RLS) |
| LLM | Groq, Gemini, OpenRouter (free tiers) |
| Voice | Web Speech API (STT + TTS) |
| Hosting | Vercel |

## 🌐 Browser Support

| Browser | Voice Support |
|---|---|
| Chrome / Edge | ✅ Full |
| Safari | ⚠️ Partial |
| Firefox | ⚠️ Limited |

## 📄 License

MIT
