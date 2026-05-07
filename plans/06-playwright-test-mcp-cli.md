# Plan 06: Playwright Test, Playwright MCP, and Playwright CLI

## Update (2026-05-07)

- Repo context: root Vite/React/Electron app, separate `server/` package, `pnpm` workspace, JavaScript modules, no current Playwright config.
- Current tests:
  - Root `node --test` suites for `public/streaming` and `public/sources`.
  - Server Mocha suites under `server/test`.
- Current dev stack:
  - Vite serves the renderer on port `3000`.
  - Vite proxies `/api`, `/live/api`, and `/live/watch` to `localhost:6001`.
  - The server starts HTTP on `6001`, Socket.IO on `6002`, and a Mongo memory replica set on `27017` with `./dev` as the DB path in development/test mode.
- This plan intentionally does not install Playwright yet. It defines the implementation and documentation system first.
- Official docs checked on 2026-05-07:
  - Playwright Test installation/configuration/CLI.
  - Playwright Electron and ElectronApplication API.
  - Playwright Test Agents.
  - Playwright MCP installation/capabilities/profile behavior.
  - Playwright agent CLI installation/skills/capabilities.

## Terminology

- **Playwright Test**: the durable test runner from `@playwright/test`. This is what should run in CI and hold committed end-to-end tests.
- **Built-in Playwright CLI**: the `playwright` executable installed with Playwright Test and run through `pnpm exec playwright`. Use it for `test`, `show-report`, `codegen`, `install`, `trace`, and related Playwright Test workflows.
- **Playwright MCP**: the MCP server from `@playwright/mcp@latest`. Use it for AI-assisted exploratory browser automation, snapshots, assertions, storage, network inspection, and test discovery loops.
- **Playwright agent CLI**: the newer `playwright-cli` command from `@playwright/cli`. Use it as an agent-friendly shell interface for browser control and generated local skills.

The repo should keep these four things documented separately because they solve different problems.

## Problem

Rebound has useful unit and server integration coverage, but it does not have a durable browser-level validation layer. Manual UI checks are hard to repeat, and AI/browser automation work has no repo-local rules for how generated flows become maintainable tests.

Without a written implementation plan, Playwright can easily become three overlapping setups:

1. A CI test runner with committed specs.
2. An MCP browser tool for agents.
3. A CLI browser tool for agents and local debugging.

Those should cooperate, but they should not be treated as interchangeable.

## Goals

- Add Playwright Test as the official browser E2E layer for the Vite app.
- Keep the first implementation JavaScript-only and consistent with the repo.
- Treat Node.js 20 or newer as the minimum supported runtime for Playwright Test, MCP, and agent CLI workflows.
- Start with a small Chromium smoke suite, then expand to authenticated and live-stream workflows.
- Add browser artifacts and reports without committing generated output.
- Document when to use Playwright Test, MCP, built-in CLI, and agent CLI.
- Preserve future implementation knowledge in versioned docs so agents and humans do not rediscover setup details every time.
- Make generated tests reviewable, refactorable, and stable before they enter CI.

## Non-goals

- Do not replace existing `node --test` or Mocha suites.
- Do not make MCP output itself a source of truth.
- Do not require all developers to globally install `@playwright/cli`.
- Do not make browser E2E tests depend on a developer's personal browser profile.
- Do not start with full cross-browser, mobile, Electron, and streaming coverage in one change.

## Expected repo result

After implementation, the repo should contain:

```text
playwright.config.js
playwright.electron.config.js
tests/
  e2e/
    smoke.spec.js
    auth.setup.js
    authenticated/
      chat.spec.js
      navigation.spec.js
    fixtures/
      users.js
    helpers/
      api.js
      selectors.js
      testData.js
  electron/
    smoke.spec.js
    ipc.spec.js
    helpers/
      electronTest.js
docs/
  testing/
    playwright.md
    playwright-test-map.md
    playwright-mcp.md
    playwright-cli.md
    playwright-electron.md
    playwright-streaming.md
    playwright-runbook.md
    playwright-doc-maintenance.md
```

Planned generated/ignored paths:

```text
playwright-report/
test-results/
.auth/
.playwright-mcp/
docs/testing/artifacts/
server/dev-e2e/
server/dev-test/
```

`docs/testing/artifacts/` should stay ignored unless a specific screenshot or trace is intentionally committed for documentation.

## Phase A: E2E runtime isolation

The first implementation should make the app start predictably for Playwright without fighting a developer's normal dev server.

### A1. Make Vite proxy target configurable

**Status:** Complete (2026-05-07).

Current proxy targets are hard-coded to `http://localhost:6001`. Add environment-controlled proxy targets before E2E tests are added:

```js
const apiTarget = process.env.VITE_API_PROXY_TARGET || "http://localhost:6001";
```

Use `apiTarget` for `/api`, `/live/api`, and `/live/watch`.

### A2. Make server test ports configurable

**Status:** Complete (2026-05-07).

The server already accepts `PORT` through `startBackend`. The E2E launch command should run with explicit ports:

```text
PORT=6101
REBOUND_SOCKET_PORT=6102
MONGOMS_PORT=27018
REBOUND_DEV_DB_PATH=./dev-e2e
```

The current server computes Socket.IO as `httpPort + 1`, so `REBOUND_SOCKET_PORT` is optional unless a later change makes sockets independently configurable.

### A3. Isolate Mongo memory storage

**Status:** Complete (2026-05-07).

The database helper currently uses port `27017` and `./dev` for development/test. Add env overrides:

```js
const mongoPort = Number(process.env.MONGOMS_PORT || 27017);
const dbPath = process.env.REBOUND_DEV_DB_PATH || (process.env.NODE_ENV === "test" ? "./dev-test" : "./dev");
```

This keeps E2E runs from touching an active local dev database.

E2E and Mocha test runs should reset their disposable database paths before startup. Normal development should keep `./dev` unless `REBOUND_RESET_DEV_DB=1` is explicitly set.

### A4. Add an E2E server command

**Status:** Complete (2026-05-07).

Add root package scripts that keep the command readable and reusable:

```json
{
  "pree2e:server": "kill-port 6101 6102 27018",
  "e2e:server": "cross-env-shell NODE_ENV=development PORT=6101 REBOUND_SOCKET_PORT=6102 MONGOMS_PORT=27018 REBOUND_DEV_DB_PATH=./dev-e2e REBOUND_RESET_DEV_DB=1 \"cd server && node ./src/app.js\"",
  "pree2e:web": "kill-port 3100",
  "e2e:web": "cross-env VITE_API_PROXY_TARGET=http://localhost:6101 vite --host 127.0.0.1 --port 3100"
}
```

Keep these commands internal to Playwright. Normal `pnpm run start`, `pnpm run electron-dev`, and server tests should not change behavior.

