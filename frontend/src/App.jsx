import { useEffect, useState } from 'react'
import {
  ArrowClockwise,
  ArrowRight,
  CaretDown,
  Check,
  Copy,
  List,
  Plus,
  X,
} from '@phosphor-icons/react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const STORAGE_KEY = 'seekora.threads.v1'
const MAX_THREADS = 30

const SUGGESTIONS = [
  'What are the latest developments in small modular nuclear reactors?',
  'How does retrieval augmented generation reduce hallucinations?',
  'What did the latest IPCC report say about methane emissions?',
]

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function loadThreads() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveThreads(threads) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(threads.slice(0, MAX_THREADS)))
  } catch {
    /* private mode or quota: history stays in memory only */
  }
}

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}

/* Inline Markdown: bold, code spans, and [n] citation chips. */
function renderInline(text, keyPrefix) {
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
function renderRich(text) {
  const nodes = []
  const fenceSplit = text.split(/```/)
  let key = 0

  fenceSplit.forEach((chunk, fi) => {
    if (fi % 2 === 1) {
      nodes.push(<pre key={`f-${key++}`}><code>{chunk.replace(/^\w+\n/, '')}</code></pre>)
      return
    }
    const lines = chunk.split('\n')
    let list = null

    function flushList() {
      if (!list) return
      const Tag = list.ordered ? 'ol' : 'ul'
      nodes.push(
        <Tag key={`l-${key++}`}>
          {list.items.map((item, ii) => (
            <li key={ii}>{renderInline(item, `l-${key}-i${ii}`)}</li>
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
        nodes.push(<Tag key={`h-${key++}`}>{renderInline((h3 ?? h2)[1], `h-${key}`)}</Tag>)
      } else if (ul || ol) {
        const ordered = Boolean(ol)
        const item = (ul ?? ol)[1]
        if (!list || list.ordered !== ordered) {
          flushList()
          list = { ordered, items: [] }
        }
        list.items.push(item)
      } else if (line.trim() === '') {
        flushList()
      } else {
        flushList()
        nodes.push(<p key={`p-${key++}`}>{renderInline(line, `p-${key}`)}</p>)
      }
    }
    flushList()
  })

  return nodes
}

function Composer({ value, onChange, onSubmit, loading, placeholder, hint }) {
  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="composer">
      <label className="visually-hidden" htmlFor="seekora-query">
        Ask a question
      </label>
      <textarea
        id="seekora-query"
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
          <ArrowRight size={18} weight="bold" />
          {loading ? 'Asking...' : 'Ask'}
        </button>
      </div>
    </div>
  )
}

function App() {
  const [threads, setThreads] = useState(loadThreads)
  const [activeId, setActiveId] = useState(null)
  const [query, setQuery] = useState('')
  const [asked, setAsked] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    saveThreads(threads)
  }, [threads])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])

  async function runAsk(text) {
    const q = (text ?? query).trim()
    if (!q || loading) return
    setLoading(true)
    setError('')
    setAnswer('')
    setSources([])
    setAsked(q)
    setQuery('')
    setCopied(false)
    setSourcesOpen(false)
    try {
      const res = await fetch(`${API_URL}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      if (!res.ok) throw new Error(`The answer engine returned status ${res.status}.`)
      const data = await res.json()
      const nextAnswer = data.answer ?? ''
      const nextSources = data.sources ?? []
      setAnswer(nextAnswer)
      setSources(nextSources)
      setThreads((prev) => {
        if (activeId) {
          return prev.map((t) =>
            t.id === activeId ? { ...t, query: q, answer: nextAnswer, sources: nextSources, ts: Date.now() } : t,
          )
        }
        const thread = {
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
    } catch (err) {
      setError(err.message ?? 'Something went wrong while asking.')
    } finally {
      setLoading(false)
    }
  }

  function openThread(id) {
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
  }

  function deleteThread(id) {
    setThreads((prev) => prev.filter((t) => t.id !== id))
    if (id === activeId) reset()
  }

  function reset() {
    setActiveId(null)
    setQuery('')
    setAsked('')
    setAnswer('')
    setSources([])
    setError('')
    setCopied(false)
    setSourcesOpen(false)
    setSidebarOpen(false)
  }

  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText(answer)
      setCopied(true)
    } catch {
      setError('Copy is not available in this browser. Select the text manually.')
    }
  }

  const hasResult = asked !== '' && !loading && !error && answer !== ''

  return (
    <div className={`app${sidebarOpen ? ' sidebar-open' : ''}`}>
      <aside className="sidebar" aria-label="Threads">
        <div className="brand-row">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span className="brand">Seekora</span>
        </div>
        <button type="button" className="new-thread" onClick={reset}>
          <Plus size={18} weight="bold" />
          New thread
        </button>
        <p className="thread-label">Recent</p>
        {threads.length === 0 ? (
          <p className="thread-empty">
            Threads you ask will appear here for this session.
          </p>
        ) : (
          <ul className="thread-list">
            {threads.map((t) => (
              <li
                key={t.id}
                className={`thread-item${t.id === activeId ? ' active' : ''}`}
              >
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
                  <X size={16} />
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
            <span className="brand">Seekora</span>
          </header>

          {!asked && (
            <main className="hero">
              <h1 className="hero-title">What do you want to know?</h1>
              <p className="hero-sub">
                Ask anything. Seekora searches the live web and writes an
                answer with sources you can check.
              </p>
              <form onSubmit={(e) => e.preventDefault()}>
                <Composer
                  value={query}
                  onChange={setQuery}
                  onSubmit={() => runAsk()}
                  loading={loading}
                  placeholder="Ask anything..."
                  hint="Press Enter to ask, Shift plus Enter for a new line"
                />
              </form>
              <ul className="suggest-list">
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
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </main>
          )}

          {asked && (
            <main aria-live="polite" aria-busy={loading} className="thread">
              <h1 className="query-title">{asked}</h1>

              {loading && (
                <div className="answer-card" role="status" aria-label="Searching the web">
                  <p className="answer-label">Answer</p>
                  <div className="skel skel-line" style={{ width: '92%' }} />
                  <div className="skel skel-line" style={{ width: '98%' }} />
                  <div className="skel skel-line" style={{ width: '84%' }} />
                  <div className="skel skel-line" style={{ width: '60%' }} />
                </div>
              )}

              {error && (
                <div className="error-card" role="alert">
                  <p>{error}</p>
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

              {hasResult && (
                <>
                  <section className="answer-card rise" aria-label="Answer">
                    <div className="answer-head">
                      <p className="answer-label">Answer</p>
                      <button
                        type="button"
                        className="copy-button"
                        onClick={copyAnswer}
                      >
                        {copied ? <Check size={16} weight="bold" /> : <Copy size={16} />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="answer-body">{renderRich(answer)}</div>
                  </section>

                  {sources.length > 0 && (
                    <section className="rise rise-1" aria-label="Sources">
                      <button
                        type="button"
                        className="sources-toggle"
                        onClick={() => setSourcesOpen((v) => !v)}
                        aria-expanded={sourcesOpen}
                        aria-controls="sources-list"
                      >
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
                          {sources.map((s) => (
                            <li
                              key={s.id ?? s.url}
                              id={`source-${s.id}`}
                              className="source-card"
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

                  <button
                    type="button"
                    className="new-question rise rise-2"
                    onClick={reset}
                  >
                    <ArrowClockwise size={18} />
                    New question
                  </button>
                </>
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
            Seekora answers from live web sources via Exa. Verify important
            claims before acting on them.
          </footer>
        </div>
      </div>
    </div>
  )
}

export default App
