import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

// Desktop (Tauri shell) build: `nx run app-react:build-spa` sets CODEDM_DESKTOP=true.
// The webview serves the SPA from tauri://localhost root, so the '/app' basepath and
// the node-server preset both switch off: static SPA shell into .output/public.
const desktop = process.env.CODEDM_DESKTOP === 'true'

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
		...(desktop ? [] : [nitro({ config: { preset: 'node-server' } })]),
		tailwindcss(),
		react(),
	],
	resolve: {
		alias: {
			'@': resolve(__dirname, './src'),
		},
	},
	server: {
		port: 5173,
	},
})
