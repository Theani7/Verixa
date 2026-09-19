import { ArrowBendDownRight, GlobeHemisphereWest, Plus, X } from '@phosphor-icons/react'
import type { Turn } from '../types'
import { renderRich } from '../markdown'
import { SourceList } from '../article'
import { AnswerHeader } from './AnswerHeader'
import { ThinkingAccordion } from './ThinkingAccordion'
import { ActionBar } from './ActionBar'

export interface TurnCardProps {
  turn: Turn
  turnIndex: number
  copiedKey?: string | null
  openSources?: string | null
  shareState?: 'idle' | 'copied' | 'failed'
  onCopy?: (text: string, key: string) => void
  onShare?: () => void
  onNewThread?: () => void
  onToggleSources?: (key: string) => void
  onAskRelated?: (query: string) => void
}

export function TurnCard({
  turn,
  turnIndex,
  copiedKey = null,
  openSources = null,
  shareState = 'idle',
  onCopy,
  onShare,
  onNewThread,
  onToggleSources,
  onAskRelated,
}: TurnCardProps) {
  const key = `t${turnIndex}`
  const isSourcesOpen = openSources === key
  const isCopied = copiedKey === key

  const showSearchingLine =
    turn.mode === 'search' &&
    turn.searchedQuery !== '' &&
    turn.searchedQuery.toLowerCase() !== turn.query.toLowerCase()

  return (
    <div className="turn">
      <div className="bubble-row">
        <h2 className="user-bubble">{turn.query}</h2>
      </div>

      <div className="assistant-turn">
        <AnswerHeader mode={turn.mode} durationMs={turn.durationMs} />

        {turn.thought && (
          <ThinkingAccordion
            thought={turn.thought}
            isLive={false}
            durationMs={turn.thoughtDurationMs}
            defaultOpen={false}
          />
        )}

        {showSearchingLine && (
          <p className="searching-line">
            <GlobeHemisphereWest size={15} aria-hidden="true" />
            Searching for {turn.searchedQuery}
          </p>
        )}

        <div className="answer-body">
          {renderRich(turn.answer, `${key}-`, turn.sources, false)}
        </div>

        <ActionBar
          copied={isCopied}
          shareState={shareState}
          sources={turn.sources}
          sourcesOpen={isSourcesOpen}
          onCopy={onCopy ? () => onCopy(turn.answer, key) : undefined}
          onShare={onShare}
          onNewThread={onNewThread}
          onToggleSources={onToggleSources ? () => onToggleSources(key) : undefined}
        />

        {isSourcesOpen && turn.sources.length > 0 && (
          <div className="sources-drawer rise">
            <div className="sources-drawer-head">
              <span className="sources-drawer-title">
                <GlobeHemisphereWest size={15} aria-hidden="true" />
                <span>Sources ({turn.sources.length})</span>
              </span>
              {onToggleSources && (
                <button
                  type="button"
                  className="sources-drawer-close"
                  onClick={() => onToggleSources(key)}
                  aria-label="Close sources drawer"
                  title="Close"
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <SourceList prefix={`${key}-`} sources={turn.sources} />
          </div>
        )}

        {onAskRelated && turn.related.length > 0 && (
          <section className="related rise" aria-label="Related questions">
            <p className="related-label">
              <ArrowBendDownRight size={15} aria-hidden="true" />
              <span>Related questions</span>
            </p>
            <ul className="related-list">
              {turn.related.map((rq) => (
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

export default TurnCard
