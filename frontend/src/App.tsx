import { useEffect, useMemo, useRef, useState } from 'react'
import { EyeSlash, GlobeHemisphereWest, List } from '@phosphor-icons/react'
import './App.css'
import { fetchMe, syncThread } from './api'
import type { Session } from './api'
import { AuthModal } from './components/AuthModal'
import { SettingsModal } from './components/SettingsModal'
import type { Category } from './components/SettingsModal'
import { ChatSourcesModal } from './components/ChatSourcesModal'

import { Composer } from './components/Composer'
import { Sidebar } from './components/Sidebar'
import { Hero } from './components/Hero'
import { TurnCard } from './components/TurnCard'
import { LiveTurnCard } from './components/LiveTurnCard'
import { useThreadStore } from './hooks/useThreadStore'
import { useAskStream } from './hooks/useAskStream'
import {
  AUTH_KEY,
  MAX_THREADS,
  loadAskMode,
  loadCollapsed,
  loadIncognito,
  persistAskMode,
  persistCollapsed,
  persistIncognito,
} from './lib/storage'
import { loadPrefs, loadProfile, persistPrefs, persistProfile } from './lib/preferences'
import { collectSources, loadSession } from './lib/normalize'
import type { AskMode, LLMConfig, Prefs, Profile } from './types'
import {
  DEFAULT_LLM_CONFIG,
  LLM_CONFIG_KEY,
  PREFS_KEY,
  PROFILE_KEY,
  normalizeLLMConfig,
} from './types'
import { activateLLMSource } from './lib/llmProviders'

