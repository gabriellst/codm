import { glob } from 'astro/loaders'
import { defineCollection, z } from 'astro:content'

/**
 * Legal documents (privacy today, terms later) — definition, content, and consumers
 * colocated under `src/pages/[locale]/legal/_content/`, same slice shape the landing
 * uses (`_content` keeps the files out of the file router; `[locale]` is a literal
 * on-disk folder). One MDX per locale: `privacy.pt.mdx` / `privacy.en.mdx`, yielding
 * collection ids `privacy.pt` / `privacy.en` — the route reads `<doc>.${locale}`.
 *
 * These MDX files are ALSO the GitHub-facing documentation (README links straight at
 * them), which is why they carry no imports and no JSX: GitHub renders `.mdx` as plain
 * markdown, so a component in the body would show up as literal text there. Keep them
 * component-free — the styling belongs to `_components/LegalDoc.astro`, not the content.
 */
export const legal = defineCollection({
	loader: glob({
		pattern: '*.{pt,en}.mdx',
		base: './src/pages/[locale]/legal/_content',
		// Astro's default id generator strips dots (`privacy.pt.mdx` → `privacypt`).
		// Pin the id to the dotted stem so consumers read `${doc}.${locale}`.
		generateId: ({ entry }) => entry.replace(/\.mdx$/, ''),
	}),
	schema: z.object({
		title: z.string().min(1),
		description: z.string().min(1).max(200),
		/** Drives the "last updated" line AND the JSON-LD `dateModified`. */
		updatedAt: z.coerce.date(),
	}),
})
