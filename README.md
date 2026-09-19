# Verixa

[![CI](https://github.com/Theani7/Verixa/actions/workflows/ci.yml/badge.svg)](https://github.com/Theani7/Verixa/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.12+](https://img.shields.io/badge/python-3.12+-blue.svg)](https://www.python.org/)
[![React 19](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Bun](https://img.shields.io/badge/Bun-1.2+-fbf0df.svg)](https://bun.sh/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ed.svg)](https://www.docker.com/)

Verixa is an open-source, Perplexity-style answer engine that pairs live web retrieval with large-language-model synthesis. It supports a universal multi-provider LLM hub (**OpenRouter**, **Groq**, **Ollama**, **OpenAI**, **Anthropic Claude**, and custom **OpenAI-compatible endpoints**), live web search via Exa, and real-time streaming rendered in a warm charcoal dark minimal interface.

The repository directory is named `Seekora`; the application and product name are **Verixa**.

## 🚀 Quickstart with Docker

The fastest way to run Verixa locally with PostgreSQL (pgvector), FastAPI backend, and React frontend:

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Theani7/Verixa.git
   cd Verixa
   ```

2. **Configure your environment**:
   ```bash
   cp .env.example .env
   ```
   Add your `EXA_API_KEY` along with your preferred LLM key (`GROQ_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, or `ANTHROPIC_API_KEY`) or configure local `OLLAMA_BASE_URL` in `.env`.

3. **Start the stack**:
   ```bash
   docker compose up -d
   ```

4. Open **`http://localhost:5173`** in your browser. The API and interactive Swagger documentation are accessible at `http://localhost:8000/docs`.

---

## Key Features

- **Universal Multi-Provider & Model Hub**:
  - Out-of-the-box support for **OpenRouter**, **Groq**, **Ollama (local)**, **OpenAI**, **Anthropic (Claude)**, and any **Custom OpenAI-Compatible API** (vLLM, LM Studio, LocalAI, Together AI, DeepSeek).
  - Add and manage multiple models simultaneously per provider with comma-separated inputs.
  - Test LLM connectivity live with real-time health-check validation directly in the Settings modal (`/api/llm/test`).
  - Switch active models on the fly without restarting services.
- **Bespoke Warm Charcoal Dark Visual Experience**:
  - Handcrafted dark monochrome palette (`#191a1a`, `#212323`, `#282b2b`, `#f2f1ec`) inspired by Perplexity's clean, distraction-free aesthetic.
  - **Two Distinct Live Animations**:
    - **Search Mode**: Compass radar scanning badge, monospaced query spotlight pill, 3-stage visual progress pipeline (*Search Query* &rarr; *Explore Sources* &rarr; *Synthesize*), and live discovered website shelf with high-resolution favicons and clean hostnames.
    - **Deep Research Mode**: Quantum counter-rotating neural core, 4-stage research matrix (*Plan Angles* &rarr; *Deep Search* &rarr; *Fact Verification* &rarr; *Synthesize Dossier*), micro-fill progress bar, live source tray, and collapsible audit checkpoint trail.
  - **Model Reasoning / Thinking Monologue Drawer**:
    - Dedicated accordion view for reasoning models emitting `<think>` tags or `reasoning_content` (DeepSeek-R1, QwQ, etc.).
    - Displays real-time streaming tokens with an elapsed duration counter, character count, and one-click copy button.
- **True Low-Latency SSE Streaming**:
  - Instantaneous Server-Sent Event streaming with zero pre-search latency, streaming discovered sources, incremental markdown tokens, and related questions.
- **Fact Verification & Grounding Engine**:
  - Multi-stage claim extraction, citation matching, contradictive conflict detection, and automated citation mapping with inline numbered citations (`[1]`, `[2]`).
- **Live Web Retrieval via Exa**:
  - High-precision web search with titles, URLs, snippets, and highlights automatically parsed into compact context windows.
- **Incognito Privacy Mode**:
  - Ephemeral in-memory threads (no `localStorage`, no database writes, no server sync).
  - Query redacted from backend server logs, memory retrieval and learning bypassed, and public thread sharing disabled.
- **Persistent Memory & Personalization**:
  - pgvector-ready user memory store with automatic candidate learning and manual review controls.
  - Local personalization profile for identity, occupation, custom system instructions, response length, and formatting preferences.
- **Fast Response Caching**:
  - Built-in DiskCache layer with configurable TTL for instant sub-second responses on repeated queries.
- **Thread Management & Public Sharing**:
  - Chronologically grouped sidebar threads (Today, Yesterday, Previous 7 days, Older) with search, deletion, and public read-only sharing via `/t/<id>`.

---

## Architecture

```text
Browser Client (React 19 + TypeScript + Bun)
  │
  │  HTTP / SSE Streaming / verixa.llm_config.v1
  ▼
FastAPI Application ─────────────────────────────────► PostgreSQL (pgvector)
  │                                                      ├── users
  │                                                      ├── threads
  │                                                      └── memories
  ├─► LLM Connection Tester (/api/llm/test)
  ├─► Query Router & Conversational Rewriter
  ├─► Exa Web Search Client
  ├─► LLM Synthesis Engine (OpenRouter / Groq / Ollama / OpenAI / Anthropic)
  │     ├── Grounded Markdown Answer & Citations
  │     ├── Model Reasoning (<think> blocks)
  │     ├── Related Questions Generator
  │     └── Candidate Memory Extraction
  └─► DiskCache (TTL response cache)
```

### Architecture Overview

![Verixa architecture diagram](assets/images/architecture.png)

### Request Lifecycle

1. **Intake & Classification**:
   - The backend receives the question, conversational history (up to 4 recent turns), user profile preferences, search mode (`search` vs `deep`), incognito flag, and optional client-side `custom_llm` credentials.
   - Conversational greetings or questions fully answerable from recent context route directly to the chat path without unnecessary web searches.
2. **Follow-Up Query Rewriting**:
   - For multi-turn conversations, pronouns (such as "he", "she", "it", "that company") are resolved against previous turns into a self-contained search query.
3. **Retrieval**:
   - **Search Mode**: Single-pass Exa retrieval with adaptive source selection and high-resolution favicons streamed immediately to the UI.
   - **Deep Mode**: Decomposes the prompt into multiple search angles, executes searches, deduplicates domains, performs gap reflection, and triggers follow-up queries.
4. **Synthesis & Verification**:
   - Compact source contexts are formatted and piped to the configured LLM.
   - For reasoning models, internal thinking chunks stream into the collapsible thinking accordion.
   - The answer streams as incremental markdown with inline citation markers (`[1]`, `[2]`).
5. **Post-Processing**:
   - Related follow-up questions are generated.
   - For signed-in users (outside of incognito), durable user facts are extracted and saved to memory.

---

## Technology Stack

### Backend
- **Python 3.12+** & **FastAPI**
- **LangChain Core**, **LangChain Groq**, **LangChain OpenAI**, **LangChain Community**
- **Exa Python Client** for neural web search
- **SQLAlchemy 2** & **psycopg 3**
- **PostgreSQL** with **pgvector**
- **DiskCache** for TTL caching
- **bcrypt** & **PyJWT** for authentication
- **Uvicorn** for ASGI serving

### Frontend
- **React 19** & **TypeScript**
- **Vite** (bundled via Rolldown)
- **Bun 1.2+** runtime & package manager
- **Phosphor Icons**
- **Highlight.js** for code syntax highlighting
- **Native CSS** with warm charcoal design system

---

## Prerequisites

- **Python 3.12** or newer
- **Bun 1.2** or newer
- **PostgreSQL** with `pgvector` support (optional for standalone local dev; required for accounts, threads sync, and memories)
- **Exa API Key** (from [exa.ai](https://exa.ai))
- An API key or local endpoint for your chosen LLM provider:
  - **OpenRouter API Key** (from [openrouter.ai](https://openrouter.ai))
  - **Groq API Key** (from [console.groq.com](https://console.groq.com))
  - **OpenAI API Key** (from [platform.openai.com](https://platform.openai.com))
  - **Anthropic API Key** (from [console.anthropic.com](https://console.anthropic.com))
  - Or a running **Ollama** instance (`ollama run llama3`) or local **vLLM / LM Studio** server

---

## Installation & Local Setup

### 1. Backend Setup

```bash
# Clone the repository
git clone https://github.com/Theani7/Verixa.git
cd Verixa

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
python -m pip install --upgrade pip
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
```

### 2. Frontend Setup

```bash
cd frontend
bun install
```

---

## Configuration

Edit `.env` in the root directory to configure the backend:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `EXA_API_KEY` | Yes | None | Authenticates Exa web searches |
| `LLM_PROVIDER` | No | `groq` | Default provider: `openrouter`, `groq`, `ollama`, `openai`, `anthropic`, or `custom` |
| `MODEL_NAME` | No | None | Global model name override |
| `OPENROUTER_API_KEY` | Optional | None | OpenRouter API key |
| `OPENROUTER_MODEL` | If using OpenRouter | None | Model ID (e.g., `anthropic/claude-3.5-sonnet`, `deepseek/deepseek-r1`) |
| `OPENROUTER_BASE_URL`| No | `https://openrouter.ai/api/v1` | OpenRouter API base URL |
| `GROQ_API_KEY` | If using Groq | None | Authenticates Groq API requests |
| `GROQ_MODEL` | If using Groq | None | Groq model (e.g., `llama-3.3-70b-versatile`) |
| `GROQ_TPM_LIMIT` | No | `8000` | Tokens-per-minute throttle limit |
| `OLLAMA_BASE_URL` | If using Ollama | `http://localhost:11434/v1` | Base URL for local Ollama daemon |
| `OLLAMA_MODEL` | If using Ollama | None | Local model tag (e.g., `llama3`, `deepseek-r1:8b`) |
| `OPENAI_API_KEY` | If using OpenAI | None | Authenticates OpenAI requests |
| `OPENAI_BASE_URL` | No | None | Custom base URL for vLLM, LM Studio, etc. |
| `OPENAI_MODEL` | If using OpenAI | None | OpenAI model (e.g., `gpt-4o`, `gpt-4o-mini`) |
| `ANTHROPIC_API_KEY` | If using Claude | None | Authenticates Anthropic API requests |
| `ANTHROPIC_MODEL` | If using Claude | None | Claude model (e.g., `claude-3-5-sonnet-20241022`) |
| `DATABASE_URL` | Yes | `postgresql+psycopg://verixa:verixa@localhost:5432/verixa` | Database connection string |
| `SECRET_KEY` | Production | `dev-secret-change-me` | Signs and validates JWT tokens |
| `VITE_API_URL` | Frontend only | `http://localhost:8000` | Target URL for frontend API requests |

> **Note**: You can also configure all API keys and custom models directly in the web UI under **Settings &rarr; Models & API**. Client-side model configurations are saved securely in browser storage and seamlessly forwarded with each search request.

---

## Running Locally

Run backend and frontend in two separate terminals:

### Terminal 1: Backend
```bash
source .venv/bin/activate
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```
- API root: `http://localhost:8000`
- Interactive API Docs: `http://localhost:8000/docs`

### Terminal 2: Frontend
```bash
cd frontend
bun run dev --host 0.0.0.0
```
- Web Application: `http://localhost:5173`

---

## Using Verixa

### Search & Deep Research Modes
Toggle modes directly from the composer pill:
- **Search**: High-speed, focused web search for quick, accurate factual synthesis with live website favicons.
- **Deep Research**: Comprehensive multi-angle investigation that recursively plans search queries, explores diverse web facets, verifies facts, and compiles an in-depth dossier.

### Model Management & Connection Testing
Open **Settings** (gear icon in the sidebar) &rarr; **Models & API**:
- Select from preset providers (**OpenRouter**, **Groq**, **OpenAI**, **Claude**, **Ollama**, or **Custom Endpoint**).
- Add multiple model identifiers simultaneously (e.g., paste `gpt-4o, gpt-4o-mini, o3-mini` or `deepseek/deepseek-r1, anthropic/claude-3.5-sonnet`).
- Click **Test Connection** to immediately verify endpoint connectivity and credentials.
- Choose your default chat and research models on the fly.

### Reasoning & Thinking Accordion
When querying reasoning models (such as DeepSeek-R1 or QwQ), the model's inner `<think>` stream is captured into a sleek, collapsible drawer above the answer. It shows:
- Dynamic elapsed duration ticker (e.g., `Thought for 4.2s`).
- Live blinking streaming cursor.
- One-click copy button for the entire reasoning monologue.

### Incognito Mode
Click **Incognito** in the sidebar to activate ephemeral browsing:
- Zero data written to `localStorage` or PostgreSQL.
- Server logs redact your query.
- User memories are not loaded or updated.
- Thread vanishes completely upon closing or reloading the tab.

---

## API Reference

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | System health check |
| `POST` | `/api/llm/test` | Public | Live connection tester for custom LLM configurations |
| `POST` | `/api/ask` | Optional | Non-streaming JSON answer endpoint |
| `POST` | `/api/ask/stream` | Optional | Low-latency Server-Sent Events (SSE) streaming endpoint |
| `PUT` | `/api/threads/{id}` | Optional | Creates or updates a thread record |
| `GET` | `/api/threads/{id}` | Public | Retrieves a public read-only shared thread |
| `DELETE`| `/api/threads/{id}` | Optional | Deletes a thread owned by the caller |
| `POST` | `/api/auth/signup` | Public | Register new account and receive JWT |
| `POST` | `/api/auth/login` | Public | Log in and receive JWT |
| `GET` | `/api/me` | Bearer | Fetch profile and account settings |
| `PUT` | `/api/me` | Bearer | Update profile preferences |
| `PUT` | `/api/auth/password` | Bearer | Update account password |
| `DELETE`| `/api/me` | Bearer | Delete account and cascade-delete all data |
| `GET` | `/api/memories` | Bearer | List saved user memories |
| `POST` | `/api/memories` | Bearer | Create a new user memory item |
| `DELETE`| `/api/memories/{id}` | Bearer | Delete a specific memory item |

### Testing an LLM Connection

```bash
curl -X POST http://localhost:8000/api/llm/test \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "openrouter",
    "api_key": "sk-or-v1-...",
    "base_url": "https://openrouter.ai/api/v1",
    "model": "deepseek/deepseek-r1"
  }'
```

Response:
```json
{
  "ok": true,
  "message": "Connected successfully! Response: Hello! How can I assist you today?"
}
```

---

## Testing & Verification

Verixa includes a complete set of automated test suites covering fact verification, incognito privacy isolation, and response caching:

```bash
source .venv/bin/activate

# 1. Fact verification and citation audit suite
python backend/tests/test_verify.py

# 2. Incognito privacy isolation and log redaction suite
python backend/tests/test_incognito.py

# 3. DiskCache TTL and cache hit/miss suite
python -m backend.tests.test_cache
```

### Frontend Typechecking & Building

```bash
cd frontend
bun run build
```

---

## Browser Storage Keys

| Key | Storage | Description |
| --- | --- | --- |
| `verixa.threads.v1` | `localStorage` | Local conversation history and turns |
| `verixa.auth.v1` | `localStorage` | JWT session token and user summary |
| `verixa.llm_config.v1` | `localStorage` | Custom providers, keys, and model lists |
| `verixa.prefs.v1` | `localStorage` | Application streaming and UI preferences |
| `verixa.profile.v1` | `localStorage` | Personalization profile and custom instructions |
| `verixa.mode.v1` | `localStorage` | Active search mode (`search` vs `deep`) |
| `verixa.sidebar.v1` | `localStorage` | Sidebar collapsed or expanded state |
| `verixa.incognito.v1` | `sessionStorage` | Ephemeral tab incognito state |

---

## Contributing

Contributions are welcome! Please check [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on code standards, conventional commits, and submitting pull requests.

## License

Verixa is open source under the [MIT License](LICENSE).
