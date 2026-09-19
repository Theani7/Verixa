import { useEffect } from 'react'
import {
  LockSimple,
  X,
  ArrowRight,
  MagnifyingGlass,
  Sparkle,
} from '@phosphor-icons/react'
import type { AskMode } from '../types'

export interface ModeLockModalProps {
  isOpen: boolean
  currentMode: AskMode
  targetMode: AskMode
  onClose: () => void
  onStartNewChat: (targetMode: AskMode) => void
}

export function ModeLockModal({
  isOpen,
  currentMode,
  targetMode,
  onClose,
  onStartNewChat,
}: ModeLockModalProps) {
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const currentLabel = currentMode === 'deep' ? 'Deep Research' : 'Search'
  const targetLabel = targetMode === 'deep' ? 'Deep Research' : 'Search'

  const currentDesc =
    currentMode === 'deep'
      ? 'Multi-stage investigation & synthesis'
      : 'Fast, focused live-web retrieval'

  const targetDesc =
    targetMode === 'deep'
      ? 'Multi-stage investigation & synthesis'
      : 'Fast, focused live-web retrieval'

  return (
    <div
      className="modal-backdrop mode-lock-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="modal mode-lock-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mode-lock-title"
      >
        <div className="modal-head">
          <div className="mode-lock-header-badge">
            <LockSimple size={18} weight="bold" />
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mode-lock-body">
          <h2 id="mode-lock-title" className="mode-lock-title">
            Mode is locked for this chat
          </h2>
          <p className="mode-lock-text">
            This chat was started using <strong>{currentLabel}</strong>. Deep Research and Search modes utilize distinct reasoning frameworks, context pipelines, and search depths that cannot be mixed within the same thread.
          </p>

          <div className="mode-lock-comparison">
            <div className="mode-lock-card current">
              <div className="mode-lock-card-badge">
                {currentMode === 'deep' ? (
                  <Sparkle size={15} weight="bold" />
                ) : (
                  <MagnifyingGlass size={15} weight="bold" />
                )}
                <span>Active Chat Mode</span>
              </div>
              <span className="mode-lock-card-name">{currentLabel}</span>
              <span className="mode-lock-card-sub">{currentDesc}</span>
            </div>

            <div className="mode-lock-divider">
              <ArrowRight size={14} weight="bold" />
            </div>

            <div className="mode-lock-card target">
              <div className="mode-lock-card-badge requested">
                {targetMode === 'deep' ? (
                  <Sparkle size={15} weight="bold" />
                ) : (
                  <MagnifyingGlass size={15} weight="bold" />
                )}
                <span>Requested</span>
              </div>
              <span className="mode-lock-card-name">{targetLabel}</span>
              <span className="mode-lock-card-sub">{targetDesc}</span>
            </div>
          </div>
        </div>

        <div className="mode-lock-actions">
          <button
            type="button"
            className="mode-lock-btn-secondary"
            onClick={onClose}
          >
            Stay in current chat
          </button>
          <button
            type="button"
            className="mode-lock-btn-primary"
            onClick={() => onStartNewChat(targetMode)}
            autoFocus
          >
            <span>Start new chat in {targetLabel}</span>
            <ArrowRight size={14} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  )
}
