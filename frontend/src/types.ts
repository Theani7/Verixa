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
