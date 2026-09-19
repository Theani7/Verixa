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
  thought?: string
  thoughtDurationMs?: number
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

export interface ProviderConfig {
  id: string
  name: string
  provider: LLMProviderType
  apiKey?: string
  baseUrl?: string
  models: string[]
  isCustom?: boolean
}

export const INITIAL_PROVIDERS: ProviderConfig[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    models: [],
  },
  {
    id: 'anthropic',
    name: 'Claude (Anthropic)',
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKey: '',
    models: [],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: '',
    models: [],
  },
  {
    id: 'groq',
    name: 'Groq',
    provider: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: '',
    models: [],
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    provider: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: '',
    models: [],
  },
]

export interface LLMConfig {
  activeProviderId: string
  activeModel?: string
  activeModelLabel?: string
  provider: LLMProviderType
  apiKey?: string
  baseUrl?: string
  model?: string
  providers: ProviderConfig[]
}

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  activeProviderId: 'default',
  activeModel: '',
  activeModelLabel: 'Server Default',
  provider: 'default',
  apiKey: '',
  baseUrl: '',
  model: '',
  providers: INITIAL_PROVIDERS,
}

export const LLM_CONFIG_KEY = 'verixa.llm_config.v1'

export function normalizeLLMConfig(saved: unknown): LLMConfig {
  if (!saved || typeof saved !== 'object') {
    return DEFAULT_LLM_CONFIG
  }
  const s = saved as Partial<LLMConfig> & {
    sources?: Array<{ id: string; name: string; provider: LLMProviderType; model: string; apiKey?: string; baseUrl?: string }>
  }

  let providers: ProviderConfig[] = INITIAL_PROVIDERS.map((p) => ({ ...p, models: [...p.models] }))

  if (Array.isArray(s.providers) && s.providers.length > 0) {
    const savedMap = new Map<string, ProviderConfig>()
    for (const p of s.providers) {
      if (p && p.id) savedMap.set(p.id, p)
    }
    // Merge standard providers with saved credentials and models
    providers = INITIAL_PROVIDERS.map((init) => {
      const existing = savedMap.get(init.id)
      if (existing) {
        savedMap.delete(init.id)
        return {
          ...init,
          ...existing,
          models: Array.isArray(existing.models) ? existing.models : [],
        }
      }
      return { ...init }
    })
    // Add any remaining custom providers
    for (const [, custom] of savedMap) {
      if (custom && custom.id) {
        providers.push({
          ...custom,
          models: Array.isArray(custom.models) ? custom.models : [],
          isCustom: true,
        })
      }
    }
  } else if (Array.isArray(s.sources) && s.sources.length > 0) {
    // Migration from previous source format
    for (const src of s.sources) {
      const match = providers.find((p) => p.id === src.provider)
      if (match) {
        if (src.apiKey && !match.apiKey) match.apiKey = src.apiKey
        if (src.baseUrl && !match.baseUrl) match.baseUrl = src.baseUrl
        if (src.model && !match.models.includes(src.model)) {
          match.models.push(src.model)
        }
      } else {
        // Custom provider
        providers.push({
          id: src.id,
          name: src.name || 'Custom',
          provider: src.provider,
          apiKey: src.apiKey,
          baseUrl: src.baseUrl,
          models: src.model ? [src.model] : [],
          isCustom: true,
        })
      }
    }
  }

  const activeProviderId = s.activeProviderId || (s.provider && s.provider !== 'default' ? s.provider : 'default')
  const activeModel = s.activeModel || s.model || ''
  const activeProv = providers.find((p) => p.id === activeProviderId)

  let activeModelLabel = 'Server Default'
  if (activeProviderId !== 'default' && activeProv && activeModel) {
    activeModelLabel = `${activeProv.name} (${activeModel})`
  }

  return {
    activeProviderId: activeProv ? activeProv.id : 'default',
    activeModel: activeProv ? activeModel : '',
    activeModelLabel,
    provider: activeProv ? activeProv.provider : 'default',
    apiKey: activeProv ? (activeProv.apiKey || '') : '',
    baseUrl: activeProv ? (activeProv.baseUrl || '') : '',
    model: activeProv ? activeModel : '',
    providers,
  }
}


