import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import {
  ArrowUp,
  CaretDown,
  Check,
  Cpu,
  Flask,
  GlobeHemisphereWest,
  LockSimple,
  Plus,
  Sparkle,
  SpinnerGap,
  Square,
} from '@phosphor-icons/react'
import type { AskMode, LLMConfig } from '../types'

export interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  loading: boolean
  placeholder: string
  hint?: string
  mode: AskMode
  onMode: (mode: AskMode) => void
  isModeLocked?: boolean
  onModeLockAttempt?: (targetMode: AskMode) => void
  onStop?: () => void
  llmConfig?: LLMConfig
  onSelectModel?: (providerId: string, modelName: string) => void
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
  isModeLocked = false,
  onModeLockAttempt,
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
    if (isModeLocked && next !== mode) {
      setModeMenuOpen(false)
      onModeLockAttempt?.(next)
      return
    }
    onMode(next)
    setModeMenuOpen(false)
  }

  function handleModelPick(providerId: string, modelName: string): void {
    if (onSelectModel) {
      onSelectModel(providerId, modelName)
    }
    setModelMenuOpen(false)
  }

  const currentMode = MODES.find((m) => m.id === mode) ?? MODES[0]

  // Active label
  const activeLabel = llmConfig?.activeModelLabel || 'Server Default'

  // Providers with models added
  const providersWithModels = (llmConfig?.providers || []).filter(
    (p) => p.models && p.models.length > 0
  )

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
              className={`mode-button${mode === 'deep' ? ' mode-deep-active' : ''}${isModeLocked ? ' mode-locked' : ''}`}
              onClick={() => {
                setModeMenuOpen((v) => !v)
                setModelMenuOpen(false)
              }}
              aria-expanded={modeMenuOpen}
              aria-haspopup="listbox"
              aria-label={`Answer mode: ${currentMode.label}${isModeLocked ? ' (locked to this chat)' : ''}`}
              title={isModeLocked ? `Mode locked to ${currentMode.label} for this chat` : 'Answer mode'}
            >
              <span className="mode-button-icon">{currentMode.icon}</span>
              <span className="mode-button-label">{currentMode.label}</span>
              {isModeLocked && (
                <LockSimple size={11} weight="bold" className="mode-lock-badge" aria-hidden="true" />
              )}
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
                  {MODES.map((m) => {
                    const isCurrent = mode === m.id
                    const isLockedOut = isModeLocked && !isCurrent
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="option"
                        aria-selected={isCurrent}
                        className={`mode-option${isCurrent ? ' active' : ''}${isLockedOut ? ' locked-option' : ''}`}
                        onClick={() => pickMode(m.id)}
                      >
                        {m.icon}
                        <span className="mode-text">
                          <span className="mode-name">
                            {m.label}
                            {isLockedOut && (
                              <span className="mode-lock-tag">
                                <LockSimple size={10} weight="bold" />
                                Locked
                              </span>
                            )}
                          </span>
                          <span className="mode-desc">
                            {isLockedOut ? 'Start new chat to switch' : m.desc}
                          </span>
                        </span>
                        {isCurrent && <Check size={16} weight="bold" />}
                        {isLockedOut && <LockSimple size={13} weight="bold" className="mode-lock-right" />}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* Model Selector (Perplexity / Gemini style) */}
          <div className="model-select-wrap">
            <button
              type="button"
              className={`model-select-btn${llmConfig && llmConfig.activeProviderId !== 'default' ? ' custom-active' : ''}`}
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
                    <button
                      type="button"
                      className={`model-item${(!llmConfig || llmConfig.activeProviderId === 'default') ? ' active' : ''}`}
                      onClick={() => handleModelPick('default', '')}
                    >
                      <div className="model-item-info">
                        <span className="model-item-name">
                          <Sparkle size={13} weight="fill" className="model-icon-sparkle" /> Server Default
                        </span>
                        <span className="model-item-id">Configured on server (.env)</span>
                      </div>
                      {(!llmConfig || llmConfig.activeProviderId === 'default') && (
                        <Check size={14} weight="bold" />
                      )}
                    </button>

                    {/* Grouped by Provider with their multiple models */}
                    {providersWithModels.map((prov) => (
                      <div key={prov.id} className="model-group">
                        <div className="model-group-title-row">
                          <span className="model-group-title">{prov.name}</span>
                          <span className="model-group-count">{prov.models.length} model{prov.models.length !== 1 ? 's' : ''}</span>
                        </div>
                        {prov.models.map((m) => {
                          const isSelected =
                            llmConfig?.activeProviderId === prov.id &&
                            llmConfig?.activeModel === m

                          return (
                            <button
                              key={m}
                              type="button"
                              className={`model-item${isSelected ? ' active' : ''}`}
                              onClick={() => handleModelPick(prov.id, m)}
                            >
                              <div className="model-item-info">
                                <span className="model-item-name">{m}</span>
                                <span className="model-item-id">{prov.name}</span>
                              </div>
                              {isSelected && <Check size={14} weight="bold" />}
                            </button>
                          )
                        })}
                      </div>
                    ))}

                    {providersWithModels.length === 0 && (
                      <p className="empty-models-hint">
                        No custom models added yet. Click below to add models from OpenAI, Claude, OpenRouter, Groq, or Ollama.
                      </p>
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
                        <Plus size={14} weight="bold" />
                        <span>Add / Manage Models & API Keys</span>
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
