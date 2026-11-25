import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * The CLOUD PANEL's own entry (`.specs/2026-11-24-tarefa-e-painel-design.md` §5/§6): a second, static Vite
 * build inside this package — none of the desktop's TanStack Start / Nitro shell; its root (`src/panel/web/`)
 * reaches only what `main.tsx` imports (the fence rail `tests/architecture/panel-web-fence.test.ts` proves it).
 *
 * The cloud serves the result from the SAME origin as the link it already hands out: `GET /panel/g/:token`
 * answers `index.html`, `GET /panel/assets/:file` the files of `assets/` — hence `base: '/panel/'`. Its CSP is
 * `script-src 'self'` with no exception, so the output must carry NO inline script: no module-preload polyfill
 * (the one inline script Vite would add) and the entry stays a plain `<script type="module" src>`.
 *
 * No `build.target`: `lib/i18n.ts` uses top-level await, which Vite 7's default target already allows.
 */
export default defineConfig({
	root: resolve(__dirname, 'src/panel/web'),
	base: '/panel/',
	// The root `.env` is not the panel's business: it reads nothing from `import.meta.env`.
	envDir: false,
	plugins: [tailwindcss(), react()],
	resolve: {
		alias: {
			'@': resolve(__dirname, './src'),
		},
	},
	build: {
		outDir: resolve(__dirname, 'dist-panel'),
		emptyOutDir: true,
		assetsDir: 'assets',
		sourcemap: false,
		modulePreload: { polyfill: false },
	},
})
