# AGENTS

## Setup

- Use **Node.js** with `pnpm`.
- Run `pnpm install` from the repo root; this installs frontend dependencies and, via the `postinstall` script, installs server dependencies and prepares the build directory.

## Testing

- Run test commands before committing any changes.
- Frontend testing: (when ran from the repo root folder) `pnpm test`
- Backend testing: (when ran from the server folder) `pnpm test`
- Frontend test scripts are located in `src/__tests__`
- Backend test scripts are located in `server/tests/`

## Documentation

- Backend documentation is located in `server_docs/`
- Frontend documentation doesn't exist yet

## Coding Guidelines

- Keep tests and documentation in sync with code changes.
- When modifying frontend code, ensure any affected frontend tests are also updated to cover your changes.
- When modifying backend code, ensure any affected backend tests are also updated to cover your changes.

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
