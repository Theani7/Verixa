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
  ShareNetwork,
  SignOut,
  Sparkle,
  SpinnerGap,
  Trash,
  Tray,
  WarningCircle,
} from '@phosphor-icons/react'
import './App.css'
import { API_URL, deleteSharedThread, fetchMe, syncThread } from './api'
import type { Session } from './api'
import { SourceList } from './article'
import { renderRich } from './markdown'
import AuthModal from './AuthModal'
import type { Source, Thread, Turn } from './types'

const STORAGE_KEY = 'verixa.threads.v1'
const AUTH_KEY = 'verixa.auth.v1'
const LEGACY_STORAGE_KEY = 'seekora.threads.v1'
const MAX_THREADS = 30

const SUGGESTIONS: string[] = [
  'What are the latest developments in small modular nuclear reactors?',
  'How does retrieval augmented generation reduce hallucinations?',
  'What did the latest IPCC report say about methane emissions?',
]

type Phase = 'idle' | 'searching' | 'reading' | 'writing' | 'done'

type StreamEvent =
  | { type: 'status'; phase: Phase }
  | { type: 'rewrite'; query: string }
  | { type: 'sources'; sources: Source[] }
  | { type: 'token'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

/* Model-native grounding markers (e.g. 【2†L1-L9】 or bare 【1】) become
   [n] chips. The second pass drops a marker split across stream chunks. */
function normalizeCitations(text: string): string {
  return text
    .replace(/【(\d+)(?:[†‡][^】]*)?】/g, '[$1]')
    .replace(/【\d+(?:[†‡][^】]*)?$/, '')
}

function isSource(value: unknown): value is Source {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Record<string, unknown>
  return (
    typeof s.id === 'number' &&
    typeof s.title === 'string' &&
    typeof s.url === 'string'
  )
}

function normalizeThread(value: unknown): Thread | null {
  if (typeof value !== 'object' || value === null) return null
  const t = value as Record<string, unknown>
  if (typeof t.id !== 'string' || typeof t.title !== 'string') return null
  if (Array.isArray(t.turns)) {
    const turns: Turn[] = t.turns
      .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
      .map((x) => ({
        query: typeof x.query === 'string' ? x.query : '',
        answer: typeof x.answer === 'string' ? x.answer : '',
        sources: Array.isArray(x.sources) ? x.sources.filter(isSource) : [],
      }))
      .filter((x) => x.query !== '')
    if (turns.length === 0) return null
    return {
      id: t.id,
      title: t.title,
      turns,
      ts: typeof t.ts === 'number' ? t.ts : Date.now(),
    }
  }
  /* Legacy single-turn shape: wrap it so old history keeps working. */
  if (typeof t.query === 'string' && typeof t.answer === 'string') {
    return {
      id: t.id,
      title: t.title,
      turns: [
        {
          query: t.query,
          answer: t.answer,
          sources: Array.isArray(t.sources) ? t.sources.filter(isSource) : [],
        },
      ],
      ts: typeof t.ts === 'number' ? t.ts : Date.now(),
    }
  }
  return null
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).token !== 'string' ||
      typeof (parsed as Record<string, unknown>).email !== 'string'
    ) {
      return null
    }
    return parsed as Session
  } catch {
    return null
  }
}

