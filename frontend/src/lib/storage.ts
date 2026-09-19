import type { AskMode } from '../types'
import { MODE_KEY } from '../types'

export const STORAGE_KEY = 'verixa.threads.v1'
export const AUTH_KEY = 'verixa.auth.v1'
export const LEGACY_STORAGE_KEY = 'seekora.threads.v1'
export const MAX_THREADS = 30
export const SIDEBAR_KEY = 'verixa.sidebar.v1'
export const INCOGNITO_KEY = 'verixa.incognito.v1'

export function loadAskMode(): AskMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'deep' ? 'deep' : 'search'
  } catch {
    return 'search'
  }
}

export function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'collapsed'
  } catch {
    return false
  }
}

export function loadIncognito(): boolean {
  try {
    return sessionStorage.getItem(INCOGNITO_KEY) === 'on'
  } catch {
    return false
  }
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  return 'Something went wrong while asking.'
}

export function persistAskMode(mode: AskMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    /* ignore */
  }
}

export function persistCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? 'collapsed' : 'open')
  } catch {
    /* ignore */
  }
}

export function persistIncognito(incognito: boolean): void {
  try {
    if (incognito) {
      sessionStorage.setItem(INCOGNITO_KEY, 'on')
    } else {
      sessionStorage.removeItem(INCOGNITO_KEY)
    }
  } catch {
    /* ignore */
  }
}

export function formatSecs(ms: number): string {
  return `${Math.max(1, Math.round(ms / 1000))}s`
}

