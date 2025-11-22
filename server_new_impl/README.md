# server_new_impl

Initial NestJS GraphQL foundation for the new backend outlined in `server_new_plan`. This package sets up a modular Nest application with validated configuration, code-first schema generation, and a GraphQL-based health probe for early smoke testing.

## Scripts
- `pnpm --filter @rebound/server-new start:dev` - Run the Nest server in watch mode.
- `pnpm --filter @rebound/server-new build` - Compile TypeScript to `dist`.
- `pnpm --filter @rebound/server-new lint` - Run ESLint against the source files.
