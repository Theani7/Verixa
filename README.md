# Verixa

Verixa is a Perplexity-style answer engine that combines live web retrieval with large-language-model synthesis. It searches the web through Exa, generates cited answers with Groq and LangChain, and presents the result through a responsive React interface with server-sent event (SSE) streaming.

The repository directory is named `Seekora`; the application and product name are **Verixa**.

## Features

- **Live web search** through the Exa `/search` endpoint with titles, URLs, and highlights
- **Grounded answer synthesis** using LangChain and Groq
- **SSE streaming** with visible searching, reading, writing, thinking, and deep-research phases
- **Search and deep-research modes**
  - Search mode performs one retrieval pass and can route simple conversation to the chat path
  - Deep mode decomposes a question, searches several angles, reflects on missing information, runs follow-up searches, and merges the sources
- **Conversation-aware follow-ups** with pronoun resolution and up to four recent turns supplied to the model
- **Inline numbered citations** linked to expandable source cards
- **Markdown and code rendering**, including syntax highlighting and copyable code blocks
- **Thread history** stored locally and synchronized to PostgreSQL when the user is signed in
- **Public thread sharing** through read-only `/t/<id>` pages
- **Email/password accounts** with bcrypt password hashes and seven-day JWT sessions
- **Per-user memory** with manual memory management, automatic learning, usage controls, and a 100-item cap
- **Local personalization** for identity, context, location, answer length, answer format, and custom instructions
- **Related questions** generated after completed answers
- **Responsive dark UI** with desktop and mobile sidebars
- **Non-streaming fallback** for clients or preferences that do not use SSE

## Architecture

```text
Browser
  |
  |  React UI + SSE
  v
FastAPI backend ----------------------> PostgreSQL
  |                                      users
  |                                      threads
  |                                      memories (pgvector)
  |
  +--> routing and follow-up rewriting
  |
  +--> Exa web search
  |
  +--> Groq through LangChain
          |
          +--> grounded answer
          +--> related questions
          +--> candidate memories
```

## Architecture Overview

![Verixa architecture diagram](assets/images/architecture.png)

The diagram summarizes how the React browser client, FastAPI backend, Exa search, Groq and LangChain synthesis, and PostgreSQL with pgvector storage interact.

### Request flow

For a normal web-search request, Verixa:

1. Receives the query, recent history, personalization profile, result-count preference, answer mode, and optional bearer token.
2. Classifies the request as chat or search. Greetings and conversation-only messages can use the chat path without web retrieval.
3. Rewrites follow-up questions into standalone search queries using the recent thread context.
4. Searches Exa and limits the source set.
5. Builds a compact source context from titles, URLs, and highlights.
6. Generates a Markdown answer with inline `[1]`, `[2]` citations.
7. Normalizes model-native citation markers for the frontend.
8. Streams progress, sources, tokens, related questions, completion, and errors as JSON SSE frames.
9. Optionally extracts and stores durable user facts after a signed-in answer.

Deep research extends this flow by planning multiple focused searches, collecting their results, deduplicating sources by URL, reflecting on gaps, performing follow-up searches, and synthesizing one answer from the combined evidence. The non-streaming deep endpoint runs the initial searches concurrently; the default streaming endpoint exposes each research step as it runs.

## Technology Stack

### Backend

- Python
- FastAPI
- Pydantic request validation
- LangChain Core
- LangChain Groq
- Exa Python client
- SQLAlchemy 2
- PostgreSQL with pgvector
- psycopg 3
- bcrypt
- PyJWT
- Uvicorn

### Frontend

- React 19
- TypeScript
- Vite
- Bun
- Phosphor Icons
- Highlight.js
- Native CSS

## Prerequisites

- Python 3.12 or newer
- Bun 1.2 or newer
- PostgreSQL with pgvector support
- An Exa API key
- A Groq API key

