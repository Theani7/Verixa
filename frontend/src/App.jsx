import { useState } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

function App() {
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function ask(e) {
    e.preventDefault()
    if (!query.trim() || loading) return
    setLoading(true)
    setError('')
    setAnswer('')
    setSources([])
    try {
      const res = await fetch(`${API_URL}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      if (!res.ok) throw new Error(`Backend error: ${res.status}`)
      const data = await res.json()
      setAnswer(data.answer ?? '')
      setSources(data.sources ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Seekora</h1>
      <p>Perplexity-style search powered by Exa + LangChain + Groq.</p>
      <form onSubmit={ask} style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask anything..."
          style={{ flex: 1, padding: '0.6rem' }}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Searching...' : 'Ask'}
        </button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {answer && (
        <section>
          <h2>Answer</h2>
          <p style={{ whiteSpace: 'pre-wrap' }}>{answer}</p>
        </section>
      )}
      {sources.length > 0 && (
        <section>
          <h2>Sources</h2>
          <ol>
            {sources.map((s) => (
              <li key={s.id ?? s.url}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  )
}

export default App
