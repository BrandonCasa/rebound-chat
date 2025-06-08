# AGENTS

## Setup

- Use **Node.js** with `pnpm`.
- Run `pnpm install` from the repo root; this installs frontend dependencies and, via the `postinstall` script, installs server dependencies and prepares the build directory.

## Testing

- Run test commands before committing any changes.
- Frontend testing: (when ran from the repo root folder) `pnpm test`
- Backend testing: (when ran from the server folder) `pnpm test`

## Coding Guidelines

- Keep tests and documentation in sync with code changes.
- Check for tests which reference components you modify, and if your changes require those tests to be updated, if so, update the tests.

## Search Tips

- When searching the codebase (e.g., using `grep`), ignore the following directories to reduce noise:
  - `node_modules/`
  - `server/node_modules/`
  - `dist/`
  - `build/`
  - `app/`
  - `server/dev/`
  - `server/logs/`
  - Also ignore any other directories you think should be ignored for what you're doing.
