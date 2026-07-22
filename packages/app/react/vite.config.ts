import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
	base: '/app/',
	envDir: '..',
	plugins: [
		tanstackStart({
			router: { basepath: '/app' },
			tsr: {
				routesDirectory: './src/routes',
				generatedRouteTree: './src/routeTree.gen.ts',
				routeFileIgnorePrefix: '-',
				quoteStyle: 'single',
				autoCodeSplitting: true,
			},
		}),
		nitro({ config: { preset: 'node-server' } }),
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
