// ──────────────────────────────────────────────
// JARVIS — Core Type Definitions
// ──────────────────────────────────────────────

/** Visual state of the JARVIS orb */
export type JarvisState = 'idle' | 'listening' | 'thinking' | 'speaking';

/** LLM provider identifiers */
export type LLMProvider = 'groq' | 'gemini' | 'openrouter';

/** Chat message roles */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

// ── Database Models ──────────────────────────

export interface UserProfile {
  id: string;
  firebase_uid: string;
  email: string;
  display_name: string | null;
  photo_url: string | null;
  created_at: string;
  last_login_at: string;
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
}

export interface MemoryEntry {
  id: string;
  profile_id: string;
  key: string;
  value: string;
  updated_at: string;
}

export interface UserSettings {
  profile_id: string;
  voice_enabled: boolean;
  preferred_provider: LLMProvider;
  theme: string;
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

// ── API Request/Response ─────────────────────

export interface ChatRequest {
  messages: ChatMessage[];
  conversation_id?: string;
}

export interface ChatAPIResponse {
  message: string;
  provider_used: LLMProvider;
  conversation_id: string;
}

export interface AuthSessionRequest {
  id_token: string;
}

export interface AuthSessionResponse {
  profile: UserProfile;
}
