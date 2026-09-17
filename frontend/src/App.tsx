import { useEffect, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import {
  ArrowClockwise,
  ArrowRight,
  ArrowUpRight,
  BookOpenText,
  CaretDown,
  ChatCircleText,
  Check,
  Copy,
  List,
  MagnifyingGlass,
  Newspaper,
  PencilLine,
  Plus,
  Sparkle,
  SpinnerGap,
  Trash,
  Tray,
  WarningCircle,
} from '@phosphor-icons/react'
import './App.css'

const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const STORAGE_KEY = 'verixa.threads.v1'
const LEGACY_STORAGE_KEY = 'seekora.threads.v1'
const MAX_THREADS = 30

const SUGGESTIONS: string[] = [
  'What are the latest developments in small modular nuclear reactors?',
  'How does retrieval augmented generation reduce hallucinations?',
  'What did the latest IPCC report say about methane emissions?',
]

interface Source {
  id: number
  title: string
  url: string
  excerpt?: string
}

interface Thread {
  id: string
  title: string
  query: string
  answer: string
  sources: Source[]
  ts: number
}

type Phase = 'idle' | 'searching' | 'reading' | 'writing' | 'done'

type StreamEvent =
  | { type: 'status'; phase: Phase }
  | { type: 'sources'; sources: Source[] }
  | { type: 'token'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/* Model-native grounding markers (e.g. 【2†L1-L9】) become [2] chips.
   The second pass drops a marker still split across stream chunks. */
function normalizeCitations(text: string): string {
  return text
    .replace(/【(\d+)[†‡][^】]*】/g, '[$1]')
    .replace(/【\d+[†‡][^】]*$/, '')
}

function isThread(value: unknown): value is Thread {
  if (typeof value !== 'object' || value === null) return false
  const t = value as Record<string, unknown>
  return (
    typeof t.id === 'string' &&
    typeof t.title === 'string' &&
    typeof t.query === 'string' &&
    typeof t.answer === 'string' &&
    Array.isArray(t.sources)
  )
}

function loadThreads(): Thread[] {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isThread)
  } catch {
    return []
  }
}

function saveThreads(threads: Thread[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(threads.slice(0, MAX_THREADS)))
  } catch {
    /* private mode or quota: history stays in memory only */
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  return 'Something went wrong while asking.'
}

/* Inline Markdown: bold, code spans, and [n] citation chips. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d+\])/)
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`
    const bold = part.match(/^\*\*([^*]+)\*\*$/)
    if (bold) return <strong key={key}>{bold[1]}</strong>
    const code = part.match(/^`([^`]+)`$/)
    if (code) return <code key={key}>{code[1]}</code>
    const cite = part.match(/^\[(\d+)\]$/)
    if (cite)
      return (
        <a key={key} className="cite" href={`#source-${cite[1]}`}>
          {cite[1]}
        </a>
      )
    return <span key={key}>{part}</span>
  })
}

/* Block Markdown: fences, headings, lists, paragraphs. Built as elements,
   never injected HTML, so source text cannot break out. */
