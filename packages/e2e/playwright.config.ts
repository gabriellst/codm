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
		baseURL: 'http://localhost:5173',
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
			// the node bundle first and exports CODEDM_NODE_BIN (nvm-resolved), CODEDM_E2E + the scratch
			// CODEDM_DATA_DIR. A bare `bun x playwright` (no runner) falls back to PATH `node`.
			command: `${process.env.CODEDM_NODE_BIN ?? 'node'} --enable-source-maps ./dist/server.js`,
			// url (not port): the raw port poll resolves localhost to ::1 first on macOS while the
			// servers bind IPv4 — both were READY and the poll still timed out. An HTTP probe against
			// 127.0.0.1 accepts any response, but 404 does NOT prove the daemon is up (a stale listener
			// 404s too), so probe a route that returns 200 only once the daemon is serving: the operator
			// session echo (/v1/session), which needs no seeded state.
			url: `http://127.0.0.1:${Number(process.env.API_PORT ?? 3030)}/v1/session`,
			reuseExistingServer: false,
			timeout: 120_000,
			cwd: '../api/typescript',
			stdout: 'pipe',
			// PORT is honored by BOTH stacks (fastify api AND nitro/vite) — pin it per server or they
			// collide on whichever value the runner exported. CODEDM_DATA_DIR/CODEDM_E2E come from the
			// runner's env (inherited); pinned here so a bare `bun x playwright` invocation still boots
			// hermetically.
			env: {
				PORT: String(process.env.API_PORT ?? 3030),
				API_PORT: String(process.env.API_PORT ?? 3030),
				CODEDM_E2E: process.env.CODEDM_E2E ?? 'true',
				...(process.env.CODEDM_DATA_DIR ? { CODEDM_DATA_DIR: process.env.CODEDM_DATA_DIR } : {}),
				RATE_LIMIT_DISABLED: 'true',
			},
		},
		{
			command: 'bun x vite --host',
			url: `http://127.0.0.1:${Number(process.env.VITE_PORT ?? 5173)}/app/`,
			reuseExistingServer: false,
			timeout: 120_000,
			cwd: '../app/react',
			stdout: 'pipe',
			env: { PORT: String(process.env.VITE_PORT ?? 5173) },
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
