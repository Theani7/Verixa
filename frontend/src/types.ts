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

export interface ModelSource {
  id: string
  name: string
  provider: LLMProviderType
  model: string
  apiKey?: string
  baseUrl?: string
}

export interface LLMConfig {
  provider: LLMProviderType
  apiKey?: string
  baseUrl?: string
  model?: string
  activeSourceId?: string
  activeModelLabel?: string
  sources: ModelSource[]
}

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'default',
  apiKey: '',
  baseUrl: '',
  model: '',
  activeSourceId: 'default',
  activeModelLabel: 'Server Default',
  sources: [],
}

export const LLM_CONFIG_KEY = 'verixa.llm_config.v1'

export function normalizeLLMConfig(saved: unknown): LLMConfig {
  if (!saved || typeof saved !== 'object') {
    return DEFAULT_LLM_CONFIG
  }
  const s = saved as Partial<LLMConfig> & { customSources?: ModelSource[]; providers?: Record<string, { apiKey?: string; baseUrl?: string; model?: string }> }

  let sources: ModelSource[] = []
  if (Array.isArray(s.sources)) {
    sources = s.sources
  } else if (Array.isArray(s.customSources)) {
    sources = s.customSources
  } else if (s.providers && typeof s.providers === 'object') {
    for (const [prov, creds] of Object.entries(s.providers)) {
      if (creds && creds.apiKey && creds.model) {
        sources.push({
          id: `source_${prov}`,
          name: prov.toUpperCase(),
          provider: prov as LLMProviderType,
          model: creds.model,
          apiKey: creds.apiKey,
          baseUrl: creds.baseUrl,
        })
      }
    }
  }

  const activeSourceId = s.activeSourceId || s.provider || 'default'
  const activeSource = sources.find((src) => src.id === activeSourceId)

  return {
    ...DEFAULT_LLM_CONFIG,
    ...s,
    sources,
    activeSourceId: activeSource ? activeSource.id : (s.provider === 'default' ? 'default' : s.activeSourceId || 'default'),
    provider: activeSource ? activeSource.provider : (s.provider || 'default'),
    apiKey: activeSource ? (activeSource.apiKey || '') : (s.apiKey || ''),
    baseUrl: activeSource ? (activeSource.baseUrl || '') : (s.baseUrl || ''),
    model: activeSource ? activeSource.model : (s.model || ''),
    activeModelLabel: activeSource ? `${activeSource.name} (${activeSource.model})` : 'Server Default',
  }
}


