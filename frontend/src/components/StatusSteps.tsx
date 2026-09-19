import type { ReactNode } from 'react'
import { BookOpenText, Check, MagnifyingGlass, PencilLine, Sparkle } from '@phosphor-icons/react'
import { DeepThink } from './DeepThink'
import type { Phase } from '../hooks/useAskStream'

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
}

export function StatusSteps({ phase, sourceCount, resolved, steps }: StatusStepsProps) {
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
              {label}
            </li>
          )
        })}
      </ul>
      {resolved !== '' && (
        <p className="resolve-line">Searching for &ldquo;{resolved}&rdquo;</p>
      )}
    </div>
  )
}

export default StatusSteps
