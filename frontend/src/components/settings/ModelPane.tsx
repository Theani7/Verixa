import { useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  Eye,
  EyeSlash,
  ArrowCounterClockwise,
  Check,
  Plus,
  Trash,
  X,
  GlobeHemisphereWest,
  Sparkle,
  Lightning,
  Robot,
  SpinnerGap,
} from '@phosphor-icons/react'
import type { LLMConfig, LLMProviderType } from '../../types'
import { DEFAULT_LLM_CONFIG } from '../../types'
import {
  PROVIDER_METAS,
  addCustomProvider,
  addModelsToProvider,
  deleteCustomProvider,
  parseModelInput,
  removeModelFromProvider,
  selectActiveModel,
  updateProvider,
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
  const [selectedProviderId, setSelectedProviderId] = useState<string>(
    config.activeProviderId !== 'default' ? config.activeProviderId : 'openai'
  )
  const [showKey, setShowKey] = useState(false)
  const [savedBadge, setSavedBadge] = useState(false)

  // Multi-model input for active provider
  const [modelInputText, setModelInputText] = useState('')

  // New custom provider form modal/drawer state
  const [isAddingCustomProv, setIsAddingCustomProv] = useState(false)
  const [customProvName, setCustomProvName] = useState('')
  const [customProvType, setCustomProvType] = useState<LLMProviderType>('custom')
  const [customProvUrl, setCustomProvUrl] = useState('')
  const [customProvKey, setCustomProvKey] = useState('')
  const [customProvModels, setCustomProvModels] = useState('')
  const [customProvError, setCustomProvError] = useState('')

  // Connection testing state
  const [testingConnection, setTestingConnection] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const flashSaved = () => {
    setSavedBadge(true)
    setTimeout(() => setSavedBadge(false), 1500)
  }

  const handleTestConnection = async () => {
    setTestingConnection(true)
    setTestResult(null)
    try {
      const res = await fetch('http://localhost:8000/api/llm/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: currentProvider.provider,
          api_key: currentProvider.apiKey || undefined,
          base_url: currentProvider.baseUrl || undefined,
          model: currentProvider.models[0] || undefined,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setTestResult({ ok: true, message: data.message || 'Connected successfully!' })
      } else {
        setTestResult({ ok: false, message: data.error || 'Connection failed.' })
      }
    } catch (err: unknown) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Network error connecting to backend.',
      })
    } finally {
      setTestingConnection(false)
    }
  }

  const currentProvider =
    config.providers.find((p) => p.id === selectedProviderId) ||
    config.providers[0] || {
      id: 'openai',
      name: 'OpenAI',
      provider: 'openai',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      models: [],
    }

  const meta =
    PROVIDER_METAS.find((m) => m.id === currentProvider.provider) ||
    PROVIDER_METAS[0]

  const handleKeyChange = (apiKey: string) => {
    onChange(updateProvider(config, currentProvider.id, { apiKey }))
    flashSaved()
  }

  const handleBaseUrlChange = (baseUrl: string) => {
    onChange(updateProvider(config, currentProvider.id, { baseUrl }))
    flashSaved()
  }

  // Add multiple models at the same time
  const handleAddModels = () => {
    const parsed = parseModelInput(modelInputText)
    if (parsed.length === 0) return

    onChange(addModelsToProvider(config, currentProvider.id, parsed))
    setModelInputText('')
    flashSaved()
  }

  const handleModelInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddModels()
    }
  }

  const handleRemoveModel = (modelName: string) => {
    onChange(removeModelFromProvider(config, currentProvider.id, modelName))
    flashSaved()
  }

  const handleSelectModel = (providerId: string, modelName: string) => {
    onChange(selectActiveModel(config, providerId, modelName))
    flashSaved()
  }

  const handleActivateServerDefault = () => {
    onChange(selectActiveModel(config, 'default', ''))
    flashSaved()
  }

  const handleSaveCustomProvider = () => {
    if (!customProvName.trim()) {
      setCustomProvError('Please enter an endpoint name.')
      return
    }
    if (!customProvUrl.trim()) {
      setCustomProvError('Please enter a valid Base URL.')
      return
    }

    const models = parseModelInput(customProvModels)
    const updated = addCustomProvider(config, {
      name: customProvName.trim(),
      provider: customProvType,
      baseUrl: customProvUrl.trim(),
      apiKey: customProvKey.trim() || undefined,
      models,
    })

    onChange(updated)
    setIsAddingCustomProv(false)
    setCustomProvName('')
    setCustomProvUrl('')
    setCustomProvKey('')
    setCustomProvModels('')
    setCustomProvError('')
    flashSaved()
  }

  const handleDeleteCustomProvider = (provId: string) => {
    onChange(deleteCustomProvider(config, provId))
    if (selectedProviderId === provId) {
      setSelectedProviderId('openai')
    }
    flashSaved()
  }

  const handleReset = () => {
    onChange(DEFAULT_LLM_CONFIG)
    flashSaved()
  }

  return (
    <div className="settings-model-pane">
      {/* Header */}
      <div className="settings-lead-row">
        <div>
          <h3 className="settings-section-title">Models & AI Providers</h3>
          <p className="settings-lead">
            Configure your API keys once and add multiple models for each provider.
            Switch between your models anytime directly in the chat bar.
          </p>
        </div>
        {savedBadge && (
          <span className="settings-saved-badge">
            <Check size={14} weight="bold" /> Saved
          </span>
        )}
      </div>

      {/* Active Model Summary Card */}
      <div className="active-model-hero">
        <div className="active-model-hero-left">
          <div className="active-model-badge">
            <Sparkle size={13} weight="fill" /> Active In Chat
          </div>
          <div className="active-model-name-text">
            {config.activeModelLabel || 'Server Default'}
          </div>
          <div className="active-model-sub-text">
            {config.activeProviderId === 'default'
              ? 'Using the default model configured in the server environment (.env)'
              : `Provider: ${config.provider.toUpperCase()} \u2022 Model: ${config.model}`}
          </div>
        </div>
        {config.activeProviderId !== 'default' && (
          <button
            type="button"
            className="btn-use-default"
            onClick={handleActivateServerDefault}
            title="Reset active model to server default"
          >
            <ArrowCounterClockwise size={13} />
            Reset to Server Default
          </button>
        )}
      </div>

      {/* Provider Tabs Selector */}
      <div className="provider-tabs-bar">
        {config.providers.map((p) => {
          const isSelected = selectedProviderId === p.id
          const isCurrentActive = config.activeProviderId === p.id

          return (
            <button
              key={p.id}
              type="button"
              className={`provider-tab-pill${isSelected ? ' selected' : ''}${isCurrentActive ? ' is-active' : ''}`}
              onClick={() => setSelectedProviderId(p.id)}
            >
              <span className="tab-pill-icon">
                {p.provider === 'ollama' ? (
                  <Robot size={15} />
                ) : p.provider === 'groq' ? (
                  <Lightning size={15} />
                ) : (
                  <span className="tab-pill-dot" />
                )}
              </span>
              <span className="tab-pill-name">{p.name}</span>
              {p.models.length > 0 && (
                <span className="tab-pill-count">{p.models.length}</span>
              )}
              {isCurrentActive && <span className="tab-pill-active-dot" title="Active model" />}
            </button>
          )
        })}

        <button
          type="button"
          className="btn-add-provider-pill"
          onClick={() => setIsAddingCustomProv(true)}
          title="Add a custom OpenAI-compatible endpoint"
        >
          <Plus size={13} weight="bold" />
          <span>Add Custom Endpoint</span>
        </button>
      </div>

      {/* Provider Details & Multi-Model Card */}
      <div className="provider-manager-card">
        <div className="provider-manager-head">
          <div className="provider-manager-title-row">
            <h4 className="provider-manager-name">{currentProvider.name}</h4>
            {currentProvider.isCustom && (
              <button
                type="button"
                className="btn-delete-prov"
                onClick={() => handleDeleteCustomProvider(currentProvider.id)}
                title="Delete this custom endpoint"
              >
                <Trash size={14} /> Remove Endpoint
              </button>
            )}
          </div>
          <span className="provider-manager-stats">
            {currentProvider.models.length} model{currentProvider.models.length !== 1 ? 's' : ''} configured
          </span>
        </div>

        {/* Credentials Form */}
        <div className="provider-credentials-box">
          {meta.needsKey && (
            <div className="field">
              <label htmlFor="provider-api-key">{currentProvider.name} API Key</label>
              <div className="password-input-wrapper">
                <input
                  id="provider-api-key"
                  type={showKey ? 'text' : 'password'}
                  placeholder={`Enter your ${currentProvider.name} API key`}
                  value={currentProvider.apiKey || ''}
                  onChange={(e) => handleKeyChange(e.target.value)}
                  autoComplete="off"
                  spellCheck="false"
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowKey(!showKey)}
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          <div className="field">
            <label htmlFor="provider-base-url">API Base URL</label>
            <input
              id="provider-base-url"
              type="text"
              placeholder={meta.defaultBaseUrl || 'https://...'}
              value={currentProvider.baseUrl || ''}
              onChange={(e) => handleBaseUrlChange(e.target.value)}
              spellCheck="false"
            />
          </div>

          <div className="test-connection-row">
            <button
              type="button"
              className="btn-test-connection"
              onClick={handleTestConnection}
              disabled={testingConnection || (meta.needsKey && !currentProvider.apiKey)}
            >
              {testingConnection ? (
                <SpinnerGap size={14} className="spin" />
              ) : (
                <Lightning size={14} />
              )}
              <span>{testingConnection ? 'Testing Connection...' : 'Test Connection'}</span>
            </button>
            {testResult && (
              <span className={`test-result-badge ${testResult.ok ? 'success' : 'error'}`}>
                {testResult.ok ? <Check size={13} weight="bold" /> : <X size={13} weight="bold" />}
                {testResult.message}
              </span>
            )}
          </div>
        </div>

        {/* Multi-Model Section */}
        <div className="models-manager-section">
          <div className="models-manager-head">
            <h5 className="models-manager-title">
              Configured Models ({currentProvider.models.length})
            </h5>
            <p className="settings-hint">
              Add multiple models for {currentProvider.name}. You can enter multiple names at once separated by commas.
            </p>
          </div>

          {/* Add Multiple Models Input */}
          <div className="multi-model-input-row">
            <input
              type="text"
              className="multi-model-input"
              placeholder="e.g. gpt-4o, gpt-4o-mini (type or paste, separated by commas)"
              value={modelInputText}
              onChange={(e) => setModelInputText(e.target.value)}
              onKeyDown={handleModelInputKeyDown}
              spellCheck="false"
            />
            <button
              type="button"
              className="btn-add-models"
              onClick={handleAddModels}
              disabled={!modelInputText.trim()}
            >
              <Plus size={14} weight="bold" />
              <span>Add Model{modelInputText.includes(',') ? 's' : ''}</span>
            </button>
          </div>

          {/* Model Pills / Cards List */}
          {currentProvider.models.length > 0 ? (
            <div className="models-pills-list">
              {currentProvider.models.map((m) => {
                const isActive =
                  config.activeProviderId === currentProvider.id && config.activeModel === m

                return (
                  <div key={m} className={`model-tag-pill${isActive ? ' active' : ''}`}>
                    <button
                      type="button"
                      className="model-tag-select-area"
                      onClick={() => handleSelectModel(currentProvider.id, m)}
                      title={isActive ? 'Active model' : 'Click to set as active in chat'}
                    >
                      <span className="model-tag-dot" />
                      <span className="model-tag-name">{m}</span>
                      {isActive && <span className="model-active-badge">Active</span>}
                    </button>
                    <button
                      type="button"
                      className="model-tag-remove-btn"
                      onClick={() => handleRemoveModel(m)}
                      title={`Remove ${m}`}
                      aria-label={`Remove ${m}`}
                    >
                      <X size={12} weight="bold" />
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="models-empty-state">
              No models added yet for {currentProvider.name}. Type your model names above to add them.
            </div>
          )}
        </div>
      </div>

      {/* Modal for Adding Custom Provider */}
      {isAddingCustomProv && (
        <div className="custom-prov-modal-overlay">
          <div className="custom-prov-modal">
            <div className="custom-prov-modal-head">
              <h4>Add Custom Endpoint</h4>
              <button
                type="button"
                className="icon-btn-close"
                onClick={() => setIsAddingCustomProv(false)}
              >
                <X size={16} />
              </button>
            </div>

            {customProvError && (
              <div className="custom-prov-error">{customProvError}</div>
            )}

            <div className="field">
              <label htmlFor="custom-prov-name">Endpoint Name</label>
              <input
                id="custom-prov-name"
                type="text"
                placeholder="e.g. My vLLM Server, LM Studio, Work Proxy"
                value={customProvName}
                onChange={(e) => setCustomProvName(e.target.value)}
              />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="custom-prov-type">API Format</label>
                <select
                  id="custom-prov-type"
                  value={customProvType}
                  onChange={(e) => setCustomProvType(e.target.value as LLMProviderType)}
                >
                  <option value="custom">OpenAI Compatible (Standard)</option>
                  <option value="openai">OpenAI Official</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openrouter">OpenRouter</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="custom-prov-url">Base URL</label>
                <input
                  id="custom-prov-url"
                  type="text"
                  placeholder="http://localhost:8000/v1 or https://..."
                  value={customProvUrl}
                  onChange={(e) => setCustomProvUrl(e.target.value)}
                  spellCheck="false"
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="custom-prov-key">API Key (Optional)</label>
              <input
                id="custom-prov-key"
                type="password"
                placeholder="Optional authorization token"
                value={customProvKey}
                onChange={(e) => setCustomProvKey(e.target.value)}
                spellCheck="false"
              />
            </div>

            <div className="field">
              <label htmlFor="custom-prov-models">
                Models (comma-separated)
              </label>
              <input
                id="custom-prov-models"
                type="text"
                placeholder="e.g. model-1, model-2, model-3"
                value={customProvModels}
                onChange={(e) => setCustomProvModels(e.target.value)}
                spellCheck="false"
              />
            </div>

            <div className="custom-prov-modal-actions">
              <button
                type="button"
                className="settings-button ghost btn-sm"
                onClick={() => setIsAddingCustomProv(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="settings-button primary btn-sm"
                onClick={handleSaveCustomProvider}
              >
                Create Endpoint
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search Sources Count Scalability */}
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

      {/* Reset footer */}
      <div className="settings-footer-actions">
        <button
          type="button"
          className="settings-button ghost"
          onClick={handleReset}
        >
          <ArrowCounterClockwise size={15} />
          Reset All Providers to Default
        </button>
      </div>
    </div>
  )
}

export default ModelPane
