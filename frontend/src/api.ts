import type { Memory, Me, Session, Thread } from './types'

export type { Memory, Me, Session }

export const API_URL: string =
  import.meta.env.VITE_API_URL ?? 'http://localhost:8000'


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
    typeof s.email === 'string' &&
    (s.full_name === undefined || typeof s.full_name === 'string') &&
    (s.username === undefined || typeof s.username === 'string')
  )
}

function withProfileDefaults(s: Session): Session {
  const r = s as unknown as Record<string, unknown>
  return {
    token: s.token,
    id: s.id,
    email: s.email,
    full_name: typeof r.full_name === 'string' ? r.full_name : '',
    username: typeof r.username === 'string' ? r.username : '',
  }
}

export async function signup(email: string, password: string): Promise<Session> {
  const data = await request('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!isSession(data)) throw new Error('Sign up returned an invalid response.')
  return withProfileDefaults(data)
}

export async function login(email: string, password: string): Promise<Session> {
  const data = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!isSession(data)) throw new Error('Sign in returned an invalid response.')
  return withProfileDefaults(data)
}

export async function fetchMe(token: string): Promise<Me> {
  const data = await request('/api/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (
    typeof data !== 'object' ||
    data === null ||
    typeof (data as Record<string, unknown>).id !== 'string' ||
    typeof (data as Record<string, unknown>).email !== 'string' ||
    typeof (data as Record<string, unknown>).full_name !== 'string' ||
    typeof (data as Record<string, unknown>).username !== 'string' ||
    typeof (data as Record<string, unknown>).created_at !== 'string' ||
    typeof (data as Record<string, unknown>).memory_enabled !== 'boolean' ||
    typeof (data as Record<string, unknown>).memory_auto !== 'boolean'
  ) {
    throw new Error('Session is invalid.')
  }
  return data as Me
}

export async function updateProfile(
  token: string,
  profile: {
    full_name?: string
    username?: string
    memory_enabled?: boolean
    memory_auto?: boolean
  },
): Promise<Me> {
  const data = await request('/api/me', {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(profile),
  })
  if (
    typeof data !== 'object' ||
    data === null ||
    typeof (data as Record<string, unknown>).full_name !== 'string' ||
    typeof (data as Record<string, unknown>).username !== 'string'
  ) {
    throw new Error('Profile update returned an invalid response.')
  }
  return data as Me
}

export async function changePassword(
  token: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await request('/api/auth/password', {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })
}

export async function deleteAccount(token: string): Promise<void> {
  await request('/api/me', {
    method: 'DELETE',
    headers: authHeaders(token),
  })
}

function isMemory(value: unknown): value is Memory {
  if (typeof value !== 'object' || value === null) return false
  const m = value as Record<string, unknown>
  return (
    typeof m.id === 'string' &&
    typeof m.content === 'string' &&
    typeof m.created_at === 'string'
  )
}

export async function listMemories(token: string): Promise<Memory[]> {
  const data = (await request('/api/memories', {
    headers: authHeaders(token),
  })) as { memories?: unknown }
  if (!Array.isArray(data.memories)) throw new Error('Invalid memories response.')
  return data.memories.filter(isMemory)
}

export async function addMemory(token: string, content: string): Promise<Memory> {
  const data = await request('/api/memories', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ content }),
  })
  if (!isMemory(data)) throw new Error('Invalid memory response.')
  return data
}

export async function deleteMemory(token: string, id: string): Promise<void> {
  await request(`/api/memories/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
}
