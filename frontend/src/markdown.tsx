import type { ReactNode } from 'react'

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/* Inline Markdown: bold, code spans, and [n] citation chips. */
function renderInline(text: string, keyPrefix: string, citePrefix = ''): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d+\])/)
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`
    const bold = part.match(/^\*\*([^*]+)\*\*$/)
    if (bold) return <strong key={key}>{bold[1]}</strong>
    const code = part.match(/^`([^`]+)`$/)
    if (code) return <code key={key}>{code[1]}</code>
    const cite = part.match(/^\[(\d+)\]$/)
    if (cite)
      return (
        <a key={key} className="cite" href={`#${citePrefix}source-${cite[1]}`}>
          {cite[1]}
        </a>
      )
    return <span key={key}>{part}</span>
  })
}

/* Block Markdown: fences, headings, lists, paragraphs. Built as elements,
   never injected HTML, so source text cannot break out. */
export function renderRich(text: string, citePrefix = ''): ReactNode[] {
  const nodes: ReactNode[] = []
  const fenceSplit = text.split(/```/)
  let key = 0

  fenceSplit.forEach((chunk, fi) => {
    if (fi % 2 === 1) {
      nodes.push(<pre key={`f-${key++}`}><code>{chunk.replace(/^\w+\n/, '')}</code></pre>)
      return
    }
    const lines = chunk.split('\n')
    let list: { ordered: boolean; items: string[] } | null = null

    function flushList(): void {
      if (!list) return
      const Tag = list.ordered ? 'ol' : 'ul'
      const items = list.items
      const listKey = key++
      nodes.push(
        <Tag key={`l-${listKey}`}>
          {items.map((item, ii) => (
            <li key={ii}>{renderInline(item, `l-${listKey}-i${ii}`, citePrefix)}</li>
          ))}
        </Tag>,
      )
      list = null
    }

    for (const line of lines) {
      const h3 = line.match(/^###\s+(.*)/)
      const h2 = line.match(/^##\s+(.*)/)
      const ul = line.match(/^[-*]\s+(.*)/)
      const ol = line.match(/^\d+[.)]\s+(.*)/)
      if (h3 || h2) {
        flushList()
        const Tag = h3 ? 'h3' : 'h4'
        const content = (h3 ?? h2)?.[1] ?? ''
        const headKey = key++
        nodes.push(
          <Tag key={`h-${headKey}`}>{renderInline(content, `h-${headKey}`, citePrefix)}</Tag>,
        )
      } else if (ul || ol) {
        const ordered = Boolean(ol)
        const item = (ul ?? ol)?.[1] ?? ''
        if (!list || list.ordered !== ordered) {
          flushList()
          list = { ordered, items: [] }
        }
        list.items.push(item)
      } else if (line.trim() === '') {
        flushList()
      } else {
        flushList()
        const paraKey = key++
        nodes.push(
          <p key={`p-${paraKey}`}>{renderInline(line, `p-${paraKey}`, citePrefix)}</p>,
        )
      }
    }
    flushList()
  })

  return nodes
}

