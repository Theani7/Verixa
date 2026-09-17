import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  Brain,
  SlidersHorizontal,
  Sparkle,
  Trash,
  UserCircle,
  X,
} from '@phosphor-icons/react'
import {
  addMemory,
  changePassword,
  deleteAccount,
  deleteMemory,
  fetchMe,
  listMemories,
} from './api'
import type { Memory, Session } from './api'
import type { Prefs, Profile } from './types'

type Category = 'account' | 'preferences' | 'personalization' | 'memory'

const CATEGORIES: Array<{ id: Category; label: string; icon: ReactNode }> = [
  { id: 'account', label: 'Account', icon: <UserCircle size={18} /> },
  { id: 'preferences', label: 'Preferences', icon: <SlidersHorizontal size={18} /> },
  { id: 'personalization', label: 'Personalization', icon: <Sparkle size={18} /> },
  { id: 'memory', label: 'Memory', icon: <Brain size={18} /> },
]

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function SignInPrompt({ onOpenAuth }: { onOpenAuth: () => void }) {
  return (
    <div>
      <p className="settings-lead">Sign in to use this section.</p>
      <button type="button" className="ask-button" onClick={onOpenAuth}>
        Sign in
      </button>
    </div>
  )
}

function AccountPane({
  session,
  onSignOut,
  onAccountDeleted,
  onOpenAuth,
}: {
  session: Session | null
  onSignOut: () => void
  onAccountDeleted: () => void
  onOpenAuth: () => void
}) {
  const [memberSince, setMemberSince] = useState(session?.created_at ?? '')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwBusy, setPwBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    if (!session) return
    fetchMe(session.token)
      .then((me) => setMemberSince(me.created_at))
      .catch(() => undefined)
  }, [session])

  const token = session?.token ?? ''
  if (!session) return <SignInPrompt onOpenAuth={onOpenAuth} />

  async function submitPassword(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (pwBusy) return
    setPwMsg(null)
    setPwBusy(true)
    try {
      await changePassword(token, current, next)
      setCurrent('')
      setNext('')
      setPwMsg({ ok: true, text: 'Password updated.' })
    } catch (err) {
      setPwMsg({
        ok: false,
        text: err instanceof Error ? err.message : 'Could not update password.',
      })
    } finally {
      setPwBusy(false)
    }
  }

  async function confirmDelete(): Promise<void> {
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await deleteAccount(token)
      onAccountDeleted()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete account.')
      setDeleteBusy(false)
      setConfirmingDelete(false)
    }
  }

  return (
    <div>
      <div className="settings-row">
        <span className="settings-key">Email</span>
        <span className="settings-value">{session.email}</span>
      </div>
      {memberSince !== '' && (
        <div className="settings-row">
          <span className="settings-key">Member since</span>
          <span className="settings-value">{formatDate(memberSince)}</span>
        </div>
      )}

      <h4 className="settings-sub">Change password</h4>
      <form onSubmit={submitPassword}>
        <div className="field">
          <label htmlFor="settings-current">Current password</label>
          <input
            id="settings-current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="settings-new">New password</label>
          <input
            id="settings-new"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={8}
          />
        </div>
        {pwMsg && (
          <p className={pwMsg.ok ? 'settings-ok' : 'auth-error'} role="status">
            {pwMsg.text}
          </p>
        )}
        <button type="submit" className="settings-button" disabled={pwBusy}>
          {pwBusy ? 'Updating...' : 'Update password'}
        </button>
      </form>

      <h4 className="settings-sub">Session</h4>
      <button type="button" className="settings-button ghost" onClick={onSignOut}>
        Sign out
      </button>

      <h4 className="settings-sub danger">Delete account</h4>
      {!confirmingDelete ? (
        <button
          type="button"
          className="settings-button danger-outline"
          onClick={() => setConfirmingDelete(true)}
        >
          Delete account...
        </button>
      ) : (
        <div className="danger-box" role="alert">
          <p>
            This permanently deletes your account, threads, and memories,
            including threads on this device. This cannot be undone.
          </p>
          {deleteError !== '' && <p className="auth-error">{deleteError}</p>}
          <div className="danger-actions">
            <button
              type="button"
              className="settings-button ghost"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleteBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="settings-button danger-solid"
              onClick={confirmDelete}
              disabled={deleteBusy}
            >
              {deleteBusy ? 'Deleting...' : 'Delete forever'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PreferencesPane({
  prefs,
  onPrefs,
}: {
  prefs: Prefs
  onPrefs: (prefs: Prefs) => void
}) {
  return (
    <div>
      <h4 className="settings-sub first">Results per search</h4>
      <div className="auth-tabs" role="group" aria-label="Results per search">
        {[3, 5, 10].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={prefs.numResults === n}
            className={`auth-tab${prefs.numResults === n ? ' active' : ''}`}
            onClick={() => onPrefs({ ...prefs, numResults: n })}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="settings-lead">
        More results give the answer broader context but take longer.
      </p>

      <h4 className="settings-sub">Answer delivery</h4>
      <div className="auth-tabs" role="group" aria-label="Answer delivery">
        <button
          type="button"
          aria-pressed={prefs.stream}
          className={`auth-tab${prefs.stream ? ' active' : ''}`}
          onClick={() => onPrefs({ ...prefs, stream: true })}
        >
          Stream live
        </button>
        <button
          type="button"
          aria-pressed={!prefs.stream}
          className={`auth-tab${!prefs.stream ? ' active' : ''}`}
          onClick={() => onPrefs({ ...prefs, stream: false })}
        >
          All at once
        </button>
      </div>
      <p className="settings-lead">
        Streaming types the answer as it arrives. All at once waits for the
        complete answer.
      </p>
    </div>
  )
}

function PersonalizationPane({
  profile,
  onProfile,
}: {
  profile: Profile
  onProfile: (profile: Profile) => void
}) {
  return (
    <div>
      <p className="settings-lead">
        Tell Verixa how to talk to you. Saved automatically on this device.
      </p>
      <div className="field">
        <label htmlFor="settings-name">What should Verixa call you?</label>
        <input
          id="settings-name"
          type="text"
          autoComplete="nickname"
          value={profile.name}
          onChange={(e) => onProfile({ ...profile, name: e.target.value })}
          placeholder="Asha"
          maxLength={100}
        />
      </div>
      <div className="field">
        <label htmlFor="settings-instructions">How should Verixa respond?</label>
        <textarea
          id="settings-instructions"
          value={profile.instructions}
          onChange={(e) => onProfile({ ...profile, instructions: e.target.value })}
          placeholder="Example: keep answers short and skip the background."
          rows={4}
          maxLength={2000}
        />
      </div>
    </div>
  )
}

function MemoryPane({
  session,
  onOpenAuth,
}: {
  session: Session | null
  onOpenAuth: () => void
}) {
  const [memories, setMemories] = useState<Memory[]>([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!session) return
    listMemories(session.token)
      .then((rows) => {
        setMemories(rows)
        setLoaded(true)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load memories.')
        setLoaded(true)
      })
  }, [session])

  const token = session?.token ?? ''
  if (!session) return <SignInPrompt onOpenAuth={onOpenAuth} />

  async function add(e: FormEvent): Promise<void> {
    e.preventDefault()
    const content = draft.trim()
    if (content === '' || busy) return
    setBusy(true)
    setError('')
    try {
      const row = await addMemory(token, content)
      setMemories((prev) => [row, ...prev])
      setDraft('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save memory.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string): Promise<void> {
    setError('')
    try {
      await deleteMemory(token, id)
      setMemories((prev) => prev.filter((m) => m.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete memory.')
    }
  }

  return (
    <div>
      <p className="settings-lead">
        Things Verixa should remember when answering you, like your city or
        how much detail you like. {memories.length} of 100 saved.
      </p>
      <form onSubmit={add} className="memory-add">
        <label className="visually-hidden" htmlFor="memory-draft">
          New memory
        </label>
        <input
          id="memory-draft"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Example: I live in Kathmandu."
          maxLength={1000}
        />
        <button type="submit" className="settings-button" disabled={busy || draft.trim() === ''}>
          {busy ? 'Saving...' : 'Remember'}
        </button>
      </form>
      {error !== '' && (
        <p className="auth-error" role="alert">{error}</p>
      )}
      {!loaded && <p className="settings-lead">Loading memories...</p>}
      {loaded && memories.length === 0 && (
        <p className="settings-lead">Nothing remembered yet.</p>
      )}
      <ul className="memory-list">
        {memories.map((m) => (
          <li key={m.id} className="memory-item">
            <span className="memory-text">{m.content}</span>
            <button
              type="button"
              className="memory-delete"
              onClick={() => remove(m.id)}
              aria-label={`Forget memory: ${m.content}`}
            >
              <Trash size={15} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function SettingsModal({
  session,
  prefs,
  onPrefs,
  profile,
  onProfile,
  onClose,
  onSignOut,
  onAccountDeleted,
  onOpenAuth,
}: {
  session: Session | null
  prefs: Prefs
  onPrefs: (prefs: Prefs) => void
  profile: Profile
  onProfile: (profile: Profile) => void
  onClose: () => void
  onSignOut: () => void
  onAccountDeleted: () => void
  onOpenAuth: () => void
}) {
  const [category, setCategory] = useState<Category>('account')

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="modal-head">
          <h2 id="settings-title" className="modal-title">Settings</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X size={18} />
          </button>
        </div>

        <div className="settings-grid">
          <nav className="settings-nav" aria-label="Settings categories">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-current={category === c.id ? 'true' : undefined}
                className={`settings-nav-item${category === c.id ? ' active' : ''}`}
                onClick={() => setCategory(c.id)}
              >
                {c.icon}
                {c.label}
              </button>
            ))}
          </nav>

          <div className="settings-pane">
            {category === 'account' && (
              <AccountPane
                session={session}
                onSignOut={onSignOut}
                onAccountDeleted={onAccountDeleted}
                onOpenAuth={onOpenAuth}
              />
            )}
            {category === 'preferences' && (
              <PreferencesPane prefs={prefs} onPrefs={onPrefs} />
            )}
            {category === 'personalization' && (
              <PersonalizationPane profile={profile} onProfile={onProfile} />
            )}
            {category === 'memory' && (
              <MemoryPane session={session} onOpenAuth={onOpenAuth} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
