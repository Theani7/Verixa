# Verixa

A Perplexity-style answer engine. Ask anything: Verixa searches the live web
with [Exa](https://exa.ai), synthesizes a cited answer with LangChain + Groq,
and streams it token by token into a dark, minimal React UI.

## Features

- Live web retrieval via the Exa `/search` endpoint (query + highlights)
- Cited answers synthesized by Groq through LangChain
- Token streaming over SSE with search progress steps
  (searching, reading sources, writing)
- Numbered citation chips linked to collapsible source cards
- Thread sidebar with history persisted in the browser
- Markdown answers, copy button, follow-up composer docked at the bottom

## Stack

- Backend: FastAPI, LangChain, `langchain-groq`, `exa-py`,
  SQLAlchemy, Postgres with pgvector
- Frontend: React 19, Vite, Bun, Phosphor icons, native CSS (no UI framework)

## Prerequisites

- Python 3.12+
- [Bun](https://bun.sh) 1.2+ (frontend runtime and package manager)
- Postgres 16+ with pgvector (local Homebrew install works:
  `brew install postgresql@18 pgvector`, then create the `verixa`
  database and role)
- An [Exa API key](https://exa.ai) and a
  [Groq API key](https://console.groq.com)

## Setup

```bash
# Backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then fill in EXA_API_KEY and GROQ_API_KEY
```

`.env` is git-ignored and never committed.

## Run

```bash
# Backend (http://localhost:8000)
source .venv/bin/activate
uvicorn backend.main:app --reload --port 8000

# Frontend (http://localhost:5173) — new terminal
cd frontend && bun install && bun run dev
```

API docs are served at http://localhost:8000/docs while the backend runs.

## API

| Method | Path             | Description                                  |
| ------ | ---------------- | -------------------------------------------- |
| GET    | `/api/health`    | Health check                                 |
| POST   | `/api/ask`       | Full JSON answer: `{ answer, sources }`      |
| POST   | `/api/ask/stream`| SSE stream: `status`, `rewrite`, `sources`, `token`, `done`, `error` events |
| PUT    | `/api/threads/{id}` | Save a thread for sharing (upsert, validated) |
| GET    | `/api/threads/{id}` | Public read-only thread for share links       |
| DELETE | `/api/threads/{id}` | Delete a shared thread                        |
| POST   | `/api/auth/signup`  | Create an account, returns a session token    |
| POST   | `/api/auth/login`   | Sign in, returns a session token              |
| GET    | `/api/me`           | Current session account (Bearer token)        |
| PUT    | `/api/auth/password`| Change password (Bearer token)                |
| DELETE | `/api/me`           | Delete account, threads, and memories         |
| GET    | `/api/memories`     | List saved memories (Bearer token)            |
| POST   | `/api/memories`     | Save a memory (Bearer token)                  |
| DELETE | `/api/memories/{id}`| Forget a memory (Bearer token)                |

## Accounts

Sign in from the sidebar avatar area opens a popup with sign in and sign
up tabs. Passwords are bcrypt-hashed, sessions are 7-day JWTs stored only
in your browser. Threads saved while signed in belong to your account:
nobody else can overwrite or delete them, even with the id. Share links
stay public so recipients need no account. Signing in also claims your
existing local threads for your account.

## Settings

The profile menu (avatar, bottom of the sidebar) opens Settings with four
sections. Account edits your full name and username, shows your login email
(read-only) and join date, changes the password, signs out, deletes the
account with everything in it, and links to GitHub support. Preferences
tunes results per search (3, 5, or 10) and answer delivery (stream live or
all at once). Personalization stores your name and response instructions on
the device and sends them with every question. Memory keeps facts Verixa
should remember; signed-in users get them injected into every answer.

## Sharing

Every finished turn auto-syncs to Postgres
(tables `users`, `threads`, `memories`; connection via `DATABASE_URL`).
The Share button copies a public link of the
form `http://localhost:5173/t/<id>` that renders the thread read-only,
no login needed. Deleting a thread removes
its shared copy too. Anyone with the link can read it, so share mindfully.

## Project layout

```
backend/        FastAPI app, LangChain chain, SSE streaming
verixa/         Exa web-search tool (recommended /search request shape)
frontend/       Vite + React answer-engine UI
```

## Notes

- Retrieval follows the canonical Exa request shape: query plus
  `type: "auto"` plus bare `contents: { highlights: true }`, with no extra
  filters. The app has its own chat LLM, so it uses `/search` as context
  instead of the `/answer` endpoint.
- Model-native citation markers (e.g. `【2†L1-L9】`) are normalized to
  `[n]` chips on both the backend and the streaming frontend.
- Follow-ups resolve against thread history: the backend rewrites
  "how old is he" into a standalone query before searching, and answers
  see the last few turns for pronouns and context.
- Thread history lives in `localStorage` under `verixa.threads.v1`.
