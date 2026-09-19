import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { ArrowUp, CaretDown, Check, Flask, GlobeHemisphereWest, SpinnerGap, Square } from '@phosphor-icons/react'
import type { AskMode } from '../types'

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
}: ComposerProps) {
  const [menuOpen, setMenuOpen] = useState(false)
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

  function pick(next: AskMode): void {
    onMode(next)
    setMenuOpen(false)
  }

  const current = MODES.find((m) => m.id === mode) ?? MODES[0]

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
          <div className="mode-wrap">
            <button
              type="button"
              className={`mode-button${mode === 'deep' ? ' mode-deep-active' : ''}`}
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="listbox"
              aria-label={`Answer mode: ${current.label}`}
              title="Answer mode"
            >
              <span className="mode-button-icon">{current.icon}</span>
              <span className="mode-button-label">{current.label}</span>
              <CaretDown
                size={11}
                weight="bold"
                className={`mode-caret${menuOpen ? ' open' : ''}`}
                aria-hidden="true"
              />
            </button>
            {menuOpen && (
              <>
                <button
                  type="button"
                  className="menu-backdrop"
                  aria-label="Close mode menu"
                  onClick={() => setMenuOpen(false)}
                />
                <div
                  className="mode-menu"
                  role="listbox"
                  aria-label="Answer mode"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setMenuOpen(false)
                  }}
                >
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="option"
                      aria-selected={mode === m.id}
                      className={`mode-option${mode === m.id ? ' active' : ''}`}
                      onClick={() => pick(m.id)}
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
              <span>{loading ? 'Asking...' : 'Ask'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default Composer
