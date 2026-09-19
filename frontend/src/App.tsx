import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowBendDownRight,
  ArrowClockwise,
  ArrowUpRight,
  ChatCircleText,
  Check,
  Copy,
  EyeSlash,
  GearSix,
  GlobeHemisphereWest,
  List,
  MagnifyingGlass,
  SidebarSimple,
  Plus,
  ShareNetwork,
  SignIn,
  SignOut,
  Trash,
  Tray,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import './App.css'
import { API_URL, deleteSharedThread, fetchMe, syncThread } from './api'
import type { Session } from './api'
import { SourceList } from './article'
import { faviconFor, hostnameOf, normalizeCitations, renderRich } from './markdown'
import AuthModal from './AuthModal'
import SettingsModal from './SettingsModal'
import { ChatSourcesModal } from './components/ChatSourcesModal'
import { Composer } from './components/Composer'
import { AnswerHeader } from './components/AnswerHeader'
import { StatusSteps } from './components/StatusSteps'
import { groupThreads, loadThreads } from './hooks/useThreadStore'
import { loadAskMode, loadCollapsed, loadIncognito, errorMessage, newId, INCOGNITO_KEY, AUTH_KEY, MAX_THREADS, STORAGE_KEY, SIDEBAR_KEY } from './lib/storage'
import { loadPrefs, loadProfile } from './lib/preferences'
import { loadSession, isSource } from './lib/normalize'
import type { AskMode, Prefs, Profile, Source, Thread, Turn } from './types'
import { PREFS_KEY, PROFILE_KEY, MODE_KEY } from './types'

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

interface SuggestionItem { topic: string; text: string }

const SUGGESTION_POOL: SuggestionItem[] = [
  { topic: 'AI', text: 'How does retrieval augmented generation reduce hallucinations?' },
  { topic: 'Climate', text: 'What did the latest IPCC report say about methane emissions?' },
  { topic: 'Space', text: 'What is happening with the Artemis moon program?' },
  { topic: 'Health', text: 'How much sleep do adults actually need?' },
  { topic: 'Economy', text: 'Why do central banks raise interest rates to fight inflation?' },
  { topic: 'History', text: 'What caused the fall of the Roman Empire?' },
]

