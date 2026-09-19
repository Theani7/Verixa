import { useEffect, useState } from 'react'
import { LinkSimple } from '@phosphor-icons/react'
import './App.css'
import { fetchSharedThread } from './api'
import { TurnCard } from './components/TurnCard'
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
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [openSources, setOpenSources] = useState<string | null>(null)
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle')

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

  const copyTurn = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    })
  }

  const toggleSources = (key: string) => {
    setOpenSources((prev) => (prev === key ? null : key))
  }

  const shareThread = () => {
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => {
        setShareState('copied')
        setTimeout(() => setShareState('idle'), 2000)
      })
      .catch(() => setShareState('failed'))
  }

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
          {thread.turns.map((turn, ti) => (
            <TurnCard
              key={`t${ti}`}
              turn={turn}
              turnIndex={ti}
              copiedKey={copiedKey}
              openSources={openSources}
              shareState={shareState}
              onCopy={copyTurn}
              onShare={shareThread}
              onNewThread={() => {
                window.location.href = '/'
              }}
              onToggleSources={toggleSources}
            />
          ))}
          <footer className="footer">
            Shared from Verixa. Answers were generated from live web sources.
          </footer>
        </main>
      )}
    </div>
  )
}