The server script launches from `server/` directly so `./dev-e2e` resolves to `server/dev-e2e/` consistently on Windows and Unix-like shells.

## Phase B: Install Playwright Test

### B1. Add dependencies

**Status:** Complete (2026-05-07).

Use `pnpm`, matching `AGENTS.md`:

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

Install only Chromium first. Add Firefox/WebKit after the smoke suite is stable and CI timing is known.

### B2. Add ignored artifacts

**Status:** Complete (2026-05-07).

Add to `.gitignore`:

```gitignore
/playwright-report/
/test-results/
/.auth/
/.playwright-mcp/
/docs/testing/artifacts/
/server/dev-e2e/
/server/dev-test/
```

### B3. Add scripts

**Status:** Complete (2026-05-07).

Root `package.json` should get:

```json
{
	"test:e2e": "playwright test",
	"test:e2e:ui": "playwright test --ui",
	"test:e2e:headed": "playwright test --headed",
	"test:e2e:debug": "playwright test --debug",
	"test:e2e:report": "playwright show-report",
	"test:e2e:install": "playwright install chromium",
	"pw:codegen": "playwright codegen http://127.0.0.1:3100"
}
```

Use `pnpm run test:e2e` in documentation. Use `pnpm exec playwright ...` for one-off commands not covered by scripts.

## Phase C: Playwright config

**Status:** Complete (2026-05-07).

Create `playwright.config.js` at the repo root:

```js
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/e2e",
	outputDir: "./test-results",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",
	use: {
		baseURL: "http://127.0.0.1:3100",
		trace: "on-first-retry",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
	projects: [
		{
			name: "setup",
			testMatch: /.*\.setup\.js/,
		},
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
			dependencies: ["setup"],
		},
	],
	webServer: {
		command: 'pnpm exec concurrently -k -n server,web "pnpm run e2e:server" "pnpm run e2e:web"',
		url: "http://127.0.0.1:3100",
		reuseExistingServer: !process.env.CI,
		timeout: 120000,
	},
});
```

Notes:

- Keep `baseURL` on `127.0.0.1` to avoid localhost/IPv6 differences.
- Use one browser at first to avoid test suite sprawl.
- Use `trace: "on-first-retry"` in CI. Local debugging can use `--trace=on`.
- If the setup project is not needed for the first smoke suite, add it when authenticated flows land.

The initial config keeps only the `chromium` project. Add the setup project when Phase E introduces authenticated storage state.

## Phase D: First committed tests

**Status:** Complete (2026-05-07).

The first specs should validate app boot, navigation, and one stable interactive behavior. They should not require account setup.

### D1. Smoke tests

Create `tests/e2e/smoke.spec.js`:

- Load `/`.
- Assert the app shell renders.
- Navigate to a public route that does not require auth.
- Verify one accessible UI action, such as the `TestingPage` warning snackbar if the route is available in the normal router.

Selectors should prefer:

1. `getByRole`.
2. `getByLabel`.
3. `getByText` for stable user-facing copy.
4. `getByTestId` only when the element lacks a useful accessible surface.

### D2. Add missing accessibility surfaces as needed

If a flow requires brittle CSS selectors, update the UI instead of accepting brittle tests. Examples:

- Add `aria-label` to icon-only buttons.
- Add meaningful button/link text where possible.
- Add `data-testid` only for repeated data-driven records where accessible names are not unique.

### D3. Test data policy

Do not let E2E tests depend on existing local data. Use one of:

- Public unauthenticated pages.
- API-created records in a test-only database.
- Auth setup that creates a unique user per run.

## Phase E: Authenticated E2E

Authenticated flows should use Playwright storage state instead of logging in through the UI in every test.

### E1. Storage state setup

Create `tests/e2e/auth.setup.js`:

- Call server APIs to create a unique user and obtain auth state when possible.
- Fall back to UI registration only if no test helper API exists.
- Save storage state to `.auth/user.json`.

### E2. Auth project

Add a second project:

```js
{
  name: "authenticated-chromium",
  use: {
    ...devices["Desktop Chrome"],
    storageState: ".auth/user.json"
  },
  dependencies: ["setup"],
  testMatch: /authenticated\/.*\.spec\.js/
}
```

### E3. Initial authenticated coverage

Add small tests in this order:

1. User can reach the main authenticated app shell.
2. Chat input accepts text and clears after send, using mocked or test-created room data.
3. Security/settings pages render current user data without crashing.
4. Device sessions page can display and refresh session state.

Keep these tests narrow. Route-level smoke coverage is more valuable than a long brittle happy path at this stage.

## Phase F: Live-stream and media workflows

Live-stream flows are higher risk and should land after the basic suite is stable.

### F1. Browser playback smoke

Test only the viewer side first:

- Seed a live session through server helpers.
- Load `/live/watch/...` or the app route that lists streams.
- Mock HLS/media responses when testing UI state.
- Assert loading, unavailable, and playable states.

### F2. Multi-viewer browser playback

Add browser E2E that opens multiple independent authenticated viewer contexts against one live session. These should use real running web app instances, not component mocks:

```js
const host = await browser.newContext({ storageState: ".auth/host.json" });
const viewerA = await browser.newContext({ storageState: ".auth/viewer-a.json" });
const viewerB = await browser.newContext({ storageState: ".auth/viewer-b.json" });
```

Initial automated cases:

- **Two viewers can join the same active stream**
  - Host creates or seeds an active live session.
  - Viewer A opens `/live/share/:publicToken`.
  - Viewer B opens `/live/share/:publicToken`.
  - Assert both see the live share page, player shell, session state, and a playable or waiting-for-media state.
  - Assert `/live/api/share/:publicToken` returns the same `sessionId` for both users.

- **Viewer disconnect updates control-plane summary**
  - Viewer A and B connect to the same stream.
  - Wait for viewer summary to report at least two viewers on the streamer-side status panel or through the live-control server state if exposed by a test endpoint.
  - Close Viewer B's page/context.
  - Assert the viewer count drops back to one within the control-plane dwell window.

- **Late join during host adaptation**
  - Start a stream and force or simulate a recommendation that marks the host as adapting.
  - Open Viewer B while adaptation is pending.
  - Assert Viewer B sees the "host adjusting" viewer affordance and then clears after the streamer ack or safety timeout.

- **Authenticated access isolation**
  - Viewer A is logged in and can load the live share.
  - A new unauthenticated context opens the same URL and sees the login requirement.
  - Viewer B logs out or uses an expired token and receives the expected auth guard.

Each viewer must be a separate BrowserContext with its own storage state so cookies, localStorage, WebSocket auth, and HLS requests behave like different logged-in users.

### F3. Device-type viewer matrix

Expand Playwright projects for viewer-side stream tests after the basic multi-viewer suite is stable:

