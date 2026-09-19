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

export interface LLMConfig {
  provider: LLMProviderType
  apiKey?: string
  baseUrl?: string
  model?: string
}

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'default',
  apiKey: '',
  baseUrl: '',
  model: '',
}

export const LLM_CONFIG_KEY = 'verixa.llm_config.v1'


