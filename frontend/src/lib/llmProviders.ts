import type { LLMConfig, LLMProviderType, ModelSource } from '../types'

export interface ProviderMeta {
  id: LLMProviderType
  name: string
  defaultBaseUrl: string
  needsKey: boolean
}

export const PROVIDER_METAS: ProviderMeta[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    needsKey: true,
  },
  {
    id: 'anthropic',
    name: 'Claude (Anthropic)',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    needsKey: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    needsKey: true,
  },
  {
    id: 'groq',
    name: 'Groq',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    needsKey: true,
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    defaultBaseUrl: 'http://localhost:11434/v1',
    needsKey: false,
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    defaultBaseUrl: '',
    needsKey: false,
  },
]

export function activateLLMSource(config: LLMConfig, sourceId: string): LLMConfig {
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

  const source = config.sources.find((s) => s.id === sourceId)
  if (!source) {
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

  return {
    ...config,
    activeSourceId: source.id,
    activeModelLabel: `${source.name} (${source.model})`,
    provider: source.provider,
    apiKey: source.apiKey || '',
    baseUrl: source.baseUrl || '',
    model: source.model,
  }
}

export function addLLMSource(
  config: LLMConfig,
  sourceData: Omit<ModelSource, 'id'>
): LLMConfig {
  const newSource: ModelSource = {
    ...sourceData,
    id: `src_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  }

  const nextSources = [...config.sources, newSource]
  return activateLLMSource({ ...config, sources: nextSources }, newSource.id)
}

export function updateLLMSource(config: LLMConfig, updated: ModelSource): LLMConfig {
  const nextSources = config.sources.map((s) => (s.id === updated.id ? updated : s))
  let nextConfig = { ...config, sources: nextSources }
  if (config.activeSourceId === updated.id) {
    nextConfig = activateLLMSource(nextConfig, updated.id)
  }
  return nextConfig
}

export function deleteLLMSource(config: LLMConfig, sourceId: string): LLMConfig {
  const nextSources = config.sources.filter((s) => s.id !== sourceId)
  let nextConfig = { ...config, sources: nextSources }
  if (config.activeSourceId === sourceId) {
    nextConfig = activateLLMSource(nextConfig, 'default')
  }
  return nextConfig
}
