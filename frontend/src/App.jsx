import { useState } from 'react'
import { ArrowClockwise, ArrowRight } from '@phosphor-icons/react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

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

function renderCitations(text) {
  const parts = text.split(/(\[\d+\])/)
  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/)
    if (!match) return <span key={i}>{part}</span>
    return (
      <a key={i} className="cite" href={`#source-${match[1]}`}>
        {match[1]}
      </a>
    )
  })
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
  const [query, setQuery] = useState('')
  const [asked, setAsked] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function runAsk(text) {
    const q = (text ?? query).trim()
    if (!q || loading) return
    setLoading(true)
    setError('')
    setAnswer('')
    setSources([])
    setAsked(q)
    try {
      const res = await fetch(`${API_URL}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      if (!res.ok) throw new Error(`The answer engine returned status ${res.status}.`)
      const data = await res.json()
      setAnswer(data.answer ?? '')
      setSources(data.sources ?? [])
    } catch (err) {
      setError(err.message ?? 'Something went wrong while asking.')
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setQuery('')
    setAsked('')
    setAnswer('')
    setSources([])
    setError('')
  }

  const hasResult = asked !== '' && !loading && !error

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">Seekora</span>
        <span className="engine-note">Live answers with cited sources</span>
      </header>

      {!asked && (
        <main className="hero">
          <h1 className="hero-title">What do you want to know?</h1>
          <p className="hero-sub">
            Ask anything. Seekora searches the live web and writes an answer
            with sources you can check.
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
        <main aria-live="polite" aria-busy={loading}>
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
              <section className="answer-card">
                <p className="answer-label">Answer</p>
                <p className="answer-body">{renderCitations(answer)}</p>
              </section>

              {sources.length > 0 && (
                <section>
                  <p className="sources-label">Sources</p>
                  <ol className="sources-list">
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
                </section>
              )}

              <button type="button" className="new-question" onClick={reset}>
                <ArrowClockwise size={18} />
                New question
              </button>
            </>
          )}
        </main>
      )}

      <footer className="footer">
        Seekora answers from live web sources via Exa. Verify important claims
        before acting on them.
      </footer>
    </div>
  )
}

export default App
