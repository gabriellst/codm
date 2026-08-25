import { describe, expect, it } from 'bun:test'
import { parseReply } from './citation'

/**
 * AC-T4.2 — the citation protocol, both directions plus the malformed case.
 *
 * The orchestrator has no structured output and no tool for speaking, so §7.6's "the model signals a
 * citation by reusing the entryId" has exactly one channel: the text. That makes this parser the whole
 * contract, and every one of its failure modes is visible to a human in a real conversation — a
 * sentinel that survives is delivered verbatim into somebody's chat.
 */
const ENTRY = '019e4d24-6524-7041-9e1c-8108180cddae'

describe('parseReply', () => {
	it('no sentinel — the reply stands, and nothing is cited', () => {
		expect(parseReply('sim, claro')).toEqual({ text: 'sim, claro' })
	})

	it('a trailing sentinel is STRIPPED and becomes the citation', () => {
		const parsed = parseReply(`resolvido: dark mode tá lá\n[quote: ${ENTRY}]`)

		expect(parsed.text).toBe('resolvido: dark mode tá lá')
		expect(parsed.replyToEntryId).toBe(ENTRY)
	})

	it('tolerates the spacing a model actually produces', () => {
		expect(parseReply(`ok\n  [quote:   ${ENTRY}]  `).replyToEntryId).toBe(ENTRY)
	})

	/**
	 * The important one. A malformed id must still be REMOVED — publishing `[quote: undefined]` into a
	 * group is worse than losing the attachment, and the reply itself is perfectly good without it.
	 */
	it('a MALFORMED id is stripped from the text but produces no citation', () => {
		const parsed = parseReply('resolvido\n[quote: not-a-uuid]')

		expect(parsed.text).toBe('resolvido')
		expect(parsed.replyToEntryId).toBeUndefined()
	})

	it('only the LAST line counts — prose that mentions the shape is not a citation', () => {
		const parsed = parseReply(`é assim que se cita: [quote: ${ENTRY}] no fim da mensagem`)

		expect(parsed.replyToEntryId).toBeUndefined()
		expect(parsed.text).toContain('no fim da mensagem')
	})

	it('a sentinel-only reply leaves no text to deliver', () => {
		expect(parseReply(`[quote: ${ENTRY}]`)).toEqual({ text: '', replyToEntryId: ENTRY })
	})
})
