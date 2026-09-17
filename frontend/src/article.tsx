import type { Source } from './types'
import { hostnameOf } from './markdown'

export function SourceList({ prefix, sources }: { prefix: string; sources: Source[] }) {
  return (
    <ol className="sources-list" id={`${prefix}sources-list`}>
      {sources.map((s, si) => (
        <li
          key={s.id ?? s.url}
          id={`${prefix}source-${s.id}`}
          className="source-card rise"
          style={{ animationDelay: `${Math.min(si, 5) * 60}ms` }}
        >
          <span className="source-num">{s.id}</span>
          <div className="source-meta">
            <a
              className="source-link"
              href={s.url}
              target="_blank"
              rel="noreferrer"
            >
              {s.title}
            </a>
            {s.excerpt && (
              <p className="source-excerpt">{s.excerpt}</p>
            )}
            <span className="source-host">
              <img
                src={`https://www.google.com/s2/favicons?domain=${hostnameOf(s.url)}&sz=64`}
                alt=""
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
              {hostnameOf(s.url)}
            </span>
          </div>
        </li>
      ))}
    </ol>
  )
}
