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
  occupation: string
  company: string
  dob: string
  gender: string
  shareLocation: boolean
  location: string
  responseLength: 'short' | 'default' | 'long'
  responseFormat: 'lists' | 'default' | 'paragraph'
}

export const DEFAULT_PREFS: Prefs = { numResults: 5, stream: true }
export const DEFAULT_PROFILE: Profile = {
  name: '',
  instructions: '',
  occupation: '',
  company: '',
  dob: '',
  gender: '',
  shareLocation: false,
  location: '',
  responseLength: 'default',
  responseFormat: 'default',
}
export const PREFS_KEY = 'verixa.prefs.v1'
export const PROFILE_KEY = 'verixa.profile.v1'