```js
projects: [
	{ name: "viewer-desktop-chrome", use: { ...devices["Desktop Chrome"] } },
	{ name: "viewer-desktop-firefox", use: { ...devices["Desktop Firefox"] } },
	{ name: "viewer-mobile-chrome", use: { ...devices["Pixel 5"] } },
	{ name: "viewer-mobile-safari", use: { ...devices["iPhone 13"] } },
];
```

Do not run the full matrix on every PR at first. Recommended tiers:

- PR: `viewer-desktop-chrome`.
- Nightly: desktop Chrome, Firefox, and mobile Chrome emulation.
- Release candidate: full matrix including WebKit/mobile Safari.
- Manual field pass: actual phone/tablet/laptop hardware using real browsers and real accounts.

Device-specific assertions:

- **Mobile viewport**
  - Player controls fit without overlap.
  - Live latency/status chips remain visible.
  - Fullscreen control is present or gracefully unavailable.
  - Touch play/pause and volume behavior does not break layout.

- **Low-power viewer**
  - `viewerProbe` reports codec support and `mediaCapabilities` smooth/power-efficient values when available.
  - The server recommendation avoids codecs the viewer cannot decode.

- **High-DPI viewer**
  - `display.devicePixelRatio`, viewport size, and screen size reach the live-control channel.
  - Recommendation does not over-target resolution for a small viewport.

### F4. Real-account end-to-end runs

Add a non-CI runbook for real accounts on staging or a controlled production-like environment. These tests intentionally use the real deployed web app and real user accounts because they validate auth, cookies, WebSocket credentials, browser media policy, and routing exactly as users see them.

For these runs, Playwright should point at the real web origin with a `PLAYWRIGHT_REAL_BASE_URL` environment variable instead of the local Vite server. The host Electron app should use the same origin through `REBOUND_ELECTRON_RENDERER_URL` and `REBOUND_ELECTRON_API_BASE` so host and viewers are exercising the same running web instance.

Minimum accounts:

```text
stream-host-nvidia@example.test
viewer-desktop-fast@example.test
viewer-laptop-wifi@example.test
viewer-phone-cellular@example.test
viewer-tablet@example.test
viewer-lowend@example.test
```

Rules:

- Use dedicated test accounts, never personal accounts.
- Store credentials in the runner secret store or manual password manager, not in the repo.
- Save Playwright storage states under `.auth/real/` and keep them ignored.
- Rotate or reset accounts after release validation.
- Record browser, OS, device model, network type, and account ID in `docs/testing/playwright-test-map.md` or a linked test-run report.

Real-account cases:

- Host starts desktop stream from the Electron app while logged in as `stream-host-*`.
- Viewer desktop joins from a separate logged-in web browser.
- Viewer phone joins from an actual mobile browser.
- Viewer tablet joins later.
- Viewer laptop disconnects abruptly by closing the tab.
- Viewer phone switches network class, such as Wi-Fi to cellular, when available.
- Host stops stream.
- All viewers observe ended/unavailable state without stale playback URLs continuing indefinitely.

### F5. Connection quality and speed tests

Add a test harness for network quality that can run locally and in selected CI jobs:

- Use Playwright context routing or a local proxy for viewer-side HLS requests.
- Inject latency, jitter, throttled throughput, packet-loss-like aborts, and temporary 500/404 responses for playlists or segments.
- Keep main-process streamer network tests separate because Playwright BrowserContext routing only controls renderer requests, not Node `fetch()` in Electron main.

Quality scenarios:

- **Fast stable link**
  - Segment load fraction stays low.
  - Player remains near target live latency.
  - No adaptation recommendation is emitted after initial settle.

- **Constrained bandwidth**
  - Throttle viewer segment requests below current encoded bitrate.
  - `loadFractionAvg` rises.
  - Viewer capabilities update with `triggeredBy: "hls_bandwidth"` or level-drop signal.
  - Server recommends lower bitrate/FPS/resolution within the host ceiling.
  - Host status panel shows recommendation.
  - Streamer applies the recommendation when auto-adapt is enabled.
  - Viewer sees "host adjusting" and playback recovers.

- **Jittery link**
  - Add random delay to segments and playlists.
  - Assert player shows buffering/reconnecting states but does not enter fatal playback error.
  - Assert HLS recovery path calls `startLoad()` on network errors.

- **Temporary disconnect**
  - Abort or fail HLS segment requests for 5-15 seconds.
  - Assert player reconnects once the route recovers.
  - Assert live-control socket reconnects and sends fresh capabilities.

- **Slow viewer leaves**
  - Viewer A has constrained bandwidth and triggers a downshift.
  - Viewer B has fast bandwidth.
  - Close Viewer A.
  - After dwell window, server recommends raising quality back toward the host ceiling.
  - Host applies raise only within initial ceiling.

Metrics to capture per run:

```text
startup_time_ms            click/open -> first frame or canplay
time_to_playable_ms        share page load -> player playable
live_latency_seconds       seekable live edge - currentTime
rebuffer_count             video waiting events after first play
rebuffer_total_ms          total waiting duration
segment_load_fraction_avg  segmentLoadDuration / segmentPlayableDuration
hls_bandwidth_mbit         hls.js bandwidth estimate
viewer_count               live-control viewer summary
recommendation_count       server recommendations emitted
adaptation_ack_ms          recommendation -> streamer ack
streamer_respawn_ms        stop old FFmpeg -> new media playable
upload_success_rate        successful PUTs / attempted PUTs
segment_gap_count          missing or non-monotonic HLS segments
```

Suggested acceptance targets for the first baseline:

- First playable frame within 10 seconds on a local/staging LAN.
- Live latency remains within 2-4 target segments during stable playback.
- Zero fatal playback errors in a 30-minute steady-state run.
- Rebuffer total under 1% of watch time on a stable link.
- Viewer count converges within 5 seconds of join/leave.
- Streamer adaptation ack within 12 seconds of recommendation.
- No orphan FFmpeg process after stop or failed start.

These thresholds are starting points. Record actual baseline numbers before making them hard CI gates.

Field-run report template:

```markdown
## Streaming Field Run: YYYY-MM-DD

Environment:

- App build:
- Server URL:
- Host account:
- Viewer accounts:
- Host hardware:
- Viewer devices:
- Network conditions:

Scenario:

- Host source:
- Codec/settings:
- Viewers joined:
- Viewers disconnected:
- Network changes:

Metrics:

- startup_time_ms:
- time_to_playable_ms:
- live_latency_seconds p50/p95:
- rebuffer_count:
- rebuffer_total_ms:
- segment_load_fraction_avg p50/p95:
- recommendation_count:
- adaptation_ack_ms:
- upload_success_rate:
- host_cpu_percent p50/p95:
- host_gpu_encoder_percent p50/p95:

Failures:

- Playback:
- Control plane:
- Upload:
- Encoder:
- Cleanup:
```

### F6. Planned streaming scripts

After the first deterministic stream tests exist, add explicit scripts so people do not need to remember test filters:

