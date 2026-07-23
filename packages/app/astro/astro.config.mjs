import mdx from '@astrojs/mdx'
import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

export default defineConfig({
	site: process.env.SITE_URL ?? 'http://localhost:4321',
	output: 'static',
	integrations: [
		react(),
		mdx(),
		sitemap({
			i18n: {
				defaultLocale: 'pt',
				locales: { pt: 'pt-BR', en: 'en-US' },
			},
			// `/` is a noindex client-side redirect shell (Option B) — keep it out of
			// the sitemap; only the localized trees are canonical.
			filter: page => new URL(page).pathname !== '/',
		}),
	],
	vite: {
		plugins: [tailwindcss()],
	},
	i18n: {
		defaultLocale: 'pt',
		locales: ['pt', 'en'],
		routing: {
			// Option B routes every locale under a file-based `[locale]/` folder, so we
			// do NOT use Astro's built-in i18n routing. Keep `prefixDefaultLocale: false`
			// so Astro does NOT auto-generate its own `/` → `/pt/` redirect template —
			// that would clobber our hand-written client-side locale-detecting shell at
			// `src/pages/index.astro` (rule 3: cookie + navigator.language detection).
			prefixDefaultLocale: false,
		},
	},
	image: {
		service: { entrypoint: 'astro/assets/services/sharp' },
	},
	prefetch: true,
	server: {
		port: 4321,
	},
})
