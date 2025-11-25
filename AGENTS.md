# AGENTS

## Setup

- Use **Node.js** with `pnpm`.

## Steps after saving changes to a file:
- If the file has extensions (.js, .jsx), format after save with `prettier FILE --write`.

## Search Tips

- When searching the codebase (e.g., using `grep`), ignore the following directories to reduce noise:
  - `node_modules/`
  - `server/node_modules/`
  - `dist/`
  - `build/`
  - `app/`
  - `server/dev/`
  - `server/logs/`
  - `server_docs/`
  - Also ignore any other directories you think should be ignored based on what you're doing.
