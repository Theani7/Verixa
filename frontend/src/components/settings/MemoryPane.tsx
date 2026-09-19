import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Trash } from '@phosphor-icons/react'
import { addMemory, deleteMemory, fetchMe, listMemories, updateProfile } from '../../api'
import type { Memory, Session } from '../../types'
import { SignInPrompt } from './SignInPrompt'

export interface MemoryPaneProps {
  session: Session | null
  onOpenAuth: () => void
}

export function MemoryPane({ session, onOpenAuth }: MemoryPaneProps) {
  const [memories, setMemories] = useState<Memory[]>([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [memEnabled, setMemEnabled] = useState(true)
  const [memAuto, setMemAuto] = useState(true)

  useEffect(() => {
    if (!session) return
    Promise.all([listMemories(session.token), fetchMe(session.token)])
      .then(([rows, me]) => {
        setMemories(rows)
        setMemEnabled(me.memory_enabled)
        setMemAuto(me.memory_auto)
        setLoaded(true)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load memories.')
        setLoaded(true)
      })
  }, [session])

  const token = session?.token ?? ''
  if (!session) return <SignInPrompt onOpenAuth={onOpenAuth} />

  async function setFlag(
    key: 'memory_enabled' | 'memory_auto',
    value: boolean,
  ): Promise<void> {
    const prevEnabled = memEnabled
    const prevAuto = memAuto
    if (key === 'memory_enabled') setMemEnabled(value)
    else setMemAuto(value)
    setError('')
    try {
      const me = await updateProfile(token, { [key]: value })
      setMemEnabled(me.memory_enabled)
      setMemAuto(me.memory_auto)
    } catch (err) {
      setMemEnabled(prevEnabled)
      setMemAuto(prevAuto)
      setError(err instanceof Error ? err.message : 'Could not save setting.')
    }
  }

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
      <label className="switch-row" htmlFor="memory-enabled">
        <span className="switch-text">
          <span className="switch-title">Use memory in answers</span>
          <span className="switch-sub">
            {memEnabled
              ? 'Saved facts are included when answering you.'
              : 'Paused: saved facts stay stored but are ignored.'}
          </span>
        </span>
        <input
          id="memory-enabled"
          type="checkbox"
          className="switch"
          checked={memEnabled}
          onChange={(e) => setFlag('memory_enabled', e.target.checked)}
        />
      </label>
      <label
        className={`switch-row${memEnabled ? '' : ' disabled'}`}
        htmlFor="memory-auto"
      >
        <span className="switch-text">
          <span className="switch-title">Learn automatically</span>
          <span className="switch-sub">
            Save new facts from your chats without asking.
          </span>
        </span>
        <input
          id="memory-auto"
          type="checkbox"
          className="switch"
          checked={memAuto}
          disabled={!memEnabled}
          onChange={(e) => setFlag('memory_auto', e.target.checked)}
        />
      </label>
      <p className="settings-lead">
        Things Verixa should remember when answering you, like your city or how much
        detail you like. {memories.length} of 100 saved.
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
        <button
          type="submit"
          className="settings-button"
          disabled={busy || draft.trim() === ''}
        >
          {busy ? 'Saving...' : 'Remember'}
        </button>
      </form>
      {error !== '' && (
        <p className="auth-error" role="alert">
          {error}
        </p>
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

export default MemoryPane
