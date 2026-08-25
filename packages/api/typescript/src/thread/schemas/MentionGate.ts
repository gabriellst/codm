import { basename } from 'node:path'
import { z } from '@codm/core-typescript'
import { ProductConfig } from '@shared/config/ProductConfig'

/** MentionGate discriminated-union VO — a tag is required exactly when the gate is enabled. */
export const MentionGateSchema = z.discriminatedUnion('enabled', [
	z.object({ enabled: z.literal(false) }),
	z.object({ enabled: z.literal(true), tag: z.string().trim().min(1) }),
])

/**
 * Fallback tag when the folder name slugs to nothing (a root path, a CJK-only basename).
 *
 * LIDO do `ProductConfig`, não redigitado (F3/T8). Isto era `'codm'` cravado — e a consequência num
 * fork não é estética: esta tag é o que o operador DIGITA no WhatsApp para invocar o agente. Um fork
 * irmão cujo workspace tivesse basename impronunciável passaria a cunhar `@codm`, e o agente
 * responderia a uma marca que não é dele — ou, pior, não responderia à que é.
 */
const FALLBACK_TAG = ProductConfig.env.CODM_MENTION_FALLBACK_TAG

/**
 * Mint the citation tag for a thread from the folder it was linked to — `/Users/w/codm` → `@codm`.
 *
 * `Workspace` carries `{ ownerId, path, badges, addedAt }` and `AddWorkspace` collects only a path, so
 * the basename is the ONLY human-facing name the system has. Deliberately NOT `agent/…/slug.ts`'s
 * `slugify`, which is the ISSUE-KEY rule: it falls back to `'issue'`, caps at 40, and turns combining
 * marks into dashes (`conversação` → `conversac-a-o`). Coupling the two would mean a future tweak to
 * issue slugs silently changes what people have to type in WhatsApp.
 */
export function mintMentionTag(workspacePath: string): string {
	const slug = basename(workspacePath)
		.toLowerCase()
		.normalize('NFKD')
		.replace(/\p{M}+/gu, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 32)
		.replace(/-+$/g, '')
	return `@${slug || FALLBACK_TAG}`
}

/**
 * The citation matcher — a WORD-BOUNDARY match, not `String.includes`, and the difference is not
 * cosmetic.
 *
 * The tag is derived from a folder name, so it collides with the vocabulary of the very project it
 * names. This repo's own packages are `@codm/core-typescript`, `@codm/contracts-typescript`,
 * `@codm/client-typescript` — that much moved with the rebrand (`template.config.ts` `REPO.scope`).
 * The CHECKOUT DIRECTORY did not: it is not a tracked file, so renaming it is out of scope for a
 * codemod, and this founder's live thread is still bound to `/…/pessoal/codedm`, minting `@codedm`
 * live, while `FALLBACK_TAG` above is `codm`. Under `includes`, "bump @codm/core-typescript to 2.0"
 * would still summon the agent — that is exactly why this is a WORD-BOUNDARY match, not
 * `includes`: the `/` in the right-hand class is the character that stops it; the `.` handles
 * `codedm.ts`.
 *
 * Case-insensitive because the mint lowercases while every UI surface renders the raw path: an
 * operator reading `/Users/x/MyApp` would tell the group to type `@MyApp` and get silence.
 *
 * The tag is escaped: `ConfigureMentionGate` accepts any non-empty string, so an operator-set
 * `@a+b` would otherwise be compiled as a pattern.
 *
 * A fresh RegExp per call — a `g`-flagged regex carries `lastIndex` between uses.
 */
function tagPattern(tag: string, flags: string): RegExp {
	const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	return new RegExp(`(?<![\\p{L}\\p{N}_@./-])${escaped}(?![\\p{L}\\p{N}_/-]|\\.[\\p{L}\\p{N}])`, flags)
}

/** Whether `text` cites `tag` as a standalone token. */
export function mentionsTag(text: string, tag: string): boolean {
	return tagPattern(tag, 'iu').test(text)
}

/** `text` with every citation of `tag` removed and whitespace collapsed. May return an empty string. */
export function stripMentionTag(text: string, tag: string): string {
	return text
		.replace(tagPattern(tag, 'giu'), ' ')
		.replace(/[ \t]+/g, ' ')
		.trim()
}
