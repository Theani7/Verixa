export interface Source {
  id: number
  title: string
  url: string
  excerpt?: string
}

export interface Turn {
  query: string
  answer: string
  sources: Source[]
}

export interface Thread {
  id: string
  title: string
  turns: Turn[]
  ts: number
}

export interface Prefs {
  numResults: number
  stream: boolean
}

export interface Profile {
  name: string
  instructions: string
}

export const DEFAULT_PREFS: Prefs = { numResults: 5, stream: true }
export const DEFAULT_PROFILE: Profile = { name: '', instructions: '' }
export const PREFS_KEY = 'verixa.prefs.v1'
export const PROFILE_KEY = 'verixa.profile.v1'
