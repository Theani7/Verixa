import { ArrowUpRight } from '@phosphor-icons/react'
import type { AskMode, Profile } from '../types'
import { Composer } from './Composer'

export interface SuggestionItem {
  topic: string
  text: string
}

export const SUGGESTION_POOL: SuggestionItem[] = [
  { topic: 'AI', text: 'How does retrieval augmented generation reduce hallucinations?' },
  { topic: 'Climate', text: 'What did the latest IPCC report say about methane emissions?' },
  { topic: 'Space', text: 'What is happening with the Artemis moon program?' },
  { topic: 'Health', text: 'How much sleep do adults actually need?' },
  { topic: 'Economy', text: 'Why do central banks raise interest rates to fight inflation?' },
  { topic: 'History', text: 'What caused the fall of the Roman Empire?' },
]

export function heroSuggestions(profile: Profile): SuggestionItem[] {
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

export interface HeroProps {
  profile: Profile
  query: string
  loading: boolean
  askMode: AskMode
  onChangeQuery: (value: string) => void
  onSubmit: () => void
  onMode: (mode: AskMode) => void
  onStop?: () => void
  onPickSuggestion: (text: string) => void
}

export function Hero({
  profile,
  query,
  loading,
  askMode,
  onChangeQuery,
  onSubmit,
  onMode,
  onStop,
  onPickSuggestion,
}: HeroProps) {
  const firstName = profile.name.trim().split(/\s+/)[0] ?? ''
  const suggestions = heroSuggestions(profile)

  return (
    <main className="hero">
      <h1 className="hero-title rise">
        {firstName !== ''
          ? `Hi, ${firstName}! How can I help you today?`
          : 'What do you want to know?'}
      </h1>
      <p className="hero-sub rise rise-1">
        Ask anything. Verixa searches the live web and writes an answer with sources you can check.
      </p>
      <form onSubmit={(e) => e.preventDefault()} className="rise rise-2">
        <Composer
          value={query}
          onChange={onChangeQuery}
          onSubmit={onSubmit}
          loading={loading}
          mode={askMode}
          onMode={onMode}
          onStop={loading ? onStop : undefined}
          placeholder="Ask anything..."
        />
      </form>
      <ul className="suggest-list rise rise-3">
        {suggestions.map((s) => (
          <li key={s.text}>
            <button
              type="button"
              className="suggest-item"
              onClick={() => onPickSuggestion(s.text)}
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
  )
}

export default Hero
