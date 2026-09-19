import { Trash } from '@phosphor-icons/react'
import type { Session } from '../../types'
import { useMemories } from '../../hooks/useMemories'
import { SignInPrompt } from './SignInPrompt'

export interface MemoryPaneProps {
  session: Session | null
  onOpenAuth: () => void
}

export function MemoryPane({ session, onOpenAuth }: MemoryPaneProps) {
  const {
    memories,
    loaded,
    draft,
    setDraft,
    error,
    busy,
    memEnabled,
    memAuto,
    setFlag,
    add,
    remove,
  } = useMemories(session)

  if (!session) return <SignInPrompt onOpenAuth={onOpenAuth} />

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
