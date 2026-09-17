import { useEffect, useState } from 'react'
import { LinkSimple } from '@phosphor-icons/react'
import './App.css'
import { fetchSharedThread } from './api'
import { SourceList } from './article'
import { renderRich } from './markdown'
import type { Thread } from './types'

export default function SharedThread({ id }: { id: string }) {
  const [thread, setThread] = useState<Thread | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    document.title = 'Shared thread - Verixa'
    let live = true
    fetchSharedThread(id)
      .then((t) => {
        if (!live) return
        setThread(t)
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
          <h1 className="query-title">{thread.title}</h1>
          {thread.turns.map((turn, ti) => {
            const prefix = `s${ti}-`
            return (
              <div className="turn" key={prefix}>
                <h2 className="turn-query">{turn.query}</h2>
                <section className="answer-card" aria-label="Answer">
                  <div className="answer-body">{renderRich(turn.answer, prefix)}</div>
                </section>
                {turn.sources.length > 0 && (
                  <section aria-label="Sources">
                    <p className="answer-label">Sources</p>
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
