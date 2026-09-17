import type { ReactNode } from 'react'

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/* Inline Markdown: bold, code spans, links, and [n] citation chips. */
function renderInline(text: string, keyPrefix: string, citePrefix = ''): ReactNode[] {
  const parts = text.split(
    /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:[^)\s]+\)|\[\d+\])/,
  )
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`
    const bold = part.match(/^\*\*([^*]+)\*\*$/)
    if (bold) return <strong key={key}>{bold[1]}</strong>
    const code = part.match(/^`([^`]+)`$/)
    if (code) return <code key={key}>{code[1]}</code>
    const link = part.match(/^\[([^\]]+)\]\((https?:[^)\s]+)\)$/)
    if (link)
      return (
        <a
          key={key}
          className="md-link"
          href={link[2]}
          target="_blank"
          rel="noreferrer"
        >
          {link[1]}
        </a>
      )
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

function splitRow(line: string): string[] {
  let cells = line.trim().split('|')
  if (cells.length > 0 && cells[0].trim() === '') cells = cells.slice(1)
  if (cells.length > 0 && cells[cells.length - 1].trim() === '') {
    cells = cells.slice(0, -1)
  }
  return cells.map((c) => c.trim())
}

function isDelimiter(line: string): boolean {
  const trimmed = line.trim()
  return (
    trimmed.includes('|') &&
    trimmed.includes('-') &&
    /^[\s:|-]+$/.test(trimmed)
  )
}

/* Block Markdown: fences, tables, headings, quotes, rules, lists,
   paragraphs. Built as elements, never injected HTML, so source text
   cannot break out. */
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

    let li = 0
    while (li < lines.length) {
      const line = lines[li]
      const h3 = line.match(/^###\s+(.*)/)
      const h2 = line.match(/^##\s+(.*)/)
      const ul = line.match(/^[-*]\s+(.*)/)
      const ol = line.match(/^\d+[.)]\s+(.*)/)
      const quote = line.match(/^>\s?(.*)/)
      const hr = line.match(/^(---|\*\*\*|___)\s*$/)

      if (
        line.trim().startsWith('|') &&
        li + 1 < lines.length &&
        isDelimiter(lines[li + 1])
      ) {
        flushList()
        const headers = splitRow(line)
        const rows: string[][] = []
        li += 2
        while (li < lines.length && lines[li].trim().startsWith('|')) {
          rows.push(splitRow(lines[li]))
          li += 1
        }
        const tableKey = key++
        nodes.push(
          <div className="table-wrap" key={`t-${tableKey}`}>
            <table>
              <thead>
                <tr>
                  {headers.map((h, hi) => (
                    <th key={hi} scope="col">
                      {renderInline(h, `t-${tableKey}-h${hi}`, citePrefix)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci}>
                        {renderInline(cell, `t-${tableKey}-r${ri}c${ci}`, citePrefix)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        )
      } else if (h3 || h2) {
        flushList()
        li += 1
        const Tag = h3 ? 'h3' : 'h4'
        const content = (h3 ?? h2)?.[1] ?? ''
        const headKey = key++
        nodes.push(
          <Tag key={`h-${headKey}`}>{renderInline(content, `h-${headKey}`, citePrefix)}</Tag>,
        )
      } else if (quote) {
        flushList()
        const quoted: string[] = []
        while (li < lines.length) {
          const q = lines[li].match(/^>\s?(.*)/)
          if (!q) break
          quoted.push(q[1])
          li += 1
        }
        const quoteKey = key++
        nodes.push(
          <blockquote key={`q-${quoteKey}`}>
            {quoted
              .join('\n')
              .split('\n')
              .filter((p) => p.trim() !== '')
              .map((p, pi) => (
                <p key={pi}>{renderInline(p, `q-${quoteKey}-${pi}`, citePrefix)}</p>
              ))}
          </blockquote>,
        )
      } else if (hr) {
        flushList()
        li += 1
        nodes.push(<hr key={`r-${key++}`} className="md-hr" />)
      } else if (ul || ol) {
        li += 1
        const ordered = Boolean(ol)
        const item = (ul ?? ol)?.[1] ?? ''
        if (!list || list.ordered !== ordered) {
          flushList()
          list = { ordered, items: [] }
        }
        list.items.push(item)
      } else if (line.trim() === '') {
        flushList()
        li += 1
      } else {
        flushList()
        li += 1
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
