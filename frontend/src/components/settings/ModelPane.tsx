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
  PencilSimple,
} from '@phosphor-icons/react'
import type { LLMConfig, LLMProviderType, ModelSource } from '../../types'
import { DEFAULT_LLM_CONFIG } from '../../types'
import {
  PROVIDER_METAS,
  activateLLMSource,
  addLLMSource,
  deleteLLMSource,
  updateLLMSource,
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
  const [showKey, setShowKey] = useState(false)
  const [savedBadge, setSavedBadge] = useState(false)

  // Add / Edit form state
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [sourceName, setSourceName] = useState('')
  const [sourceProvider, setSourceProvider] = useState<LLMProviderType>('openai')
  const [sourceModel, setSourceModel] = useState('')
  const [sourceApiKey, setSourceApiKey] = useState('')
  const [sourceBaseUrl, setSourceBaseUrl] = useState('')
  const [formError, setFormError] = useState('')

  const flashSaved = () => {
    setSavedBadge(true)
    setTimeout(() => setSavedBadge(false), 1500)
  }

  const selectedMeta = PROVIDER_METAS.find((p) => p.id === sourceProvider) ?? PROVIDER_METAS[0]

  const handleProviderSelect = (provider: LLMProviderType) => {
    setSourceProvider(provider)
    const meta = PROVIDER_METAS.find((p) => p.id === provider)
    if (meta && meta.defaultBaseUrl && !sourceBaseUrl) {
      setSourceBaseUrl(meta.defaultBaseUrl)
    }
  }

  const openAddForm = () => {
    setEditingId(null)
    setSourceName('')
    setSourceProvider('openai')
    setSourceModel('')
    setSourceApiKey('')
    setSourceBaseUrl(PROVIDER_METAS[0].defaultBaseUrl)
    setFormError('')
    setIsFormOpen(true)
  }

  const openEditForm = (source: ModelSource) => {
    setEditingId(source.id)
    setSourceName(source.name)
    setSourceProvider(source.provider)
    setSourceModel(source.model)
    setSourceApiKey(source.apiKey || '')
    setSourceBaseUrl(source.baseUrl || '')
    setFormError('')
    setIsFormOpen(true)
  }

  const handleSaveSource = () => {
    if (!sourceName.trim()) {
      setFormError('Please enter a display name for this model source.')
      return
    }
    if (!sourceModel.trim()) {
      setFormError('Please enter the model name explicitly.')
      return
    }

    if (editingId) {
      const updated: ModelSource = {
        id: editingId,
        name: sourceName.trim(),
        provider: sourceProvider,
        model: sourceModel.trim(),
        apiKey: sourceApiKey.trim() || undefined,
        baseUrl: sourceBaseUrl.trim() || undefined,
      }
      onChange(updateLLMSource(config, updated))
    } else {
      onChange(
        addLLMSource(config, {
          name: sourceName.trim(),
          provider: sourceProvider,
          model: sourceModel.trim(),
          apiKey: sourceApiKey.trim() || undefined,
          baseUrl: sourceBaseUrl.trim() || undefined,
        })
      )
    }

    setIsFormOpen(false)
    setEditingId(null)
    setFormError('')
    flashSaved()
  }

  const handleDeleteSource = (id: string) => {
    onChange(deleteLLMSource(config, id))
    flashSaved()
  }

  const handleActivateSource = (id: string) => {
    onChange(activateLLMSource(config, id))
    flashSaved()
  }

  const handleReset = () => {
    onChange(DEFAULT_LLM_CONFIG)
    flashSaved()
  }

  return (
    <div className="settings-model-pane">
      <div className="settings-lead-row">
        <div>
          <h3 className="settings-section-title">Models & AI Sources</h3>
          <p className="settings-lead">
            Add your own model sources with your API keys and custom model names.
            Switch models instantly during chat.
          </p>
        </div>
        {savedBadge && (
          <span className="settings-saved-badge">
            <Check size={14} weight="bold" /> Saved
          </span>
        )}
      </div>

      {/* Active Model Card */}
      <div className="active-model-card">
        <div className="active-model-card-info">
          <span className="active-model-tag">
            <Sparkle size={13} weight="fill" /> Active Model
          </span>
          <span className="active-model-title">
            {config.activeModelLabel || 'Server Default'}
          </span>
        </div>
        {config.activeSourceId !== 'default' && (
          <button
            type="button"
            className="settings-button ghost btn-sm"
            onClick={() => handleActivateSource('default')}
            title="Reset to server default model from .env"
          >
            <ArrowCounterClockwise size={13} />
            Use Server Default
          </button>
        )}
      </div>

      {/* Model Sources List */}
      <div className="custom-sources-section">
        <div className="section-head-row">
          <div>
            <h4 className="settings-sub-title">Configured Models ({config.sources.length})</h4>
            <p className="settings-hint">
              Add as many models as you need from OpenAI, Claude, OpenRouter, Groq, Ollama, or custom endpoints.
            </p>
          </div>
          {!isFormOpen && (
            <button
              type="button"
              className="settings-button primary btn-sm"
              onClick={openAddForm}
            >
              <Plus size={14} weight="bold" /> Add Model
            </button>
          )}
        </div>

        {/* Add / Edit Form */}
        {isFormOpen && (
          <div className="custom-source-form">
            <h5 className="custom-form-title">
              {editingId ? 'Edit Model Source' : 'Add New Model Source'}
            </h5>
            {formError && <div className="form-error-banner">{formError}</div>}

            <div className="field-row">
              <div className="field">
                <label htmlFor="model-src-name">Display Name</label>
                <input
                  id="model-src-name"
                  type="text"
                  placeholder="e.g. My Fast Model, Claude Research"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="model-src-provider">Provider</label>
                <select
                  id="model-src-provider"
                  value={sourceProvider}
                  onChange={(e) => handleProviderSelect(e.target.value as LLMProviderType)}
                >
                  {PROVIDER_METAS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="model-src-model">
                Model Name <span style={{ color: 'var(--accent)' }}>*</span>
              </label>
              <input
                id="model-src-model"
                type="text"
                placeholder="Enter exact model name (e.g. your model identifier)"
                value={sourceModel}
                onChange={(e) => setSourceModel(e.target.value)}
                spellCheck="false"
              />
              <p className="settings-hint">
                Specify the exact model identifier to request from the provider.
              </p>
            </div>

            {selectedMeta.needsKey && (
              <div className="field">
                <label htmlFor="model-src-key">{selectedMeta.name} API Key</label>
                <div className="password-input-wrapper">
                  <input
                    id="model-src-key"
                    type={showKey ? 'text' : 'password'}
                    placeholder={`Enter your ${selectedMeta.name} API key`}
                    value={sourceApiKey}
                    onChange={(e) => setSourceApiKey(e.target.value)}
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
              <label htmlFor="model-src-baseurl">API Base URL (Optional)</label>
              <input
                id="model-src-baseurl"
                type="text"
                placeholder={selectedMeta.defaultBaseUrl || 'https://...'}
                value={sourceBaseUrl}
                onChange={(e) => setSourceBaseUrl(e.target.value)}
                spellCheck="false"
              />
            </div>

            <div className="form-actions-row">
              <button
                type="button"
                className="settings-button ghost btn-sm"
                onClick={() => {
                  setIsFormOpen(false)
                  setEditingId(null)
                  setFormError('')
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="settings-button primary btn-sm"
                onClick={handleSaveSource}
              >
                {editingId ? 'Save Changes' : 'Add Model'}
              </button>
            </div>
          </div>
        )}

        {/* List of configured sources */}
        {config.sources.length > 0 ? (
          <div className="custom-sources-list">
            {config.sources.map((src) => {
              const isActive = config.activeSourceId === src.id
              return (
                <div key={src.id} className={`custom-source-item${isActive ? ' active' : ''}`}>
                  <div className="custom-source-info">
                    <div className="custom-source-title-row">
                      <span className="custom-source-name">{src.name}</span>
                      <span className="badge-ready">{src.provider}</span>
                      {isActive && <span className="badge-active">Active</span>}
                    </div>
                    <span className="custom-source-endpoint">
                      Model: <strong>{src.model}</strong>
                      {src.baseUrl && <span> &bull; <code>{src.baseUrl}</code></span>}
                    </span>
                  </div>
                  <div className="custom-source-actions">
                    {!isActive && (
                      <button
                        type="button"
                        className="settings-button secondary btn-sm"
                        onClick={() => handleActivateSource(src.id)}
                      >
                        Set Active
                      </button>
                    )}
                    <button
                      type="button"
                      className="icon-delete-btn"
                      onClick={() => openEditForm(src)}
                      title="Edit model"
                      aria-label="Edit model"
                    >
                      <PencilSimple size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-delete-btn"
                      onClick={() => handleDeleteSource(src.id)}
                      title="Delete model"
                      aria-label="Delete model"
                    >
                      <Trash size={15} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          !isFormOpen && (
            <p className="empty-sources-hint">
              No custom models added yet. Click &quot;Add Model&quot; to configure your API keys and models.
            </p>
          )
        )}
      </div>

      {/* Search Sources Scalability */}
      {onNumResultsChange && (
        <div className="search-sources-section">
          <div className="section-head-row">
            <div>
              <h4 className="settings-sub-title">Search Sources Count</h4>
              <p className="settings-hint">
                Number of web search sources retrieved and synthesized for each query.
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
          Reset to Server Default
        </button>
      </div>
    </div>
  )
}

export default ModelPane