```json
{
	"test:e2e:live": "playwright test live -c playwright.config.js",
	"test:electron:live": "playwright test live -c playwright.electron.config.js",
	"test:streaming:quality": "playwright test tests/e2e/live/quality.spec.js -c playwright.config.js",
	"test:streaming:real-accounts": "playwright test tests/e2e/live/real-accounts.spec.js -c playwright.config.js --headed"
}
```

Keep `test:streaming:real-accounts` out of CI by default. It depends on real accounts, a real web deployment, and real devices.

### F7. Desktop capture boundaries

Desktop capture starts in the Electron main process and uses the preload bridge, so it belongs to the dedicated Playwright Electron track in Phase H. Browser E2E can validate viewer-side stream state and HLS UI, but it should not try to fake Electron-only APIs through `window.electronAPI`.

### F8. Media artifact policy

Do not commit video traces or media captures. If a media fixture is required, commit a tiny deterministic fixture under `tests/e2e/fixtures/media/` with a clear license note.

## Phase G: CI rollout

Add a separate GitHub Actions workflow after local tests pass reliably:

```yaml
name: Playwright E2E

on:
  pull_request:
  push:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm run test:e2e
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

CI should start Chromium only. Add cross-browser jobs later as a scheduled or manual workflow if the suite becomes broad enough to justify it.

## Phase H: Playwright Electron implementation plan

Playwright Electron should be a separate test track from browser E2E. Browser E2E proves the web app works in real browsers. Electron tests prove the desktop shell, main process, preload bridge, IPC handlers, app protocol, auto-update event bridge, source service integration, and desktop live-stream entry points work.

### H1. API stance

The official Playwright Electron API is experimental. It is accessed through `_electron` and launches an Electron app with `electron.launch(options)`. The returned `ElectronApplication` can:

- Access the first renderer window with `firstWindow()`.
- Access all renderer windows with `windows()`.
- Wait for a new Electron window with `waitForEvent("window")`.
- Evaluate code in the Electron main process with `evaluate()`.
- Retrieve the `BrowserWindow` handle for a `Page` with `browserWindow(page)`.
- Access the browser context with `context()` for renderer-side routing and storage.
- Access the launched Electron child process with `process()`.
- Listen for main-process `console`, `window`, and `close` events.

The repo currently uses Electron `^36.9.5`, which is above the Electron versions listed as supported by Playwright Electron. Keep a note in `docs/testing/playwright-electron.md` that this API is experimental and should be smoke-tested after Playwright or Electron updates.

### H2. Dependency and import decision

Inside Playwright Test specs, prefer:

```js
import { test as base, expect, _electron as electron } from "@playwright/test";
```

During implementation, verify this import works under pnpm's strict dependency layout. If the installed `@playwright/test` version does not expose `_electron`, add `playwright` as an explicit dev dependency and import `_electron` from `playwright`, matching the Playwright API docs:

```js
import { _electron as electron } from "playwright";
```

Do not rely on an undeclared transitive package.

### H3. Runtime prep in `public/electron.js`

Electron tests need deterministic URLs, API targets, and user data. Add test-friendly environment hooks before the first Electron smoke test:

```js
if (process.env.REBOUND_ELECTRON_USER_DATA_DIR) {
	app.setPath("userData", process.env.REBOUND_ELECTRON_USER_DATA_DIR);
}

const getElectronRendererUrl = () => process.env.REBOUND_ELECTRON_RENDERER_URL || "http://localhost:3000";

const getElectronApiBase = () => process.env.REBOUND_ELECTRON_API_BASE || (isDev ? "http://localhost:6001/api" : "https://rebound.nexus/api");
```

The `app.setPath("userData", ...)` hook must run before `userFfmpegRoot` is derived from `app.getPath("userData")`.

Use `getElectronRendererUrl()` in `createWindow()` when `isDev` is true. Use `getElectronApiBase()` in Google auth instead of the current hard-coded dev API base.

Add an optional source-service gate:

```js
const shouldStartSourceService = process.env.REBOUND_ELECTRON_DISABLE_SOURCE_SERVICE !== "1";
```

Use it to skip `sourceService.start()` in basic smoke tests. Source capture tests can enable it explicitly. This reduces flake from OS capture permissions and display availability.

### H4. Scripts

Add root scripts after browser E2E is stable:

```json
{
	"e2e:electron:web": "cross-env VITE_API_PROXY_TARGET=http://localhost:6101 vite --host 127.0.0.1 --port 3200",
	"test:electron": "playwright test -c playwright.electron.config.js",
	"test:electron:debug": "cross-env PWDEBUG=1 playwright test -c playwright.electron.config.js --debug",
	"test:electron:report": "playwright show-report playwright-report/electron"
}
```

The Electron web server uses port `3200` so it does not collide with normal dev (`3000`) or browser E2E (`3100`). The launched Electron app receives `REBOUND_ELECTRON_RENDERER_URL=http://127.0.0.1:3200`.

### H5. Electron Playwright config

Create `playwright.electron.config.js`:

```js
import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/electron",
	outputDir: "./test-results/electron",
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI
		? [["github"], ["html", { open: "never", outputFolder: "playwright-report/electron" }]]
		: [["html", { outputFolder: "playwright-report/electron" }]],
	use: {
		trace: "on-first-retry",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
	webServer: {
		command: 'pnpm exec concurrently -k -n server,web "pnpm run e2e:server" "pnpm run e2e:electron:web"',
		url: "http://127.0.0.1:3200",
		reuseExistingServer: !process.env.CI,
		timeout: 120000,
	},
});
```

Keep Electron tests single-worker. The app has one main process, a single-user data directory per app instance, update events, desktop capture state, and FFmpeg process state; parallel Electron windows will create hard-to-debug shared-state failures.

### H6. Shared Electron fixture

Create `tests/electron/helpers/electronTest.js`:

```js
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, expect, _electron as electron } from "@playwright/test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const test = base.extend({
	electronApp: async ({}, use, testInfo) => {
		const electronApp = await electron.launch({
			args: ["public/electron.js"],
			cwd: repoRoot,
			env: {
				...process.env,
				NODE_ENV: "development",
				REBOUND_ELECTRON_RENDERER_URL: "http://127.0.0.1:3200",
				REBOUND_ELECTRON_API_BASE: "http://127.0.0.1:6101/api",
				REBOUND_ELECTRON_USER_DATA_DIR: testInfo.outputPath("user-data"),
				REBOUND_ELECTRON_DISABLE_SOURCE_SERVICE: "1",
			},
			artifactsDir: testInfo.outputPath("electron-artifacts"),
			timeout: 60000,
		});

		electronApp.on("console", async (msg) => {
			const values = await Promise.all(msg.args().map((arg) => arg.jsonValue().catch(() => String(arg))));
			console.log("[electron:main]", ...values);
		});

		try {
			await use(electronApp);
		} finally {
			await electronApp.close().catch(() => {});
		}
	},

	electronWindow: async ({ electronApp }, use) => {
		const window = await electronApp.firstWindow({ timeout: 60000 });
		window.on("console", (msg) => console.log("[electron:renderer]", msg.text()));
		await window.waitForLoadState("domcontentloaded");
		await use(window);
	},
});

export { expect };
```

