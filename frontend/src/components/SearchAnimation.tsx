import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  BookOpenText,
  Check,
  Compass,
  GlobeHemisphereWest,
  MagnifyingGlass,
  PencilLine,
  Timer,
} from '@phosphor-icons/react'
import type { Phase } from '../hooks/useAskStream'
import type { Source } from '../types'
import { faviconFor, hostnameOf } from '../lib/url'

export interface SearchAnimationProps {
  phase: Phase
  resolvedQuery?: string
  sources?: Source[]
  sourceCount?: number
}

const SEARCH_STAGES = [
  { id: 'searching', label: 'Search Query', icon: MagnifyingGlass },
  { id: 'reading', label: 'Explore Sources', icon: BookOpenText },
  { id: 'writing', label: 'Synthesize', icon: PencilLine },
] as const

export function SearchAnimation({
  phase,
  resolvedQuery = '',
  sources = [],
  sourceCount = 0,
}: SearchAnimationProps) {
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

  const activeIdx =
    phase === 'searching' ? 0 : phase === 'reading' ? 1 : phase === 'writing' ? 2 : 1

  const currentStatusText =
    phase === 'searching'
      ? 'Searching the web...'
      : phase === 'reading'
      ? `Reading ${sources.length || sourceCount || 5} sources...`
      : 'Synthesizing verified answer...'

  const count = sources.length || sourceCount

  return (
    <div className="search-anim-card rise" role="status" aria-label="Web search in progress">
      {/* Top Bar: Radar Core + Status Text + Live Timer */}
      <div className="search-anim-header">
        <div className="search-radar-badge" aria-hidden="true">
          <Compass size={17} weight="bold" className="search-radar-icon" />
          <span className="search-radar-ping" />
        </div>

        <div className="search-anim-titles">
          <div className="search-anim-main-title">
            <span>{currentStatusText}</span>
            <span className="anim-live-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </div>
          {resolvedQuery && (
            <p className="search-query-tag">
              <MagnifyingGlass size={11} aria-hidden="true" />
              <span>&ldquo;{resolvedQuery}&rdquo;</span>
            </p>
          )}
        </div>

        <div className="search-timer-pill" aria-label={`${elapsed} seconds elapsed`}>
          <Timer size={13} aria-hidden="true" />
          <span>{elapsed}s</span>
        </div>
      </div>

      {/* Stepper Capsules */}
      <div className="search-stepper">
        {SEARCH_STAGES.map((stage, idx) => {
          const Icon = stage.icon
          const isDone = idx < activeIdx
          const isActive = idx === activeIdx
          return (
            <div
              key={stage.id}
              className={`search-step-capsule ${isDone ? 'done' : isActive ? 'active' : 'pending'}`}
            >
              <span className="step-capsule-icon" aria-hidden="true">
                {isDone ? <Check size={12} weight="bold" /> : <Icon size={12} />}
              </span>
              <span className="step-capsule-label">{stage.label}</span>
              {isActive && <span className="step-capsule-beacon" />}
            </div>
          )
        })}
      </div>

      {/* Hero: Live Visited Website Favicons Carousel */}
      {sources.length > 0 ? (
        <div className="search-sources-shelf rise">
          <div className="shelf-meta-row">
            <span className="shelf-label">
              <GlobeHemisphereWest size={13} aria-hidden="true" />
              <span>Discovered {count} sources</span>
            </span>
            {phase === 'reading' && <span className="shelf-reading-badge">Reading live</span>}
          </div>

          <div className="shelf-chips-scroll">
            {sources.map((s, idx) => {
              const host = hostnameOf(s.url)
              const fav = faviconFor(s.url)
              return (
                <a
                  key={s.id ?? s.url}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="search-site-chip pop-in"
                  style={{ animationDelay: `${idx * 70}ms` }}
                  title={s.title}
                >
                  <img
                    src={fav}
                    alt=""
                    className="site-chip-favicon"
                    loading="lazy"
                    onError={(e) => {
                      ;(e.currentTarget as HTMLElement).style.display = 'none'
                    }}
                  />
                  <span className="site-chip-host">{host}</span>
                  <ArrowUpRight size={11} className="site-chip-arrow" aria-hidden="true" />
                  {phase === 'reading' && <span className="site-chip-shimmer" />}
                </a>
              )
            })}
          </div>
        </div>
      ) : (
        /* Pulse wave while waiting for initial search results */
        <div className="search-scanning-bar" aria-hidden="true">
          <span className="scanning-beam" />
        </div>
      )}
    </div>
  )
}

export default SearchAnimation
