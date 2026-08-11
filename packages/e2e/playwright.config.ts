import { defineConfig } from '@playwright/test'

export default defineConfig({
	testDir: './tests',
	timeout: 30_000,
	retries: 0,
	// ONE worker, measured (C8, 29-jul). Two workers ran two specs against the SAME embedded
	// SQLite (TS daemon + Go gateway on one file): under 05's post-unlock traffic the issue
	// materialization upsert (`issue_issues ... on conflict`) failed transiently 3/3 runs, and
	// the outbox dispatcher's 30s retry backoff outlives the specs' 20s polls — a deterministic
	// timeout. Serialized, the suite is GREEN and FASTER (14.9s vs ~26s): contention was costing
	// more than parallelism bought. Raise this only with a measurement proving otherwise.
	workers: 1,
	use: {
		baseURL: `http://localhost:${Number(process.env.VITE_PORT ?? 5273)}`,
		viewport: { width: 1512, height: 982 },
		locale: 'pt-BR',
		video: 'off',
		screenshot: 'only-on-failure',
		trace: 'on-first-retry',
	},
	// Direct package commands, NOT `nx run ...`: two concurrent nx invocations contend on the nx
	// daemon lock and can hang past the webServer timeout with zero output (observed live — both
	// servers boot in seconds standalone).
	webServer: [
		{
			// Real-mode daemon over the embedded SQLite store, booted the RUN-UNDER-NODE way: `node dist/server.js`
			// (the artifact we ship), NOT `bun run ./src` (a runtime we don't). scripts/run-e2e.ts builds
			// the node bundle first and exports CODM_NODE_BIN (nvm-resolved), CODM_ENV=e2e + the scratch
			// CODM_DATA_DIR. A bare `bun x playwright` (no runner) falls back to PATH `node`.
			command: `${process.env.CODM_NODE_BIN ?? 'node'} --enable-source-maps ./dist/server.js`,
			// url (not port): the raw port poll resolves localhost to ::1 first on macOS while the
			// servers bind IPv4 — both were READY and the poll still timed out. An HTTP probe against
			// 127.0.0.1 accepts any response, but 404 does NOT prove the daemon is up (a stale listener
			// 404s too), so probe a route that returns 200 only once the daemon is serving: the operator
			// session echo (/v1/session), which needs no seeded state.
			url: `http://127.0.0.1:${Number(process.env.API_PORT ?? 3130)}/v1/session`,
			reuseExistingServer: false,
			timeout: 120_000,
			cwd: '../api/typescript',
			stdout: 'pipe',
			// PORT is honored by BOTH stacks (fastify api AND nitro/vite) — pin it per server or they
			// collide on whichever value the runner exported. CODM_DATA_DIR/CODM_ENV come from the
			// runner's env (inherited); pinned here so a bare `bun x playwright` invocation still boots
			// hermetically.
			env: {
				PORT: String(process.env.API_PORT ?? 3130),
				API_PORT: String(process.env.API_PORT ?? 3130),
				CODM_ENV: process.env.CODM_ENV ?? 'e2e',
				...(process.env.CODM_DATA_DIR ? { CODM_DATA_DIR: process.env.CODM_DATA_DIR } : {}),
				RATE_LIMIT_DISABLED: 'true',
				// SERVER-SIDE only — the browser never learns this (app-react lib/config.ts: "No
				// VITE_GATEWAY_URL exists on purpose"). external/utils/forwardToChannel.ts reads this to
				// proxy `/v1/external/channel/*` to the gateway webServer below. scripts/run-e2e.ts exports
				// the real value (derived from its own gatewayPort); this fallback keeps a bare
				// `bunx playwright` invocation (no runner) pointed at the SAME default port the gateway
				// webServer entry falls back to.
				API_GO_URL: process.env.API_GO_URL ?? `http://127.0.0.1:${Number(process.env.CHANNEL_PORT ?? 3132)}`,
			},
		},
		{
			command: 'bun x vite --host',
			url: `http://127.0.0.1:${Number(process.env.VITE_PORT ?? 5273)}/app/`,
			reuseExistingServer: false,
			timeout: 120_000,
			cwd: '../app/react',
			stdout: 'pipe',
			env: { PORT: String(process.env.VITE_PORT ?? 5273) },
		},
		{
			// Prebuilt Go binary — scripts/run-e2e.ts runs `go build -o api ./cmd/api` ONCE before
			// Playwright boots anything (mirrors the TS daemon above: build once, run the artifact,
			// never `go run` under a webServer restart cycle). `./api` is the SAME argv
			// template.config.ts's `WORKSPACES.apiGo.testBoot.run` declares.
			//
			// CODM_ENV=e2e selects `channel.Overlays[EnvE2e]` (internal/channel/overlay.go) — the
			// scripted MockChannelFactory playing `defaultE2eScenario()` (QR frames, auto-pairing,
			// contacts) through the REAL mapper/outbox/handler/projector pipeline, no phone involved.
			// CHANNEL_GLOBAL_API_KEY / GLOBAL_API_KEY are pinned EMPTY for the exact reason
			// template.config.ts's `WORKSPACES.apiGo.testBoot` docblock spells out: godotenv turns an
			// empty `A=  # comment` env line into the apikey guard's literal SECRET unless the
			// launching cwd's own .env was preloaded — pinned here so the boot is identical however
			// it's invoked, not just when scripts/run-e2e.ts's env happens to carry it.
			command: './api',
			// The gateway's HttpRouter serves every controller under `/api/{context}{path}` — its own
			// OpenAPI spec omits that mount (see forwardToChannel.ts), so `/api/health` (public,
			// core/services/httprouter) is the probe both this webServer and testBoot.ts's
			// bootService poll.
			url: `http://127.0.0.1:${Number(process.env.CHANNEL_PORT ?? 3132)}/api/health`,
			reuseExistingServer: false,
			timeout: 120_000,
			cwd: '../api/go',
			stdout: 'pipe',
			env: {
				CODM_ENV: process.env.CODM_ENV ?? 'e2e',
				CHANNEL_PORT: String(process.env.CHANNEL_PORT ?? 3132),
				CHANNEL_GLOBAL_API_KEY: '',
				GLOBAL_API_KEY: '',
				...(process.env.CODM_DATA_DIR ? { CODM_DATA_DIR: process.env.CODM_DATA_DIR } : {}),
			},
		},
	],
	projects: [
		{
			name: 'e2e',
			use: { browserName: 'chromium' },
		},
	],
	outputDir: './recordings',
})