If the import path for `_electron` changes during implementation, update only this helper and keep specs unchanged.

### H7. First Electron smoke specs

Create `tests/electron/smoke.spec.js` with these tests:

1. **Main process launches**
   - Launch Electron.
   - Use `electronApp.evaluate(({ app }) => app.getAppPath())`.
   - Assert the app path is the repo root or expected app path.
   - Assert `electronApp.process().pid` is a positive number.

2. **Renderer window loads**
   - Use `electronApp.firstWindow()`.
   - Assert the URL starts with `http://127.0.0.1:3200` or `http://localhost:3200`.
   - Assert the title or an app-shell element is visible.

3. **Preload bridge is present**
   - Evaluate in the renderer:
     ```js
     await window.evaluate(() => ({
      inElectron: globalThis.IN_ELECTRON_ENV === true,
      hasElectronApi: Boolean(window.electronAPI),
      hasSystemApi: typeof window.electronAPI?.system?.getFfmpegPath === "function",
      hasLiveStreamApi: typeof window.electronAPI?.liveStream?.getState === "function",
      hasSourcesApi: typeof window.electronAPI?.sources?.list === "function",
     }));
     ```
   - Assert all expected bridge properties are present.

4. **System IPC responds**
   - Call `window.electronAPI.system.getFfmpegPath()`.
   - Assert the returned value is a string ending in `ffmpeg` or `ffmpeg.exe`.
   - Call `window.electronAPI.system.getFfprobePath()` similarly.

5. **Live stream manager starts idle**
   - Call `window.electronAPI.liveStream.getState()`.
   - Assert `status` is `idle`.
   - Call `window.electronAPI.liveStream.getCapabilities()`.
   - Assert it includes `platform`, `videoCodecs`, `audioCodecs`, and `captureBackends`.

6. **Simulated update bridge works**
   - Register `onUpdateAvailable`, `onDownloadProgress`, or `onUpdateDownloaded` listeners from the renderer.
   - Call `window.electronAPI.simulateUpdate()`.
   - Assert at least the simulated update-available payload arrives with `version: "SIMULATED"`.
   - Keep this test tolerant of timing because the existing simulated download emits over several seconds.

### H8. IPC and multi-window specs

Create `tests/electron/ipc.spec.js` after the smoke spec is stable:

- **Google auth starts a child window**
  - Do not hit real Google.
  - Point `REBOUND_ELECTRON_API_BASE` at the E2E server.
  - If needed, add a dev-only mocked auth route or route the Google auth URL at the BrowserContext level.
  - Use `const authWindowPromise = electronApp.waitForEvent("window")`.
  - Trigger `window.electronAPI.auth.startGoogleLogin("http://127.0.0.1:3200/?authComplete=google")`.
  - Assert a second window appears and can be closed.

- **Main process window count is sane**
  - Use `electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)`.
  - Assert the expected window count after opening and closing auth flows.

- **BrowserWindow handle can inspect shell state**
  - Use `const bw = await electronApp.browserWindow(page)`.
  - Evaluate width, height, title, or destroyed state through the handle only when the renderer `Page` API cannot express the assertion.

### H9. Desktop source and live-stream tests

Add these only after smoke and IPC specs are reliable:

- Enable `REBOUND_ELECTRON_DISABLE_SOURCE_SERVICE=0`.
- Test `window.electronAPI.sources.list()` returns an array. On CI, allow an empty array if the platform has no available capture source.
- Test `sources.captureOnce()` only locally or in a platform-specific job with known display permissions.
- For live streaming, prefer file-source mode over desktop capture in CI:
  - Use a tiny committed media fixture.
  - Stub or seed auth/live-create token state.
  - Start a session through `window.electronAPI.liveStream.start({ sourceMode: "file", filePath, ... })`.
  - Assert state transitions `starting` -> `streaming` -> `idle`.
  - Assert `window.electronAPI.liveStream.stop()` cleans up the FFmpeg process.

Desktop capture and real FFmpeg encode tests should be opt-in until there is stable CI infrastructure for display capture.

Host-side desktop streaming cases:

- **Screen source starts and stops**
  - Enable source service.
  - Select the first `screen` source returned by `sources.list({ types: ["screen"] })`.
  - Start a stream with logged-in host credentials or a live create token.
  - Assert `liveStream.getState()` transitions to `streaming`, exposes `sessionInfo`, and includes an `ffmpegPid`.
  - Assert the `/live/api/share/:publicToken` endpoint becomes playable for an authenticated viewer.
  - Stop stream and assert `ffmpegPid` is null and status is `idle`.

- **Window source starts and stops**
  - Open a deterministic local browser window or test app window as the captured target.
  - Select a `window` source by name or appName.
  - Start stream at low-risk settings: 720p, 30 FPS, 3-4 Mbit/s, H.264 when available.
  - Verify playback from a separate web context.
  - Stop and assert temp segment directory is removed.

- **Capture permission unavailable**
  - Run with source service enabled on a platform without display permissions.
  - Assert the UI surfaces a useful source-list or capture error and the main process remains alive.
  - Assert `liveStream.getState()` remains `idle`.

- **FFmpeg startup failure**
  - Launch Electron with an invalid FFmpeg path override or temporarily point to a non-executable fixture.
  - Attempt start.
  - Assert a user-facing error, no active session leak, no uploader loop, and no orphan process.

- **Uploader interruption**
  - Start file-source or screen-source stream.
  - Temporarily fail segment upload requests from the E2E server or test proxy.
  - Assert logs record upload failures.
  - Restore the route and assert uploader recovers or the stream stops cleanly according to the intended policy.

- **Auto-adapt respawn**
  - Start stream with `autoAdaptEnabled: true`.
  - Connect a constrained viewer that causes a lower recommendation.
  - Assert Electron receives `recommended-settings`, applies a diff through the adapter, respawns FFmpeg, and sends an ack.
  - Assert the viewer sees the adapting message and then resumes playback.

Host hardware matrix for real desktop streaming:

