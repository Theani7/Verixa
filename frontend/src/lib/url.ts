export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function faviconFor(url: string): string {
  return `https://www.google.com/s2/favicons?domain=${hostnameOf(url)}&sz=64`
}

export function shortHost(url: string): string {
  return hostnameOf(url).split('.')[0]
}
