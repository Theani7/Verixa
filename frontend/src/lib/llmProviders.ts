import type { LLMConfig, LLMProviderType, ProviderConfig } from '../types'

export interface ProviderMeta {
  id: LLMProviderType
  name: string
  defaultBaseUrl: string
  needsKey: boolean
  accentColor: string
}

export const PROVIDER_METAS: ProviderMeta[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    needsKey: true,
    accentColor: '#10a37f',
  },
  {
    id: 'anthropic',
    name: 'Claude (Anthropic)',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    needsKey: true,
    accentColor: '#d97706',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    needsKey: true,
    accentColor: '#6366f1',
  },
  {
    id: 'groq',
    name: 'Groq',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    needsKey: true,
    accentColor: '#f97316',
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    defaultBaseUrl: 'http://localhost:11434/v1',
    needsKey: false,
    accentColor: '#a855f7',
  },
  {
    id: 'custom',
    name: 'Custom Endpoint',
    defaultBaseUrl: '',
    needsKey: false,
    accentColor: '#0ea5e9',
  },
]

export function selectActiveModel(
  config: LLMConfig,
  providerId: string,
  modelName: string = ''
): LLMConfig {
  if (providerId === 'default' || !modelName) {
    return {
      ...config,
      activeProviderId: 'default',
      activeModel: '',
      activeModelLabel: 'Server Default',
      provider: 'default',
      apiKey: '',
      baseUrl: '',
      model: '',
    }
  }

  const prov = config.providers.find((p) => p.id === providerId)
  if (!prov) {
    return {
      ...config,
      activeProviderId: 'default',
      activeModel: '',
      activeModelLabel: 'Server Default',
      provider: 'default',
      apiKey: '',
      baseUrl: '',
      model: '',
    }
  }

  return {
    ...config,
    activeProviderId: prov.id,
    activeModel: modelName,
    activeModelLabel: `${prov.name} (${modelName})`,
    provider: prov.provider,
    apiKey: prov.apiKey || '',
    baseUrl: prov.baseUrl || '',
    model: modelName,
  }
}

export function parseModelInput(input: string): string[] {
  return input
    .split(/[\n,]+/)
    .map((m) => m.trim())
    .filter((m) => m.length > 0)
}

export function addModelsToProvider(
  config: LLMConfig,
  providerId: string,
  newModels: string[]
): LLMConfig {
  const prov = config.providers.find((p) => p.id === providerId)
  if (!prov) return config

  const existingSet = new Set(prov.models)
  const toAdd = newModels.filter((m) => !existingSet.has(m))
  if (toAdd.length === 0) return config

  const updatedModels = [...prov.models, ...toAdd]
  const updatedProviders = config.providers.map((p) =>
    p.id === providerId ? { ...p, models: updatedModels } : p
  )

  let nextConfig = { ...config, providers: updatedProviders }

  // If no model is currently selected for this provider and it's active, activate the first model
  if (config.activeProviderId === providerId && !config.activeModel) {
    nextConfig = selectActiveModel(nextConfig, providerId, toAdd[0])
  }

  return nextConfig
}

export function removeModelFromProvider(
  config: LLMConfig,
  providerId: string,
  modelName: string
): LLMConfig {
  const prov = config.providers.find((p) => p.id === providerId)
  if (!prov) return config

  const updatedModels = prov.models.filter((m) => m !== modelName)
  const updatedProviders = config.providers.map((p) =>
    p.id === providerId ? { ...p, models: updatedModels } : p
  )

  let nextConfig = { ...config, providers: updatedProviders }

  // If the deleted model was active, switch to next available model or default
  if (config.activeProviderId === providerId && config.activeModel === modelName) {
    if (updatedModels.length > 0) {
      nextConfig = selectActiveModel(nextConfig, providerId, updatedModels[0])
    } else {
      nextConfig = selectActiveModel(nextConfig, 'default', '')
    }
  }

  return nextConfig
}

export function updateProvider(
  config: LLMConfig,
  providerId: string,
  updates: Partial<ProviderConfig>
): LLMConfig {
  const updatedProviders = config.providers.map((p) =>
    p.id === providerId ? { ...p, ...updates } : p
  )

  let nextConfig = { ...config, providers: updatedProviders }

  if (config.activeProviderId === providerId) {
    const activeProv = updatedProviders.find((p) => p.id === providerId)
    if (activeProv) {
      nextConfig = {
        ...nextConfig,
        apiKey: activeProv.apiKey || '',
        baseUrl: activeProv.baseUrl || '',
      }
    }
  }

  return nextConfig
}

export function addCustomProvider(
  config: LLMConfig,
  custom: {
    name: string
    provider: LLMProviderType
    baseUrl: string
    apiKey?: string
    models: string[]
  }
): LLMConfig {
  const id = `custom_${Date.now()}`
  const newProv: ProviderConfig = {
    id,
    name: custom.name,
    provider: custom.provider,
    baseUrl: custom.baseUrl,
    apiKey: custom.apiKey,
    models: custom.models,
    isCustom: true,
  }

  const updatedProviders = [...config.providers, newProv]
  let nextConfig: LLMConfig = { ...config, providers: updatedProviders }

  if (newProv.models.length > 0) {
    nextConfig = selectActiveModel(nextConfig, newProv.id, newProv.models[0])
  }

  return nextConfig
}

export function deleteCustomProvider(
  config: LLMConfig,
  providerId: string
): LLMConfig {
  const updatedProviders = config.providers.filter((p) => p.id !== providerId)
  let nextConfig = { ...config, providers: updatedProviders }

  if (config.activeProviderId === providerId) {
    nextConfig = selectActiveModel(nextConfig, 'default', '')
  }

  return nextConfig
}