| Host OS             | GPU / encoder      | Capture backend                        | Codecs to test                                         | Baseline settings |
| ------------------- | ------------------ | -------------------------------------- | ------------------------------------------------------ | ----------------- |
| Windows 11          | NVIDIA RTX / NVENC | `gdigrab` or `gfxcapture`              | `h264_nvenc`, `hevc_nvenc`, `av1_nvenc` when supported | 1080p60, 8M       |
| Windows 11          | Intel iGPU / QSV   | `gdigrab` or `gfxcapture`              | `h264_qsv`, `hevc_qsv`, `av1_qsv` when supported       | 1080p60, 6M       |
| Windows 11          | AMD GPU / AMF      | `gdigrab` or `gfxcapture`              | AMF-backed H.264/HEVC if the local profile supports it | 1080p60, 6M       |
| macOS Apple Silicon | VideoToolbox       | `avfoundation` / display capture path  | `h264_videotoolbox`, `hevc_videotoolbox`               | 1080p60, 6M       |
| Linux NVIDIA        | NVENC              | `x11grab` or Wayland-supported path    | `h264_nvenc`, `hevc_nvenc`, `av1_nvenc` when supported | 1080p60, 8M       |
| Linux Intel         | QSV/VAAPI          | `x11grab` or Wayland-supported path    | QSV/VAAPI-backed H.264/HEVC/AV1 if supported           | 720p30, 4M        |
| CPU-only fallback   | software           | file source first, screen only locally | `libx264`/software codec if added to profile           | 720p30, 2.5M      |

For each hardware row, capture:

```text
host_cpu_model
host_gpu_model
driver_version
os_version
capture_backend
video_codec
encoder_preset
resolution
fps
video_bitrate
ffmpeg_command
time_to_streaming_ms
average_encoder_speed
dropped_frame_or_duplicate_frame_count
segment_duration_p50/p95
segment_size_p50/p95
upload_pass_duration_p50/p95
cpu_percent_p50/p95
gpu_encoder_percent_p50/p95
memory_rss_mb_p50/p95
```

Use the profiler/GPU plan when available to collect GPU encoder utilization. Until then, parse FFmpeg logs and OS tools manually in the runbook.

### H10. Renderer routing and main-process networking

`electronApp.context().route()` can mock requests made by renderer windows. It will not reliably mock Node `fetch()` calls made in the Electron main process, such as live-stream session creation. For main-process network paths, prefer:

- E2E server fixtures.
- Environment-controlled API base URLs.
- Test-only dev endpoints.
- Narrow dependency injection in the module under test if the behavior can be unit-tested outside Electron.

Document this distinction because it is a common source of false assumptions when mixing BrowserContext tools with Electron main-process code.

### H11. Packaged app smoke

Add packaged Electron tests only after source-mode Electron smoke passes:

```text
tests/electron/packaged.spec.js
```

Scope:

- Run `pnpm run build`.
- Launch the packaged or unpacked app artifact with `electron.launch({ executablePath, args: [...] })`.
- Assert `app.isPackaged` is true via `electronApp.evaluate`.
- Assert `app://-/index.html` loads.
- Assert the custom `app` protocol serves JS, CSS, and image resources.

Do not run packaged tests on every PR at first. They are slower and overlap with the existing Electron build workflow.

### H12. Electron artifacts

Use ignored paths only:

```text
test-results/electron/
playwright-report/electron/
docs/testing/artifacts/electron/
```

Attach these when debugging:

- Main process console messages from `electronApp.on("console")`.
- Renderer console messages from `window.on("console")`.
- Screenshots on failure.
- Traces on retry.
- Videos on failure.

Never commit Electron user data directories or storage state.

### H13. Electron CI

Start with a separate workflow or manual job:

```yaml
name: Playwright Electron

on:
  workflow_dispatch:
  pull_request:
    paths:
      - "public/electron.js"
      - "public/preload.js"
      - "public/electron-live-stream.js"
      - "public/sources/**"
      - "tests/electron/**"
      - "playwright.electron.config.js"

jobs:
  electron-smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: xvfb-run -a pnpm run test:electron
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-electron-report
          path: playwright-report/electron/
          retention-days: 7
```

Linux CI needs `xvfb-run` because Electron opens a real desktop window. Windows CI can run without Xvfb, but source-capture and display enumeration assertions should remain tolerant.

### H14. Ownership boundaries

- Browser E2E owns route rendering, forms, auth flows, chat UI, and viewer playback states in regular browsers.
- Electron tests own main-process lifecycle, preload bridge, IPC, Electron-only menus/windows, app protocol, update bridge, source service, and desktop live-stream entry points.
- Unit tests under `public/streaming/**/__tests__` continue to own pure pipeline, uploader, parser, and adapter behavior.
- Server Mocha tests continue to own API route and persistence behavior.

Do not duplicate the same assertion across all layers unless a bug has proved that the boundary matters.

## Phase I: Playwright MCP implementation plan

Playwright MCP is for AI-assisted exploration, not CI.

### I1. Recommended MCP config

Prefer a pnpm-native config for this repo:

```json
{
	"mcpServers": {
		"playwright": {
			"command": "pnpm",
			"args": ["dlx", "@playwright/mcp@latest", "--caps=testing,storage,devtools", "--isolated"]
		}
	}
}
```

Document the official `npx @playwright/mcp@latest` config as an alternative for clients that do not work cleanly with `pnpm dlx`.

### I2. Capability policy

Default for Rebound test discovery:

```text
testing,storage,devtools
```

Add only when needed:

- `network`: API inspection or request mocking.
- `vision`: canvas, video controls, or elements not exposed in accessibility snapshots.
- `pdf`: only for export workflows.

Avoid enabling every capability by default. Smaller tool surfaces make agent work more predictable.

### I3. State policy

Use `--isolated` for test discovery unless the task explicitly needs a persistent login. For authenticated flows:

- Prefer storage state files under `.auth/`.
- Never commit storage state.
- Never reuse a developer's personal browser profile for committed test generation.

### I4. MCP output policy

MCP exploration may produce:

- Candidate flows.
- Locator hints.
- Screenshots.
- Traces.
- Draft test code.

Before committing anything:

- Convert draft code into normal Playwright Test specs.
- Replace brittle selectors with role/label/test-id selectors.
- Remove personal data and generated state.
- Run `pnpm run test:e2e`.
- Update `docs/testing/playwright-test-map.md` with the new covered flow.

## Phase J: Playwright agent CLI implementation plan

The agent CLI is useful when a coding agent can run shell commands and should avoid MCP's larger tool schema and snapshot context.

### J1. Installation options

Document two options:

```bash
pnpm add -D @playwright/cli
pnpm exec playwright-cli --help
pnpm exec playwright-cli install --skills
```

or personal global install:

```bash
pnpm add -g @playwright/cli
playwright-cli install --skills
```

Use local dev dependency if the repo wants reproducible agent CLI behavior. Use personal global install if this remains developer tooling outside CI.

### J2. Repo scripts if local dependency is chosen

```json
{
	"pwcli:help": "playwright-cli --help",
	"pwcli:open": "playwright-cli open http://127.0.0.1:3100",
	"pwcli:show": "playwright-cli show",
	"pwcli:skills": "playwright-cli install --skills"
}
```

