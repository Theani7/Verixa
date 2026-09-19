import { useCallback, useEffect, useRef, useState } from 'react'
import type { Thread, Turn } from '../types'
import { syncThread } from '../api'
import { LEGACY_STORAGE_KEY, MAX_THREADS, STORAGE_KEY, newId } from '../lib/storage'
import { normalizeThread } from '../lib/normalize'

export function loadThreads(): Thread[] {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((x) => {
      const t = normalizeThread(x)
      return t ? [t] : []
    })
  } catch {
    return []
  }
}

export function saveThreads(threads: Thread[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(threads.slice(0, MAX_THREADS)))
  } catch {
    /* private mode or quota: history stays in memory only */
  }
}

export function groupThreads(all: Thread[], filter: string): ThreadGroup[] {
  const q = filter.trim().toLowerCase()
  const list =
    q === ''
      ? all
      : all.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.turns.some((turn) => turn.query.toLowerCase().includes(q)),
        )
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const startMs = start.getTime()
  const day = 24 * 60 * 60 * 1000
  const groups: ThreadGroup[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 days', items: [] },
    { label: 'Older', items: [] },
  ]
  for (const t of list) {
    if (t.ts >= startMs) groups[0].items.push(t)
    else if (t.ts >= startMs - day) groups[1].items.push(t)
    else if (t.ts >= startMs - 7 * day) groups[2].items.push(t)
    else groups[3].items.push(t)
  }
  return groups.filter((g) => g.items.length > 0)
}

export interface ThreadGroup {
  label: string
  items: Thread[]
}

export function useThreadStore(incognito: boolean, token: string | null) {
  const [threads, setThreads] = useState<Thread[]>(loadThreads)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const incognitoThreadIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (incognito) return
    saveThreads(threads)
  }, [threads, incognito])

  const persistTurn = useCallback(
    (turn: Turn): void => {
      if (activeId) {
        const next = threads.map((t) =>
          t.id === activeId ? { ...t, turns: [...t.turns, turn], ts: Date.now() } : t,
        )
        setThreads(next)
        const updated = next.find((t) => t.id === activeId)
        if (updated && !incognito) syncThread(updated, token).catch(() => undefined)
      } else {
        const thread: Thread = {
          id: newId(),
          title: turn.query.length > 60 ? `${turn.query.slice(0, 60)}...` : turn.query,
          turns: [turn],
          ts: Date.now(),
        }
        setActiveId(thread.id)
        setThreads((prev) => [thread, ...prev])
        if (incognito) {
          incognitoThreadIds.current.add(thread.id)
        } else {
          syncThread(thread, token).catch(() => undefined)
        }
      }
    },
    [threads, activeId, incognito, token],
  )

  const dropIncognitoThreads = useCallback((): void => {
    const ids = incognitoThreadIds.current
    setThreads((prev) => prev.filter((t) => !ids.has(t.id)))
    setActiveId((prev) => (prev && ids.has(prev) ? null : prev))
    incognitoThreadIds.current = new Set()
  }, [])

  const toggleIncognito = useCallback(
    (next: boolean, onEnter: () => void, onLeave: () => void): void => {
      if (next) {
        onEnter()
      } else {
        dropIncognitoThreads()
        onLeave()
      }
    },
    [dropIncognitoThreads],
  )

  return {
    threads,
    setThreads,
    activeId,
    setActiveId,
    collapsed,
    setCollapsed,
    persistTurn,
    dropIncognitoThreads,
    toggleIncognito,
    incognitoThreadIds,
  }
}
