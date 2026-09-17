import { useEffect, useRef, useState } from 'react'
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
  GearSix,
  List,
  MagnifyingGlass,
  Newspaper,
  SidebarSimple,
  PencilLine,
  Plus,
  ShareNetwork,
  SignIn,
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
import SettingsModal from './SettingsModal'
import type { Prefs, Profile, Source, Thread, Turn } from './types'
import {
  DEFAULT_PREFS,
  DEFAULT_PROFILE,
  PREFS_KEY,
  PROFILE_KEY,
} from './types'

const STORAGE_KEY = 'verixa.threads.v1'
const AUTH_KEY = 'verixa.auth.v1'
const LEGACY_STORAGE_KEY = 'seekora.threads.v1'
const MAX_THREADS = 30
const SIDEBAR_KEY = 'verixa.sidebar.v1'

interface ThreadGroup {
  label: string
  items: Thread[]
}

function groupThreads(all: Thread[], filter: string): ThreadGroup[] {
  const q = filter.trim().toLowerCase()
  const list =
    q === ''
      ? all
      : all.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.turns.some((turn) => turn.query.toLowerCase().includes(q)),
        )
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const startMs = start.getTime()
  const day = 24 * 60 * 60 * 1000
  const groups: ThreadGroup[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 days', items: [] },
    { label: 'Older', items: [] },
  ]
  for (const t of list) {
    if (t.ts >= startMs) groups[0].items.push(t)
    else if (t.ts >= startMs - day) groups[1].items.push(t)
    else if (t.ts >= startMs - 7 * day) groups[2].items.push(t)
    else groups[3].items.push(t)
  }
  return groups.filter((g) => g.items.length > 0)
}

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'collapsed'
  } catch {
    return false
  }
}

const SUGGESTIONS: string[] = [
  'What are the latest developments in small modular nuclear reactors?',
  'How does retrieval augmented generation reduce hallucinations?',
  'What did the latest IPCC report say about methane emissions?',
]

type Phase = 'idle' | 'searching' | 'reading' | 'writing' | 'thinking' | 'done'

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
    const p = parsed as Record<string, unknown>
    return {
      token: p.token as string,
      id: typeof p.id === 'string' ? p.id : '',
      email: p.email as string,
      full_name: typeof p.full_name === 'string' ? p.full_name : '',
      username: typeof p.username === 'string' ? p.username : '',
    }
  } catch {
    return null
  }
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    const p = JSON.parse(raw) as Partial<Prefs>
    const numResults = p.numResults === 3 || p.numResults === 10 ? p.numResults : 5
    return { numResults, stream: p.stream !== false }
  } catch {
    return DEFAULT_PREFS
  }
}