### J3. CLI usage rules

Use agent CLI for:

- Quick browser exploration.
- Screenshots during implementation.
- Network and storage inspection.
- Producing locator candidates.
- Debugging one failing flow interactively.

Do not use agent CLI as:

- A replacement for committed specs.
- A hidden dependency in CI.
- A way to bypass Playwright Test assertions.

### J4. Skills maintenance

If `playwright-cli install --skills` is used, document:

- Where the skills were installed.
- Which agent uses them.
- When they were last regenerated.
- Which Playwright CLI version generated them.

Regenerate skills whenever `@playwright/cli` is updated.

## Phase K: Playwright Test Agents

Playwright Test Agents can produce a planner/generator/healer loop. Treat them as optional after the base suite exists.

### K1. Init command

Use the loop that matches the target agent:

```bash
pnpm exec playwright init-agents --loop=claude
pnpm exec playwright init-agents --loop=vscode
pnpm exec playwright init-agents --loop=opencode
```

Do not run this blindly in the first Playwright PR. It creates agent definitions that should be reviewed.

### K2. Agent output policy

The planner's Markdown plan can be committed only if it is rewritten as a durable product test plan under `docs/testing/`.

The generator's specs can be committed only after:

- Selectors are reviewed.
- Test data setup is deterministic.
- The tests pass locally.
- The test map is updated.

The healer's changes should be reviewed like any other code change. A healed test that weakens assertions should be rejected.

### K3. Regeneration

Official Playwright docs say generated Test Agent definitions should be regenerated when Playwright is updated. Add that to `docs/testing/playwright-doc-maintenance.md` and the dependency update checklist.

## Documentation system

Documentation should be split by audience and update frequency.

### `docs/testing/playwright.md`

Primary source of truth. Include:

- Setup commands.
- Script reference.
- How to run the suite locally.
- Artifact locations.
- How to add a new test.
- Selector policy.
- Auth/storage state policy.
- CI behavior.

### `docs/testing/playwright-test-map.md`

Living coverage map. Keep one row per durable scenario:

```markdown
| Area      | Scenario           | Spec                      | Data setup | Owner notes |
| --------- | ------------------ | ------------------------- | ---------- | ----------- |
| App shell | Public app renders | `tests/e2e/smoke.spec.js` | none       | First smoke |
```

This prevents agents from regenerating duplicate tests.

### `docs/testing/playwright-mcp.md`

MCP runbook. Include:

- Recommended MCP config.
- Capability presets.
- Isolated vs persistent state rules.
- How to save storage state safely.
- How to convert MCP exploration into a Playwright Test spec.
- What never gets committed.

### `docs/testing/playwright-cli.md`

Agent CLI runbook. Include:

- Local or global install decision.
- `playwright-cli install --skills` instructions.
- Common commands.
- How CLI sessions map to local dev servers.
- When to prefer CLI over MCP.

### `docs/testing/playwright-electron.md`

Electron runbook. Include:

- The experimental status of Playwright Electron.
- Required Electron env hooks.
- Source-mode launch command and config.
- Packaged-app smoke strategy.
- Main-process vs renderer-process assertion examples.
- Preload bridge and IPC testing patterns.
- Source capture limitations on CI.
- Xvfb requirements on Linux.
- Artifact locations.

### `docs/testing/playwright-streaming.md`

Desktop streaming validation runbook. Include:

- Automated CI-safe streaming smoke tests.
- Real-account staging test accounts and storage-state rules.
- Multi-viewer join/leave scenarios.
- Device matrix for desktop, mobile, tablet, high-DPI, and low-power viewers.
- Host hardware matrix for NVIDIA/NVENC, Intel/QSV, AMD/AMF, Apple/VideoToolbox, Linux capture, and CPU fallback.
- Network quality scenarios for stable, throttled, jittery, disconnected, and recovering viewers.
- Required metrics, thresholds, and report template.
- Which tests are PR-gated, nightly, release-candidate, manual, or hardware-lab only.
- How to record environment details without committing credentials, tokens, user data, or large media artifacts.

### `docs/testing/playwright-runbook.md`

Debugging guide. Include:

- Running one spec.
- Running headed.
- UI mode.
- Debug mode.
- Opening the HTML report.
- Opening traces.
- Updating browser binaries.
- Common port/database failures in this repo.

### `docs/testing/playwright-doc-maintenance.md`

Maintenance checklist. Include:

- Last Playwright docs review date.
- Installed versions.
- Browser install command last used.
- Electron launch mode and Electron version last verified.
- MCP config last verified date.
- Agent CLI skills last regenerated date.
- Test Agents last regenerated date, if used.

## Documentation maintenance policy

Every future PR that changes Playwright behavior should answer these checklist items:

```markdown
- [ ] Did a test script change? Update `docs/testing/playwright.md`.
- [ ] Did a spec add/remove coverage? Update `docs/testing/playwright-test-map.md`.
- [ ] Did MCP config/capabilities change? Update `docs/testing/playwright-mcp.md`.
- [ ] Did agent CLI usage or skills change? Update `docs/testing/playwright-cli.md`.
- [ ] Did Electron launch, preload, IPC, or artifact behavior change? Update `docs/testing/playwright-electron.md`.
- [ ] Did live-streaming test coverage, metrics, device matrix, hardware matrix, or thresholds change? Update `docs/testing/playwright-streaming.md`.
- [ ] Did troubleshooting knowledge change? Update `docs/testing/playwright-runbook.md`.
- [ ] Did Playwright, Electron, MCP, or CLI versions change? Update `playwright-doc-maintenance.md`.
```

Add a short "Docs touched/not needed" note to PR descriptions for Playwright-related work.

## Version update policy

When updating `@playwright/test`:

1. Run `pnpm add -D @playwright/test@latest`.
2. Run `pnpm exec playwright install chromium`.
3. Run `pnpm exec playwright --version`.
4. Run `pnpm run test:e2e`.
5. Run `pnpm run test:electron` if Electron tests have been implemented.
6. Update `docs/testing/playwright-doc-maintenance.md`.
7. If Test Agents are used, regenerate their definitions.

When updating `electron`:

1. Run the existing Electron dev workflow.
2. Run `pnpm run test:electron`.
3. Verify `electronApp.evaluate(({ app }) => app.getVersion())` still works.
4. Verify `firstWindow()`, preload bridge assertions, and IPC smoke tests still pass.
5. Update `docs/testing/playwright-electron.md` if launch flags, app paths, or platform behavior changed.
6. Update `docs/testing/playwright-doc-maintenance.md`.

When updating `@playwright/cli`:

1. Update the dependency or personal global package.
2. Run `playwright-cli --help`.
3. Run `playwright-cli install --skills` if skills are used.
4. Update `docs/testing/playwright-cli.md`.
5. Update `docs/testing/playwright-doc-maintenance.md`.

