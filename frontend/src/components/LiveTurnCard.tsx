import {
  ArrowBendDownRight,
  ArrowClockwise,
  GlobeHemisphereWest,
  Plus,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import type { AskMode, Source } from '../types'
import type { Phase } from '../hooks/useAskStream'
import { renderRich } from '../markdown'
import { SourceList } from '../article'
import { AnswerHeader } from './AnswerHeader'
import { StatusSteps } from './StatusSteps'
import { ThinkingAccordion } from './ThinkingAccordion'
import { ActionBar } from './ActionBar'

export interface LiveTurnCardProps {
  asked: string
  displayAnswer: string
  thought?: string
  thoughtDurationMs?: number
  sources: Source[]
  phase: Phase
  steps: string[]
  resolvedQuery: string
  error: string
  related: string[]
  askMode: AskMode
  loading: boolean
  streaming: boolean
  copiedKey: string | null
  openSources: string | null
  shareState: 'idle' | 'copied' | 'failed'
  onCopy: (text: string, key: string) => void
  onShare: () => void
  onNewThread: () => void
  onToggleSources: (key: string) => void
  onRetry: () => void
  onAskRelated: (query: string) => void
}

export function LiveTurnCard({
  asked,
  displayAnswer,
  thought = '',
  thoughtDurationMs = 0,
  sources,
  phase,
  steps,
  resolvedQuery,
  error,
  related,
  askMode,
  loading,
  streaming,
  copiedKey,
  openSources,
  shareState,
  onCopy,
  onShare,
  onNewThread,
  onToggleSources,
  onRetry,
  onAskRelated,
}: LiveTurnCardProps) {
  const isSourcesOpen = openSources === 'live'
  const isCopied = copiedKey === 'live'

  return (
    <div className="turn live-turn">
      <div className="bubble-row">
        <h1 className="user-bubble">{asked}</h1>
      </div>

      <div className="assistant-turn">
        {loading && (
          <StatusSteps
            phase={phase}
            sourceCount={sources.length}
            resolved={resolvedQuery}
            steps={steps}
            sources={sources}
            mode={askMode}
          />
        )}

        {thought !== '' && (
          <ThinkingAccordion
            thought={thought}
            isLive={loading && displayAnswer === ''}
            durationMs={thoughtDurationMs}
          />
        )}

        {(displayAnswer !== '' || !loading) && (
          <AnswerHeader mode={askMode} durationMs={0} loading={loading} />
        )}

        {displayAnswer !== '' && (
          <div className="answer-body">
            {renderRich(displayAnswer, 'live-', sources, streaming)}
          </div>
        )}

        {error && (
          <div className="error-card" role="alert">
            <p className="error-line">
              <WarningCircle size={18} aria-hidden="true" />
              <span>{error}</span>
            </p>
            <button type="button" className="ask-button" onClick={onRetry}>
              <ArrowClockwise size={18} weight="bold" />
              Ask again
            </button>
          </div>
        )}

        {!loading && displayAnswer !== '' && (
          <ActionBar
            copied={isCopied}
            shareState={shareState}
            sources={sources}
            sourcesOpen={isSourcesOpen}
            onCopy={() => onCopy(displayAnswer, 'live')}
            onShare={onShare}
            onNewThread={onNewThread}
            onToggleSources={() => onToggleSources('live')}
          />
        )}

        {isSourcesOpen && sources.length > 0 && (
          <div className="sources-drawer rise">
            <div className="sources-drawer-head">
              <span className="sources-drawer-title">
                <GlobeHemisphereWest size={15} aria-hidden="true" />
                <span>Sources ({sources.length})</span>
              </span>
              <button
                type="button"
                className="sources-drawer-close"
                onClick={() => onToggleSources('live')}
                aria-label="Close sources drawer"
                title="Close"
              >
                <X size={15} />
              </button>
            </div>
            <SourceList prefix="live-" sources={sources} />
          </div>
        )}

        {!loading && related.length > 0 && (
          <section className="related rise" aria-label="Related questions">
            <p className="related-label">
              <ArrowBendDownRight size={15} aria-hidden="true" />
              <span>Related questions</span>
            </p>
            <ul className="related-list">
              {related.map((rq) => (
                <li key={rq}>
                  <button
                    type="button"
                    className="related-item"
                    onClick={() => onAskRelated(rq)}
                  >
                    <span className="related-text">{rq}</span>
                    <Plus size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

export default LiveTurnCard