Install Bun using the [official Bun installation instructions](https://bun.sh/docs/installation).

### PostgreSQL and pgvector

A local Homebrew installation can be prepared with:

```bash
brew install postgresql@18 pgvector
```

Follow the installation output to start PostgreSQL and make the pgvector extension available. Then create a role and database matching the local `DATABASE_URL`:

```sql
CREATE USER verixa WITH PASSWORD 'verixa';
CREATE DATABASE verixa OWNER verixa;
```

Alternatively, run a pgvector-enabled PostgreSQL container:

```bash
docker run --name verixa-postgres \
  -e POSTGRES_USER=verixa \
  -e POSTGRES_PASSWORD=verixa \
  -e POSTGRES_DB=verixa \
  -p 5432:5432 \
  pgvector/pgvector:pg18
```

To stop and remove the container later:

```bash
docker stop verixa-postgres
docker rm verixa-postgres
```

## Repository Layout

```text
.
├── backend/
│   ├── auth.py          # Password hashing and JWT session handling
│   ├── chain.py         # Routing, prompts, retrieval, synthesis, memory
│   ├── db.py            # SQLAlchemy engine and session lifecycle
│   ├── deep.py          # Deep-research planning and refinement
│   ├── main.py          # FastAPI application and API routes
│   ├── models.py        # Users, threads, and vector-memory tables
│   ├── streaming.py     # SSE event construction and streaming pipeline
│   └── threads.py       # Shared-thread validation and ownership
├── assets/
│   └── images/
│       ├── .gitkeep
│       └── architecture.png # Architecture overview diagram
├── verixa/
│   └── search.py        # Exa `/search` client and command-line search tool
├── frontend/
│   ├── src/
│   │   ├── api.ts       # HTTP and authentication client
│   │   ├── App.tsx      # Main answer-engine interface
│   │   ├── SharedThread.tsx
│   │   ├── markdown.tsx # Markdown, citation, and code rendering
│   │   └── types.ts     # Shared frontend data types
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── .env.example         # Environment-variable template
├── requirements.txt     # Python dependencies
└── README.md
```

## Configuration

Copy the environment template before starting the backend:

```bash
cp .env.example .env
```

Edit `.env` and configure these variables:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `EXA_API_KEY` | For search and deep modes | None | Authenticates Exa web searches |
| `GROQ_API_KEY` | For all LLM paths | None | Authenticates Groq model requests |
| `DATABASE_URL` | Yes | `postgresql+psycopg://verixa:verixa@localhost:5432/verixa` | Selects the PostgreSQL database |
| `SECRET_KEY` | Yes outside local development | `dev-secret-change-me` | Signs and verifies JWT sessions |
| `VITE_API_URL` | Frontend only | `http://localhost:8000` | Points the Vite client at the API |

Generate a production-safe signing key:

```bash
openssl rand -hex 32
```

The backend loads `.env` through `python-dotenv`. The frontend only exposes variables prefixed with `VITE_`; set `VITE_API_URL` in `frontend/.env.local` when the API is not on `localhost:8000`:

```dotenv
VITE_API_URL=https://api.example.com
```

Never commit `.env`, API keys, JWT secrets, or database credentials. `.env` is already ignored by Git.

## Installation

Clone the repository and enter its directory:

```bash
git clone https://github.com/Theani7/Verixa.git
cd Verixa
```

### Backend

Create and activate a virtual environment, then install dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

On Windows PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Copy and complete the environment file:

```bash
cp .env.example .env
```

### Frontend

Install dependencies with Bun:

```bash
cd frontend
bun install
```

## Running Locally

Run the backend and frontend in separate terminals.

### Terminal 1: backend

```bash
source .venv/bin/activate
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

The API is available at `http://localhost:8000`, and interactive API documentation is available at `http://localhost:8000/docs`.

On startup, Verixa creates missing database tables and attempts to enable the PostgreSQL `vector` extension.

### Terminal 2: frontend

```bash
cd frontend
bun run dev --host 0.0.0.0
```

Open `http://localhost:5173`.

The default frontend API target is `http://localhost:8000`. Change `VITE_API_URL` and restart Vite if the backend uses another host or port.

## Verifying the Installation

Check the backend health endpoint:

```bash
curl http://localhost:8000/api/health
```

Expected response:

```json
{"status":"ok"}
```

Test the Exa client directly:

```bash
source .venv/bin/activate
python -m verixa.search "latest developments in retrieval augmented generation"
```

Build the frontend:

```bash
cd frontend
bun run build
```

## Using Verixa

### Asking questions

Enter a question in the composer and press `Enter`. Hold `Shift` and press `Enter` to add a new line. The default mode is **Search**.

Use the mode selector in the composer to choose:

- **Search**: fast, live-web answers with a focused source set
- **Deep research**: slower multi-stage research for broad or complex questions

The backend may classify a selected search request as chat when the message is a greeting, thanks, small talk, or a follow-up that can be answered from conversation history.

### Working with sources

Search and deep-research answers display numbered citation chips. Select a citation chip to expand its source card and open the original URL. The source count in the answer action bar opens the complete source list for the thread.

### Continuing a conversation

Questions sent from an active thread include up to four recent turns. Verixa resolves references such as “he”, “she”, “it”, and “that report” before searching when appropriate.

### Managing threads

The sidebar shows threads grouped by Today, Yesterday, Previous 7 days, and Older. It supports:

- Searching thread titles and question text
- Opening, deleting, and starting threads
- Collapsing or expanding the navigation
- Keyboard focus shortcuts

Local thread history is stored under `verixa.threads.v1`. Signed-in threads are also synchronized to PostgreSQL. Local history remains available when signed out, subject to browser storage limits and retention.

### Sharing a thread

Select the share action on a finished thread to copy a link in this form:

```text
http://localhost:5173/t/<thread-id>
```

Shared pages are public and read-only. Anyone with the link can view the thread without an account. Delete the local thread to remove its server copy when signed in.

### Accounts and settings

Sign in or create an account from the sidebar. Passwords must be 8–72 bytes and are stored as bcrypt hashes. Successful authentication returns a JWT stored in browser local storage under `verixa.auth.v1`; sessions expire after seven days.

Account settings provide:

- Full name and username
- Password changes
- Sign out and account deletion
- Memory-use and automatic-learning controls

Personalization settings are stored locally under `verixa.profile.v1` and sent with each request. They can include:

- Name, occupation, company, and date of birth
- Gender and optional shared location
- Custom answer instructions
- Short, default, or long response length
- List, mixed, or paragraph-oriented response format

Memory settings and saved facts are stored in PostgreSQL. Automatic memory learning is best-effort and does not interrupt answer generation.

## API Reference

FastAPI validates request bodies with Pydantic. Protected endpoints accept:

```http
Authorization: Bearer <JWT>
```

| Method | Path | Authentication | Description |
| --- | --- | --- | --- |
| `GET` | `/api/health` | No | Returns backend health |
| `POST` | `/api/ask` | Optional | Returns a complete JSON answer |
| `POST` | `/api/ask/stream` | Optional | Streams an answer as SSE |
| `PUT` | `/api/threads/{id}` | Optional | Creates or updates a thread |
| `GET` | `/api/threads/{id}` | No | Reads a public shared thread |
| `DELETE` | `/api/threads/{id}` | Optional | Deletes a thread owned by the caller |
| `POST` | `/api/auth/signup` | No | Creates an account and session |
| `POST` | `/api/auth/login` | No | Creates a session |
| `GET` | `/api/me` | Yes | Returns the current account |
| `PUT` | `/api/me` | Yes | Updates profile and memory preferences |
| `PUT` | `/api/auth/password` | Yes | Changes the current password |
| `DELETE` | `/api/me` | Yes | Deletes the account and related data |
| `GET` | `/api/memories` | Yes | Lists saved memories |
| `POST` | `/api/memories` | Yes | Saves a memory |
| `DELETE` | `/api/memories/{id}` | Yes | Deletes one of the caller's memories |

### Ask for a complete answer

```bash
curl -X POST http://localhost:8000/api/ask \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "What are the main advantages of retrieval augmented generation?",
    "history": [],
    "num_results": 5,
    "profile": {},
    "mode": "search"
  }'
```

Example response:

```json
{
  "answer": "Retrieval augmented generation... [1]",
  "sources": [
    {
      "id": 1,
      "title": "Example source",
      "url": "https://example.com/article",
      "excerpt": "A relevant search highlight."
    }
  ],
  "query": "What are the main advantages of retrieval augmented generation?",
  "mode": "search",
  "related": ["How is RAG evaluated?"]
}
```

### Stream an answer

```bash
curl -N -X POST http://localhost:8000/api/ask/stream \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "Explain pgvector in one paragraph.",
    "history": [],
    "mode": "search"
  }'
```

SSE frames contain one JSON object per `data:` line:

```text
data: {"type":"status","phase":"searching"}

data: {"type":"sources","sources":[{"id":1,"title":"...","url":"..."}]}

data: {"type":"token","text":"..."}

data: {"type":"related","questions":["..."]}

data: {"type":"done"}
```

Supported event types are:

| Event | Fields | Meaning |
| --- | --- | --- |
| `status` | `phase` | Current work phase |
| `progress` | `label` | Deep-research progress detail |
| `mode` | `mode` | Resolved `search` or `chat` mode |
| `rewrite` | `query` | Standalone follow-up query |
| `sources` | `sources` | Retrieved source metadata |
| `token` | `text` | One generated text chunk |
| `related` | `questions` | Suggested follow-up questions |
| `done` | None | Stream completed successfully |
| `error` | `message` | Stream failed; no `done` follows |

### Create an account

```bash
curl -X POST http://localhost:8000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "user@example.com",
    "password": "a-strong-password"
  }'
```

Store the returned token and send it as a bearer token for protected requests.

## Data Model

Verixa uses three PostgreSQL tables:

### `users`

Stores email, bcrypt password hash, display name, username, creation time, and memory preferences.

### `threads`

Stores a public ID, optional owner, title, JSONB turns, and update timestamp. Thread ownership prevents another account from updating or deleting an owned thread.

### `memories`

Stores user-owned memory text, creation time, and an optional 1,536-dimensional pgvector embedding. The schema is vector-ready; the current automatic-learning path stores text candidates.

Thread records accept at most 50 turns. Each turn is limited to 2,000 query characters, 20,000 answer characters, and 10 sources.

## Browser Storage

| Key | Contents |
| --- | --- |
| `verixa.threads.v1` | Local thread history |
| `verixa.auth.v1` | JWT session and account summary |
| `verixa.prefs.v1` | Result count and streaming preference |
| `verixa.profile.v1` | Local personalization |
| `verixa.mode.v1` | Selected search or deep mode |
| `verixa.sidebar.v1` | Sidebar open or collapsed state |

The frontend also recognizes the legacy `seekora.threads.v1` history key and migrates valid records into the current shape in memory.

## Development

### Backend syntax check

```bash
source .venv/bin/activate
python -m compileall backend verixa
```

### Frontend lint

```bash
cd frontend
bun run lint
```

### Frontend typecheck and production build

The project build runs TypeScript project references before Vite bundles the application:

```bash
cd frontend
bun run build
```

The generated frontend is written to `frontend/dist`.

### Run the search module directly

```bash
source .venv/bin/activate
python -m verixa.search "your query here"
```

Without a query, the module prints its usage message and exits with status 2.

## Production Deployment

A production deployment should:

1. Set a strong, secret `SECRET_KEY`.
2. Use a managed or dedicated PostgreSQL instance with pgvector.
3. Set `DATABASE_URL` to a secure connection string.
4. Configure `VITE_API_URL` for the deployed API.
5. Serve the built `frontend/dist` directory through a static host or reverse proxy.
6. Use HTTPS for both frontend and API traffic.
7. Update FastAPI CORS configuration if the production frontend origin differs from `http://localhost:5173`.
8. Place the API behind a proxy that preserves streaming responses and disables response buffering.
9. Keep Exa and Groq credentials server-side only.
10. Add operational controls such as rate limiting, request-size limits, monitoring, backups, and structured logs as required.

The checked-in CORS allowlist currently permits `http://localhost:5173`. This is appropriate for local development but must be changed for a production frontend origin.

## Troubleshooting

### `EXA_API_KEY is not set`

Confirm that `.env` exists beside `requirements.txt`, contains an active Exa key, and is loaded in the backend process. Restart Uvicorn after changing the file.

### `GROQ_API_KEY is not set`

Add a Groq key to `.env` and restart the backend. Every chat, search, rewrite, memory, and related-question path uses the Groq client.

### Database connection errors

Verify that PostgreSQL is running, the role and database exist, the password matches `DATABASE_URL`, and port 5432 is reachable. Test the SQLAlchemy URL from the activated backend environment before starting Uvicorn.

### `extension "vector" is not available`

Install pgvector for the PostgreSQL server and enable it in the active database. A client-side Python package alone does not add the PostgreSQL extension.

### The frontend cannot reach the API

Check that the backend is listening on port 8000. If it uses another origin, set `VITE_API_URL` in `frontend/.env.local` and restart the Vite server. Browser requests are subject to the backend CORS allowlist.

### Streaming appears delayed

Some reverse proxies buffer SSE responses. Disable proxy buffering and preserve these response headers:

```http
Cache-Control: no-cache
X-Accel-Buffering: no
Content-Type: text/event-stream
```

### Clipboard actions do not work

Modern browsers may restrict the Clipboard API to secure contexts. Serve the frontend over HTTPS when deploying, or select and copy answer text manually during local HTTP development.

### API keys and usage

Exa and Groq are external services with usage limits and pricing. Search volume, model selection, and answer length affect usage. Review each provider's current pricing and key restrictions before production use.

## Security Notes

- `.env` is ignored, but secrets must also be protected by the deployment environment.
- Replace the development `SECRET_KEY` before exposing authentication.
- JWTs are stored in browser local storage for this development application.
- Shared thread links are public and should not contain private information.
- Account deletion cascades to owned threads and memories.
- Thread ownership is enforced on server-side update and delete operations.
- The current local deployment does not include rate limiting or abuse protection.

## License

Verixa is licensed under the [MIT License](LICENSE). See the license file for the full terms and disclaimer.
