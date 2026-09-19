# Contributing to Verixa

Thank you for your interest in contributing to Verixa! Whether you are fixing a bug, improving documentation, or proposing new features, your help is welcome.

## Code of Conduct

Please be respectful, constructive, and collaborative in all issues, pull requests, and discussions.

## Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/Verixa.git
   cd Verixa
   ```
3. **Create a branch** for your work:
   ```bash
   git checkout -b feat/your-feature-name
   ```

## Development Workflow

### Prerequisites
- Python 3.12 or newer
- Bun 1.2 or newer
- Docker (optional, for local PostgreSQL with pgvector)

### Backend Setup
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env with your credentials
```

Run tests:
```bash
python backend/tests/test_verify.py
python backend/tests/test_incognito.py
python -m backend.tests.test_cache
```

Start the backend server:
```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup
We use **Bun** (not npm) for package management and scripts:
```bash
cd frontend
bun install
bun run dev
```

Check types and build:
```bash
bun run lint
bun run build   # runs tsc -b && vite build
```

## Guidelines

- **TypeScript Only**: Frontend code must always be TypeScript (`.ts`/`.tsx`), never plain JavaScript.
- **Conventional Commits**: Write commit messages following the [Conventional Commits](https://www.conventionalcommits.org/) specification:
  - `feat: add new feature`
  - `fix: correct bug behavior`
  - `refactor: code structure change without behavior alteration`
  - `docs: update documentation`
  - `test: add or adjust tests`
  - `chore: maintenance, dependency updates`
- **Tests**: Ensure all backend tests and frontend typechecks pass before submitting a pull request.

## Submitting a Pull Request

1. Push your changes to your fork.
2. Open a Pull Request against `main` on `Theani7/Verixa`.
3. Provide a clear description of your changes, the problem they solve, and the testing performed.
4. Ensure the GitHub Actions CI passes.
