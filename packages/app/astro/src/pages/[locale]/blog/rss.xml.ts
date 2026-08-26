import rss from '@astrojs/rss'
import type { APIContext } from 'astro'
import { getCollection, getEntry } from 'astro:content'
import { isLocale, type Locale, LOCALES } from '~/i18n'

export function getStaticPaths() {
	return LOCALES.map(locale => ({ params: { locale } }))
}

export async function GET(context: APIContext) {
	const raw = context.params.locale
	const locale: Locale = isLocale(raw) ? raw : 'pt'

	const landing = await getEntry('landing', `home.${locale}`)
	const t = landing!.data
	const posts = (await getCollection('blog', ({ id, data }) => id.startsWith(`${locale}/`) && !data.draft)).sort(
		(a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime(),
	)

	return rss({
		title: `CODM — ${t.hero.titleBold} ${t.hero.titleLight}`,
		description: t.hero.subtitle,
		site: context.site ?? 'http://localhost:4321',
		items: posts.map(post => ({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.publishedAt,
			link: `/${locale}/blog/${post.id.replace(new RegExp(`^${locale}/`), '').replace(/\.mdx?$/, '')}`,
		})),
		customData: `<language>${locale === 'pt' ? 'pt-BR' : 'en-US'}</language>`,
	})
}