function loadThreads(): Thread[] {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((x) => {
      const t = normalizeThread(x)
      return t ? [t] : []
    })
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

type StepId = 'searching' | 'reading' | 'writing'

const STEPS: Array<{ id: StepId; label: string; icon: ReactNode }> = [
  { id: 'searching', label: 'Searching the web', icon: <MagnifyingGlass size={16} /> },
  { id: 'reading', label: 'Reading sources', icon: <BookOpenText size={16} /> },
  { id: 'writing', label: 'Writing answer', icon: <PencilLine size={16} /> },
]

function StatusSteps({
  phase,
  sourceCount,
  resolved,
}: {
  phase: Phase
  sourceCount: number
  resolved: string
}) {
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
      {resolved !== '' && (
        <p className="resolve-line">Searching for &ldquo;{resolved}&rdquo;</p>
      )}
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
  const [turns, setTurns] = useState<Turn[]>([])
  const [query, setQuery] = useState('')
  const [asked, setAsked] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<Source[]>([])
  const [error, setError] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [openSources, setOpenSources] = useState<string | null>(null)
  const [resolvedQuery, setResolvedQuery] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [session, setSession] = useState<Session | null>(loadSession)
  const [authModal, setAuthModal] = useState<'signin' | 'signup' | null>(null)

  const loading =
    phase === 'searching' || phase === 'reading' || phase === 'writing'
  const inThread = turns.length > 0 || asked !== ''

  useEffect(() => {
    saveThreads(threads)
  }, [threads])

  useEffect(() => {
    const stored = loadSession()
    if (!stored) return
    fetchMe(stored.token).catch(() => {
      setSession(null)
      try {
        localStorage.removeItem(AUTH_KEY)
      } catch {
        /* ignore */
      }
    })
  }, [])

  useEffect(() => {
    if (copiedKey === null) return
    const t = setTimeout(() => setCopiedKey(null), 2000)
    return () => clearTimeout(t)
  }, [copiedKey])

  useEffect(() => {
    if (shareState === 'idle') return
    const t = setTimeout(() => setShareState('idle'), 2500)
    return () => clearTimeout(t)
  }, [shareState])
  function persistTurn(turn: Turn): void {
    if (activeId) {
      const next = threads.map((t) =>
        t.id === activeId ? { ...t, turns: [...t.turns, turn], ts: Date.now() } : t,
      )
      setThreads(next)
      const updated = next.find((t) => t.id === activeId)
      if (updated) syncThread(updated, session?.token).catch(() => undefined)
    } else {
      const thread: Thread = {
        id: newId(),
        title: turn.query.length > 60 ? `${turn.query.slice(0, 60)}...` : turn.query,
        turns: [turn],
        ts: Date.now(),
      }
      setActiveId(thread.id)
      setThreads((prev) => [thread, ...prev])
      syncThread(thread, session?.token).catch(() => undefined)
    }
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
    setCopiedKey(null)
    setOpenSources(null)
    setResolvedQuery('')
    const history = turns.slice(-4).map((t) => ({
      query: t.query,
      answer: t.answer.slice(0, 2000),
    }))
    let full = ''
    let seenSources: Source[] = []
    try {
      const res = await fetch(`${API_URL}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, history }),
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
            } else if (e.type === 'rewrite') {
              setResolvedQuery(e.query)
            } else if (e.type === 'sources') {
              seenSources = e.sources ?? []
              setSources(seenSources)
            } else if (e.type === 'token') {
              full += e.text
              setAnswer(full)
            } else if (e.type === 'done') {
              const turn: Turn = {
                query: q,
                answer: normalizeCitations(full),
                sources: seenSources,
              }
              setTurns((prev) => [...prev, turn])
              persistTurn(turn)
              setAsked('')
              setAnswer('')
              setSources([])
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
    setTurns(t.turns)
    setQuery('')
    setAsked('')
    setAnswer('')
    setSources([])
    setError('')
    setCopiedKey(null)
    setOpenSources(null)
    setResolvedQuery('')
    setSidebarOpen(false)
    setPhase('done')
  }

  function deleteThread(id: string): void {
    setThreads((prev) => prev.filter((t) => t.id !== id))
    deleteSharedThread(id, session?.token).catch(() => undefined)
    if (id === activeId) reset()
  }

  function handleAuthSuccess(next: Session): void {
    setSession(next)
    try {
      localStorage.setItem(AUTH_KEY, JSON.stringify(next))
    } catch {
      /* private mode: session lasts until reload */
    }
    setAuthModal(null)
    for (const thread of threads.slice(0, MAX_THREADS)) {
      syncThread(thread, next.token).catch(() => undefined)
    }
  }

  function signOut(): void {
    setSession(null)
    try {
      localStorage.removeItem(AUTH_KEY)
    } catch {
      /* ignore */
    }
  }

  function reset(): void {
    setActiveId(null)
    setTurns([])
    setQuery('')
    setAsked('')
    setAnswer('')
    setSources([])
    setError('')
    setCopiedKey(null)
    setOpenSources(null)
    setResolvedQuery('')
    setSidebarOpen(false)
    setShareState('idle')
    setPhase('idle')
  }

  async function copyAnswer(text: string, key: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(normalizeCitations(text))
      setCopiedKey(key)
    } catch {
      setError('Copy is not available in this browser. Select the text manually.')
    }
  }

  function toggleSources(key: string): void {
    setOpenSources((prev) => (prev === key ? null : key))
  }

  async function shareThread(): Promise<void> {
    const t = threads.find((x) => x.id === activeId)
    if (!t) return
    try {
      await syncThread(t, session?.token)
      await navigator.clipboard.writeText(`${window.location.origin}/t/${t.id}`)
      setShareState('copied')
    } catch {
      setShareState('failed')
    }
  }

  const streaming = answer !== '' && phase !== 'done'
  const displayAnswer = normalizeCitations(answer)

  function answerCard(
    key: string,
    text: string,
    plain: boolean,
    copyKey: string,
  ): ReactNode {
    const copied = copiedKey === copyKey
    return (
      <section className="answer-card rise" aria-label="Answer">
        <div className="answer-head">
          <p className="answer-label">
            <Sparkle size={15} aria-hidden="true" />
            Answer
          </p>
          <button
            type="button"
            className="copy-button"
            onClick={() => copyAnswer(text, copyKey)}
          >
            <span key={String(copied)} className="copy-pop">
              {copied ? <Check size={16} weight="bold" /> : <Copy size={16} />}
            </span>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <div className="answer-body">
          {plain ? (
            <p className="stream-text">
              {text}
              <span className="stream-caret" aria-hidden="true" />
            </p>
          ) : (
            renderRich(text, `${key}-`)
          )}
        </div>
      </section>
    )
  }

  function sourcesToggle(key: string, list: Source[]): ReactNode {
    if (list.length === 0) return null
    const open = openSources === key
    return (
      <section className="rise rise-1" aria-label="Sources">
        <button
          type="button"
          className="sources-toggle"
          onClick={() => toggleSources(key)}
          aria-expanded={open}
          aria-controls={`${key}-sources-list`}
        >
          <Newspaper size={16} aria-hidden="true" />
          <span className="sources-count">{list.length}</span>
          Sources
          <CaretDown
            size={16}
            weight="bold"
            className={`sources-caret${open ? ' open' : ''}`}
          />
        </button>
        {open && <SourceList prefix={`${key}-`} sources={list} />}
      </section>
    )
  }

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
                  title={t.turns[0]?.query ?? t.title}
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
        <div className="auth-block">
          {session ? (
            <>
              <span className="auth-email" title={session.email}>
                {session.email}
              </span>
              <button
                type="button"
                className="sign-out"
                onClick={signOut}
                aria-label={`Sign out ${session.email}`}
              >
                <SignOut size={16} />
                Sign out
              </button>
            </>
          ) : (
            <button
              type="button"
              className="sign-in"
              onClick={() => setAuthModal('signin')}
            >
              Sign in
            </button>
          )}
        </div>
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

          {!inThread && (
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

          {inThread && (
            <main
              aria-live={phase === 'done' ? 'polite' : 'off'}
              aria-busy={loading}
              className="thread"
            >
              {turns.map((turn, ti) => {
                const key = `t${ti}`
                return (
                  <div className="turn" key={key}>
                    <h2 className="turn-query">{turn.query}</h2>
                    {answerCard(key, turn.answer, false, key)}
                    {sourcesToggle(key, turn.sources)}
                  </div>
                )
              })}

              {asked !== '' && (
                <>
                  <h1 className="query-title">{asked}</h1>

                  {loading && (
                    <StatusSteps
                      phase={phase}
                      sourceCount={sources.length}
                      resolved={resolvedQuery}
                    />
                  )}

                  {answer !== '' && answerCard('live', displayAnswer, streaming, 'live')}

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

                  {sources.length > 0 && phase === 'done' && sourcesToggle('live', sources)}
                </>
              )}

              {phase === 'done' && turns.length > 0 && (
                <div className="thread-actions rise rise-2">
                  <button
                    type="button"
                    className="share-button"
                    onClick={shareThread}
                  >
                    <ShareNetwork size={18} />
                    {shareState === 'copied'
                      ? 'Link copied'
                      : shareState === 'failed'
                        ? 'Sharing failed'
                        : 'Share'}
                  </button>
                  <button
                    type="button"
                    className="new-question"
                    onClick={reset}
                  >
                    <ArrowClockwise size={18} />
                    New question
                  </button>
                </div>
              )}

              <div className="composer-dock">
                <form onSubmit={(e) => e.preventDefault()}>
                  <Composer
                    value={query}
                    onChange={setQuery}
                    onSubmit={() => runAsk()}
                    loading={loading}
                    placeholder={turns.length > 0 ? 'Ask a follow-up...' : 'Ask anything...'}
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

      {authModal && (
        <AuthModal
          initialMode={authModal}
          onClose={() => setAuthModal(null)}
          onSuccess={handleAuthSuccess}
        />
      )}
    </div>
  )
}

export default App