When updating MCP config:

1. Verify the client can start `@playwright/mcp@latest`.
2. Verify capabilities are limited to the required set.
3. Verify isolated storage behavior.
4. Update `docs/testing/playwright-mcp.md`.
5. Update `docs/testing/playwright-doc-maintenance.md`.

## Validation plan

### Local validation

Run:

```bash
pnpm run test:e2e
pnpm run test:e2e:headed -- smoke.spec.js
pnpm run test:e2e:report
```

Expected:

- Vite starts on `127.0.0.1:3100`.
- Server starts on `6101`.
- Mongo memory server uses the E2E-specific port/path.
- Chromium runs tests headlessly.
- HTML report opens after request.
- No Playwright artifacts appear in `git status`.

### CI validation

Expected:

- `pnpm install --frozen-lockfile` succeeds.
- `pnpm exec playwright install --with-deps chromium` succeeds.
- `pnpm run test:e2e` exits non-zero on failures.
- HTML report uploads on both pass and fail, or at least on fail.

### MCP validation

Ask the configured MCP client:

```text
Navigate to http://127.0.0.1:3100, take an accessibility snapshot, and verify the app shell is visible.
```

Expected:

- Browser starts isolated.
- Snapshot contains accessible app elements.
- No personal profile state is used.
- Any saved storage file lands under `.auth/` and is ignored.

### Agent CLI validation

Run:

```bash
playwright-cli open http://127.0.0.1:3100 --headed
playwright-cli snapshot
playwright-cli screenshot
playwright-cli close
```

Expected:

- CLI can connect to the local app.
- Snapshot is useful for locator discovery.
- Screenshot lands in a documented ignored artifact path.

### Electron validation

Run:

```bash
pnpm run test:electron
pnpm run test:electron:report
```

Expected:

- Vite starts on `127.0.0.1:3200`.
- Server starts on `6101`.
- Electron launches from `public/electron.js`.
- `electronApp.firstWindow()` resolves within 60 seconds.
- The renderer reports `globalThis.IN_ELECTRON_ENV === true`.
- `window.electronAPI.system.getFfmpegPath()` and `getFfprobePath()` return platform-specific paths.
- `window.electronAPI.liveStream.getState()` returns `idle` before any stream starts.
- The simulated update event bridge emits the expected simulated payload.
- No Electron user data or artifacts appear in `git status`.

### Desktop streaming validation

Run by tier:

```bash
pnpm run test:e2e -- live
pnpm run test:electron -- live
pnpm run test:streaming:real-accounts
pnpm run test:streaming:quality
```

The last two scripts are future harnesses from `docs/testing/playwright-streaming.md`; they should be added only after the smoke path is stable.

Expected automated smoke result:

- Electron host starts a file-source stream or a permitted screen-source stream.
- A separate authenticated web viewer opens the live share page with its own storage state.
- HLS playlists and segments are fetched through the normal `/live/watch/:publicToken/...` routes.
- The player reaches playable or waiting-for-media state without fatal errors.
- `/live-control` connects for streamer and viewer.
- Viewer summary reflects join and disconnect.
- Host stop ends the session and clears FFmpeg.

Expected real-account field result:

- Host and every viewer are distinct logged-in accounts.
- At least one desktop browser, one laptop/Wi-Fi browser, one phone, and one tablet join the same stream.
- A slow viewer can trigger quality reduction; after it disconnects, quality can rise back toward the host ceiling.
- Playback recovers from a temporary network interruption.
- Run report records startup time, live latency, rebuffer count, segment load fraction, recommendation count, adaptation ack time, upload success rate, and host CPU/GPU stats.

## Suggested implementation order

1. Phase A: isolate ports and Mongo path.
2. Phase B: install Playwright Test, browsers, scripts, ignores.
3. Phase C: add `playwright.config.js`.
4. Phase D: add smoke tests.
5. Add `docs/testing/playwright.md`, runbook, and test map.
6. Add CI workflow.
7. Add authenticated setup and tests.
8. Add Electron env hooks, `playwright.electron.config.js`, and source-mode smoke tests.
9. Add live-stream/browser playback tests with multi-viewer join/leave coverage.
10. Add `docs/testing/playwright-streaming.md` with real-account, device, hardware, and network-quality matrices.
11. Add MCP runbook and recommended config.
12. Add agent CLI runbook and optional local dependency.
13. Add Playwright Test Agents only if the base workflow is stable and there is a real use case.
14. Add Electron IPC, source-service, live-stream, and packaged-app tests.
15. Add hardware-lab and real-account streaming validation scripts once metrics are stable.

## Risks and mitigations

- **Port conflicts**: use isolated E2E ports and make Vite proxy configurable.
- **Mongo dev data contamination**: add E2E-specific Mongo port/path before auth tests.
- **Flaky selectors**: require role/label-first selectors and add accessibility labels to the app.
- **Slow CI**: start Chromium-only, add browser matrix later.
- **Experimental Electron API**: keep Electron tests smoke-focused, run them after Playwright/Electron updates, and document API changes immediately.
- **Electron CI display requirements**: use Xvfb on Linux and keep desktop-capture assertions out of default CI until display permissions are stable.
- **Streaming field-test drift**: keep dedicated test accounts, device inventory, hardware inventory, and measured thresholds in `docs/testing/playwright-streaming.md`.
- **False confidence from simulation**: separate CI-safe file-source/network-mock tests from real desktop capture, real hardware encoder, and real-network field tests.
- **Real account leakage**: keep account credentials, auth storage, stream tokens, screenshots with private content, and generated media artifacts out of git.
- **MCP drift**: keep MCP config in docs and record last verification date.
- **Generated test drift**: require generated specs to be reviewed and added to the test map.
- **Auth state leakage**: ignore `.auth/` and never commit storage state.
- **Agent CLI global version drift**: prefer local dev dependency if repeatable team behavior matters.

## References

- Playwright Test installation: https://playwright.dev/docs/intro
- Playwright Test configuration: https://playwright.dev/docs/test-configuration
- Built-in Playwright command line: https://playwright.dev/docs/test-cli
- Playwright Electron API: https://playwright.dev/docs/api/class-electron
- Playwright ElectronApplication API: https://playwright.dev/docs/api/class-electronapplication
- Playwright Test Agents: https://playwright.dev/docs/test-agents
- Playwright MCP introduction: https://playwright.dev/mcp/introduction
- Playwright MCP installation: https://playwright.dev/mcp/installation
- Playwright MCP capabilities: https://playwright.dev/mcp/capabilities
- Playwright MCP profile and state: https://playwright.dev/mcp/configuration/user-profile
- Playwright agent CLI installation: https://playwright.dev/agent-cli/installation
- Playwright agent CLI skills: https://playwright.dev/agent-cli/skills
- Playwright agent CLI capabilities: https://playwright.dev/agent-cli/capabilities
