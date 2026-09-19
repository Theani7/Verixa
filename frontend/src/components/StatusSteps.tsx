import { SearchAnimation } from './SearchAnimation'
import { DeepThinkAnimation } from './DeepThinkAnimation'
import type { Phase } from '../hooks/useAskStream'
import type { AskMode, Source } from '../types'

export interface StatusStepsProps {
  phase: Phase
  sourceCount: number
  resolved: string
  steps: string[]
  sources?: Source[]
  mode?: AskMode
}

export function StatusSteps({
  phase,
  sourceCount,
  resolved,
  steps,
  sources = [],
  mode = 'search',
}: StatusStepsProps) {
  // Deep Research Mode Animation
  if (mode === 'deep' || phase === 'researching' || (phase === 'writing' && steps.length > 0)) {
    return (
      <DeepThinkAnimation
        steps={steps}
        headline={phase === 'writing' ? 'Synthesizing Dossier' : 'Deep Research Protocol'}
        sources={sources}
      />
    )
  }

  // Web Search Mode Animation
  return (
    <SearchAnimation
      phase={phase}
      resolvedQuery={resolved}
      sources={sources}
      sourceCount={sourceCount}
    />
  )
}

export default StatusSteps

