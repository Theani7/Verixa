import { useState } from 'react'
import {
  Eye,
  EyeSlash,
  ArrowCounterClockwise,
  Check,
  Plus,
  Trash,
  GlobeHemisphereWest,
  Sparkle,
} from '@phosphor-icons/react'
import type { CustomSource, LLMConfig, LLMProviderType } from '../../types'
import { DEFAULT_LLM_CONFIG } from '../../types'
import {
  PROVIDER_PRESETS,
  activateLLMModel,
  isProviderReady,
  updateProviderCredentials,
} from '../../lib/llmProviders'

export interface ModelPaneProps {
  config: LLMConfig
  onChange: (config: LLMConfig) => void
  numResults?: number
  onNumResultsChange?: (numResults: number) => void
}

export function ModelPane({
  config,
  onChange,
  numResults = 5,
  onNumResultsChange,
}: ModelPaneProps) {
  const [selectedProviderTab, setSelectedProviderTab] = useState<LLMProviderType>(
    (config.provider === 'custom' ? 'openai' : config.provider) || 'openai'
  )
  const [showKey, setShowKey] = useState(false)
  const [savedBadge, setSavedBadge] = useState(false)

  // Custom source form state
  const [isAddingCustom, setIsAddingCustom] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [customApiKey, setCustomApiKey] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [customProviderType, setCustomProviderType] = useState<LLMProviderType>('custom')
  const [customFormError, setCustomFormError] = useState('')

  const flashSaved = () => {
    setSavedBadge(true)
    setTimeout(() => setSavedBadge(false), 1500)
  }

  const activePreset =
    PROVIDER_PRESETS.find((p) => p.id === selectedProviderTab) ?? PROVIDER_PRESETS[1]

  const currentCreds = config.providers?.[selectedProviderTab] || {
    apiKey: '',
    baseUrl: activePreset.defaultBaseUrl,
    model: activePreset.defaultModel,
  }

  const handleKeyChange = (apiKey: string) => {
    const updated = updateProviderCredentials(config, selectedProviderTab, { apiKey })
    onChange(updated)
    flashSaved()
  }

  const handleBaseUrlChange = (baseUrl: string) => {
    const updated = updateProviderCredentials(config, selectedProviderTab, { baseUrl })
    onChange(updated)
    flashSaved()
  }

  const handleModelChange = (model: string) => {
    const updated = updateProviderCredentials(config, selectedProviderTab, { model })
    onChange(updated)
    flashSaved()
  }

  const handleActivateProvider = (providerId: string, modelName?: string) => {
    const updated = activateLLMModel(config, providerId, modelName)
    onChange(updated)
    flashSaved()
  }

  const handleAddCustomSource = () => {
    if (!customName.trim()) {
      setCustomFormError('Please enter a source name.')
      return
    }
    if (!customBaseUrl.trim()) {
      setCustomFormError('Please enter a valid Base URL endpoint.')
      return
    }
    if (!customModel.trim()) {
      setCustomFormError('Please enter the model name.')
      return
    }

    const newSource: CustomSource = {
      id: `custom_${Date.now()}`,
      name: customName.trim(),
      provider: customProviderType,
      baseUrl: customBaseUrl.trim(),
      apiKey: customApiKey.trim() || undefined,
      model: customModel.trim(),
    }

    const nextCustomSources = [...(config.customSources || []), newSource]
    const updated = activateLLMModel(
      { ...config, customSources: nextCustomSources },
      newSource.id
    )
    onChange(updated)

    // Reset form
    setCustomName('')
    setCustomBaseUrl('')
    setCustomApiKey('')
    setCustomModel('')
    setIsAddingCustom(false)
    setCustomFormError('')
    flashSaved()
  }

  const handleDeleteCustomSource = (id: string) => {
    const nextSources = (config.customSources || []).filter((s) => s.id !== id)
    let nextConfig: LLMConfig = { ...config, customSources: nextSources }
    if (config.activeSourceId === id) {
      nextConfig = activateLLMModel(nextConfig, 'default')
    }
    onChange(nextConfig)
    flashSaved()
  }

  const handleReset = () => {
    onChange(DEFAULT_LLM_CONFIG)
    flashSaved()
  }

  const customSourcesList = config.customSources || []

  return (
    <div className="settings-model-pane">
      <div className="settings-lead-row">
        <div>
          <h3 className="settings-section-title">Models & AI Sources</h3>
          <p className="settings-lead">
            Add multiple model providers and custom OpenAI-compatible endpoints. Configure keys
            once, switch models instantly during chat.
          </p>
        </div>
        {savedBadge && (
          <span className="settings-saved-badge">
            <Check size={14} weight="bold" /> Saved
          </span>
        )}
      </div>

      {/* Currently Active Summary Card */}
      <div className="active-model-card">
        <div className="active-model-card-info">
          <span className="active-model-tag">
            <Sparkle size={13} weight="fill" /> Active Model
          </span>
          <span className="active-model-title">
            {config.activeModelLabel || (config.provider === 'default' ? 'Server Default' : `${config.provider} (${config.model})`)}
          </span>
        </div>
        {config.activeSourceId !== 'default' && (
          <button
            type="button"
            className="settings-button ghost btn-sm"
            onClick={() => handleActivateProvider('default')}
            title="Reset to server default model"
          >
            <ArrowCounterClockwise size={13} />
            Use Default
          </button>
        )}
      </div>

      {/* Provider Selector Tabs / Grid */}
      <div className="provider-grid">
        {PROVIDER_PRESETS.filter((p) => p.id !== 'default').map((preset) => {
          const isConfigured = isProviderReady(config, preset.id)
          const isCurrentActive = config.activeSourceId === preset.id
          const isTabOpen = selectedProviderTab === preset.id

          return (
            <button
              key={preset.id}
              type="button"
              className={`provider-card${isTabOpen ? ' selected' : ''}${isCurrentActive ? ' is-active' : ''}`}
              onClick={() => setSelectedProviderTab(preset.id)}
            >
              <div className="provider-card-top">
                <span className="provider-card-name">{preset.name}</span>
                {isCurrentActive ? (
                  <span className="badge-active">Active</span>
                ) : isConfigured ? (
                  <span className="badge-ready">Ready</span>
                ) : (
                  <span className="badge-unconfigured">Key needed</span>
                )}
              </div>
              <span className="provider-card-desc">{preset.defaultModel || 'Configurable'}</span>
            </button>
          )
        })}
      </div>

      {/* Active Provider Configuration Box */}
      <div className="provider-config-box">
        <div className="provider-config-header">
          <div>
            <h4 className="provider-config-title">{activePreset.name} Configuration</h4>
            <p className="settings-hint">{activePreset.description}</p>
          </div>
          {config.activeSourceId !== activePreset.id && (
            <button
              type="button"
              className="settings-button primary btn-sm"
              onClick={() => handleActivateProvider(activePreset.id)}
            >
              Set Active
            </button>
          )}
        </div>

        {activePreset.needsKey && (
          <div className="field">
            <label htmlFor="settings-llm-key">{activePreset.name} API Key</label>
            <div className="password-input-wrapper">
              <input
                id="settings-llm-key"
                type={showKey ? 'text' : 'password'}
                value={currentCreds.apiKey || ''}
                placeholder={`Enter your ${activePreset.name} API key`}
                onChange={(e) => handleKeyChange(e.target.value)}
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
            value={currentCreds.baseUrl || ''}
            placeholder={activePreset.defaultBaseUrl || 'https://...'}
            onChange={(e) => handleBaseUrlChange(e.target.value)}
            spellCheck="false"
          />
        </div>

        <div className="field">
          <label htmlFor="settings-llm-model">Default Model</label>
          <input
            id="settings-llm-model"
            type="text"
            value={currentCreds.model || ''}
            placeholder={activePreset.defaultModel || 'Model identifier'}
            onChange={(e) => handleModelChange(e.target.value)}
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
                    className={`model-chip${currentCreds.model === m ? ' active' : ''}`}
                    onClick={() => {
                      handleModelChange(m)
                      if (config.activeSourceId === activePreset.id) {
                        handleActivateProvider(activePreset.id, m)
                      }
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom Sources Section */}
      <div className="custom-sources-section">
        <div className="section-head-row">
          <div>
            <h4 className="settings-sub-title">Custom Endpoints & Sources</h4>
            <p className="settings-hint">
              Connect private LLMs, vLLM, LM Studio, LocalAI, or custom OpenAI proxies.
            </p>
          </div>
          {!isAddingCustom && (
            <button
              type="button"
              className="settings-button secondary btn-sm"
              onClick={() => setIsAddingCustom(true)}
            >
              <Plus size={14} weight="bold" /> Add Custom Source
            </button>
          )}
        </div>

        {isAddingCustom && (
          <div className="custom-source-form">
            <h5 className="custom-form-title">New Custom AI Source</h5>
            {customFormError && <div className="form-error-banner">{customFormError}</div>}
            <div className="field-row">
              <div className="field">
                <label htmlFor="custom-src-name">Source Name</label>
                <input
                  id="custom-src-name"
                  type="text"
                  placeholder="e.g. My Local vLLM, Work Proxy"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="custom-src-provider">API Format</label>
                <select
                  id="custom-src-provider"
                  value={customProviderType}
                  onChange={(e) => setCustomProviderType(e.target.value as LLMProviderType)}
                >
                  <option value="custom">OpenAI Compatible (Default)</option>
                  <option value="openai">OpenAI Official</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openrouter">OpenRouter</option>
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="custom-src-url">Endpoint Base URL</label>
              <input
                id="custom-src-url"
                type="text"
                placeholder="http://localhost:8000/v1 or https://..."
                value={customBaseUrl}
                onChange={(e) => setCustomBaseUrl(e.target.value)}
                spellCheck="false"
              />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="custom-src-model">Model Name / ID</label>
                <input
                  id="custom-src-model"
                  type="text"
                  placeholder="e.g. deepseek-ai/DeepSeek-R1"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  spellCheck="false"
                />
              </div>
              <div className="field">
                <label htmlFor="custom-src-key">API Key (Optional)</label>
                <input
                  id="custom-src-key"
                  type="password"
                  placeholder="Optional token or key"
                  value={customApiKey}
                  onChange={(e) => setCustomApiKey(e.target.value)}
                  spellCheck="false"
                />
              </div>
            </div>

            <div className="form-actions-row">
              <button
                type="button"
                className="settings-button ghost btn-sm"
                onClick={() => {
                  setIsAddingCustom(false)
                  setCustomFormError('')
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="settings-button primary btn-sm"
                onClick={handleAddCustomSource}
              >
                Save & Activate Source
              </button>
            </div>
          </div>
        )}

        {customSourcesList.length > 0 ? (
          <div className="custom-sources-list">
            {customSourcesList.map((cs) => {
              const isActive = config.activeSourceId === cs.id
              return (
                <div key={cs.id} className={`custom-source-item${isActive ? ' active' : ''}`}>
                  <div className="custom-source-info">
                    <div className="custom-source-title-row">
                      <span className="custom-source-name">{cs.name}</span>
                      {isActive && <span className="badge-active">Active</span>}
                    </div>
                    <span className="custom-source-endpoint">
                      <code>{cs.baseUrl}</code> &bull; <span>{cs.model}</span>
                    </span>
                  </div>
                  <div className="custom-source-actions">
                    {!isActive ? (
                      <button
                        type="button"
                        className="settings-button secondary btn-sm"
                        onClick={() => handleActivateProvider(cs.id, cs.model)}
                      >
                        Activate
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="icon-delete-btn"
                      onClick={() => handleDeleteCustomSource(cs.id)}
                      title="Delete source"
                      aria-label="Delete source"
                    >
                      <Trash size={15} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          !isAddingCustom && (
            <p className="empty-sources-hint">No custom sources added yet.</p>
          )
        )}
      </div>

      {/* Search Sources Count (Perplexity-style source scalability) */}
      {onNumResultsChange && (
        <div className="search-sources-section">
          <div className="section-head-row">
            <div>
              <h4 className="settings-sub-title">Search Sources Count</h4>
              <p className="settings-hint">
                How many live web sources Verixa retrieves and synthesizes for each question.
              </p>
            </div>
          </div>
          <div className="source-count-chips">
            {[5, 10, 15, 20, 30, 50].map((count) => (
              <button
                key={count}
                type="button"
                className={`source-chip${numResults === count ? ' active' : ''}`}
                onClick={() => {
                  onNumResultsChange(count)
                  flashSaved()
                }}
              >
                <GlobeHemisphereWest size={13} />
                <span>{count} sources</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="settings-footer-actions">
        <button
          type="button"
          className="settings-button ghost"
          onClick={handleReset}
        >
          <ArrowCounterClockwise size={15} />
          Reset All to Server Default
        </button>
      </div>
    </div>
  )
}

export default ModelPane
