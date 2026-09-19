import { useEffect, useRef, useState } from 'react'
import { API_URL, syncThread } from '../api'
import type { Session } from '../api'
import { normalizeCitations } from '../lib/citations'
import type { AskMode, Prefs, Profile, Source, Thread, Turn } from '../types'

import { errorMessage } from '../lib/storage'
import { isSource } from '../lib/normalize'


export type Phase = 'idle' | 'searching' | 'reading' | 'writing' | 'thinking' | 'researching' | 'done'

export type StreamEvent =
  | { type: 'status'; phase: Phase }
  | { type: 'mode'; mode: 'search' | 'chat' }
  | { type: 'progress'; label: string }
  | { type: 'rewrite'; query: string }
  | { type: 'related'; questions: string[] }
  | { type: 'sources'; sources: Source[] }
  | { type: 'token'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

export interface UseAskStreamArgs {
  session: Session | null
  incognito: boolean
  profile: Profile
  prefs: Prefs
  askMode: AskMode
  historyTurns: Turn[]
  onTurn: (turn: Turn) => void
}

export function useAskStream({
  session,
  incognito,
  profile,
  prefs,
  askMode,
  historyTurns,
  onTurn,
}: UseAskStreamArgs) {
  const [query, setQuery] = useState('')
  const [asked, setAsked] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<Source[]>([])
  const [error, setError] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [openSources, setOpenSources] = useState<string | null>(null)
  const [resolvedQuery, setResolvedQuery] = useState('')
  const [related, setRelated] = useState<string[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [steps, setSteps] = useState<string[]>([])
  const abortControllerRef = useRef<AbortController | null>(null)
  const onTurnRef = useRef(onTurn)
  onTurnRef.current = onTurn

  const loading =
    phase === 'searching' ||
    phase === 'reading' ||
    phase === 'writing' ||
    phase === 'thinking' ||
    phase === 'researching'

  useEffect(() => {
    if (copiedKey === null) return
    const t = setTimeout(() => setCopiedKey(null), 2000)
    return () => clearTimeout(t)
  }, [copiedKey])

  useEffect(() => {
    if (shareState === 'idle') return
    const t = setTimeout(() => setShareState('idle'), 2500)
    return () => clearTimeout(t)
  }, [shareState])

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [])

  function persistTurn(turn: Turn): void {
    onTurnRef.current(turn)
  }

  function finishTurn(
    q: string,
    text: string,
    srcs: Source[],
    mode: Turn['mode'],
    searchedQuery: string,
    durationMs: number,
    relatedQs: string[],
  ): void {
    const turn: Turn = {
      query: q,
      answer: normalizeCitations(text),
      sources: srcs,
      mode,
      searchedQuery,
      durationMs,
      related: relatedQs,
    }
    onTurnRef.current(turn)
    setAsked('')
    setAnswer('')
    setSources([])
    setRelated([])
    setSteps([])
    setPhase('done')
  }

  function stopAsk(): void {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    if (asked !== '' && answer !== '') {
      finishTurn(asked, answer, sources, askMode, resolvedQuery, 0, related)
    } else {
      setAsked('')
      setAnswer('')
      setSources([])
      setRelated([])
      setSteps([])
      setPhase('idle')
    }
  }

  function reset(): void {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setQuery('')
    setAsked('')
    setAnswer('')
    setSources([])
    setError('')
    setCopiedKey(null)
    setOpenSources(null)
    setResolvedQuery('')
    setRelated([])
    setSteps([])
    setShareState('idle')
    setPhase('idle')
  }

  async function runAsk(text?: string): Promise<void> {
    const q = (text ?? query).trim()
    if (!q || loading) return
    setPhase('searching')
    setError('')
    setAnswer('')
    setSources([])
    setAsked(q)
    setQuery('')
    setCopiedKey(null)
    setOpenSources(null)
    setResolvedQuery('')
    setRelated([])
    setSteps([])
    const history = historyTurns.slice(-4).map((t) => ({
      query: t.query,
      answer: t.answer.slice(0, 2000),
    }))
    let full = ''
    let seenSources: Source[] = []
    let seenRelated: string[] = []
    let mode: Turn['mode'] = askMode
    let standalone = q
    const started = Date.now()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    // Incognito: never send the auth token, so the request is anonymous
    // and the server cannot touch account data (memories, threads).
    if (session && !incognito) headers.Authorization = `Bearer ${session.token}`
    const payload = JSON.stringify({
      query: q,
      history,
      num_results: prefs.numResults,
      profile,
      mode: askMode,
      incognito,
    })

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      if (!prefs.stream) {
        const res = await fetch(`${API_URL}/api/ask`, {
          method: 'POST',
          headers,
          body: payload,
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`The answer engine returned status ${res.status}.`)
        const data = (await res.json()) as {
          answer?: unknown
          sources?: unknown
          mode?: unknown
          query?: unknown
          related?: unknown
        }
        full = normalizeCitations(typeof data.answer === 'string' ? data.answer : '')
        seenSources = Array.isArray(data.sources)
          ? data.sources.filter(isSource)
          : []
        if (data.mode === 'chat') mode = 'chat'
        else if (data.mode === 'deep') mode = 'deep'
        if (typeof data.query === 'string' && data.query.trim() !== '') {
          standalone = data.query
        }
        if (Array.isArray(data.related)) {
          seenRelated = data.related
            .filter((r): r is string => typeof r === 'string')
            .slice(0, 4)
          setRelated(seenRelated)
        }
        setAnswer(full)
        setSources(seenSources)
        finishTurn(q, full, seenSources, mode, standalone, Date.now() - started, seenRelated)
        return
      }
      const res = await fetch(`${API_URL}/api/ask/stream`, {
        method: 'POST',
        headers,
        body: payload,
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`The answer engine returned status ${res.status}.`)
      if (!res.body) throw new Error('Streaming is not supported in this browser.')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done || value === undefined) break
        buf += decoder.decode(value, { stream: true })
        let idx: number
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data: ')) continue
            const e = JSON.parse(line.slice(6)) as StreamEvent
            if (e.type === 'status') {
              setPhase(e.phase)
            } else if (e.type === 'mode') {
              if (e.mode === 'chat') mode = 'chat'
            } else if (e.type === 'progress') {
              setSteps((prev) => [...prev.slice(-9), e.label])
            } else if (e.type === 'rewrite') {
              standalone = e.query
              setResolvedQuery(e.query)
            } else if (e.type === 'sources') {
              seenSources = e.sources ?? []
              setSources(seenSources)
            } else if (e.type === 'token') {
              full += e.text
              setAnswer(full)
            } else if (e.type === 'related') {
              seenRelated = (e.questions ?? [])
                .filter((r): r is string => typeof r === 'string')
                .slice(0, 4)
              setRelated(seenRelated)
            } else if (e.type === 'done') {
              finishTurn(
                q,
                full,
                seenSources,
                mode,
                standalone,
                Date.now() - started,
                seenRelated,
              )
            } else if (e.type === 'error') {
              throw new Error(e.message)
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }
      setError(errorMessage(err))
      setPhase('done')
    } finally {
      abortControllerRef.current = null
    }
  }

  async function copyAnswer(text: string, key: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(normalizeCitations(text))
      setCopiedKey(key)
    } catch {
      setError('Copy is not available in this browser. Select the text manually.')
    }
  }

  function toggleSources(key: string): void {
    setOpenSources((prev) => (prev === key ? null : key))
  }

  function clearForOpen(): void {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setQuery('')
    setAsked('')
    setAnswer('')
    setSources([])
    setError('')
    setCopiedKey(null)
    setOpenSources(null)
    setResolvedQuery('')
    setRelated([])
    setSteps([])
    setPhase('done')
  }

  async function shareThread(thread: Thread | undefined): Promise<void> {
    if (!thread) return
    if (incognito) {
      setError('Sharing is off in incognito. Turn incognito off to share a thread.')
      setShareState('failed')
      return
    }
    try {
      await syncThread(thread, session?.token)
      await navigator.clipboard.writeText(`${window.location.origin}/t/${thread.id}`)
      setShareState('copied')
    } catch {
      setShareState('failed')
    }
  }

  const streaming = answer !== '' && phase !== 'done'
  const displayAnswer = normalizeCitations(answer)

  return {
    loading,
    streaming,
    displayAnswer,
    phase,
    answer,
    sources,
    related,
    error,
    asked,
    resolvedQuery,
    steps,
    copiedKey,
    openSources,
    shareState,
    query,
    abortControllerRef,
    runAsk,
    stopAsk,
    reset,
    clearForOpen,
    copyAnswer,
    toggleSources,
    shareThread,
    finishTurn,
    persistTurn,
    setQuery,
    setAsked,
    setAnswer,
    setSources,
    setError,
    setCopiedKey,
    setOpenSources,
    setResolvedQuery,
    setRelated,
    setSteps,
    setPhase,
    setShareState,
  }
}

export default useAskStream

