import { describe, expect, it } from 'bun:test'
import { mentionsTag, mintMentionTag, stripMentionTag } from './MentionGate'

/**
 * The citation tag is the one string in the product a human has to type EXACTLY, from a phone, to get
 * an answer. These are the rules that decide whether they get one.
 */
describe('mintMentionTag — the tag is the folder name, slugged', () => {
	it('takes the basename and slugs it', () => {
		expect(mintMentionTag('/Users/work/Desktop/Projetos/pessoal/codedm')).toBe('@codedm')
		expect(mintMentionTag('/Users/dev/Acme Studio')).toBe('@acme-studio')
		expect(mintMentionTag('/Users/dev/my_app.v2/')).toBe('@my-app-v2')
	})

	it('strips combining marks instead of dashing them', () => {
		// This is why the mint is NOT `agent/services/IssueRouter/slug.ts`: that one is the ISSUE-KEY rule
		// and turns `conversação` into `conversac-a-o`, which nobody would ever type.
		expect(mintMentionTag('/Users/dev/conversação')).toBe('@conversacao')
	})

	it('falls back rather than minting an unusable tag', () => {
		// A root path and a non-latin basename both slug to nothing. An empty tag would be worse than a
		// wrong one: `MentionGateSchema` rejects it, so `Thread.create` would throw on attach.
		expect(mintMentionTag('/')).toBe('@codm')
		expect(mintMentionTag('/Users/dev/日本語')).toBe('@codm')
	})
})

describe('mentionsTag — a standalone token, not a substring', () => {
	it('matches a citation anywhere in the message, case-insensitively', () => {
		expect(mentionsTag('@codm fix the login bug', '@codm')).toBe(true)
		expect(mentionsTag('hey @codm, can you look?', '@codm')).toBe(true)
		// The mint lowercases; every UI surface renders the raw folder path. An operator reading
		// `/Users/x/MyApp` will tell the group to type `@MyApp`.
		expect(mentionsTag('@CODM ping', '@codm')).toBe(true)
	})

	it('does NOT match inside a longer token — the reason this is not String.includes', () => {
		// The tag is derived from a folder name, so it collides with the vocabulary of the project it
		// names. This repo's packages are literally `@codm/*` and its live thread mints `@codm`.
		expect(mentionsTag('bump @codm/core-typescript to 2.0', '@codm')).toBe(false)
		expect(mentionsTag('see codm.ts', '@codm')).toBe(false)
		expect(mentionsTag('@codmx is someone else', '@codm')).toBe(false)
		expect(mentionsTag('mail me at a@codm.dev', '@codm')).toBe(false)
	})

	it('treats an operator-set tag as text, never as a pattern', () => {
		// `ConfigureMentionGate` accepts any non-empty string, so the tag must be escaped.
		expect(mentionsTag('ping @a+b now', '@a+b')).toBe(true)
		expect(mentionsTag('ping @aaab now', '@a+b')).toBe(false)
	})

	it('is stateless across calls', () => {
		// A `g`-flagged RegExp carries `lastIndex`; reusing one would make every other call miss.
		expect(mentionsTag('@codm one', '@codm')).toBe(true)
		expect(mentionsTag('@codm two', '@codm')).toBe(true)
	})
})

describe('stripMentionTag — addressing is not content', () => {
	it('removes every citation and collapses the gap', () => {
		expect(stripMentionTag('@codm fix the login bug', '@codm')).toBe('fix the login bug')
		expect(stripMentionTag('hey @codm please @codm hurry', '@codm')).toBe('hey please hurry')
	})

	it('leaves a non-citation occurrence alone', () => {
		expect(stripMentionTag('bump @codm/core to 2.0', '@codm')).toBe('bump @codm/core to 2.0')
	})

	it('CAN empty a bare summon — the caller is responsible for that', () => {
		// `Thread.textWithoutMention` falls back to the original text precisely because of this.
		expect(stripMentionTag('@codm', '@codm')).toBe('')
	})
})
