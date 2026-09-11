// ──────────────────────────────────────────────
// JARVIS — Core Type Definitions
// ──────────────────────────────────────────────

/** Visual state of the JARVIS orb */
export type JarvisState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'receiving';

/** LLM provider identifiers */
export type LLMProvider = 'groq' | 'gemini' | 'openrouter' | 'cloudflare';

/** Dual voice persona: JARVIS (male butler) or FRIDAY (female tactical) */
export type VoicePersona = 'jarvis' | 'friday';

/** Task-based router request classification */
export type RequestTaskType = 'quick_chat' | 'vision' | 'deep_summary' | 'stt';

/** Chat message roles */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/** Multi-modal attachments (Images, PDFs, Text Documents) */
export interface ChatAttachment {
  id: string;
  type: 'image' | 'document';
  name: string;
  mimeType: string;
  size: number;
  dataUrl?: string; // base64 data for images
  extractedText?: string; // extracted text content for documents
  pageCount?: number;
}

export type ClearanceLevel = 1 | 5 | 9;

// ── Database Models ──────────────────────────

export interface UserProfile {
  id: string;
  firebase_uid: string;
  email: string;
  display_name: string | null;
  photo_url: string | null;
  created_at: string;
  last_login_at: string;
  clearance_level?: ClearanceLevel;
}

export interface Conversation {
  id: string;
  profile_id: string;
  title: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  provider_used: LLMProvider | null;
  created_at: string;
  attachments?: ChatAttachment[];
}

export interface MemoryEntry {
  id: string;
  profile_id: string;
  key: string;
  value: string;
  updated_at: string;
  follow_up_relevant?: boolean;
  inferred_date?: string | null;
  followed_up?: boolean;
  mention_count?: number;
  topic?: string;
}

export interface UserSettings {
  profile_id: string;
  voice_enabled: boolean;
  preferred_provider: LLMProvider;
  theme: string;
  voice_persona: VoicePersona;
  clearance_level?: ClearanceLevel;
}

// ── LLM Router ───────────────────────────────

export interface LLMResponse {
  content: string;
  provider_used: LLMProvider;
  tool_calls?: ToolCall[];
}

export interface ChatMessage {
  role: MessageRole;
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: ToolCall[];
  attachments?: ChatAttachment[];
}


// ── Tool Calling ─────────────────────────────

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
      }>;
      required: string[];
    };
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  tool_call_id: string;
  name?: string;
  content: string;
}

// ── Streaming ────────────────────────────────

/** SSE chunk payload for streaming LLM responses */
export interface StreamChunk {
  token?: string;
  done?: boolean;
  provider_used?: LLMProvider;
  tool_calls?: ToolCall[];
  error?: string;
}

/** Async generator function signature for streaming provider adapters */
export type StreamingProviderFn = (
  messages: ChatMessage[],
  tools?: ToolDefinition[]
) => AsyncGenerator<StreamChunk, void, unknown>;

// ── API Request/Response ─────────────────────

export interface ChatRequest {
  messages: ChatMessage[];
  conversation_id?: string;
  voice_persona?: VoicePersona;
}

export interface ChatAPIResponse {
  message: string;
  provider_used: LLMProvider;
  conversation_id: string;
  voice_persona?: VoicePersona;
}

export interface AuthSessionRequest {
  id_token: string;
}

export interface AuthSessionResponse {
  profile: UserProfile;
}
