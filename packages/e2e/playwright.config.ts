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
		// Vídeo de demo opt-in por env, nunca default (técnica do UI-FIDELITY: `PW_VIDEO=on bun
		// scripts/run-e2e.ts <spec>` grava o webm da jornada real em test-results/; ffmpeg → mp4).
		video: process.env.PW_VIDEO === 'on' ? 'on' : 'off',
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
			// 404s too), so probe a route that returns 200 only once the daemon is serving.
			//
			// ── F1.3: a rota era `/session`, e a premissa dela CADUCOU ───────────────────────────
			// `/session` monta SOMENTE na nuvem — `auth` é cloud-only desde o ADR 0001, e a
			// `PLACEMENT` o diz. No daemon local ela dá 404 PERMANENTE. E o Playwright considera pronto
			// só `200 <= status < 404` (playwright-core, `isURLAvailable`), com um fallback para 404
			// que só vale quando o pathname é `/`. Logo o poll NUNCA convergia: os 120s estouravam com
			// o daemon perfeitamente no ar.
			//
			// Medido ao diagnosticar: o Vite sobe em ~560ms e responde 200, o gateway Go responde 200
			// em `/api/health`, e o api-ts loga `listening` — os três estavam saudáveis. O defeito era
			// a sonda, e ele é do MAINLINE, não desta worktree.
			//
			// `/health` serve melhor à intenção original: é do contexto `shared` (monta sempre), é
			// público (sem middleware), devolve 200 apenas quando db, migrações e dispatchers estão up,
			// e 503 caso contrário — que também está fora da faixa de prontidão. Ou seja, preserva a
			// propriedade anti-listener-stale que este comentário buscava, e a reforça.
			url: `http://127.0.0.1:${Number(process.env.API_PORT ?? 3130)}/health`,
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
				// proxy `/external/channel/*` to the gateway webServer below. scripts/run-e2e.ts exports
				// the real value (derived from its own gatewayPort); this fallback keeps a bare
				// `bunx playwright` invocation (no runner) pointed at the SAME default port the gateway
				// webServer entry falls back to.
				API_GO_URL: process.env.API_GO_URL ?? `http://127.0.0.1:${Number(process.env.CHANNEL_PORT ?? 3132)}`,
			},
		},
		{
			// ── O DAEMON DE NUVEM (F7) ─────────────────────────────────────────────────────────────
			// O MESMO `dist/server.js` do daemon local acima — a única diferença é `CODM_PROFILE=cloud`,
			// que faz `deployment.ts` montar `shared, auth, owner` em vez do conjunto local. Não é um
			// segundo artefato: é o mesmo binário sob outra coluna, exatamente como `dev:cloud` faz.
			//
			// POR QUE ELE EXISTE: o ADR 0001 tornou `auth` e `owner` cloud-only, e o daemon local passou
			// a perguntar à nuvem quem é o operador (`CloudSessionMiddleware`, declarado em praticamente
			// todo controller local). Sem esta entrada, `CODM_CLOUD_URL` não tinha para onde apontar e o
			// middleware recusava tudo — 10 das 11 specs reprovavam por essa única razão, e a sonda
			// quebrada de prontidão escondeu isso até a F1.3.
			//
			// SEM POSTGRES: sob `CODM_ENV=e2e` a família `pg` resolve para o `PGliteDriver`
			// (`shared/registry.ts`, decisão da F7) — Postgres em-processo que aplica a própria
			// migração. Medido: este boot responde 200 em `/health` com `auth` e `owner` montados,
			// sem container e sem passo de deploy.
			//
			// DA FONTE, e não do bundle — a assimetria com o daemon local acima é DELIBERADA e medida.
			// Aquele roda `node dist/server.js` porque provar o caminho run-under-Node do artefato que
			// enviamos é parte do que a suíte existe para fazer (ver o comentário dele). Este não tem
			// esse mandato: ele entra na topologia para responder QUEM É O OPERADOR. E rodá-lo do bundle
			// custaria caro no lugar errado — o `PGliteDriver` é Postgres em WASM, e seus ativos
			// (`pglite.data` + `pglite.wasm`, 13MB medidos) teriam de ser estagiados em `dist/`, que hoje
			// tem 20MB: +65% em TODA imagem de produção, para um driver que produção nunca constrói.
			// Da fonte, `import.meta.url` resolve os dois troncos de migração sozinho e o custo é zero.
			//
			// O que essa escolha NÃO cobre — o bundle bootar sob perfil cloud — é coberto por um rail
			// estático sobre a saída do build (`tests/architecture/build-output.test.ts`), que nasceu
			// justamente do defeito que este caminho revelou.
			command: 'bun run ./src',
			url: `http://127.0.0.1:${Number(process.env.E2E_CLOUD_PORT ?? 3134)}/health`,
			reuseExistingServer: false,
			timeout: 120_000,
			cwd: '../api/typescript',
			stdout: 'pipe',
			env: {
				CODM_PROFILE: 'cloud',
				PORT: String(process.env.E2E_CLOUD_PORT ?? 3134),
				API_PORT: String(process.env.E2E_CLOUD_PORT ?? 3134),
				CODM_ENV: process.env.CODM_ENV ?? 'e2e',
				// Data dir PRÓPRIO, nunca o do par local/gateway: aqueles dois co-tenantam UM arquivo
				// SQLite, e este fala Postgres em-processo. Compartilhar o dir só criaria disputa de lock
				// entre processos que não têm nada a compartilhar.
				...(process.env.E2E_CLOUD_DATA_DIR ? { CODM_DATA_DIR: process.env.E2E_CLOUD_DATA_DIR } : {}),
				RATE_LIMIT_DISABLED: 'true',
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
