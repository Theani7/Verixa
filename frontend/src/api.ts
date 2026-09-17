import type { Thread } from './types'

export const API_URL: string =
  import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export interface Session {
  token: string
  id: string
  email: string
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${API_URL}${path}`, init)
  if (!res.ok) {
    let detail = `Request failed with status ${res.status}.`
    try {
      const body = (await res.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      /* keep default */
    }
    throw new Error(detail)
  }
  return res.json() as Promise<unknown>
}

function authHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
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

export async function syncThread(thread: Thread, token?: string | null): Promise<void> {
  await request(`/api/threads/${thread.id}`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({ title: thread.title, turns: thread.turns }),
  })
}

export async function fetchSharedThread(id: string): Promise<Thread> {
  const data = await request(`/api/threads/${id}`)
  if (!isThread(data)) throw new Error('Shared thread is invalid.')
  return data
}

export async function deleteSharedThread(id: string, token?: string | null): Promise<void> {
  try {
    await request(`/api/threads/${id}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    })
  } catch {
    /* Already gone server-side: local delete still stands. */
  }
}

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Record<string, unknown>
  return (
    typeof s.token === 'string' &&
    typeof s.id === 'string' &&
    typeof s.email === 'string'
  )
}

export async function signup(email: string, password: string): Promise<Session> {
  const data = await request('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!isSession(data)) throw new Error('Sign up returned an invalid response.')
  return data
}

export async function login(email: string, password: string): Promise<Session> {
  const data = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!isSession(data)) throw new Error('Sign in returned an invalid response.')
  return data
}

export async function fetchMe(token: string): Promise<{ id: string; email: string }> {
  const data = await request('/api/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (
    typeof data !== 'object' ||
    data === null ||
    typeof (data as Record<string, unknown>).id !== 'string' ||
    typeof (data as Record<string, unknown>).email !== 'string'
  ) {
    throw new Error('Session is invalid.')
  }
  return data as { id: string; email: string }
}
