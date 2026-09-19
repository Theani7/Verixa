import { DEFAULT_PREFS, DEFAULT_PROFILE } from '../types'
import type { Prefs, Profile } from '../types'
import { PREFS_KEY, PROFILE_KEY } from '../types'

export function loadPrefs(raw: string | null): Prefs {
  try {
    if (!raw) return DEFAULT_PREFS
    const p = JSON.parse(raw) as Partial<Prefs>
    const numResults = p.numResults === 3 || p.numResults === 10 ? p.numResults : 5
    return { numResults, stream: p.stream !== false }
  } catch {
    return DEFAULT_PREFS
  }
}

export function loadProfile(raw: string | null): Profile {
  try {
    if (!raw) return DEFAULT_PROFILE
    const p = JSON.parse(raw) as Partial<Profile> & Record<string, unknown>
    const text = (key: keyof Profile, limit: number): string =>
      typeof p[key] === 'string' ? (p[key] as string).slice(0, limit) : ''
    return {
      name: text('name', 100),
      instructions: text('instructions', 2000),
      occupation: text('occupation', 120),
      company: text('company', 120),
      dob: /^\d{4}-\d{2}-\d{2}$/.test(text('dob', 10)) ? text('dob', 10) : '',
      gender: ['female', 'male', 'nonbinary', 'prefer_not_to_say'].includes(
        text('gender', 20).toLowerCase(),
      )
        ? text('gender', 20).toLowerCase()
        : '',
      shareLocation: p.shareLocation === true,
      location: text('location', 120),
      responseLength: (['short', 'long'] as const).includes(
        text('responseLength', 10).toLowerCase() as 'short' | 'long',
      )
        ? (text('responseLength', 10).toLowerCase() as 'short' | 'long')
        : 'default',
      responseFormat: (['lists', 'paragraph'] as const).includes(
        text('responseFormat', 10).toLowerCase() as 'lists' | 'paragraph',
      )
        ? (text('responseFormat', 10).toLowerCase() as 'lists' | 'paragraph')
        : 'default',
    }
  } catch {
    return DEFAULT_PROFILE
  }
}

export function persistPrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}

export function persistProfile(profile: Profile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  } catch {
    /* ignore */
  }
}
