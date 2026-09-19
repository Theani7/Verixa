import type { ReactNode } from 'react'
import {
  ArrowUpRight,
  BookOpenText,
  Check,
  GlobeHemisphereWest,
  MagnifyingGlass,
  PencilLine,
  Sparkle,
} from '@phosphor-icons/react'
import { DeepThink } from './DeepThink'
import type { Phase } from '../hooks/useAskStream'
import type { Source } from '../types'
import { faviconFor, hostnameOf } from '../lib/url'

export type StepId = 'searching' | 'reading' | 'writing'

export const STEPS: Array<{ id: StepId; label: string; icon: ReactNode }> = [
  { id: 'searching', label: 'Searching the web', icon: <MagnifyingGlass size={16} /> },
  { id: 'reading', label: 'Reading sources', icon: <BookOpenText size={16} /> },
  { id: 'writing', label: 'Writing answer', icon: <PencilLine size={16} /> },
]

export interface StatusStepsProps {
  phase: Phase
  sourceCount: number
  resolved: string
  steps: string[]
  sources?: Source[]
}

export function StatusSteps({
  phase,
  sourceCount,
  resolved,
  steps,
  sources = [],
}: StatusStepsProps) {
  if (phase === 'thinking') {
    return (
      <div className="status-card rise" role="status" aria-label="Thinking">
        <ul className="status-list">
          <li className="status-row active">
            <span className="step-icon" aria-hidden="true">
              <span className="step-live">
                <Sparkle size={16} />
              </span>
            </span>
            Thinking...
          </li>
        </ul>
      </div>
    )
  }
  if (phase === 'researching' || (phase === 'writing' && steps.length > 0)) {
    return <DeepThink steps={steps} headline={phase === 'writing' ? 'Writing report' : 'Researching'} />
  }

  const activeIdx = STEPS.findIndex((s) => s.id === phase)

  return (
    <div className="status-card rise" role="status" aria-label="Search progress">
      <ul className="status-list">
        {STEPS.map((step, i) => {
          const state = i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'pending'
          const label =
            step.id === 'reading' && sourceCount > 0
              ? `Reading ${sourceCount} sources`
              : step.label
          return (
            <li key={step.id} className={`status-row ${state}`}>
              <span className="step-icon" aria-hidden="true">
                {state === 'done' ? (
                  <Check size={16} weight="bold" />
                ) : state === 'active' ? (
                  <span className="step-live">{step.icon}</span>
                ) : (
                  step.icon
                )}
              </span>
              <span className="step-label">{label}</span>
              {state === 'active' && step.id === 'searching' && resolved && (
                <span className="step-subquery">&ldquo;{resolved}&rdquo;</span>
              )}
            </li>
          )
        })}
      </ul>

      {/* Live website visiting shelf with real favicons */}
      {sources.length > 0 && (
        <div className="visiting-shelf rise">
          <div className="visiting-shelf-head">
            <GlobeHemisphereWest size={13} aria-hidden="true" />
            <span>Visited {sources.length} websites</span>
          </div>
          <div className="visiting-chips">
            {sources.map((s, idx) => {
              const host = hostnameOf(s.url)
              const fav = faviconFor(s.url)
              return (
                <a
                  key={s.id ?? s.url}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="visiting-chip pop-in"
                  style={{ animationDelay: `${idx * 60}ms` }}
                  title={s.title}
                >
                  <img
                    src={fav}
                    alt=""
                    className="visiting-favicon"
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none'
                    }}
                  />
                  <span className="visiting-host">{host}</span>
                  <ArrowUpRight size={11} className="visiting-chip-arrow" aria-hidden="true" />
                  {phase === 'reading' && <span className="visiting-shimmer" />}
                </a>
              )
            })}
          </div>
        </div>
      )}

      {resolved !== '' && sources.length === 0 && (
        <p className="resolve-line">Searching for &ldquo;{resolved}&rdquo;</p>
      )}
    </div>
  )
}

export default StatusSteps
