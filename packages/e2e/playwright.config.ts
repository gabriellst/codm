import { defineConfig } from '@playwright/test'

export default defineConfig({
	testDir: './tests',
	timeout: 30_000,
	retries: 0,
	// Constrain parallelism — Better Auth sign-up endpoints can throw 500s when
	// many specs sign up simultaneously. Two workers keeps things moving without
	// overwhelming the dev backend.
	workers: 2,
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
			command: 'bun run --watch ./src',
			// url (not port): the raw port poll resolves localhost to ::1 first on macOS while the
			// servers bind IPv4 — both were READY and the poll still timed out. An HTTP probe
			// against 127.0.0.1 accepts any response (404 counts as up).
			url: `http://127.0.0.1:${Number(process.env.API_PORT ?? 3030)}/v1/authentication/ok`,
			reuseExistingServer: false,
			timeout: 120_000,
			cwd: '../api/typescript',
			stdout: 'pipe',
			// PORT is honored by BOTH stacks (fastify api AND nitro/vite) — pin it per server or
			// they collide on whichever value the runner exported.
			env: { PORT: String(process.env.API_PORT ?? 3030) },
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