function renderRich(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const fenceSplit = text.split(/```/)
  let key = 0

  fenceSplit.forEach((chunk, fi) => {
    if (fi % 2 === 1) {
      nodes.push(<pre key={`f-${key++}`}><code>{chunk.replace(/^\w+\n/, '')}</code></pre>)
      return
    }
    const lines = chunk.split('\n')
    let list: { ordered: boolean; items: string[] } | null = null

    function flushList(): void {
      if (!list) return
      const Tag = list.ordered ? 'ol' : 'ul'
      const items = list.items
      const listKey = key++
      nodes.push(
        <Tag key={`l-${listKey}`}>
          {items.map((item, ii) => (
            <li key={ii}>{renderInline(item, `l-${listKey}-i${ii}`)}</li>
          ))}
        </Tag>,
      )
      list = null
    }

    for (const line of lines) {
      const h3 = line.match(/^###\s+(.*)/)
      const h2 = line.match(/^##\s+(.*)/)
      const ul = line.match(/^[-*]\s+(.*)/)
      const ol = line.match(/^\d+[.)]\s+(.*)/)
      if (h3 || h2) {
        flushList()
        const Tag = h3 ? 'h3' : 'h4'
        const content = (h3 ?? h2)?.[1] ?? ''
        const headKey = key++
        nodes.push(<Tag key={`h-${headKey}`}>{renderInline(content, `h-${headKey}`)}</Tag>)
      } else if (ul || ol) {
        const ordered = Boolean(ol)
        const item = (ul ?? ol)?.[1] ?? ''
        if (!list || list.ordered !== ordered) {
          flushList()
          list = { ordered, items: [] }
        }
        list.items.push(item)
      } else if (line.trim() === '') {
        flushList()
      } else {
        flushList()
        const paraKey = key++
        nodes.push(<p key={`p-${paraKey}`}>{renderInline(line, `p-${paraKey}`)}</p>)
      }
    }
    flushList()
  })

  return nodes
}

type StepId = 'searching' | 'reading' | 'writing'

const STEPS: Array<{ id: StepId; label: string; icon: ReactNode }> = [
  { id: 'searching', label: 'Searching the web', icon: <MagnifyingGlass size={16} /> },
  { id: 'reading', label: 'Reading sources', icon: <BookOpenText size={16} /> },
  { id: 'writing', label: 'Writing answer', icon: <PencilLine size={16} /> },
]

function StatusSteps({ phase, sourceCount }: { phase: Phase; sourceCount: number }) {
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
    </div>
  )
}

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  loading: boolean
  placeholder: string
  hint: string
}

function Composer({ value, onChange, onSubmit, loading, placeholder, hint }: ComposerProps) {

  function onKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="composer">
      <label className="visually-hidden" htmlFor="verixa-query">
        Ask a question
      </label>
      <textarea
        id="verixa-query"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={2}
      />
      <div className="composer-row">
        <span className="composer-hint">{hint}</span>
        <button
          type="button"
          className="ask-button"
          onClick={onSubmit}
          disabled={loading || !value.trim()}
        >
          {loading ? (
            <SpinnerGap size={18} weight="bold" className="spin" />
          ) : (
            <ArrowRight size={18} weight="bold" />
          )}
          {loading ? 'Asking...' : 'Ask'}
        </button>
      </div>
    </div>
  )
}

function App() {
  const [threads, setThreads] = useState<Thread[]>(loadThreads)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [asked, setAsked] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<Source[]>([])
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')

  const loading =
    phase === 'searching' || phase === 'reading' || phase === 'writing'

  useEffect(() => {
    saveThreads(threads)
  }, [threads])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])

  function persistThread(q: string, nextAnswer: string, nextSources: Source[]): void {
    setThreads((prev) => {
      if (activeId) {
        return prev.map((t) =>
          t.id === activeId
            ? { ...t, query: q, answer: nextAnswer, sources: nextSources, ts: Date.now() }
            : t,
        )
      }
      const thread: Thread = {
        id: newId(),
        title: q.length > 60 ? `${q.slice(0, 60)}...` : q,
        query: q,
        answer: nextAnswer,
        sources: nextSources,
        ts: Date.now(),
      }
      setActiveId(thread.id)
      return [thread, ...prev]
    })
  }

  async function runAsk(text?: string): Promise<void> {
    const q = (text ?? query).trim()
    if (!q || loading) return
    setPhase('searching')
    setError('')
    setAnswer('')
    setSources([])
    setAsked(q)
    setQuery('')
    setCopied(false)
    setSourcesOpen(false)
    let full = ''
    let seenSources: Source[] = []
    try {
      const res = await fetch(`${API_URL}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      if (!res.ok) throw new Error(`The answer engine returned status ${res.status}.`)
      if (!res.body) throw new Error('Streaming is not supported in this browser.')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done || value === undefined) break
        buf += decoder.decode(value, { stream: true })
        let idx: number
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data: ')) continue
            const e = JSON.parse(line.slice(6)) as StreamEvent
            if (e.type === 'status') {
              setPhase(e.phase)
            } else if (e.type === 'sources') {
              seenSources = e.sources ?? []
              setSources(seenSources)
            } else if (e.type === 'token') {
              full += e.text
              setAnswer(full)
            } else if (e.type === 'done') {
              persistThread(q, normalizeCitations(full), seenSources)
              setPhase('done')
            } else if (e.type === 'error') {
              throw new Error(e.message)
            }
          }
        }
      }
    } catch (err) {
      setError(errorMessage(err))
      setPhase('done')
    }
  }

  function openThread(id: string): void {
    const t = threads.find((x) => x.id === id)
    if (!t) return
    setActiveId(t.id)
    setQuery('')
    setAsked(t.query)
    setAnswer(t.answer)
    setSources(t.sources)
    setError('')
    setCopied(false)
    setSourcesOpen(false)
    setSidebarOpen(false)
    setPhase('done')
  }

  function deleteThread(id: string): void {
    setThreads((prev) => prev.filter((t) => t.id !== id))
    if (id === activeId) reset()
  }

  function reset(): void {
    setActiveId(null)
    setQuery('')
    setAsked('')
    setAnswer('')
    setSources([])
    setError('')
    setCopied(false)
    setSourcesOpen(false)
    setSidebarOpen(false)
    setPhase('idle')
  }

  async function copyAnswer(): Promise<void> {
    try {
      await navigator.clipboard.writeText(normalizeCitations(answer))
      setCopied(true)
    } catch {
      setError('Copy is not available in this browser. Select the text manually.')
    }
  }

  const streaming = answer !== '' && phase !== 'done'
  const displayAnswer = normalizeCitations(answer)

  return (
    <div className={`app${sidebarOpen ? ' sidebar-open' : ''}`}>
      <aside className="sidebar" aria-label="Threads">
        <div className="brand-row">
          <span className="brand-mark" aria-hidden="true">V</span>
          <span className="brand">Verixa</span>
        </div>
        <button type="button" className="new-thread" onClick={reset}>
          <Plus size={18} weight="bold" />
          New thread
        </button>
        <p className="thread-label">Recent</p>
        {threads.length === 0 ? (
          <p className="thread-empty">
            <Tray size={18} aria-hidden="true" />
            Threads you ask will appear here for this session.
          </p>
        ) : (
          <ul className="thread-list">
            {threads.map((t) => (
              <li
                key={t.id}
                className={`thread-item${t.id === activeId ? ' active' : ''}`}
              >
                <span className="thread-ico" aria-hidden="true">
                  <ChatCircleText size={16} />
                </span>
                <button
                  type="button"
                  className="thread-open"
                  onClick={() => openThread(t.id)}
                  aria-current={t.id === activeId ? 'true' : undefined}
                  title={t.query}
                >
                  {t.title}
                </button>
                <button
                  type="button"
                  className="thread-delete"
                  onClick={() => deleteThread(t.id)}
                  aria-label={`Delete thread ${t.title}`}
                >
                  <Trash size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="sidebar-foot">Live web answers with cited sources.</p>
      </aside>
      <button
        type="button"
        className="backdrop"
        aria-label="Close threads panel"
        onClick={() => setSidebarOpen(false)}
      />

      <div className="content">
        <div className="shell">
          <header className="topbar">
            <button
              type="button"
              className="icon-button"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-expanded={sidebarOpen}
              aria-label="Toggle threads panel"
            >
              <List size={20} />
            </button>
            <span className="brand">Verixa</span>
          </header>

          {!asked && (
            <main className="hero">
              <h1 className="hero-title rise">What do you want to know?</h1>
              <p className="hero-sub rise rise-1">
                Ask anything. Verixa searches the live web and writes an
                answer with sources you can check.
              </p>
              <form onSubmit={(e) => e.preventDefault()} className="rise rise-2">
                <Composer
                  value={query}
                  onChange={setQuery}
                  onSubmit={() => runAsk()}
                  loading={loading}
                  placeholder="Ask anything..."
                  hint="Press Enter to ask, Shift plus Enter for a new line"
                />
              </form>
              <ul className="suggest-list rise rise-3">
                {SUGGESTIONS.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      className="suggest-item"
                      onClick={() => {
                        setQuery(s)
                        runAsk(s)
                      }}
                    >
                      <span className="suggest-text">{s}</span>
                      <ArrowUpRight size={18} className="suggest-arrow" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </main>
          )}

          {asked && (
            <main
              aria-live={phase === 'done' ? 'polite' : 'off'}
              aria-busy={loading}
              className="thread"
            >
              <h1 className="query-title">{asked}</h1>

              {loading && (
                <StatusSteps phase={phase} sourceCount={sources.length} />
              )}

              {answer !== '' && (
                <section className="answer-card rise" aria-label="Answer">
                  <div className="answer-head">
                    <p className="answer-label">
                      <Sparkle size={15} aria-hidden="true" />
                      Answer
                    </p>
                    <button
                      type="button"
                      className="copy-button"
                      onClick={copyAnswer}
                    >
                      <span key={String(copied)} className="copy-pop">
                        {copied ? <Check size={16} weight="bold" /> : <Copy size={16} />}
                      </span>
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="answer-body">
                    {streaming ? (
                      <p className="stream-text">
                        {displayAnswer}
                        <span className="stream-caret" aria-hidden="true" />
                      </p>
                    ) : (
                      renderRich(displayAnswer)
                    )}
                  </div>
                </section>
              )}

              {error && (
                <div className="error-card" role="alert">
                  <p className="error-line">
                    <WarningCircle size={18} aria-hidden="true" />
                    <span>{error}</span>
                  </p>
                  <button
                    type="button"
                    className="ask-button"
                    onClick={() => runAsk(asked)}
                  >
                    <ArrowClockwise size={18} weight="bold" />
                    Ask again
                  </button>
                </div>
              )}

              {sources.length > 0 && phase === 'done' && (
                <section className="rise rise-1" aria-label="Sources">
                  <button
                    type="button"
                    className="sources-toggle"
                    onClick={() => setSourcesOpen((v) => !v)}
                    aria-expanded={sourcesOpen}
                    aria-controls="sources-list"
                  >
                    <Newspaper size={16} aria-hidden="true" />
                    <span className="sources-count">{sources.length}</span>
                    Sources
                    <CaretDown
                      size={16}
                      weight="bold"
                      className={`sources-caret${sourcesOpen ? ' open' : ''}`}
                    />
                  </button>
                  {sourcesOpen && (
                    <ol className="sources-list" id="sources-list">
                      {sources.map((s, si) => (
                        <li
                          key={s.id ?? s.url}
                          id={`source-${s.id}`}
                          className="source-card rise"
                          style={{ animationDelay: `${Math.min(si, 5) * 60}ms` }}
                        >
                          <span className="source-num">{s.id}</span>
                          <div className="source-meta">
                            <a
                              className="source-link"
                              href={s.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {s.title}
                            </a>
                            {s.excerpt && (
                              <p className="source-excerpt">{s.excerpt}</p>
                            )}
                            <span className="source-host">
                              <img
                                src={`https://www.google.com/s2/favicons?domain=${hostnameOf(s.url)}&sz=64`}
                                alt=""
                                loading="lazy"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none'
                                }}
                              />
                              {hostnameOf(s.url)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              )}

              {phase === 'done' && (
                <button
                  type="button"
                  className="new-question rise rise-2"
                  onClick={reset}
                >
                  <ArrowClockwise size={18} />
                  New question
                </button>
              )}

              <div className="composer-dock">
                <form onSubmit={(e) => e.preventDefault()}>
                  <Composer
                    value={query}
                    onChange={setQuery}
                    onSubmit={() => runAsk()}
                    loading={loading}
                    placeholder="Ask a follow-up..."
                    hint="Press Enter to ask, Shift plus Enter for a new line"
                  />
                </form>
              </div>
            </main>
          )}

          <footer className="footer">
            Verixa answers from live web sources via Exa. Verify important
            claims before acting on them.
          </footer>
        </div>
      </div>
    </div>
  )
}

export default App
