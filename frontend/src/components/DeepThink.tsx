import { useEffect, useRef, useState } from 'react'
import { CaretDown, Check, Sparkle, Timer } from '@phosphor-icons/react'

export interface DeepThinkProps {
  steps: string[]
  headline: string
}

/* Grok-style deep-research animation: pulsing "Thinking" headline with a
   live dot-wave, rotating activity line, elapsed timer, animated progress
   bar, and an expandable trail of completed steps. */
export function DeepThink({ steps, headline }: DeepThinkProps) {
  const [open, setOpen] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const startedAt = useRef(Date.now())

  useEffect(() => {
    startedAt.current = Date.now()
    setElapsed(0)
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)),
      1000,
    )
    return () => clearInterval(t)
  }, [])

  const rows = steps.length > 0 ? steps : ['Starting deep research']
  const current = rows[rows.length - 1]
  const done = rows.slice(0, -1)
  const mm = Math.floor(elapsed / 60)
  const ss = String(elapsed % 60).padStart(2, '0')

  return (
    <div className="think-card rise" role="status" aria-label="Deep research progress">
      <div className="think-head">
        <span className="think-spark" aria-hidden="true">
          <Sparkle size={18} weight="fill" />
        </span>
        <span className="think-title">
          {headline}
          <span className="think-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </span>
        <span className="think-timer" aria-label={`${elapsed} seconds elapsed`}>
          <Timer size={13} aria-hidden="true" />
          {mm}:{ss}
        </span>
      </div>
      <p key={current} className="think-current fade-swap">
        {current}
      </p>
      <div className="think-bar" aria-hidden="true">
        <span className="think-bar-fill" />
      </div>
      {done.length > 0 && (
        <button
          type="button"
          className="think-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <CaretDown size={14} weight="bold" className={open ? 'flip' : ''} aria-hidden="true" />
          {done.length} step{done.length === 1 ? '' : 's'} completed
        </button>
      )}
      {open && done.length > 0 && (
        <ul className="think-trail">
          {done.map((label, i) => (
            <li key={`${i}-${label}`}>
              <Check size={13} weight="bold" aria-hidden="true" />
              <span>{label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default DeepThink