function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return DEFAULT_PROFILE
    const p = JSON.parse(raw) as Partial<Profile> & Record<string, unknown>
    const text = (key: keyof Profile, limit: number): string =>
      typeof p[key] === 'string' ? (p[key] as string).slice(0, limit) : ''
    return {
      name: text('name', 100),
      instructions: text('instructions', 2000),
      occupation: text('occupation', 120),
      company: text('company', 120),
      dob: /^\d{4}-\d{2}-\d{2}$/.test(text('dob', 10)) ? text('dob', 10) : '',
      gender: ['female', 'male', 'nonbinary', 'prefer_not_to_say'].includes(
        text('gender', 20).toLowerCase(),
      )
        ? text('gender', 20).toLowerCase()
        : '',
      shareLocation: p.shareLocation === true,
      location: text('location', 120),
      responseLength: (['short', 'long'] as const).includes(
        text('responseLength', 10).toLowerCase() as 'short' | 'long',
      )
        ? (text('responseLength', 10).toLowerCase() as 'short' | 'long')
        : 'default',
      responseFormat: (['lists', 'paragraph'] as const).includes(
        text('responseFormat', 10).toLowerCase() as 'lists' | 'paragraph',
      )
        ? (text('responseFormat', 10).toLowerCase() as 'lists' | 'paragraph')
        : 'default',
    }
  } catch {
    return DEFAULT_PROFILE
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
  if (phase === 'thinking') {
    return (
      <div className="status-card rise" role="status" aria-label="Thinking">
        <ul className="status-list">
          <li className="status-row active">
            <span className="step-icon" aria-hidden="true">
              <span className="step-live">
                <Sparkle size={16} />
              </span>
            </span>
            Thinking...
          </li>
        </ul>
      </div>
    )
  }
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
  const [threadFilter, setThreadFilter] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadCollapsed)
  const searchRef = useRef<HTMLInputElement>(null)
  const [session, setSession] = useState<Session | null>(loadSession)
  const [authModal, setAuthModal] = useState<'signin' | 'signup' | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profileMenu, setProfileMenu] = useState(false)
  const [confirmingSignOut, setConfirmingSignOut] = useState(false)
  const [prefs] = useState<Prefs>(loadPrefs)
  const [profile, setProfile] = useState<Profile>(loadProfile)

  const loading =
    phase === 'searching' ||
    phase === 'reading' ||
    phase === 'writing' ||
    phase === 'thinking'
  const inThread = turns.length > 0 || asked !== ''

  useEffect(() => {
    saveThreads(threads)
  }, [threads])

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
      /* ignore */
    }
  }, [prefs])

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? 'collapsed' : 'open')
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed])

  useEffect(() => {
    function onSlash(e: KeyboardEvent): void {
      if (e.key !== '/' || sidebarCollapsed) return
      const el = e.target as HTMLElement | null
      if (!el) return
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) {
        return
      }
      if (el.closest('.modal')) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onSlash)
    return () => window.removeEventListener('keydown', onSlash)
  }, [sidebarCollapsed])

  useEffect(() => {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
    } catch {
      /* ignore */
    }
  }, [profile])

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
  function finishTurn(q: string, text: string, srcs: Source[]): void {
    const turn: Turn = {
      query: q,
      answer: normalizeCitations(text),
      sources: srcs,
    }
    setTurns((prev) => [...prev, turn])
    persistTurn(turn)
    setAsked('')
    setAnswer('')
    setSources([])
    setPhase('done')
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
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (session) headers.Authorization = `Bearer ${session.token}`
    const payload = JSON.stringify({
      query: q,
      history,
      num_results: prefs.numResults,
      profile,
    })
    try {
      if (!prefs.stream) {
        const res = await fetch(`${API_URL}/api/ask`, {
          method: 'POST',
          headers,
          body: payload,
        })
        if (!res.ok) throw new Error(`The answer engine returned status ${res.status}.`)
        const data = (await res.json()) as {
          answer?: unknown
          sources?: unknown
        }
        full = normalizeCitations(typeof data.answer === 'string' ? data.answer : '')
        seenSources = Array.isArray(data.sources)
          ? data.sources.filter(isSource)
          : []
        setAnswer(full)
        setSources(seenSources)
        finishTurn(q, full, seenSources)
        return
      }
      const res = await fetch(`${API_URL}/api/ask/stream`, {
        method: 'POST',
        headers,
        body: payload,
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
              finishTurn(q, full, seenSources)
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

  function handleProfileSaved(me: { full_name: string; username: string }): void {
    setSession((prev) => {
      if (!prev) return prev
      const next = { ...prev, full_name: me.full_name, username: me.username }
      try {
        localStorage.setItem(AUTH_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  function signOut(): void {
    setSession(null)
    try {
      localStorage.removeItem(AUTH_KEY)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!profileMenu) return
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') closeProfileMenu()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [profileMenu])

  function closeProfileMenu(): void {
    setProfileMenu(false)
    setConfirmingSignOut(false)
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

  const groups = groupThreads(threads, threadFilter)
  const visibleCount = groups.reduce((n, g) => n + g.items.length, 0)

  function renderThreadItem(t: Thread): ReactNode {
    return (
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
    )
  }

  return (
    <div
      className={`app${sidebarOpen ? ' sidebar-open' : ''}${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}
    >
      <aside className="sidebar" aria-label="Threads">
        <div className="brand-row">
          <span className="brand-mark" aria-hidden="true">V</span>
          <span className="brand">Verixa</span>
          <button
            type="button"
            className="rail-toggle"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <SidebarSimple size={18} />
          </button>
        </div>
        <button
          type="button"
          className="new-thread"
          onClick={reset}
          title={sidebarCollapsed ? 'New thread' : undefined}
        >
          <Plus size={18} weight="bold" />
          <span className="new-thread-label">New thread</span>
        </button>
        <div className="thread-search">
          <MagnifyingGlass size={16} aria-hidden="true" />
          <label className="visually-hidden" htmlFor="thread-filter">
            Search threads
          </label>
          <input
            ref={searchRef}
            id="thread-filter"
            type="search"
            value={threadFilter}
            onChange={(e) => setThreadFilter(e.target.value)}
            placeholder="Search threads"
            autoComplete="off"
          />
          <kbd aria-hidden="true">/</kbd>
        </div>
        {threads.length === 0 ? (
          <p className="thread-empty">
            <Tray size={18} aria-hidden="true" />
            Threads you ask will appear here for this session.
          </p>
        ) : visibleCount === 0 ? (
          <p className="thread-empty">No threads match your search.</p>
        ) : (
          <>
            {threadFilter.trim() !== '' && (
              <p className="search-count" role="status">
                {visibleCount} of {threads.length}
              </p>
            )}
            <div className="thread-scroll">
              {groups.map((g) => (
                <section key={g.label} aria-label={g.label}>
                  <p className="thread-label">{g.label}</p>
                  <ul className="thread-list">
                    {g.items.map((t) => renderThreadItem(t))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
        <div className="auth-block">
          {session ? (
            <div className="profile-wrap">
              <button
                type="button"
                className="avatar"
                onClick={() => setProfileMenu((v) => !v)}
                aria-expanded={profileMenu}
                aria-label={`Account menu for ${session.email}`}
              >
                {((session.full_name || session.email).charAt(0) || '?').toUpperCase()}
              </button>
              {profileMenu && (
                <>
                  <button
                    type="button"
                    className="menu-backdrop"
                    aria-label="Close account menu"
                    onClick={() => closeProfileMenu()}
                  />
                  <div className="profile-menu" role="menu" aria-label="Account">
                    <p className="profile-email" title={session.email}>
                      {session.email}
                    </p>
                    {!confirmingSignOut ? (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          className="profile-item"
                          onClick={() => {
                            closeProfileMenu()
                            setSettingsOpen(true)
                          }}
                        >
                          <GearSix size={16} />
                          Settings
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="profile-item"
                          onClick={() => setConfirmingSignOut(true)}
                        >
                          <SignOut size={16} />
                          Sign out
                        </button>
                      </>
                    ) : (
                      <div className="signout-confirm">
                        <p>Sign out of {session.email}?</p>
                        <div className="signout-actions">
                          <button
                            type="button"
                            className="settings-button ghost"
                            onClick={() => setConfirmingSignOut(false)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="settings-button"
                            onClick={() => {
                              closeProfileMenu()
                              signOut()
                            }}
                          >
                            Sign out
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <button
                type="button"
                className="sign-in"
                onClick={() => setAuthModal('signin')}
              >
                Sign in
              </button>
              <button
                type="button"
                className="sign-in-icon"
                onClick={() => setAuthModal('signin')}
                aria-label="Sign in"
                title="Sign in"
              >
                <SignIn size={18} />
              </button>
            </>
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

      {settingsOpen && (
        <SettingsModal
          session={session}
          profile={profile}
          onProfile={setProfile}
          onClose={() => setSettingsOpen(false)}
          onSignOut={() => {
            signOut()
            setSettingsOpen(false)
          }}
          onProfileSaved={handleProfileSaved}
          onOpenAuth={() => {
            setSettingsOpen(false)
            setAuthModal('signin')
          }}
        />
      )}
    </div>
  )
}

export default App