function App() {
  const [session, setSession] = useState<Session | null>(() =>
    loadSession(localStorage.getItem(AUTH_KEY)),
  )
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs(localStorage.getItem(PREFS_KEY)))
  const [profile, setProfile] = useState<Profile>(() =>
    loadProfile(localStorage.getItem(PROFILE_KEY)),
  )
  const [llmConfig, setLlmConfig] = useState<LLMConfig>(() => {
    try {
      const raw = localStorage.getItem(LLM_CONFIG_KEY)
      return raw ? normalizeLLMConfig(JSON.parse(raw)) : DEFAULT_LLM_CONFIG
    } catch {
      return DEFAULT_LLM_CONFIG
    }
  })
  const [askMode, setAskMode] = useState<AskMode>(loadAskMode)
  const [incognito, setIncognito] = useState(loadIncognito)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadCollapsed)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [authModal, setAuthModal] = useState<'signin' | 'signup' | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsCategory, setSettingsCategory] = useState<Category>('account')
  const [chatSourcesOpen, setChatSourcesOpen] = useState(false)

  const handleUpdateLlmConfig = (cfg: LLMConfig) => {
    setLlmConfig(cfg)
    try {
      localStorage.setItem(LLM_CONFIG_KEY, JSON.stringify(cfg))
    } catch {
      // ignore
    }
  }

  const handleSelectModel = (sourceId: string) => {
    const updated = activateLLMSource(llmConfig, sourceId)
    handleUpdateLlmConfig(updated)
  }

  const handleOpenModelSettings = () => {
    setSettingsCategory('model')
    setSettingsOpen(true)
  }

  const searchRef = useRef<HTMLInputElement>(null)
  const threadBottomRef = useRef<HTMLDivElement>(null)

  const {
    threads,
    activeId,
    turns,
    activeThread,
    persistTurn,
    openThread: storeOpenThread,
    resetThread,
    deleteThread,
    dropIncognitoThreads,
  } = useThreadStore(incognito, session?.token)

  const askStream = useAskStream({
    session,
    incognito,
    profile,
    prefs,
    askMode,
    llmConfig,
    historyTurns: turns,
    onTurn: persistTurn,
  })

  const inThread = turns.length > 0 || askStream.asked !== ''

  const chatSources = useMemo(
    () => collectSources(turns, askStream.sources),
    [turns, askStream.sources],
  )

  useEffect(() => {
    if (askStream.asked !== '') {
      threadBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [askStream.asked])

  useEffect(() => {
    function onGlobalKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        const el = e.target as HTMLElement | null
        if (el?.closest('.modal')) return
        e.preventDefault()
        handleReset()
        const input = document.getElementById('verixa-query') as HTMLTextAreaElement | null
        input?.focus()
      }
    }
    window.addEventListener('keydown', onGlobalKey)
    return () => window.removeEventListener('keydown', onGlobalKey)
  }, [])

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
    persistPrefs(prefs)
  }, [prefs])

  useEffect(() => {
    persistProfile(profile)
  }, [profile])

  useEffect(() => {
    persistAskMode(askMode)
  }, [askMode])

  useEffect(() => {
    persistCollapsed(sidebarCollapsed)
  }, [sidebarCollapsed])

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

  function handleReset(): void {
    askStream.reset()
    resetThread()
    setSidebarOpen(false)
  }

  function handleOpenThread(id: string): void {
    askStream.clearForOpen()
    storeOpenThread(id)
    setSidebarOpen(false)
  }

  function handleToggleIncognito(): void {
    if (incognito) {
      dropIncognitoThreads()
      setIncognito(false)
      persistIncognito(false)
      handleReset()
      return
    }
    setIncognito(true)
    persistIncognito(true)
    handleReset()
  }

  function handleAsk(text?: string): void {
    askStream.runAsk(text)
  }

  function handleShare(): void {
    askStream.shareThread(activeThread)
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

  return (
    <div
      className={`app${sidebarOpen ? ' sidebar-open' : ''}${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}
    >
      <Sidebar
        threads={threads}
        activeId={activeId}
        incognito={incognito}
        sidebarCollapsed={sidebarCollapsed}
        searchRef={searchRef}
        session={session}
        onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
        onToggleIncognito={handleToggleIncognito}
        onNewThread={handleReset}
        onOpenThread={handleOpenThread}
        onDeleteThread={deleteThread}
        onOpenAuth={(mode) => setAuthModal(mode)}
        onOpenSettings={() => setSettingsOpen(true)}
        onSignOut={signOut}
      />

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
              <button type="button" onClick={handleToggleIncognito}>
                Turn off
              </button>
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

          {!inThread ? (
            <Hero
              profile={profile}
              query={askStream.query}
              loading={askStream.loading}
              askMode={askMode}
              onChangeQuery={askStream.setQuery}
              onSubmit={() => handleAsk()}
              onMode={setAskMode}
              onStop={askStream.stopAsk}
              onPickSuggestion={(text) => {
                askStream.setQuery(text)
                handleAsk(text)
              }}
              llmConfig={llmConfig}
              onSelectModel={handleSelectModel}
              onOpenModelSettings={handleOpenModelSettings}
            />
          ) : (
            <main
              aria-live={askStream.phase === 'done' ? 'polite' : 'off'}
              aria-busy={askStream.loading}
              className="thread"
            >
              <div className="thread-header-bar rise">
                <div className="thread-header-info">
                  <span className="thread-header-title">
                    {activeThread?.title ?? (turns[0]?.query || askStream.asked)}
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

              {turns.map((turn, ti) => (
                <TurnCard
                  key={`t${ti}`}
                  turn={turn}
                  turnIndex={ti}
                  copiedKey={askStream.copiedKey}
                  openSources={askStream.openSources}
                  shareState={askStream.shareState}
                  onCopy={askStream.copyAnswer}
                  onShare={handleShare}
                  onNewThread={handleReset}
                  onToggleSources={askStream.toggleSources}
                  onAskRelated={(rq) => handleAsk(rq)}
                />
              ))}

              {askStream.asked !== '' && (
                <LiveTurnCard
                  asked={askStream.asked}
                  displayAnswer={askStream.displayAnswer}
                  sources={askStream.sources}
                  phase={askStream.phase}
                  steps={askStream.steps}
                  resolvedQuery={askStream.resolvedQuery}
                  error={askStream.error}
                  related={askStream.related}
                  askMode={askMode}
                  loading={askStream.loading}
                  streaming={askStream.streaming}
                  copiedKey={askStream.copiedKey}
                  openSources={askStream.openSources}
                  shareState={askStream.shareState}
                  onCopy={askStream.copyAnswer}
                  onShare={handleShare}
                  onNewThread={handleReset}
                  onToggleSources={askStream.toggleSources}
                  onRetry={() => handleAsk(askStream.asked)}
                  onAskRelated={(rq) => handleAsk(rq)}
                />
              )}

              <div ref={threadBottomRef} className="thread-scroll-anchor" />

              <div className="composer-dock">
                <form onSubmit={(e) => e.preventDefault()}>
                  <Composer
                    value={askStream.query}
                    onChange={askStream.setQuery}
                    onSubmit={() => handleAsk()}
                    loading={askStream.loading}
                    mode={askMode}
                    onMode={setAskMode}
                    onStop={askStream.loading ? askStream.stopAsk : undefined}
                    placeholder={
                      turns.length > 0 ? 'Ask a follow-up...' : 'Ask anything...'
                    }
                    llmConfig={llmConfig}
                    onSelectModel={handleSelectModel}
                    onOpenModelSettings={handleOpenModelSettings}
                  />
                </form>
              </div>
            </main>
          )}

          <footer className="footer">
            Verixa answers from live web sources via Exa. Verify important claims before
            acting on them.
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
          llmConfig={llmConfig}
          onLlmConfig={handleUpdateLlmConfig}
          prefs={prefs}
          onPrefs={setPrefs}
          initialCategory={settingsCategory}
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
