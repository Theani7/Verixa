import { useEffect, useState } from 'react'
import { LinkSimple } from '@phosphor-icons/react'
import './App.css'
import { fetchSharedThread } from './api'
import { SourceList } from './article'
import { renderRich } from './markdown'
import type { Thread } from './types'

function withDefaults(thread: Thread): Thread {
  return {
    ...thread,
    turns: thread.turns.map((t) => ({
      ...t,
      mode: t.mode ?? 'search',
      searchedQuery: t.searchedQuery ?? '',
      durationMs: t.durationMs ?? 0,
    })),
  }
}

export default function SharedThread({ id }: { id: string }) {
  const [thread, setThread] = useState<Thread | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    document.title = 'Shared thread - Verixa'
    let live = true
    fetchSharedThread(id)
      .then((t) => {
        if (!live) return
        setThread(withDefaults(t))
        document.title = `${t.title} - Verixa`
      })
      .catch(() => {
        if (live) setMissing(true)
      })
    return () => {
      live = false
    }
  }, [id])

  return (
    <div className="shell">
      <header className="shared-top">
        <a className="brand-link" href="/">
          <span className="brand-mark" aria-hidden="true">V</span>
          <span className="brand">Verixa</span>
        </a>
      </header>

      {missing && (
        <main className="hero">
          <h1 className="hero-title">Thread not found</h1>
          <p className="hero-sub">
            This shared link is invalid or the thread was deleted.
          </p>
          <a className="ask-button shared-home" href="/">
            Ask your own question
          </a>
        </main>
      )}

      {!missing && !thread && (
        <main className="hero" role="status" aria-label="Loading shared thread">
          <h1 className="hero-title">Loading shared thread...</h1>
        </main>
      )}

      {thread && (
        <main>
          <p className="shared-kicker">
            <LinkSimple size={14} aria-hidden="true" />
            Shared thread
          </p>
          <h1 className="shared-title">{thread.title}</h1>
          {thread.turns.map((turn, ti) => {
            const prefix = `s${ti}-`
            return (
              <div className="turn" key={prefix}>
                <div className="bubble-row">
                  <h2 className="user-bubble">{turn.query}</h2>
                </div>
                <div className="answer-body">
                  {renderRich(turn.answer, prefix, turn.sources)}
                </div>
                {turn.sources.length > 0 && (
                  <section aria-label="Sources">
                    <p className="shared-sources-label">Sources</p>
                    <SourceList prefix={prefix} sources={turn.sources} />
                  </section>
                )}
              </div>
            )
          })}
          <footer className="footer">
            Shared from Verixa. Answers were generated from live web sources.
          </footer>
        </main>
      )}
    </div>
  )
}
