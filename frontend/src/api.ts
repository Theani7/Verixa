import type { Thread } from './types'

export const API_URL: string =
  import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${API_URL}${path}`, init)
  if (!res.ok) throw new Error(`Request failed with status ${res.status}.`)
  return res.json() as Promise<unknown>
}

function isThread(value: unknown): value is Thread {
  if (typeof value !== 'object' || value === null) return false
  const t = value as Record<string, unknown>
  return (
    typeof t.id === 'string' &&
    typeof t.title === 'string' &&
    Array.isArray(t.turns)
  )
}

export async function syncThread(thread: Thread): Promise<void> {
  await request(`/api/threads/${thread.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: thread.title, turns: thread.turns }),
  })
}

export async function fetchSharedThread(id: string): Promise<Thread> {
  const data = await request(`/api/threads/${id}`)
  if (!isThread(data)) throw new Error('Shared thread is invalid.')
  return data
}

export async function deleteSharedThread(id: string): Promise<void> {
  try {
    await request(`/api/threads/${id}`, { method: 'DELETE' })
  } catch {
    /* Already gone server-side: local delete still stands. */
  }
}
