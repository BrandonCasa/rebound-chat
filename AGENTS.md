# AGENTS

## Setup
- Use **Node.js** with `pnpm`.
- Run `pnpm install` from the repo root; this installs frontend dependencies and, via the `postinstall` script, installs server dependencies and prepares the build directory.

## Testing
- **Frontend**: `npm test` (runs Vitest via the root `package.json`).
- **Backend**: `npm test --prefix server` (runs Mocha/Chai in `server/tests`).

Run these test commands before committing any changes.

## Coding Guidelines
- Format changed JavaScript/JSX with `npx prettier -w`.
- Avoid committing build artifacts (`dist/`, `app/`, etc., already ignored).
- Keep tests and documentation in sync with code changes.

## Search Tips
- When searching the codebase (e.g., using `grep`), ignore the following directories to reduce noise:
  - `node_modules/`
  - `server/node_modules/`
  - `dist/`
  - `build/`
  - `app/`
  - `server/dev/`
  - `server/logs/`
