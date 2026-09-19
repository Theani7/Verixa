import { useState } from 'react'
import { Eye, EyeSlash, ArrowCounterClockwise, Check } from '@phosphor-icons/react'
import type { LLMConfig, LLMProviderType } from '../../types'
import { DEFAULT_LLM_CONFIG } from '../../types'

export interface Preset {
  id: LLMProviderType
  name: string
  description: string
  defaultBaseUrl: string
  defaultModel: string
  models: string[]
  needsKey: boolean
}

export const PRESETS: Preset[] = [
  {
    id: 'default',
    name: 'Server Default',
    description: 'Use the model and API keys configured on the server.',
    defaultBaseUrl: '',
    defaultModel: '',
    models: [],
    needsKey: false,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, GPT-4o-mini, o1, etc. using your OpenAI API key.',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'o3-mini', 'gpt-3.5-turbo'],
    needsKey: true,
  },
  {
    id: 'anthropic',
    name: 'Claude (Anthropic)',
    description: 'Direct access to Claude 3.5 Sonnet and Haiku.',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-latest',
    models: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest'],
    needsKey: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Unified gateway for Claude, DeepSeek, Llama, and hundreds of models.',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-3.5-sonnet',
    models: [
      'anthropic/claude-3.5-sonnet',
      'deepseek/deepseek-r1',
      'openai/gpt-4o',
      'meta-llama/llama-3.3-70b-instruct',
    ],
    needsKey: true,
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Ultra-low latency inference using your own Groq API key.',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    models: [
      'llama-3.3-70b-versatile',
      'openai/gpt-oss-120b',
      'mixtral-8x7b-32768',
      'deepseek-r1-distill-llama-70b',
    ],
    needsKey: true,
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    description: 'Completely private, local inference without external API keys.',
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    models: ['llama3.2', 'llama3.1', 'mistral', 'deepseek-r1:8b', 'qwen2.5:7b'],
    needsKey: false,
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    description: 'Connect to LM Studio, vLLM, LocalAI, or custom OpenAI proxies.',
    defaultBaseUrl: 'http://localhost:1234/v1',
    defaultModel: '',
    models: [],
    needsKey: false,
  },
]

export interface ModelPaneProps {
  config: LLMConfig
  onChange: (config: LLMConfig) => void
}

export function ModelPane({ config, onChange }: ModelPaneProps) {
  const [showKey, setShowKey] = useState(false)
  const [savedBadge, setSavedBadge] = useState(false)

  const activePreset = PRESETS.find((p) => p.id === config.provider) ?? PRESETS[0]

  const handleProviderSelect = (provider: LLMProviderType) => {
    const preset = PRESETS.find((p) => p.id === provider) ?? PRESETS[0]
    onChange({
      provider,
      apiKey: provider === config.provider ? config.apiKey : '',
      baseUrl: preset.defaultBaseUrl,
      model: preset.defaultModel,
    })
    flashSaved()
  }

  const flashSaved = () => {
    setSavedBadge(true)
    setTimeout(() => setSavedBadge(false), 1500)
  }

  const handleReset = () => {
    onChange(DEFAULT_LLM_CONFIG)
    flashSaved()
  }

  return (
    <div className="settings-model-pane">
      <div className="settings-lead-row">
        <p className="settings-lead">
          Configure which LLM provider and model powers your answers. API keys are saved
          in this browser and sent directly with your questions.
        </p>
        {savedBadge && (
          <span className="settings-saved-badge">
            <Check size={14} weight="bold" /> Saved
          </span>
        )}
      </div>

      <div className="field">
        <label htmlFor="settings-provider-select">Provider</label>
        <select
          id="settings-provider-select"
          value={config.provider}
          onChange={(e) => handleProviderSelect(e.target.value as LLMProviderType)}
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <p className="settings-hint">{activePreset.description}</p>
      </div>

      {config.provider !== 'default' && (
        <>
          {activePreset.needsKey && (
            <div className="field">
              <label htmlFor="settings-llm-key">API Key</label>
              <div className="password-input-wrapper">
                <input
                  id="settings-llm-key"
                  type={showKey ? 'text' : 'password'}
                  value={config.apiKey ?? ''}
                  placeholder={`Enter your ${activePreset.name} API key`}
                  onChange={(e) => {
                    onChange({ ...config, apiKey: e.target.value })
                    flashSaved()
                  }}
                  autoComplete="off"
                  spellCheck="false"
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowKey(!showKey)}
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                  title={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          <div className="field">
            <label htmlFor="settings-llm-baseurl">API Base URL</label>
            <input
              id="settings-llm-baseurl"
              type="text"
              value={config.baseUrl ?? ''}
              placeholder={activePreset.defaultBaseUrl || 'https://...'}
              onChange={(e) => {
                onChange({ ...config, baseUrl: e.target.value })
                flashSaved()
              }}
              spellCheck="false"
            />
          </div>

          <div className="field">
            <label htmlFor="settings-llm-model">Model Name</label>
            <input
              id="settings-llm-model"
              type="text"
              value={config.model ?? ''}
              placeholder={activePreset.defaultModel || 'e.g. gpt-4o, llama-3.3-70b'}
              onChange={(e) => {
                onChange({ ...config, model: e.target.value })
                flashSaved()
              }}
              spellCheck="false"
            />
            {activePreset.models.length > 0 && (
              <div className="model-suggestions">
                <span className="model-suggestions-label">Popular models:</span>
                <div className="model-chip-group">
                  {activePreset.models.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`model-chip${config.model === m ? ' active' : ''}`}
                      onClick={() => {
                        onChange({ ...config, model: m })
                        flashSaved()
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <div className="settings-footer-actions">
        {config.provider !== 'default' && (
          <button
            type="button"
            className="settings-button ghost"
            onClick={handleReset}
          >
            <ArrowCounterClockwise size={15} />
            Reset to Server Default
          </button>
        )}
      </div>
    </div>
  )
}

export default ModelPane
