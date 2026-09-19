import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Brain, Cpu, Sparkle, UserCircle, X } from '@phosphor-icons/react'
import type { LLMConfig, Prefs, Profile, Session } from '../types'
import { AccountPane } from './settings/AccountPane'
import { PersonalizationPane } from './settings/PersonalizationPane'
import { MemoryPane } from './settings/MemoryPane'
import { ModelPane } from './settings/ModelPane'

export type Category = 'account' | 'model' | 'personalization' | 'memory'

export const CATEGORIES: Array<{ id: Category; label: string; icon: ReactNode }> = [
  { id: 'account', label: 'Account', icon: <UserCircle size={18} /> },
  { id: 'model', label: 'Model & Sources', icon: <Cpu size={18} /> },
  { id: 'personalization', label: 'Personalization', icon: <Sparkle size={18} /> },
  { id: 'memory', label: 'Memory', icon: <Brain size={18} /> },
]

export interface SettingsModalProps {
  session: Session | null
  profile: Profile
  onProfile: (profile: Profile) => void
  llmConfig: LLMConfig
  onLlmConfig: (config: LLMConfig) => void
  prefs?: Prefs
  onPrefs?: (prefs: Prefs) => void
  initialCategory?: Category
  onClose: () => void
  onSignOut: () => void
  onProfileSaved: (me: { full_name: string; username: string }) => void
  onOpenAuth: () => void
}

export function SettingsModal({
  session,
  profile,
  onProfile,
  llmConfig,
  onLlmConfig,
  prefs,
  onPrefs,
  initialCategory = 'account',
  onClose,
  onSignOut,
  onProfileSaved,
  onOpenAuth,
}: SettingsModalProps) {
  const [category, setCategory] = useState<Category>(initialCategory)

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
          <h2 id="settings-title" className="modal-title">
            Settings
          </h2>
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
                onProfileSaved={onProfileSaved}
                onOpenAuth={onOpenAuth}
              />
            )}
            {category === 'model' && (
              <ModelPane
                config={llmConfig}
                onChange={onLlmConfig}
                numResults={prefs?.numResults}
                onNumResultsChange={(n) => onPrefs?.({ ...prefs!, numResults: n })}
              />
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

export default SettingsModal
