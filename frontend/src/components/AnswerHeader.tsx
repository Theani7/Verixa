import { Flask, Sparkle, Timer } from '@phosphor-icons/react'
import type { Turn } from '../types'

export function formatSecs(ms: number): string {
  return `${Math.max(1, Math.round(ms / 1000))}s`
}

export interface AnswerHeaderProps {
  mode: Turn['mode']
  durationMs: number
  loading?: boolean
}

export function AnswerHeader({ mode, durationMs, loading = false }: AnswerHeaderProps) {
  return (
    <div className="answer-header rise">
      <div className="answer-brand">
        <span className={`answer-mark${loading ? ' pulsing' : ''}`} aria-hidden="true">
          <Sparkle size={14} weight="fill" />
        </span>
        <span className="answer-label">{loading ? 'Searching & answering...' : 'Answer'}</span>
      </div>
      <div className="answer-meta-tags">
        {mode === 'deep' && (
          <span className="deep-badge">
            <Flask size={13} aria-hidden="true" />
            Deep research
          </span>
        )}
        {durationMs > 0 && (
          <span className="researched-pill">
            <Timer size={13} aria-hidden="true" />
            Researched {formatSecs(durationMs)}
          </span>
        )}
      </div>
    </div>
  )
}

export default AnswerHeader
