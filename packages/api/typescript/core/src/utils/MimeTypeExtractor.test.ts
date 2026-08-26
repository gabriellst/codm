import { describe, expect, it } from 'bun:test'
import { MimeTypeExtractor } from './MimeTypeExtractor'
import { MimeTypes } from '../types/Http'

describe('MimeTypeExtractor', () => {
	it.each([
		['/tmp/shot.png', 'image/png'],
		['/tmp/shot.jpg', 'image/jpeg'],
		['/tmp/shot.jpeg', 'image/jpeg'],
		['/tmp/SHOT.PNG', 'image/png'],
		['/tmp/clip.mp4', 'video/mp4'],
		['/tmp/clip.webm', 'video/webm'],
		['/tmp/clip.mov', 'video/quicktime'],
		['/tmp/note.m4a', 'audio/mp4'],
		['/tmp/note.mp3', 'audio/mpeg'],
		['/tmp/note.flac', 'audio/flac'],
		['/tmp/tune.mid', 'audio/midi'],
		['/tmp/tune.midi', 'audio/midi'],
		['/tmp/report.pdf', 'application/pdf'],
	])('resolves %s to %s', (path, expected) => {
		expect(MimeTypeExtractor.extractMimeType(path)).toBe(expected as MimeTypes)
	})

	it.each([['/tmp/archive.unknownext'], ['/tmp/no-extension-at-all'], ['']])('falls back to octet-stream for %s', path => {
		expect(MimeTypeExtractor.extractMimeType(path)).toBe(MimeTypes['.bin'])
	})

	/**
	 * The structural rail behind the `.jpeg = '.jpg'` / `.mid = '.midi'` bug: two members held ANOTHER
	 * MEMBER'S KEY as their value, so they resolved to a string starting with a dot instead of to a
	 * media type — and one of the two keys they pointed at did not even exist. A media type always has
	 * the shape `type/subtype`; nothing in this enum may be spelled like an extension.
	 */
	it('has no member whose value is an extension rather than a media type', () => {
		const offenders = Object.entries(MimeTypes).filter(([, value]) => value.startsWith('.'))
		expect(offenders).toEqual([])
	})
})
