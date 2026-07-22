import type { StorybookConfig } from '@storybook/react-vite'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// package.json is `"type": "module"`, so this config loads as ESM where `require`/`__dirname`
// are undefined. Recreate them from import.meta so the config works under native ESM loading.
const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

function getAbsolutePath(value: string): string {
	return dirname(require.resolve(join(value, 'package.json')))
}

const config: StorybookConfig = {
	// Where to find stories
	stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],

	// Serve the MSW service worker (public/mockServiceWorker.js) for network-mocked stories.
	staticDirs: ['../public'],

	// Addons — controls, actions, viewport, backgrounds & interactions are built into Storybook core since v9
	addons: [],

	framework: {
		name: getAbsolutePath('@storybook/react-vite'),
		options: {},
	},

	// Vite customization (Tailwind v4 requires dynamic import)
	viteFinal: async config => {
		// Storybook auto-loads the app's vite.config.ts, which pulls in the
		// TanStack Start + Nitro server plugins. Those are app-server only and
		// break the Storybook build (Start's manifest-capture sees "multiple
		// entries"). Strip them — Storybook only needs React + Tailwind.
		config.plugins = (config.plugins || []).flat(Number.POSITIVE_INFINITY).filter(plugin => {
			const name = plugin && typeof plugin === 'object' && 'name' in plugin ? String(plugin.name) : ''
			return !name.startsWith('tanstack') && !name.startsWith('nitro')
		})
		const tailwindcss = (await import('@tailwindcss/vite')).default
		config.plugins.push(tailwindcss())
		config.resolve = config.resolve || {}
		config.resolve.alias = {
			...config.resolve.alias,
			'@': resolve(__dirname, '../src'),
		}
		return config
	},
}

export default config
