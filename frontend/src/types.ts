export interface Source {
  id: number
  title: string
  url: string
  excerpt?: string
}

export interface Turn {
  query: string
  answer: string
  sources: Source[]
  mode: 'search' | 'chat' | 'deep'
  searchedQuery: string
  durationMs: number
  related: string[]
}

export type AskMode = 'search' | 'deep'

export const MODE_KEY = 'verixa.mode.v1'

export interface Thread {
  id: string
  title: string
  turns: Turn[]
  ts: number
}

export interface Prefs {
  numResults: number
  stream: boolean
}

export interface Profile {
  name: string
  instructions: string
  occupation: string
  company: string
  dob: string
  gender: string
  shareLocation: boolean
  location: string
  responseLength: 'short' | 'default' | 'long'
  responseFormat: 'lists' | 'default' | 'paragraph'
}

export const DEFAULT_PREFS: Prefs = { numResults: 5, stream: true }
export const DEFAULT_PROFILE: Profile = {
  name: '',
  instructions: '',
  occupation: '',
  company: '',
  dob: '',
  gender: '',
  shareLocation: false,
  location: '',
  responseLength: 'default',
  responseFormat: 'default',
}
export const PREFS_KEY = 'verixa.prefs.v1'
export const PROFILE_KEY = 'verixa.profile.v1'

export interface Session {
  token: string
  id: string
  email: string
  full_name: string
  username: string
}

export interface Me {
  id: string
  email: string
  full_name: string
  username: string
  created_at: string
  memory_enabled: boolean
  memory_auto: boolean
}

export interface Memory {
  id: string
  content: string
  created_at: string
}

export type LLMProviderType =
  | 'default'
  | 'openai'
  | 'anthropic'
  | 'openrouter'
  | 'groq'
  | 'ollama'
  | 'custom'

export interface ProviderCredentials {
  apiKey?: string
  baseUrl?: string
  model?: string
}

export interface CustomSource {
  id: string
  name: string
  provider: LLMProviderType
  baseUrl: string
  apiKey?: string
  model: string
}

export interface LLMConfig {
  provider: LLMProviderType
  apiKey?: string
  baseUrl?: string
  model?: string
  activeSourceId?: string // 'default', provider id, or custom source id
  activeModelLabel?: string
  providers?: {
    openai?: ProviderCredentials
    anthropic?: ProviderCredentials
    openrouter?: ProviderCredentials
    groq?: ProviderCredentials
    ollama?: ProviderCredentials
    [key: string]: ProviderCredentials | undefined
  }
  customSources?: CustomSource[]
}

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'default',
  apiKey: '',
  baseUrl: '',
  model: '',
  activeSourceId: 'default',
  activeModelLabel: 'Server Default',
  providers: {
    openai: { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    anthropic: { apiKey: '', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-5-sonnet-latest' },
    openrouter: { apiKey: '', baseUrl: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-3.5-sonnet' },
    groq: { apiKey: '', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
    ollama: { apiKey: '', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' },
  },
  customSources: [],
}

export const LLM_CONFIG_KEY = 'verixa.llm_config.v1'

export function normalizeLLMConfig(saved: unknown): LLMConfig {
  if (!saved || typeof saved !== 'object') {
    return DEFAULT_LLM_CONFIG
  }
  const s = saved as Partial<LLMConfig>
  const providers = {
    ...DEFAULT_LLM_CONFIG.providers,
    ...(s.providers || {}),
  }
  // If older config had an active provider key, preserve it
  if (s.provider && s.provider !== 'default' && s.apiKey && !providers[s.provider]?.apiKey) {
    providers[s.provider] = {
      apiKey: s.apiKey,
      baseUrl: s.baseUrl || providers[s.provider]?.baseUrl,
      model: s.model || providers[s.provider]?.model,
    }
  }

  const customSources = Array.isArray(s.customSources) ? s.customSources : []
  const activeSourceId = s.activeSourceId || s.provider || 'default'

  return {
    ...DEFAULT_LLM_CONFIG,
    ...s,
    providers,
    customSources,
    activeSourceId,
  }
}


