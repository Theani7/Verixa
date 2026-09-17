import { cloneElement, isValidElement } from 'react'
import type { ReactNode } from 'react'
import type { Source } from './types'
import CodeBlock from './codeblock'

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

/* Normalizes citations from models or streams:
   - Converts native brackets 【1】 to [1]
   - Groups consecutive citations [1] [2] -> [1][2]
   - Removes floating space before punctuation: [1] . -> [1].
*/
export function normalizeCitations(text: string): string {
  let cleaned = text
    .replace(/【(\d+)(?:[†‡][^】]*)?】/g, '[$1]')
    .replace(/【\d+(?:[†‡][^】]*)?$/, '')
  // Remove space between adjacent citation markers
  cleaned = cleaned.replace(/(\[\d+\])\s+(?=\[\d+\])/g, '$1')
  // Remove space before punctuation immediately following citations
  cleaned = cleaned.replace(/(\[\d+\])\s+([.,;:!?])/g, '$1$2')
  return cleaned
}

/* Inline Markdown: bold, italic, bold-italic, code spans, links, and citation chips. */
function renderInline(
  text: string,
  keyPrefix: string,
  _citePrefix = '',
  sources: Source[] = [],
): ReactNode[] {
  const parts = text.split(
    /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\(https?:[^)\s]+\)|\[\d+\])/,
  )
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`
    const boldItalic = part.match(/^\*\*\*([^*]+)\*\*\*$/)
    if (boldItalic)
      return (
        <strong key={key}>
          <em>{boldItalic[1]}</em>
        </strong>
      )
    const bold = part.match(/^\*\*([^*]+)\*\*$/)
    if (bold) return <strong key={key}>{bold[1]}</strong>
    const italicAst = part.match(/^\*([^*]+)\*$/)
    if (italicAst) return <em key={key}>{italicAst[1]}</em>
    const italicUnd = part.match(/^_([^_]+)_$/)
    if (italicUnd) return <em key={key}>{italicUnd[1]}</em>
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
    if (cite) {
      const src = sources.find((s) => s.id === Number(cite[1]))
      if (!src) {
        return (
          <span key={key} className="cite">
            {cite[1]}
          </span>
        )
      }
      return (
        <a
          key={key}
          className="cite-rich"
          href={src.url}
          target="_blank"
          rel="noreferrer"
          title={src.title || src.url}
        >
          <img
            src={faviconFor(src.url)}
            alt=""
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
          <span>{shortHost(src.url)}</span>
        </a>
      )
    }
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

interface RawListItem {
  indent: number
  ordered: boolean
  text: string
}

interface ListItemNode {
  ordered: boolean
  text: string
  children: ListItemNode[]
}

function buildListTree(raw: RawListItem[]): ListItemNode[] {
  if (raw.length === 0) return []
  const root: ListItemNode[] = []
  const stack: Array<{ node: ListItemNode; indent: number }> = []

  for (const item of raw) {
    const node: ListItemNode = {
      ordered: item.ordered,
      text: item.text,
      children: [],
    }

    while (stack.length > 0 && stack[stack.length - 1].indent >= item.indent) {
      stack.pop()
    }

    if (stack.length === 0) {
      root.push(node)
    } else {
      stack[stack.length - 1].node.children.push(node)
    }

    stack.push({ node, indent: item.indent })
  }

  return root
}

function renderListNodes(
  tree: ListItemNode[],
  prefix: string,
  citePrefix: string,
  sources: Source[],
): ReactNode {
  if (tree.length === 0) return null
  const Tag = tree[0].ordered ? 'ol' : 'ul'
  return (
    <Tag key={prefix}>
      {tree.map((node, i) => {
        const itemKey = `${prefix}-i${i}`
        return (
          <li key={itemKey}>
            {renderInline(node.text, itemKey, citePrefix, sources)}
            {node.children.length > 0 &&
              renderListNodes(node.children, `${itemKey}-sub`, citePrefix, sources)}
          </li>
        )
      })}
    </Tag>
  )
}

/* Block Markdown: fences, tables, headings (h1-h4), quotes, rules, lists (with nested items),
   and paragraphs. Built as React elements. */
export function renderRich(
  text: string,
  citePrefix = '',
  sources: Source[] = [],
  streaming = false,
): ReactNode[] {
  const nodes: ReactNode[] = []
  const normalized = normalizeCitations(text)
  const fenceSplit = normalized.split(/```/)
  let key = 0

  fenceSplit.forEach((chunk, fi) => {
    if (fi % 2 === 1) {
      const cut = chunk.indexOf('\n')
      const language = cut === -1 ? '' : chunk.slice(0, cut)
      const code = (cut === -1 ? chunk : chunk.slice(cut + 1)).replace(/\n$/, '')
      nodes.push(<CodeBlock key={`f-${key++}`} language={language} code={code} />)
      return
    }
    const lines = chunk.split('\n')
    let rawList: RawListItem[] | null = null

    function flushList(): void {
      if (!rawList || rawList.length === 0) {
        rawList = null
        return
      }
      const tree = buildListTree(rawList)
      const listKey = key++
      nodes.push(renderListNodes(tree, `l-${listKey}`, citePrefix, sources))
      rawList = null
    }

    let li = 0
    while (li < lines.length) {
      const line = lines[li]
      const h4 = line.match(/^####\s+(.*)/)
      const h3 = line.match(/^###\s+(.*)/)
      const h2 = line.match(/^##\s+(.*)/)
      const h1 = line.match(/^#\s+(.*)/)
      const listMatch = line.match(/^(\s*)([-*•–—]|\d+[.)])\s+(.*)/)
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
                      {renderInline(h, `t-${tableKey}-h${hi}`, citePrefix, sources)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci}>
                        {renderInline(cell, `t-${tableKey}-r${ri}c${ci}`, citePrefix, sources)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        )
      } else if (h4) {
        flushList()
        li += 1
        const headKey = key++
        nodes.push(
          <h5 key={`h-${headKey}`}>{renderInline(h4[1], `h-${headKey}`, citePrefix, sources)}</h5>,
        )
      } else if (h3) {
        flushList()
        li += 1
        const headKey = key++
        nodes.push(
          <h4 key={`h-${headKey}`}>{renderInline(h3[1], `h-${headKey}`, citePrefix, sources)}</h4>,
        )
      } else if (h2) {
        flushList()
        li += 1
        const headKey = key++
        nodes.push(
          <h3 key={`h-${headKey}`}>{renderInline(h2[1], `h-${headKey}`, citePrefix, sources)}</h3>,
        )
      } else if (h1) {
        flushList()
        li += 1
        const headKey = key++
        nodes.push(
          <h2 key={`h-${headKey}`}>{renderInline(h1[1], `h-${headKey}`, citePrefix, sources)}</h2>,
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
                <p key={pi}>{renderInline(p, `q-${quoteKey}-${pi}`, citePrefix, sources)}</p>
              ))}
          </blockquote>,
        )
      } else if (hr) {
        flushList()
        li += 1
        nodes.push(<hr key={`r-${key++}`} className="md-hr" />)
      } else if (listMatch) {
        li += 1
        const indent = listMatch[1].replace(/\t/g, '  ').length
        const marker = listMatch[2]
        const itemText = listMatch[3]
        const ordered = /^\d+[.)]/.test(marker)
        if (!rawList) rawList = []
        rawList.push({ indent, ordered, text: itemText })
      } else if (rawList && rawList.length > 0 && /^\s{2,}\S/.test(line)) {
        // Indented continuation of list item
        rawList[rawList.length - 1].text += ` ${line.trim()}`
        li += 1
      } else if (line.trim() === '') {
        flushList()
        li += 1
      } else {
        flushList()
        li += 1
        const paraKey = key++
        nodes.push(
          <p key={`p-${paraKey}`}>{renderInline(line, `p-${paraKey}`, citePrefix, sources)}</p>,
        )
      }
    }
    flushList()
  })

  if (streaming) {
    if (nodes.length > 0) {
      const lastIndex = nodes.length - 1
      const lastNode = nodes[lastIndex]
      if (isValidElement<{ children?: ReactNode }>(lastNode)) {
        const children = lastNode.props.children
        const newChildren = Array.isArray(children)
          ? [...children, <span key="stream-caret" className="stream-caret" aria-hidden="true" />]
          : [children, <span key="stream-caret" className="stream-caret" aria-hidden="true" />]
        nodes[lastIndex] = cloneElement(lastNode, {}, newChildren)
      } else {
        nodes.push(<span key="stream-caret" className="stream-caret" aria-hidden="true" />)
      }
    } else {
      nodes.push(<span key="stream-caret" className="stream-caret" aria-hidden="true" />)
    }
  }

  return nodes
}
