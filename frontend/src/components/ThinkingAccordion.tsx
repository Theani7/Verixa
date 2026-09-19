import { useEffect, useRef, useState } from 'react'
import {
  Brain,
  CaretDown,
  Check,
  Copy,
  Sparkle,
  Timer,
} from '@phosphor-icons/react'

export interface ThinkingAccordionProps {
  thought: string
  isLive: boolean
  durationMs?: number
  defaultOpen?: boolean
}

export function ThinkingAccordion({
  thought,
  isLive,
  durationMs = 0,
  defaultOpen,
}: ThinkingAccordionProps) {
  const [open, setOpen] = useState(defaultOpen ?? isLive)
  const [copied, setCopied] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const liveStartRef = useRef(Date.now())

  // Track live elapsed seconds
  useEffect(() => {
    if (!isLive) return
    liveStartRef.current = Date.now()
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - liveStartRef.current) / 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [isLive])

  // Auto-open when live thinking begins, if not explicitly toggled
  useEffect(() => {
    if (isLive && defaultOpen === undefined) {
      setOpen(true)
    }
  }, [isLive, defaultOpen])

  // Auto-scroll to bottom as new thoughts stream in
  useEffect(() => {
    if (isLive && open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [thought, isLive, open])

  if (!thought && !isLive) return null

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(thought)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  const seconds = durationMs > 0 ? Math.max(1, Math.round(durationMs / 1000)) : elapsed

  return (
    <div className={`thinking-accordion rise${isLive ? ' is-live' : ''}`}>
      <button
        type="button"
        className="thinking-head"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span className="thinking-icon-badge" aria-hidden="true">
          {isLive ? (
            <Sparkle size={15} weight="fill" className="thinking-sparkle-spin" />
          ) : (
            <Brain size={15} weight="bold" />
          )}
        </span>

        <span className="thinking-title">
          {isLive ? (
            <>
              Thinking
              <span className="thinking-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </>
          ) : (
            `Thought for ${seconds} second${seconds === 1 ? '' : 's'}`
          )}
        </span>

        {isLive && (
          <span className="thinking-live-timer" aria-hidden="true">
            <Timer size={13} />
            {elapsed}s
          </span>
        )}

        <div className="thinking-actions" onClick={(e) => e.stopPropagation()}>
          {!isLive && thought && (
            <button
              type="button"
              className="thinking-copy-btn"
              onClick={handleCopy}
              title="Copy reasoning"
              aria-label="Copy reasoning"
            >
              {copied ? <Check size={12} weight="bold" /> : <Copy size={12} />}
            </button>
          )}

          <CaretDown
            size={14}
            weight="bold"
            className={`thinking-caret${open ? ' open' : ''}`}
            aria-hidden="true"
          />
        </div>
      </button>

      {open && (
        <div className="thinking-body" ref={scrollRef}>
          <div className="thinking-content">
            {thought || 'Analyzing context and formulating response...'}
            {isLive && <span className="thinking-cursor" />}
          </div>
        </div>
      )}
    </div>
  )
}

export default ThinkingAccordion
