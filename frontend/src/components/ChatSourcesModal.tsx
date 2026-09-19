import { useEffect, useState } from 'react'
import { MagnifyingGlass, X } from '@phosphor-icons/react'
import { SourceList } from '../article'
import type { Source } from '../types'

export interface ChatSourcesModalProps {
  sources: Source[]
  onClose: () => void
}

export function ChatSourcesModal({ sources, onClose }: ChatSourcesModalProps) {
  const [filter, setFilter] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = sources.filter(
    (s) =>
      s.title.toLowerCase().includes(filter.toLowerCase()) ||
      s.url.toLowerCase().includes(filter.toLowerCase()) ||
      (s.excerpt && s.excerpt.toLowerCase().includes(filter.toLowerCase())),
  )

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="modal chat-sources-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-sources-title"
      >
        <div className="modal-head">
          <div className="chat-sources-header-left">
            <h2 id="chat-sources-title" className="modal-title">
              Sources in this chat
            </h2>
            <span className="sources-badge">{sources.length}</span>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close sources dialog"
          >
            <X size={18} />
          </button>
        </div>

        {sources.length > 3 && (
          <div className="chat-sources-search">
            <MagnifyingGlass size={15} aria-hidden="true" />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter chat sources..."
              autoFocus
            />
          </div>
        )}

        <div className="chat-sources-content">
          {filtered.length > 0 ? (
            <SourceList prefix="chat-modal-" sources={filtered} />
          ) : (
            <p className="thread-empty">No sources match &ldquo;{filter}&rdquo;</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChatSourcesModal
