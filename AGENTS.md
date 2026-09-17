# Project Guidelines

## Git
- Always use Conventional Commits (e.g., `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`)
- Always commit after each change

## Frontend
- Always use TypeScript (`.ts`/`.tsx`), never plain JavaScript
- Frontend builds typecheck via `tsc -b` before Vite bundles
- Use Bun (not npm) for installs, scripts, and the dev server
