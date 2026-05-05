# AGENTS

## Setup
- When using **Node.js** use `pnpm` as your package manager.

## Steps after saving changes to a file:
- If the file has extensions (.js, .jsx), format after save with `prettier FILE --write`.

## Testing
- Run tests when you see fit.
- Modify tests when relevant.
- Add or remove tests when relevant.
- Check over all relevant tests and ensure they fit with any change you make prior to finalizing your commits.

## Search Tips
- When searching the codebase (e.g., using `grep`), ignore the following directories to reduce noise:
  - `node_modules/`
  - `server/node_modules/`
  - `dist/`
  - `build/`
  - `app/`
  - `server/dev/`
  - `server/logs/`
  - Also ignore any other directories you think should be ignored based on what you're doing.
