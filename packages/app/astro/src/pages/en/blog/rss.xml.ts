import rss from '@astrojs/rss'
import type { APIContext } from 'astro'
import { getCollection, getEntry } from 'astro:content'

export async function GET(context: APIContext) {
	const landing = await getEntry('landing', 'en/landing')
	const t = landing!.data
	const posts = (await getCollection('blog', ({ id, data }) => id.startsWith('en/') && !data.draft)).sort(
		(a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime(),
	)

	return rss({
		title: `CodeDM — ${t.hero.titleBold} ${t.hero.titleLight}`,
		description: t.hero.subtitle,
		site: context.site ?? 'http://localhost:4321',
		items: posts.map(post => ({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.publishedAt,
			link: `/en/blog/${post.id.replace(/^en\//, '').replace(/\.mdx?$/, '')}`,
		})),
		customData: '<language>en-US</language>',
	})
}
