import type { LLMConfig, LLMProviderType, ProviderCredentials } from '../types'

export interface ProviderPreset {
  id: LLMProviderType
  name: string
  shortName: string
  description: string
  defaultBaseUrl: string
  defaultModel: string
  models: string[]
  needsKey: boolean
  badgeColor: string
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'default',
    name: 'Server Default',
    shortName: 'Default',
    description: 'Use the model and API keys configured on the server environment.',
    defaultBaseUrl: '',
    defaultModel: '',
    models: [],
    needsKey: false,
    badgeColor: '#10b981',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    shortName: 'OpenAI',
    description: 'Direct GPT-4o, GPT-4o-mini, o3-mini inference via OpenAI API key.',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini', 'gpt-4-turbo'],
    needsKey: true,
    badgeColor: '#10a37f',
  },
  {
    id: 'anthropic',
    name: 'Claude (Anthropic)',
    shortName: 'Claude',
    description: 'Direct access to Claude 3.5 Sonnet, Claude 3.5 Haiku, and Opus.',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-latest',
    models: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest'],
    needsKey: true,
    badgeColor: '#d97706',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    shortName: 'OpenRouter',
    description: 'Unified gateway for DeepSeek R1, Claude, Llama, and hundreds of models.',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-3.5-sonnet',
    models: [
      'anthropic/claude-3.5-sonnet',
      'deepseek/deepseek-r1',
      'openai/gpt-4o',
      'meta-llama/llama-3.3-70b-instruct',
      'google/gemini-2.0-flash-exp:free',
    ],
    needsKey: true,
    badgeColor: '#6366f1',
  },
  {
    id: 'groq',
    name: 'Groq',
    shortName: 'Groq',
    description: 'Ultra-low latency Llama 3.3 and DeepSeek R1 inference on LPU chips.',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    models: [
      'llama-3.3-70b-versatile',
      'deepseek-r1-distill-llama-70b',
      'mixtral-8x7b-32768',
    ],
    needsKey: true,
    badgeColor: '#f97316',
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    shortName: 'Ollama',
    description: 'Completely private local LLM running on your local machine.',
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    models: ['llama3.2', 'deepseek-r1:8b', 'mistral', 'qwen2.5:7b'],
    needsKey: false,
    badgeColor: '#a855f7',
  },
]

export function isProviderReady(config: LLMConfig, providerId: string): boolean {
  if (providerId === 'default' || providerId === 'ollama') return true
  const creds = config.providers?.[providerId]
  return Boolean(creds?.apiKey && creds.apiKey.trim().length > 0)
}

export function getShortModelName(modelName: string): string {
  if (!modelName) return ''
  // e.g. "anthropic/claude-3.5-sonnet" -> "Claude 3.5 Sonnet"
  // "deepseek/deepseek-r1" -> "DeepSeek R1"
  // "claude-3-5-sonnet-latest" -> "Claude 3.5 Sonnet"
  if (modelName.includes('/')) {
    const parts = modelName.split('/')
    return parts[parts.length - 1]
  }
  return modelName
}

export function activateLLMModel(
  config: LLMConfig,
  sourceId: string,
  modelName?: string
): LLMConfig {
  if (sourceId === 'default') {
    return {
      ...config,
      activeSourceId: 'default',
      activeModelLabel: 'Server Default',
      provider: 'default',
      apiKey: '',
      baseUrl: '',
      model: '',
    }
  }

  // Check custom sources
  const custom = config.customSources?.find((c) => c.id === sourceId)
  if (custom) {
    const chosenModel = modelName || custom.model
    return {
      ...config,
      activeSourceId: custom.id,
      activeModelLabel: `${custom.name} (${getShortModelName(chosenModel)})`,
      provider: custom.provider || 'custom',
      apiKey: custom.apiKey || '',
      baseUrl: custom.baseUrl || '',
      model: chosenModel,
    }
  }

  // Check standard presets
  const preset = PROVIDER_PRESETS.find((p) => p.id === sourceId)
  const creds = config.providers?.[sourceId] || {
    apiKey: '',
    baseUrl: preset?.defaultBaseUrl || '',
    model: preset?.defaultModel || '',
  }

  const chosenModel = modelName || creds.model || preset?.defaultModel || ''
  const displayLabel = chosenModel ? `${preset?.shortName || sourceId}: ${getShortModelName(chosenModel)}` : preset?.name || sourceId

  return {
    ...config,
    activeSourceId: sourceId,
    activeModelLabel: displayLabel,
    provider: (preset?.id || 'custom') as LLMProviderType,
    apiKey: creds.apiKey || '',
    baseUrl: creds.baseUrl || preset?.defaultBaseUrl || '',
    model: chosenModel,
  }
}

export function updateProviderCredentials(
  config: LLMConfig,
  providerId: string,
  updates: Partial<ProviderCredentials>
): LLMConfig {
  const existing = config.providers?.[providerId] || {}
  const mergedCreds: ProviderCredentials = { ...existing, ...updates }

  const nextProviders = {
    ...config.providers,
    [providerId]: mergedCreds,
  }

  // If this provider is currently active, sync active fields
  let nextConfig: LLMConfig = {
    ...config,
    providers: nextProviders,
  }

  if (config.activeSourceId === providerId) {
    nextConfig = {
      ...nextConfig,
      apiKey: mergedCreds.apiKey ?? config.apiKey,
      baseUrl: mergedCreds.baseUrl ?? config.baseUrl,
      model: mergedCreds.model ?? config.model,
      activeModelLabel: `${providerId}: ${getShortModelName(mergedCreds.model || '')}`,
    }
  }

  return nextConfig
}
