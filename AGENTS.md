# AGENTS

## Setup

- Use **Node.js** with `pnpm`.
- Run `pnpm install` from the repo root; this installs frontend dependencies and, via the `postinstall` script, installs server dependencies and prepares the build directory.

## Testing

- **Frontend**: `pnpm test` (when ran from the project root folder) (runs Vitest via the root `package.json`).
- **Backend**: `pnpm test` (when ran from the server folder) (runs Mocha/Chai in `server/tests`).

Run these test commands before committing any changes.

## Coding Guidelines

- Anytime you finish working on a file, prior to commiting it (if the file is JavaScript/JSX) run `pnpm prettier {the file --write` on it.
- Avoid committing build artifacts (`dist/`, `app/`, etc., already ignored).
- Keep tests and documentation in sync with code changes.
- Check for tests which reference components you modify, and if your changes require those tests to be updated.

## Search Tips

- When searching the codebase (e.g., using `grep`), ignore the following directories to reduce noise:
  - `node_modules/`
  - `server/node_modules/`
  - `dist/`
  - `build/`
  - `app/`
  - `server/dev/`
  - `server/logs/`
