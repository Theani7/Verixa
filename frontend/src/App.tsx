import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import {
  ArrowClockwise,
  ArrowRight,
  ArrowUpRight,
  BookOpenText,
  ChatCircleText,
  Check,
  Copy,
  Flask,
  GearSix,
  GlobeHemisphereWest,
  List,
  MagnifyingGlass,
  SidebarSimple,
  PencilLine,
  Plus,
  ShareNetwork,
  SignIn,
  SignOut,
  Sparkle,
  SpinnerGap,
  Square,
  Timer,
  Trash,
  Tray,
  WarningCircle,
} from '@phosphor-icons/react'
import './App.css'
import { API_URL, deleteSharedThread, fetchMe, syncThread } from './api'
import type { Session } from './api'
import { SourceList } from './article'
import { faviconFor, hostnameOf, normalizeCitations, renderRich } from './markdown'
import AuthModal from './AuthModal'
import SettingsModal from './SettingsModal'
import type { AskMode, Prefs, Profile, Source, Thread, Turn } from './types'
import {
  DEFAULT_PREFS,
  DEFAULT_PROFILE,
  MODE_KEY,
  PREFS_KEY,
  PROFILE_KEY,
} from './types'

function loadAskMode(): AskMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'deep' ? 'deep' : 'search'
  } catch {
    return 'search'
  }
}

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

interface SuggestionItem {
  topic: string
  text: string
}

const SUGGESTION_POOL: SuggestionItem[] = [
  { topic: 'Clean Energy', text: 'What are the latest developments in small modular nuclear reactors?' },
  { topic: 'AI & Systems', text: 'How does retrieval augmented generation reduce hallucinations?' },
  { topic: 'Climate', text: 'What did the latest IPCC report say about methane emissions?' },
  { topic: 'Space', text: 'What is happening with the Artemis moon program?' },
  { topic: 'Health & Science', text: 'How much sleep do adults actually need?' },
  { topic: 'Economy', text: 'Why do central banks raise interest rates to fight inflation?' },
  { topic: 'Biotech', text: 'What is CRISPR and how is it used in medicine?' },
  { topic: 'Economics', text: 'How does remittance shape the economy of Nepal?' },
  { topic: 'History', text: 'What caused the fall of the Roman Empire?' },
]

function heroSuggestions(profile: Profile): SuggestionItem[] {
  const day = Math.floor(Date.now() / 86400000)
  const picked = [0, 1, 2].map(
    (i) => SUGGESTION_POOL[(day + i) % SUGGESTION_POOL.length],
  )
  const place = profile.shareLocation ? profile.location.trim().slice(0, 60) : ''
  if (place !== '') {
    picked[2] = { topic: 'Local', text: `What is happening in ${place} this week?` }
  }
  return picked
}

type Phase = 'idle' | 'searching' | 'reading' | 'writing' | 'thinking' | 'researching' | 'done'

