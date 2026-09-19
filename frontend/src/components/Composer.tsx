import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import {
  ArrowUp,
  CaretDown,
  Check,
  Cpu,
  Flask,
  Gear,
  GlobeHemisphereWest,
  Lock,
  Sparkle,
  SpinnerGap,
  Square,
} from '@phosphor-icons/react'
import type { AskMode, LLMConfig } from '../types'
import { PROVIDER_PRESETS, getShortModelName, isProviderReady } from '../lib/llmProviders'

export interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  loading: boolean
  placeholder: string
  hint?: string
  mode: AskMode
  onMode: (mode: AskMode) => void
  onStop?: () => void
  llmConfig?: LLMConfig
  onSelectModel?: (sourceId: string, modelName?: string) => void
  onOpenModelSettings?: () => void
}

export const MODES: Array<{
  id: AskMode
  label: string
  desc: string
  icon: ReactNode
}> = [
  {
    id: 'search',
    label: 'Search',
    desc: 'Fast answers with live sources',
    icon: <GlobeHemisphereWest size={18} />,
  },
  {
    id: 'deep',
    label: 'Deep research',
    desc: 'Multi-step research that takes longer',
    icon: <Flask size={18} />,
  },
]

export function Composer({
  value,
  onChange,
  onSubmit,
  loading,
  placeholder,
  mode,
  onMode,
  onStop,
  llmConfig,
  onSelectModel,
  onOpenModelSettings,
}: ComposerProps) {
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 52), 220)}px`
  }, [value])

  function onKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!loading && value.trim()) {
        onSubmit()
      }
    }
  }

  function pickMode(next: AskMode): void {
    onMode(next)
    setModeMenuOpen(false)
  }

  function handleModelPick(sourceId: string, modelName?: string, ready: boolean = true): void {
    if (!ready && onOpenModelSettings) {
      onOpenModelSettings()
      setModelMenuOpen(false)
      return
    }
    if (onSelectModel) {
      onSelectModel(sourceId, modelName)
    }
    setModelMenuOpen(false)
  }

  const currentMode = MODES.find((m) => m.id === mode) ?? MODES[0]

  // Determine current active model label
  const activeLabel =
    llmConfig?.activeModelLabel ||
    (llmConfig?.provider && llmConfig.provider !== 'default'
      ? `${llmConfig.provider}: ${getShortModelName(llmConfig.model || '')}`
      : 'Auto (Default)')

  const customSources = llmConfig?.customSources || []

  return (
    <div className={`composer${value.trim() ? ' has-content' : ''}`}>
      <label className="visually-hidden" htmlFor="verixa-query">
        Ask a question
      </label>
      <textarea
        ref={textareaRef}
        id="verixa-query"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={1}
      />
      <div className="composer-row">
        <div className="composer-left">
          {/* Mode Selector (Search vs Deep Research) */}
          <div className="mode-wrap">
            <button
              type="button"
              className={`mode-button${mode === 'deep' ? ' mode-deep-active' : ''}`}
              onClick={() => {
                setModeMenuOpen((v) => !v)
                setModelMenuOpen(false)
              }}
              aria-expanded={modeMenuOpen}
              aria-haspopup="listbox"
              aria-label={`Answer mode: ${currentMode.label}`}
              title="Answer mode"
            >
              <span className="mode-button-icon">{currentMode.icon}</span>
              <span className="mode-button-label">{currentMode.label}</span>
              <CaretDown
                size={11}
                weight="bold"
                className={`mode-caret${modeMenuOpen ? ' open' : ''}`}
                aria-hidden="true"
              />
            </button>
            {modeMenuOpen && (
              <>
                <button
                  type="button"
                  className="menu-backdrop"
                  aria-label="Close mode menu"
                  onClick={() => setModeMenuOpen(false)}
                />
                <div
                  className="mode-menu"
                  role="listbox"
                  aria-label="Answer mode"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setModeMenuOpen(false)
                  }}
                >
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="option"
                      aria-selected={mode === m.id}
                      className={`mode-option${mode === m.id ? ' active' : ''}`}
                      onClick={() => pickMode(m.id)}
                    >
                      {m.icon}
                      <span className="mode-text">
                        <span className="mode-name">{m.label}</span>
                        <span className="mode-desc">{m.desc}</span>
                      </span>
                      {mode === m.id && <Check size={16} weight="bold" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Model Selector (Perplexity / Gemini style) */}
          <div className="model-select-wrap">
            <button
              type="button"
              className={`model-select-btn${llmConfig && llmConfig.provider !== 'default' ? ' custom-active' : ''}`}
              onClick={() => {
                setModelMenuOpen((v) => !v)
                setModeMenuOpen(false)
              }}
              aria-expanded={modelMenuOpen}
              aria-haspopup="listbox"
              aria-label={`AI Model: ${activeLabel}`}
              title="Select AI Model"
            >
              <Cpu size={15} className="model-btn-icon" />
              <span className="model-btn-label">{activeLabel}</span>
              <CaretDown
                size={11}
                weight="bold"
                className={`mode-caret${modelMenuOpen ? ' open' : ''}`}
                aria-hidden="true"
              />
            </button>

            {modelMenuOpen && (
              <>
                <button
                  type="button"
                  className="menu-backdrop"
                  aria-label="Close model menu"
                  onClick={() => setModelMenuOpen(false)}
                />
                <div
                  className="model-select-menu"
                  role="listbox"
                  aria-label="Choose AI Model"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setModelMenuOpen(false)
                  }}
                >
                  <div className="model-menu-header">
                    <span className="model-menu-title">Select Model</span>
                    <span className="model-menu-sub">Switch anytime</span>
                  </div>

                  <div className="model-menu-scroll">
                    {/* Server Default */}
                    <div className="model-group">
                      <div className="model-group-title">Default</div>
                      <button
                        type="button"
                        className={`model-item${(!llmConfig || llmConfig.activeSourceId === 'default') ? ' active' : ''}`}
                        onClick={() => handleModelPick('default')}
                      >
                        <div className="model-item-info">
                          <span className="model-item-name">
                            <Sparkle size={13} weight="fill" className="model-icon-sparkle" /> Server Default
                          </span>
                          <span className="model-item-sub">Auto-configured provider</span>
                        </div>
                        {(!llmConfig || llmConfig.activeSourceId === 'default') && (
                          <Check size={14} weight="bold" />
                        )}
                      </button>
                    </div>

                    {/* Standard Providers */}
                    {PROVIDER_PRESETS.filter((p) => p.id !== 'default').map((preset) => {
                      const ready = llmConfig ? isProviderReady(llmConfig, preset.id) : false
                      const isCurrentSource = llmConfig?.activeSourceId === preset.id

                      return (
                        <div key={preset.id} className="model-group">
                          <div className="model-group-title-row">
                            <span className="model-group-title">{preset.name}</span>
                            {!ready && <span className="key-req-tag"><Lock size={10} /> Key needed</span>}
                          </div>
                          {preset.models.map((m) => {
                            const isSelected = isCurrentSource && (llmConfig?.model === m || (!llmConfig?.model && m === preset.defaultModel))
                            return (
                              <button
                                key={m}
                                type="button"
                                className={`model-item${isSelected ? ' active' : ''}${!ready ? ' needs-key' : ''}`}
                                onClick={() => handleModelPick(preset.id, m, ready)}
                                title={!ready ? 'Click to configure API key in Settings' : undefined}
                              >
                                <div className="model-item-info">
                                  <span className="model-item-name">{getShortModelName(m)}</span>
                                  <span className="model-item-id">{m}</span>
                                </div>
                                {isSelected ? (
                                  <Check size={14} weight="bold" />
                                ) : !ready ? (
                                  <span className="btn-setup-text">Setup</span>
                                ) : null}
                              </button>
                            )
                          })}
                        </div>
                      )
                    })}

                    {/* Custom Sources */}
                    {customSources.length > 0 && (
                      <div className="model-group">
                        <div className="model-group-title">Custom Endpoints</div>
                        {customSources.map((cs) => {
                          const isSelected = llmConfig?.activeSourceId === cs.id
                          return (
                            <button
                              key={cs.id}
                              type="button"
                              className={`model-item${isSelected ? ' active' : ''}`}
                              onClick={() => handleModelPick(cs.id, cs.model, true)}
                            >
                              <div className="model-item-info">
                                <span className="model-item-name">{cs.name}</span>
                                <span className="model-item-id">{cs.model}</span>
                              </div>
                              {isSelected && <Check size={14} weight="bold" />}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Footer configure button */}
                  {onOpenModelSettings && (
                    <div className="model-menu-footer">
                      <button
                        type="button"
                        className="model-manage-btn"
                        onClick={() => {
                          setModelMenuOpen(false)
                          onOpenModelSettings()
                        }}
                      >
                        <Gear size={14} />
                        <span>Manage API Keys & Sources</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="composer-right">
          <div className="composer-shortcuts" aria-hidden="true">
            <kbd>↵</kbd>
            <span className="shortcut-label">Ask</span>
            <span className="shortcut-sep">·</span>
            <kbd>⇧↵</kbd>
            <span className="shortcut-label">New line</span>
          </div>

          {loading && onStop ? (
            <button
              type="button"
              className="ask-button stop-btn"
              onClick={onStop}
              aria-label="Stop generating"
              title="Stop generating"
            >
              <Square size={13} weight="fill" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              type="button"
              className="ask-button"
              onClick={onSubmit}
              disabled={loading || !value.trim()}
              aria-label="Ask"
              title="Ask (Enter)"
            >
              {loading ? (
                <SpinnerGap size={17} weight="bold" className="spin" />
              ) : (
                <ArrowUp size={17} weight="bold" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default Composer
