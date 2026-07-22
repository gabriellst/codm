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
		}),
	],
	vite: {
		plugins: [tailwindcss()],
	},
	i18n: {
		defaultLocale: 'pt',
		locales: ['pt', 'en'],
		routing: {
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