type StreamEvent =
  | { type: 'status'; phase: Phase }
  | { type: 'mode'; mode: 'search' | 'chat' }
  | { type: 'progress'; label: string }
  | { type: 'rewrite'; query: string }
  | { type: 'related'; questions: string[] }
  | { type: 'sources'; sources: Source[] }
  | { type: 'token'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }


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
      .map((x) => {
        const sources = Array.isArray(x.sources) ? x.sources.filter(isSource) : []
        return {
          query: typeof x.query === 'string' ? x.query : '',
          answer: typeof x.answer === 'string' ? x.answer : '',
          sources,
          mode: x.mode === 'chat' ? ('chat' as const) : x.mode === 'deep' ? ('deep' as const) : ('search' as const),
          searchedQuery: typeof x.searchedQuery === 'string' ? x.searchedQuery : '',
          durationMs: typeof x.durationMs === 'number' ? x.durationMs : 0,
          related: Array.isArray(x.related)
            ? x.related.filter((r): r is string => typeof r === 'string').slice(0, 4)
            : [],
        }
      })
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
          mode: 'search',
          searchedQuery: '',
          durationMs: 0,
          related: [],
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
  steps,
}: {
  phase: Phase
  sourceCount: number
  resolved: string
  steps: string[]
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
  if (phase === 'researching') {
    const rows = steps.length > 0 ? steps : ['Starting deep research']
    return (
      <div className="status-card rise" role="status" aria-label="Research progress">
        <ul className="status-list">
          {rows.map((label, i) => {
            const last = i === rows.length - 1
            return (
              <li key={`${i}-${label}`} className={`status-row ${last ? 'active' : 'done'}`}>
                <span className="step-icon" aria-hidden="true">
                  {last ? (
                    <span className="step-live">
                      <MagnifyingGlass size={16} />
                    </span>
                  ) : (
                    <Check size={16} weight="bold" />
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
  mode: AskMode
  onMode: (mode: AskMode) => void
  onStop?: () => void
}

const MODES: Array<{
  id: AskMode
  label: string
  desc: string
  icon: ReactNode
}> = [
  {
    id: 'search',
    label: 'Search',
    desc: 'Fast answers with live sources',
    icon: <GlobeHemisphereWest size={18} />,
  },
  {
    id: 'deep',
    label: 'Deep research',
    desc: 'Multi-step research that takes longer',
    icon: <Flask size={18} />,
  },
]

function Composer({
  value,
  onChange,
  onSubmit,
  loading,
  placeholder,
  hint,
  mode,
  onMode,
  onStop,
}: ComposerProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 52), 220)}px`
  }, [value])

  function onKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!loading && value.trim()) {
        onSubmit()
      }
    }
  }

  function pick(next: AskMode): void {
    onMode(next)
    setMenuOpen(false)
  }

  const current = MODES.find((m) => m.id === mode) ?? MODES[0]

  return (
    <div className="composer">
      <label className="visually-hidden" htmlFor="verixa-query">
        Ask a question
      </label>
      <textarea
        ref={textareaRef}
        id="verixa-query"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={1}
      />
      <div className="composer-row">
        <div className="mode-wrap">
          <button
            type="button"
            className={`mode-button${mode === 'deep' ? ' mode-deep-active' : ''}`}
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="listbox"
            aria-label={`Answer mode: ${current.label}`}
            title="Answer mode"
          >
            {current.icon}
            {current.label}
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                className="menu-backdrop"
                aria-label="Close mode menu"
                onClick={() => setMenuOpen(false)}
              />
              <div
                className="mode-menu"
                role="listbox"
                aria-label="Answer mode"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setMenuOpen(false)
                }}
              >
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="option"
                    aria-selected={mode === m.id}
                    className={`mode-option${mode === m.id ? ' active' : ''}`}
                    onClick={() => pick(m.id)}
                  >
                    {m.icon}
                    <span className="mode-text">
                      <span className="mode-name">{m.label}</span>
                      <span className="mode-desc">{m.desc}</span>
                    </span>
                    {mode === m.id && <Check size={16} weight="bold" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <span className="composer-hint">{hint}</span>
        {loading && onStop ? (
          <button
            type="button"
            className="ask-button stop-btn"
            onClick={onStop}
            aria-label="Stop generating"
            title="Stop generating"
          >
            <Square size={14} weight="fill" />
            <span>Stop</span>
          </button>
        ) : (
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
        )}
      </div>
    </div>
  )
}

function SourcesPreview({
  sources,
  open,
  onToggle,
}: {
  sources: Source[]
  open: boolean
  onToggle: () => void
}) {
  if (sources.length === 0) return null
  const visible = sources.slice(0, 4)
  const extra = sources.length - 4

  return (
    <section className="sources-preview rise" aria-label="Web sources">
      <div className="sources-preview-head">
        <div className="sources-preview-title">
          <GlobeHemisphereWest size={15} aria-hidden="true" />
          <span>Sources</span>
          <span className="sources-badge">{sources.length}</span>
        </div>
        {extra > 0 && (
          <button
            type="button"
            className="sources-toggle-btn"
            onClick={onToggle}
            aria-expanded={open}
          >
            {open ? 'Hide details' : `+${extra} more`}
          </button>
        )}
      </div>
      <div className="sources-chips-grid">
        {visible.map((s) => (
          <a
            key={s.id ?? s.url}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="source-chip"
            title={s.title}
          >
            <div className="source-chip-top">
              <img
                src={faviconFor(s.url)}
                alt=""
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
                className="source-chip-favicon"
              />
              <span className="source-chip-host">{hostnameOf(s.url)}</span>
              <span className="source-chip-num">{s.id}</span>
            </div>
            <div className="source-chip-title">{s.title}</div>
          </a>
        ))}
      </div>
    </section>
  )
}

function formatSecs(ms: number): string {
  return `${Math.max(1, Math.round(ms / 1000))}s`
}

function AnswerHeader({
  mode,
  durationMs,
  loading = false,
}: {
  mode: Turn['mode']
  durationMs: number
  loading?: boolean
}) {
  return (
    <div className="answer-header rise">
      <div className="answer-brand">
        <span className={`answer-mark${loading ? ' pulsing' : ''}`} aria-hidden="true">
          <Sparkle size={14} weight="fill" />
        </span>
        <span className="answer-label">{loading ? 'Searching & answering...' : 'Answer'}</span>
      </div>
      <div className="answer-meta-tags">
        {mode === 'deep' && (
          <span className="deep-badge">
            <Flask size={13} aria-hidden="true" />
            Deep research
          </span>
        )}
        {durationMs > 0 && (
          <span className="researched-pill">
            <Timer size={13} aria-hidden="true" />
            Researched {formatSecs(durationMs)}
          </span>
        )}
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
  const [related, setRelated] = useState<string[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [threadFilter, setThreadFilter] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadCollapsed)
  const searchRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const threadBottomRef = useRef<HTMLDivElement>(null)
  const [session, setSession] = useState<Session | null>(loadSession)
  const [authModal, setAuthModal] = useState<'signin' | 'signup' | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profileMenu, setProfileMenu] = useState(false)
  const [confirmingSignOut, setConfirmingSignOut] = useState(false)
  const [prefs] = useState<Prefs>(loadPrefs)
  const [profile, setProfile] = useState<Profile>(loadProfile)
  const [askMode, setAskMode] = useState<AskMode>(loadAskMode)
  const [steps, setSteps] = useState<string[]>([])

  const loading =
    phase === 'searching' ||
    phase === 'reading' ||
    phase === 'writing' ||
    phase === 'thinking' ||
    phase === 'researching'
  const inThread = turns.length > 0 || asked !== ''

  useEffect(() => {
    if (asked !== '') {
      threadBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [asked, phase])

  useEffect(() => {
    function onGlobalKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        const el = e.target as HTMLElement | null
        if (el?.closest('.modal')) return
        e.preventDefault()
        reset()
        const input = document.getElementById('verixa-query') as HTMLTextAreaElement | null
        input?.focus()
      }
    }
    window.addEventListener('keydown', onGlobalKey)
    return () => window.removeEventListener('keydown', onGlobalKey)
  }, [])

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
      localStorage.setItem(MODE_KEY, askMode)
    } catch {
      /* ignore */
    }
  }, [askMode])

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
  function finishTurn(
    q: string,
    text: string,
    srcs: Source[],
    mode: Turn['mode'],
    searchedQuery: string,
    durationMs: number,
    relatedQs: string[],
  ): void {
    const turn: Turn = {
      query: q,
      answer: normalizeCitations(text),
      sources: srcs,
      mode,
      searchedQuery,
      durationMs,
      related: relatedQs,
    }
    setTurns((prev) => [...prev, turn])
    persistTurn(turn)
    setAsked('')
    setAnswer('')
    setSources([])
    setRelated([])
    setSteps([])
    setPhase('done')
  }

  function stopAsk(): void {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    if (asked !== '' && answer !== '') {
      finishTurn(asked, answer, sources, askMode, resolvedQuery, 0, related)
    } else {
      setAsked('')
      setAnswer('')
      setSources([])
      setRelated([])
      setSteps([])
      setPhase('idle')
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
    setRelated([])
    setSteps([])
    const history = turns.slice(-4).map((t) => ({
      query: t.query,
      answer: t.answer.slice(0, 2000),
    }))
    let full = ''
    let seenSources: Source[] = []
    let seenRelated: string[] = []
    let mode: Turn['mode'] = askMode
    let standalone = q
    const started = Date.now()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (session) headers.Authorization = `Bearer ${session.token}`
    const payload = JSON.stringify({
      query: q,
      history,
      num_results: prefs.numResults,
      profile,
      mode: askMode,
    })

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      if (!prefs.stream) {
        const res = await fetch(`${API_URL}/api/ask`, {
          method: 'POST',
          headers,
          body: payload,
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`The answer engine returned status ${res.status}.`)
        const data = (await res.json()) as {
          answer?: unknown
          sources?: unknown
          mode?: unknown
          query?: unknown
          related?: unknown
        }
        full = normalizeCitations(typeof data.answer === 'string' ? data.answer : '')
        seenSources = Array.isArray(data.sources)
          ? data.sources.filter(isSource)
          : []
        if (data.mode === 'chat') mode = 'chat'
        else if (data.mode === 'deep') mode = 'deep'
        if (typeof data.query === 'string' && data.query.trim() !== '') {
          standalone = data.query
        }
        if (Array.isArray(data.related)) {
          seenRelated = data.related
            .filter((r): r is string => typeof r === 'string')
            .slice(0, 4)
          setRelated(seenRelated)
        }
        setAnswer(full)
        setSources(seenSources)
        finishTurn(q, full, seenSources, mode, standalone, Date.now() - started, seenRelated)
        return
      }
      const res = await fetch(`${API_URL}/api/ask/stream`, {
        method: 'POST',
        headers,
        body: payload,
        signal: controller.signal,
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
            } else if (e.type === 'mode') {
              if (e.mode === 'chat') mode = 'chat'
            } else if (e.type === 'progress') {
              setSteps((prev) => [...prev.slice(-9), e.label])
            } else if (e.type === 'rewrite') {
              standalone = e.query
              setResolvedQuery(e.query)
            } else if (e.type === 'sources') {
              seenSources = e.sources ?? []
              setSources(seenSources)
            } else if (e.type === 'token') {
              full += e.text
              setAnswer(full)
            } else if (e.type === 'related') {
              seenRelated = (e.questions ?? [])
                .filter((r): r is string => typeof r === 'string')
                .slice(0, 4)
              setRelated(seenRelated)
            } else if (e.type === 'done') {
              finishTurn(
                q,
                full,
                seenSources,
                mode,
                standalone,
                Date.now() - started,
                seenRelated,
              )
            } else if (e.type === 'error') {
              throw new Error(e.message)
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }
      setError(errorMessage(err))
      setPhase('done')
    } finally {
      abortControllerRef.current = null
    }
  }

  function openThread(id: string): void {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
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
    setRelated([])
    setSteps([])
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
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
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
    setRelated([])
    setSteps([])
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
  const firstName = profile.name.trim().split(/\s+/)[0] ?? ''

  function favicons(list: Source[]): string[] {
    const seen = new Map<string, string>()
    for (const s of list) {
      const host = hostnameOf(s.url)
      if (!seen.has(host)) seen.set(host, s.url)
      if (seen.size >= 3) break
    }
    return [...seen.values()]
  }

  function hideBroken(e: React.SyntheticEvent<HTMLImageElement>): void {
    e.currentTarget.style.display = 'none'
  }

  function answerBody(
    key: string,
    text: string,
    plain: boolean,
    citeSources: Source[],
  ): ReactNode {
    return (
      <div className="answer-body">
        {plain ? (
          <p className="stream-text">
            {text}
            <span className="stream-caret" aria-hidden="true" />
          </p>
        ) : (
          renderRich(text, `${key}-`, citeSources)
        )}
      </div>
    )
  }

  function actionBar(
    key: string,
    text: string,
    list: Source[],
    copyKey: string,
  ): ReactNode {
    const copied = copiedKey === copyKey
    const open = openSources === key
    return (
      <div className="action-bar">
        <button
          type="button"
          className={`action-btn${copied ? ' copied' : ''}`}
          aria-label={copied ? 'Copied to clipboard' : 'Copy answer'}
          title={copied ? 'Copied!' : 'Copy answer'}
          onClick={() => copyAnswer(text, copyKey)}
        >
          <span key={String(copied)} className="copy-pop">
            {copied ? <Check size={16} weight="bold" /> : <Copy size={16} />}
          </span>
          {copied && <span className="action-feedback">Copied</span>}
        </button>
        <button
          type="button"
          className={`action-btn${shareState === 'copied' ? ' copied' : ''}`}
          aria-label={
            shareState === 'copied'
              ? 'Thread link copied'
              : shareState === 'failed'
                ? 'Sharing failed, try again'
                : 'Copy thread link'
          }
          title={
            shareState === 'copied'
              ? 'Link copied!'
              : shareState === 'failed'
                ? 'Sharing failed, try again'
                : 'Share thread'
          }
          onClick={() => shareThread()}
        >
          {shareState === 'copied' ? (
            <Check size={16} weight="bold" />
          ) : shareState === 'failed' ? (
            <WarningCircle size={16} />
          ) : (
            <ShareNetwork size={16} />
          )}
          {shareState === 'copied' && <span className="action-feedback">Copied link</span>}
        </button>
        <button
          type="button"
          className="action-btn"
          aria-label="Start new thread"
          title="New thread"
          onClick={() => reset()}
        >
          <Plus size={16} weight="bold" />
        </button>
        {list.length > 0 && (
          <button
            type="button"
            className={`sources-count-btn${open ? ' active' : ''}`}
            onClick={() => toggleSources(key)}
            aria-expanded={open}
            title={open ? 'Hide detailed sources' : 'View all sources'}
          >
            <span className="favicon-stack sm" aria-hidden="true">
              {favicons(list).map((u) => (
                <img
                  key={u}
                  src={faviconFor(u)}
                  alt=""
                  loading="lazy"
                  onError={hideBroken}
                />
              ))}
            </span>
            <span>{list.length} sources</span>
          </button>
        )}
      </div>
    )
  }

  function searchingLine(query: string, searched: string): ReactNode {
    if (searched === '' || searched.toLowerCase() === query.toLowerCase()) {
      return null
    }
    return (
      <p className="searching-line">
        <GlobeHemisphereWest size={15} aria-hidden="true" />
        Searching for {searched}
      </p>
    )
  }

  function relatedSection(questions: string[]): ReactNode {
    if (questions.length === 0) return null
    return (
      <section className="related rise" aria-label="Related questions">
        <p className="related-label">Related</p>
        <ul className="related-list">
          {questions.map((rq) => (
            <li key={rq}>
              <button
                type="button"
                className="related-item"
                onClick={() => runAsk(rq)}
              >
                <span className="related-text">{rq}</span>
                <Plus size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
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
          title={sidebarCollapsed ? 'New thread (⌘K)' : undefined}
          aria-label="New thread"
        >
          <Plus size={18} weight="bold" />
          <span className="new-thread-label">New thread</span>
          <kbd className="new-thread-kbd" aria-hidden="true">⌘K</kbd>
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
                className="profile-button"
                onClick={() => setProfileMenu((v) => !v)}
                aria-expanded={profileMenu}
                aria-label={`Account menu for ${session.email}`}
                title={session.email}
              >
                <span className="avatar avatar-sm" aria-hidden="true">
                  {((session.full_name || session.email).charAt(0) || '?').toUpperCase()}
                </span>
                <span className="profile-name">
                  {session.full_name || session.username || session.email}
                </span>
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
              <h1 className="hero-title rise">
                {firstName !== ''
                  ? `Hi, ${firstName}! How can I help you today?`
                  : 'What do you want to know?'}
              </h1>
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
                  mode={askMode}
                  onMode={setAskMode}
                  onStop={loading ? stopAsk : undefined}
                  placeholder="Ask anything..."
                  hint="Press Enter to ask, Shift plus Enter for a new line"
                />
              </form>
              <ul className="suggest-list rise rise-3">
                {heroSuggestions(profile).map((s) => (
                  <li key={s.text}>
                    <button
                      type="button"
                      className="suggest-item"
                      onClick={() => {
                        setQuery(s.text)
                        runAsk(s.text)
                      }}
                    >
                      <div className="suggest-top">
                        <span className="suggest-tag">{s.topic}</span>
                        <ArrowUpRight size={15} className="suggest-arrow" aria-hidden="true" />
                      </div>
                      <span className="suggest-text">{s.text}</span>
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
                    <div className="bubble-row">
                      <h2 className="user-bubble">{turn.query}</h2>
                    </div>

                    <div className="assistant-turn">
                      {turn.sources.length > 0 && (
                        <SourcesPreview
                          sources={turn.sources}
                          open={openSources === key}
                          onToggle={() => toggleSources(key)}
                        />
                      )}

                      {openSources === key && (
                        <div className="sources-drawer rise">
                          <SourceList prefix={`${key}-`} sources={turn.sources} />
                        </div>
                      )}

                      <AnswerHeader
                        mode={turn.mode}
                        durationMs={turn.durationMs}
                      />

                      {turn.mode === 'search' &&
                        searchingLine(turn.query, turn.searchedQuery)}

                      {answerBody(key, turn.answer, false, turn.sources)}

                      {actionBar(key, turn.answer, turn.sources, key)}

                      {relatedSection(turn.related)}
                    </div>
                  </div>
                )
              })}

              {asked !== '' && (
                <div className="turn live-turn">
                  <div className="bubble-row">
                    <h1 className="user-bubble">{asked}</h1>
                  </div>

                  <div className="assistant-turn">
                    {sources.length > 0 && (
                      <SourcesPreview
                        sources={sources}
                        open={openSources === 'live'}
                        onToggle={() => toggleSources('live')}
                      />
                    )}

                    {openSources === 'live' && (
                      <div className="sources-drawer rise">
                        <SourceList prefix="live-" sources={sources} />
                      </div>
                    )}

                    {loading && (
                      <StatusSteps
                        phase={phase}
                        sourceCount={sources.length}
                        resolved={resolvedQuery}
                        steps={steps}
                      />
                    )}

                    {(answer !== '' || !loading) && (
                      <AnswerHeader
                        mode={askMode}
                        durationMs={0}
                        loading={loading}
                      />
                    )}

                    {answer !== '' &&
                      answerBody('live', displayAnswer, streaming, sources)}

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

                    {!loading &&
                      answer !== '' &&
                      actionBar('live', displayAnswer, sources, 'live')}
                    {!loading && relatedSection(related)}
                  </div>
                </div>
              )}

              <div ref={threadBottomRef} className="thread-scroll-anchor" />

              <div className="composer-dock">
                <form onSubmit={(e) => e.preventDefault()}>
                  <Composer
                    value={query}
                    onChange={setQuery}
                    onSubmit={() => runAsk()}
                    loading={loading}
                    mode={askMode}
                    onMode={setAskMode}
                    onStop={loading ? stopAsk : undefined}
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
