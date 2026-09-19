import type { Thread, Turn } from '../types'
import type { Source } from '../types'
import type { Session } from '../api'

export function isSource(value: unknown): value is Source {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Record<string, unknown>
  return (
    typeof s.id === 'number' &&
    typeof s.title === 'string' &&
    typeof s.url === 'string'
  )
}

export function collectSources(turns: Turn[], currentSources: Source[] = []): Source[] {
  const combined = [...turns.flatMap((t) => t.sources), ...currentSources]
  const map = new Map<string, Source>()
  for (const s of combined) {
    const k = s.url || String(s.id)
    if (!map.has(k)) {
      map.set(k, s)
    }
  }
  return Array.from(map.values())
}


export function normalizeThread(value: unknown): Thread | null {
  if (typeof value !== 'object' || value === null) return null
  const t = value as Record<string, unknown>
  if (typeof t.id !== 'string' || typeof t.title !== 'string') return null
  if (Array.isArray(t.turns)) {
    const turns: Turn[] = t.turns
      .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
      .map((x) => {
        const sources = Array.isArray(x.sources) ? x.sources.filter(isSource) : []
        return {
          query: typeof x.query === 'string' ? x.query : '',
          answer: typeof x.answer === 'string' ? x.answer : '',
          sources,
          mode: x.mode === 'chat' ? ('chat' as const) : x.mode === 'deep' ? ('deep' as const) : ('search' as const),
          searchedQuery: typeof x.searchedQuery === 'string' ? x.searchedQuery : '',
          durationMs: typeof x.durationMs === 'number' ? x.durationMs : 0,
          related: Array.isArray(x.related)
            ? x.related.filter((r): r is string => typeof r === 'string').slice(0, 4)
            : [],
        }
      })
      .filter((x) => x.query !== '')
    if (turns.length === 0) return null
    return {
      id: t.id,
      title: t.title,
      turns,
      ts: typeof t.ts === 'number' ? t.ts : Date.now(),
    }
  }
  /* Legacy single-turn shape: wrap it so old history keeps working. */
  if (typeof t.query === 'string' && typeof t.answer === 'string') {
    return {
      id: t.id,
      title: t.title,
      turns: [
        {
          query: t.query,
          answer: t.answer,
          sources: Array.isArray(t.sources) ? t.sources.filter(isSource) : [],
          mode: 'search',
          searchedQuery: '',
          durationMs: 0,
          related: [],
        },
      ],
      ts: typeof t.ts === 'number' ? t.ts : Date.now(),
    }
  }
  return null
}

export function loadSession(raw: string | null): Session | null {
  try {
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).token !== 'string' ||
      typeof (parsed as Record<string, unknown>).email !== 'string'
    ) {
      return null
    }
    const p = parsed as Record<string, unknown>
    return {
      token: p.token as string,
      id: typeof p.id === 'string' ? p.id : '',
      email: p.email as string,
      full_name: typeof p.full_name === 'string' ? p.full_name : '',
      username: typeof p.username === 'string' ? p.username : '',
    }
  } catch {
    return null
  }
}
