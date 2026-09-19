import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { addMemory, deleteMemory, fetchMe, listMemories, updateProfile } from '../api'
import type { Memory, Session } from '../types'

export function useMemories(session: Session | null) {
  const [memories, setMemories] = useState<Memory[]>([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [memEnabled, setMemEnabled] = useState(true)
  const [memAuto, setMemAuto] = useState(true)

  const token = session?.token ?? ''

  useEffect(() => {
    if (!token) return
    Promise.all([listMemories(token), fetchMe(token)])
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
  }, [token])

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
    if (content === '' || busy || !token) return
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
    if (!token) return
    setError('')
    try {
      await deleteMemory(token, id)
      setMemories((prev) => prev.filter((m) => m.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete memory.')
    }
  }

  return {
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
  }
}
