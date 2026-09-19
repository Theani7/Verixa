import type { ReactNode } from 'react'
import { Check, Copy, Plus, ShareNetwork, WarningCircle } from '@phosphor-icons/react'
import type { Source } from '../types'
import { faviconFor, hostnameOf } from '../lib/url'


export interface ActionBarProps {
  copied: boolean
  shareState?: 'idle' | 'copied' | 'failed'
  sources: Source[]
  sourcesOpen: boolean
  onCopy?: () => void
  onShare?: () => void
  onNewThread?: () => void
  onToggleSources?: () => void
}

export function favicons(list: Source[]): string[] {
  const seen = new Map<string, string>()
  for (const s of list) {
    const host = hostnameOf(s.url)
    if (!seen.has(host)) seen.set(host, s.url)
    if (seen.size >= 3) break
  }
  return [...seen.values()]
}

export function ActionBar({
  copied,
  shareState = 'idle',
  sources,
  sourcesOpen,
  onCopy,
  onShare,
  onNewThread,
  onToggleSources,
}: ActionBarProps): ReactNode {
  return (
    <div className="action-bar">
      {onCopy && (
        <button
          type="button"
          className={`action-btn${copied ? ' copied' : ''}`}
          aria-label={copied ? 'Copied to clipboard' : 'Copy answer'}
          title={copied ? 'Copied!' : 'Copy answer'}
          onClick={onCopy}
        >
          <span key={String(copied)} className="copy-pop">
            {copied ? <Check size={16} weight="bold" /> : <Copy size={16} />}
          </span>
          {copied && <span className="action-feedback">Copied</span>}
        </button>
      )}
      {onShare && (
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
          onClick={onShare}
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
      )}
      {onNewThread && (
        <button
          type="button"
          className="action-btn"
          aria-label="Start new thread"
          title="New thread"
          onClick={onNewThread}
        >
          <Plus size={16} weight="bold" />
        </button>
      )}
      {sources.length > 0 && onToggleSources && (
        <button
          type="button"
          className={`sources-count-btn${sourcesOpen ? ' active' : ''}`}
          onClick={onToggleSources}
          aria-expanded={sourcesOpen}
          title={sourcesOpen ? 'Hide detailed sources' : 'View all sources'}
        >
          <span className="favicon-stack sm" aria-hidden="true">
            {favicons(sources).map((u) => (
              <img
                key={u}
                src={faviconFor(u)}
                alt=""
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ))}
          </span>
          <span>{sources.length} sources</span>
        </button>
      )}
    </div>
  )
}

export default ActionBar
