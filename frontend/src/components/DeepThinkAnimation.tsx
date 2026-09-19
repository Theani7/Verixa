import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Atom,
  CaretDown,
  Check,
  Cpu,
  FileText,
  GlobeHemisphereWest,
  MagnifyingGlass,
  ShieldCheck,
  Timer,
} from '@phosphor-icons/react'
import type { Source } from '../types'
import { faviconFor, hostnameOf } from '../lib/url'

export interface DeepThinkAnimationProps {
  steps: string[]
  headline?: string
  sources?: Source[]
}

const DEEP_STAGES = [
  { id: 'planning', label: 'Plan Angles', icon: Cpu },
  { id: 'search', label: 'Deep Search', icon: MagnifyingGlass },
  { id: 'verify', label: 'Fact Verification', icon: ShieldCheck },
  { id: 'report', label: 'Synthesize Dossier', icon: FileText },
] as const

export function DeepThinkAnimation({
  steps,
  headline = 'Deep Research',
  sources = [],
}: DeepThinkAnimationProps) {
  const [open, setOpen] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())

  useEffect(() => {
    startRef.current = Date.now()
    setElapsed(0)
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [])

  const rows = steps.length > 0 ? steps : ['Initializing deep research protocol...']
  const currentStep = rows[rows.length - 1]
  const completedSteps = rows.slice(0, -1)

  // Map step text to deep stage index
  const lowerCurrent = currentStep.toLowerCase()
  let activeStageIdx = 0
  if (lowerCurrent.includes('claim') || lowerCurrent.includes('verif') || lowerCurrent.includes('rewrit')) {
    activeStageIdx = 2
  } else if (lowerCurrent.includes('synthes') || lowerCurrent.includes('report') || lowerCurrent.includes('writing')) {
    activeStageIdx = 3
  } else if (lowerCurrent.includes('search') || lowerCurrent.includes('reading') || sources.length > 0) {
    activeStageIdx = 1
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  return (
    <div className="deep-anim-card rise" role="status" aria-label="Deep research in progress">
      {/* Top Bar: Quantum Neural Core + Title + Stopwatch */}
      <div className="deep-anim-header">
        <div className="quantum-core-badge" aria-hidden="true">
          <Atom size={20} weight="bold" className="quantum-core-atom" />
          <span className="quantum-ring-outer" />
          <span className="quantum-ring-inner" />
        </div>

        <div className="deep-anim-titles">
          <div className="deep-anim-main-title">
            <span>{headline}</span>
            <span className="deep-phase-badge">Phase {activeStageIdx + 1} of 4</span>
            <span className="anim-live-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </div>
          <p key={currentStep} className="deep-anim-live-step fade-swap">
            {currentStep}
          </p>
        </div>

        <div className="deep-timer-pill" aria-label={`${elapsed} seconds elapsed`}>
          <Timer size={13} aria-hidden="true" />
          <span>{mm}:{ss}</span>
        </div>
      </div>

      {/* Progress Track */}
      <div className="deep-progress-bar" aria-hidden="true">
        <span
          className="deep-progress-fill"
          style={{ width: `${Math.min(95, Math.max(15, (activeStageIdx + 1) * 24 + (elapsed % 15)))}%` }}
        />
      </div>

      {/* 4-Stage Research Matrix */}
      <div className="deep-stages-grid">
        {DEEP_STAGES.map((stage, idx) => {
          const Icon = stage.icon
          const isDone = idx < activeStageIdx
          const isActive = idx === activeStageIdx
          return (
            <div
              key={stage.id}
              className={`deep-stage-node ${isDone ? 'done' : isActive ? 'active' : 'pending'}`}
            >
              <span className="stage-node-icon" aria-hidden="true">
                {isDone ? <Check size={12} weight="bold" /> : <Icon size={13} />}
              </span>
              <span className="stage-node-label">{stage.label}</span>
              {isActive && <span className="stage-node-beacon" />}
            </div>
          )
        })}
      </div>

      {/* Discovered Sources shelf if present */}
      {sources.length > 0 && (
        <div className="deep-sources-tray rise">
          <div className="deep-sources-head">
            <GlobeHemisphereWest size={13} aria-hidden="true" />
            <span>Multi-Angle Sources ({sources.length})</span>
          </div>
          <div className="deep-sources-scroll">
            {sources.map((s, idx) => {
              const host = hostnameOf(s.url)
              const fav = faviconFor(s.url)
              return (
                <a
                  key={s.id ?? s.url}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="deep-source-chip pop-in"
                  style={{ animationDelay: `${idx * 60}ms` }}
                  title={s.title}
                >
                  <img
                    src={fav}
                    alt=""
                    className="deep-source-favicon"
                    loading="lazy"
                    onError={(e) => {
                      ;(e.currentTarget as HTMLElement).style.display = 'none'
                    }}
                  />
                  <span className="deep-source-host">{host}</span>
                  <ArrowUpRight size={11} className="deep-source-arrow" aria-hidden="true" />
                </a>
              )
            })}
          </div>
        </div>
      )}

      {/* Expandable Step History */}
      {completedSteps.length > 0 && (
        <div className="deep-trail-section">
          <button
            type="button"
            className="deep-trail-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            <CaretDown size={14} weight="bold" className={`trail-caret${open ? ' flip' : ''}`} aria-hidden="true" />
            <span>{completedSteps.length} research checkpoint{completedSteps.length === 1 ? '' : 's'} completed</span>
          </button>

          {open && (
            <ul className="deep-trail-list rise">
              {completedSteps.map((step, i) => (
                <li key={`${i}-${step}`} className="deep-trail-item">
                  <span className="trail-check" aria-hidden="true">
                    <Check size={11} weight="bold" />
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default DeepThinkAnimation
