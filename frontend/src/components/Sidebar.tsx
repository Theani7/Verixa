import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import {
  ChatCircleText,
  EyeSlash,
  GearSix,
  MagnifyingGlass,
  Plus,
  SidebarSimple,
  SignIn,
  SignOut,
  Trash,
  Tray,
  X,
} from '@phosphor-icons/react'
import type { Session } from '../api'
import type { Thread } from '../types'
import { groupThreads } from '../hooks/useThreadStore'

export interface SidebarProps {
  threads: Thread[]
  activeId: string | null
  incognito: boolean
  sidebarCollapsed: boolean
  searchRef: RefObject<HTMLInputElement | null>
  session: Session | null
  onToggleCollapsed: () => void
  onToggleIncognito: () => void
  onNewThread: () => void
  onOpenThread: (id: string) => void
  onDeleteThread: (id: string) => void
  onOpenAuth: (mode: 'signin' | 'signup') => void
  onOpenSettings: () => void
  onSignOut: () => void
}

export function Sidebar({
  threads,
  activeId,
  incognito,
  sidebarCollapsed,
  searchRef,
  session,
  onToggleCollapsed,
  onToggleIncognito,
  onNewThread,
  onOpenThread,
  onDeleteThread,
  onOpenAuth,
  onOpenSettings,
  onSignOut,
}: SidebarProps) {
  const [threadFilter, setThreadFilter] = useState('')
  const [profileMenu, setProfileMenu] = useState(false)
  const [confirmingSignOut, setConfirmingSignOut] = useState(false)

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

  const groups = groupThreads(threads, threadFilter)
  const visibleCount = groups.reduce((n, g) => n + g.items.length, 0)

  return (
    <aside className="sidebar" aria-label="Threads">
      <div className="brand-row">
        <span className="brand-mark" aria-hidden="true">
          V
        </span>
        <span className="brand">Verixa</span>
        <button
          type="button"
          className="rail-toggle"
          onClick={onToggleCollapsed}
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
        onClick={onNewThread}
        title={sidebarCollapsed ? 'New thread (⌘K)' : undefined}
        aria-label="New thread"
      >
        <Plus size={18} weight="bold" />
        <span className="new-thread-label">New thread</span>
        <kbd className="new-thread-kbd" aria-hidden="true">
          ⌘K
        </kbd>
      </button>

      <button
        type="button"
        className={`incognito-toggle${incognito ? ' on' : ''}`}
        onClick={onToggleIncognito}
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
                  {g.items.map((t) => {
                    const sourceCount = t.turns.reduce(
                      (acc, turn) => acc + turn.sources.length,
                      0,
                    )
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
                          onClick={() => onOpenThread(t.id)}
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
                          onClick={() => onDeleteThread(t.id)}
                          aria-label={`Delete thread ${t.title}`}
                        >
                          <Trash size={15} />
                        </button>
                      </li>
                    )
                  })}
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
                  onClick={closeProfileMenu}
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
                          onOpenSettings()
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
                            onSignOut()
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
              onClick={() => onOpenAuth('signin')}
            >
              Sign in
            </button>
            <button
              type="button"
              className="sign-in-icon"
              onClick={() => onOpenAuth('signin')}
              aria-label="Sign in"
              title="Sign in"
            >
              <SignIn size={18} />
            </button>
          </>
        )}
      </div>
    </aside>
  )
}

export default Sidebar