function heroSuggestions(profile: Profile): SuggestionItem[] {
  const day = Math.floor(Date.now() / 86400000)
  const picked = [0, 1, 2].map(
    (i) => SUGGESTION_POOL[(day + i) % SUGGESTION_POOL.length],
  )
  const place = profile.shareLocation ? profile.location.trim().slice(0, 60) : ''
  if (place !== '') {
    picked[2] = { topic: 'Local', text: 'What is happening in ' + place + ' this week?' }
  }
  return picked
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
  const [session, setSession] = useState<Session | null>(() => loadSession(localStorage.getItem(AUTH_KEY)))
  const [authModal, setAuthModal] = useState<'signin' | 'signup' | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profileMenu, setProfileMenu] = useState(false)
  const [confirmingSignOut, setConfirmingSignOut] = useState(false)
  const [prefs] = useState<Prefs>(() => loadPrefs(localStorage.getItem(PREFS_KEY)))
  const [profile, setProfile] = useState<Profile>(() => loadProfile(localStorage.getItem(PROFILE_KEY)))
  const [askMode, setAskMode] = useState<AskMode>(loadAskMode)
  const [steps, setSteps] = useState<string[]>([])
  const [chatSourcesOpen, setChatSourcesOpen] = useState(false)
  const [incognito, setIncognito] = useState(loadIncognito)
  const incognitoThreadIds = useRef<Set<string>>(new Set())

  const activeThread = threads.find((x) => x.id === activeId)
  const chatSources = useMemo(() => {
    const combined = [...turns.flatMap((t) => t.sources), ...sources]
    const map = new Map<string, Source>()
    for (const s of combined) {
      const k = s.url || String(s.id)
      if (!map.has(k)) {
        map.set(k, s)
      }
    }
    return Array.from(map.values())
  }, [turns, sources])

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
  }, [asked])

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
    if (incognito) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(threads.slice(0, MAX_THREADS))) } catch { /* ignore */ }
  }, [threads, incognito])

  function toggleIncognito(): void {
    if (incognito) {
      // Leaving incognito: drop threads created while private so they are
      // never written to localStorage or synced to the account.
      const ids = incognitoThreadIds.current
      setThreads((prev) => prev.filter((t) => !ids.has(t.id)))
      setActiveId((prev) => (prev && ids.has(prev) ? null : prev))
      incognitoThreadIds.current = new Set()
      setIncognito(false)
      try {
        sessionStorage.removeItem(INCOGNITO_KEY)
      } catch {
        /* private mode: state stays in memory */
      }
      reset()
      return
    }
    // Entering incognito: start a clean thread. Saved threads stay saved.
    setIncognito(true)
    try {
      sessionStorage.setItem(INCOGNITO_KEY, 'on')
    } catch {
      /* ignore */
    }
    reset()
  }

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
    const stored = loadSession(localStorage.getItem(AUTH_KEY))
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
      if (updated && !incognito) syncThread(updated, session?.token).catch(() => undefined)
    } else {
      const thread: Thread = {
        id: newId(),
        title: turn.query.length > 60 ? `${turn.query.slice(0, 60)}...` : turn.query,
        turns: [turn],
        ts: Date.now(),
      }
      setActiveId(thread.id)
      setThreads((prev) => [thread, ...prev])
      if (incognito) {
        incognitoThreadIds.current.add(thread.id)
      } else {
        syncThread(thread, session?.token).catch(() => undefined)
      }
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
    // Incognito: never send the auth token, so the request is anonymous
    // and the server cannot touch account data (memories, threads).
    if (session && !incognito) headers.Authorization = `Bearer ${session.token}`
    const payload = JSON.stringify({
      query: q,
      history,
      num_results: prefs.numResults,
      profile,
      mode: askMode,
      incognito,
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
    if (incognito) {
      setError('Sharing is off in incognito. Turn incognito off to share a thread.')
      setShareState('failed')
      return
    }
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
    isStreaming: boolean,
    citeSources: Source[],
  ): ReactNode {
    return (
      <div className="answer-body">
        {renderRich(text, `${key}-`, citeSources, isStreaming)}
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
        <p className="related-label">
          <ArrowBendDownRight size={15} aria-hidden="true" />
          <span>Related questions</span>
        </p>
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
    const sourceCount = t.turns.reduce((acc, turn) => acc + turn.sources.length, 0)
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
        {sourceCount > 0 && (
          <span
            className="thread-source-badge"
            title={`${sourceCount} sources in this chat`}
            aria-label={`${sourceCount} sources`}
          >
            {sourceCount}
          </span>
        )}
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
        <button
          type="button"
          className={`incognito-toggle${incognito ? ' on' : ''}`}
          onClick={toggleIncognito}
          aria-pressed={incognito}
          title={
            sidebarCollapsed
              ? incognito
                ? 'Incognito on — nothing is saved'
                : 'Incognito off'
              : incognito
                ? 'Incognito is on: questions and threads are not saved. Click to turn off.'
                : 'Incognito: ask without saving history or memories'
          }
          aria-label={incognito ? 'Turn off incognito mode' : 'Turn on incognito mode'}
        >
          <EyeSlash size={18} weight={incognito ? 'fill' : 'regular'} />
          <span className="new-thread-label">
            {incognito ? 'Incognito: on' : 'Incognito'}
          </span>
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
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setThreadFilter('')
                e.currentTarget.blur()
              }
            }}
            placeholder="Search threads"
            autoComplete="off"
          />
          {threadFilter ? (
            <button
              type="button"
              className="thread-search-clear"
              onClick={() => {
                setThreadFilter('')
                searchRef.current?.focus()
              }}
              aria-label="Clear search"
              title="Clear search"
            >
              <X size={14} />
            </button>
          ) : (
            <kbd aria-hidden="true">/</kbd>
          )}
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
          {incognito && (
            <div className="incognito-banner" role="status">
              <EyeSlash size={14} weight="bold" aria-hidden="true" />
              <span>Incognito — questions, threads, and memories are not saved.</span>
              <button type="button" onClick={toggleIncognito}>Turn off</button>
            </div>
          )}
          <header className="topbar">
            <div className="topbar-left">
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
            </div>
            {inThread && chatSources.length > 0 && (
              <button
                type="button"
                className="chat-sources-pill"
                onClick={() => setChatSourcesOpen(true)}
                title="View all sources in this chat"
              >
                <GlobeHemisphereWest size={14} aria-hidden="true" />
                <span>{chatSources.length} sources</span>
              </button>
            )}
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
              <div className="thread-header-bar rise">
                <div className="thread-header-info">
                  <span className="thread-header-title">
                    {activeThread?.title ?? (turns[0]?.query || asked)}
                  </span>
                </div>
                {chatSources.length > 0 && (
                  <button
                    type="button"
                    className="chat-sources-pill"
                    onClick={() => setChatSourcesOpen(true)}
                    title="View all sources cited in this chat"
                  >
                    <GlobeHemisphereWest size={14} aria-hidden="true" />
                    <span>{chatSources.length} sources in chat</span>
                  </button>
                )}
              </div>

              {turns.map((turn, ti) => {
                const key = `t${ti}`
                return (
                  <div className="turn" key={key}>
                    <div className="bubble-row">
                      <h2 className="user-bubble">{turn.query}</h2>
                    </div>

                    <div className="assistant-turn">
                      <AnswerHeader
                        mode={turn.mode}
                        durationMs={turn.durationMs}
                      />

                      {turn.mode === 'search' &&
                        searchingLine(turn.query, turn.searchedQuery)}

                      {answerBody(key, turn.answer, false, turn.sources)}

                      {actionBar(key, turn.answer, turn.sources, key)}

                      {openSources === key && turn.sources.length > 0 && (
                        <div className="sources-drawer rise">
                          <div className="sources-drawer-head">
                            <span className="sources-drawer-title">
                              <GlobeHemisphereWest size={15} aria-hidden="true" />
                              <span>Sources ({turn.sources.length})</span>
                            </span>
                            <button
                              type="button"
                              className="sources-drawer-close"
                              onClick={() => toggleSources(key)}
                              aria-label="Close sources drawer"
                              title="Close"
                            >
                              <X size={15} />
                            </button>
                          </div>
                          <SourceList prefix={`${key}-`} sources={turn.sources} />
                        </div>
                      )}

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

                    {openSources === 'live' && sources.length > 0 && (
                      <div className="sources-drawer rise">
                        <div className="sources-drawer-head">
                          <span className="sources-drawer-title">
                            <GlobeHemisphereWest size={15} aria-hidden="true" />
                            <span>Sources ({sources.length})</span>
                          </span>
                          <button
                            type="button"
                            className="sources-drawer-close"
                            onClick={() => toggleSources('live')}
                            aria-label="Close sources drawer"
                            title="Close"
                          >
                            <X size={15} />
                          </button>
                        </div>
                        <SourceList prefix="live-" sources={sources} />
                      </div>
                    )}

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

      {chatSourcesOpen && (
        <ChatSourcesModal
          sources={chatSources}
          onClose={() => setChatSourcesOpen(false)}
        />
      )}
    </div>
  )
}

export default App
