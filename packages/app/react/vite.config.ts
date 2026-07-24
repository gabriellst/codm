import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

// Desktop (Tauri shell): `nx run app-react:{dev-spa,build-spa}` set CODEDM_DESKTOP=true.
// The webview serves the SPA from the root ('/'), so the '/app' basepath switches off and
// TanStack Start emits a static SPA shell — for BOTH desktop dev and the desktop build.
const desktop = process.env.CODEDM_DESKTOP === 'true'

// Nitro is TanStack Start's dev-mode document server. Desktop dev-serve NEEDS it — without it
// `vite --host` has no HTML entry and every route 404s in the webview. The desktop SPA *build*
// must run WITHOUT it (static shell into .output/public). The discriminator is an explicit dev
// flag set only by the `dev-spa` target, NOT vite's `command`: the SPA build's prerender step
// re-resolves this config in a serve-like context, so a `command`-based gate would wrongly turn
// nitro back on mid-build and 500 the prerender. Web (non-desktop) always keeps nitro.
const desktopDev = process.env.CODEDM_DESKTOP_DEV === 'true'
const nitroOn = !desktop || desktopDev

export default defineConfig({
	base: desktop ? '/' : '/app/',
	envDir: '..',
	plugins: [
		tanstackStart({
			...(desktop ? { spa: { enabled: true } } : { router: { basepath: '/app' } }),
			tsr: {
				routesDirectory: './src/routes',
				generatedRouteTree: './src/routeTree.gen.ts',
				routeFileIgnorePrefix: '-',
				quoteStyle: 'single',
				autoCodeSplitting: true,
			},
		}),
		...(nitroOn ? [nitro({ config: { preset: 'node-server' } })] : []),
		tailwindcss(),
		react(),
	],
	resolve: {
		alias: {
			'@': resolve(__dirname, './src'),
		},
	},
	// 5173 is the single source for the dev port (tauri devUrl derives from VITE_PORT). Nitro's
	// dev server resolves `process.env.PORT || server.port`, and its dotenv (override:false) would
	// inject .env's PORT fallback — so the `dev-spa` nx target launches with `PORT=` (empty-but-
	// present) to block that injection and let this `server.port` win. Keep the two in sync.
	server: {
		port: 5173,
	},
})
